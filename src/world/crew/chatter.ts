/**
 * Walk-by dialog as it happens. Every second or so it looks at the crew near the captain for an
 * entry from content/dialog/ that fits who is there, where, when and what they're doing, and
 * plays it line by line: the speakers stop and face each other while they talk. People the
 * captain passes close by may say something to them, and talking to someone (E) gets a reply.
 * One line shows at a time, so it stays readable.
 *
 * Pure (no Babylon.js): the game shows `current` as a speech bubble (src/ui/Speech.tsx).
 */
import type { CrewMember } from '../../sim/crew';
import { callSign } from '../../sim/crew';
import {
  canJoin,
  fillIn,
  fitsDoing,
  fitsPlace,
  fitsTime,
  fitsWords,
  type DialogEntry,
  type DialogNames,
} from '../../sim/dialog';
import { Rng } from '../../sim/rng';
import type { CrewLife, CrewView } from './life';

/** A line being said now. */
export interface SpokenLine {
  /** New for every line, so the interface can tell lines apart. */
  readonly key: number;
  readonly speaker: CrewView;
  /** "PO2 Barros". */
  readonly name: string;
  readonly text: string;
  /** Said to the captain, rather than overheard. */
  readonly toCaptain: boolean;
}

/** Where the captain is and which way they look (radians, as the camera's). */
export interface CaptainView {
  readonly deck: number;
  readonly x: number;
  readonly y: number;
  readonly yaw: number;
}

/** Distances in metres, times in seconds of real time. */
const TUNING = {
  /** Conversations start among people this close to the captain… */
  hear: 9,
  /** …and stop when the captain gets this far away. */
  lose: 15,
  /** Every speaker is in the same room as speaker 1, and this close. */
  together: 4.5,
  /** A passer-by this close to the captain may say something to them. */
  pass: 2.4,
  /** How often to look for something to say. */
  look: 1.2,
  /** Quiet between conversations. */
  pause: [5, 11],
  /** Quiet after a passer-by's remark before another. */
  remarkPause: 9,
  /** Before the same person speaks up unprompted again. */
  personRest: 60,
  /** Before the same entry comes up again, unless nothing else fits. */
  entryRest: 300,
  /** Pause between the lines of a conversation. */
  gap: 0.45,
} as const;

interface Conversation {
  readonly entry: DialogEntry;
  readonly speakers: readonly CrewView[];
  readonly toCaptain: boolean;
  /** The next line to say, and when. */
  index: number;
  nextAt: number;
}

export class Chatter {
  /** The line being said, if any. */
  current: SpokenLine | null = null;
  private conversation: Conversation | null = null;
  private time = 0;
  private nextLook = 2;
  private nextRemark = 0;
  private key = 0;
  private readonly lastUsed = new Map<string, number>();
  private readonly spokeAt = new Map<string, number>();
  private readonly rng: Rng;

  constructor(
    private readonly entries: readonly DialogEntry[],
    private readonly life: CrewLife,
    private readonly names: DialogNames,
    private readonly roomType: (id: string) => string | null,
    seed: number,
    /** An entry to play as soon as it can be cast and again after each pause (`?dialog=`). */
    private readonly force: string | null = null,
  ) {
    this.rng = Rng.fromSeed(seed);
  }

  /** Moves time on by `seconds` (real time), with the clock at `minute` of the day. */
  update(seconds: number, captain: CaptainView, minute: number): void {
    this.time += seconds;
    const talk = this.conversation;
    if (talk) {
      if (this.lost(talk, captain)) this.stop();
      else if (this.time >= talk.nextAt) this.say(talk, captain);
      return;
    }
    if (this.time < this.nextLook) return;
    this.nextLook = this.time + TUNING.look;
    if (this.force) {
      if (this.startForced(captain)) return;
    }
    if (this.time >= this.nextRemark && this.remark(captain, minute)) return;
    this.overhear(captain, minute);
  }

  /** The captain talks to someone: they answer, if anything fits. False if not. */
  talkTo(id: string, captain: CaptainView, minute: number): boolean {
    const person = this.life.person(id);
    if (!person || !person.visible) return false;
    this.stop();
    const options = this.entries.filter(
      (entry) =>
        entry.toCaptain &&
        fitsWords(entry.who[0]!, person.member) &&
        (entry.doing ? entry.doing.includes(person.activity) : person.activity !== 'sleep') &&
        fitsTime(entry, minute) &&
        fitsPlace(entry, person.space, person.deck, this.roomType),
    );
    const casts = options
      .map((entry) => ({ entry, speakers: this.castAround(entry, person) }))
      .filter(
        (cast): cast is { entry: DialogEntry; speakers: CrewView[] } => cast.speakers !== null,
      );
    const choice = this.choose(casts);
    if (!choice) return false;
    this.start(choice.entry, choice.speakers, true, captain);
    return true;
  }

  // ---- Starting --------------------------------------------------------------------------

  /** Someone the captain passes close by says something to them, now and then. */
  private remark(captain: CaptainView, minute: number): boolean {
    const passing = this.life.people.filter((person) => {
      if (person.deck !== captain.deck || !person.visible || person.activity === 'sleep')
        return false;
      if (person.pose === 'lie' || !this.rested(person)) return false;
      const dx = person.x - captain.x;
      const dy = person.y - captain.y;
      const distance = Math.hypot(dx, dy);
      if (distance > TUNING.pass || distance < 0.2) return false;
      // In front of the captain: within about 55 degrees of where they look.
      const ahead = (Math.sin(captain.yaw) * dx - Math.cos(captain.yaw) * dy) / distance;
      return ahead > 0.57;
    });
    if (passing.length === 0) return false;
    const person = this.rng.pick(passing);
    // Not everyone says something, and not every time.
    this.spokeAt.set(person.member.id, this.time - TUNING.personRest / 2);
    if (!this.rng.chance(0.45)) return false;
    const options = this.entries.filter(
      (entry) =>
        entry.toCaptain &&
        entry.who.length === 1 &&
        fitsWords(entry.who[0]!, person.member) &&
        fitsDoing(entry, person.activity) &&
        fitsTime(entry, minute) &&
        fitsPlace(entry, person.space, person.deck, this.roomType),
    );
    const choice = this.choose(options.map((entry) => ({ entry, speakers: [person] })));
    if (!choice) return false;
    this.nextRemark = this.time + TUNING.remarkPause;
    this.start(choice.entry, choice.speakers, true, captain);
    return true;
  }

  /**
   * Two or three crew near the captain strike up a conversation that fits them, or someone
   * mutters to themselves (who may be walking past).
   */
  private overhear(captain: CaptainView, minute: number): void {
    const here = this.life.spaceAt(captain.deck, captain.x, captain.y);
    const near = this.life.people.filter((person) => {
      if (person.deck !== captain.deck || !person.visible || !this.rested(person)) return false;
      const distance = Math.hypot(person.x - captain.x, person.y - captain.y);
      // In the same room, or close enough to hear through the door.
      return distance <= TUNING.hear && (person.space === here || distance < 4);
    });
    if (near.length === 0) return;
    const settled = near.filter((person) => person.settled);
    const casts: { entry: DialogEntry; speakers: CrewView[] }[] = [];
    for (const entry of this.entries) {
      if (entry.toCaptain) continue;
      if (!fitsTime(entry, minute)) continue;
      // Conversations need people who stay put; anyone can mutter on the move.
      const speakers = this.cast(
        entry,
        entry.who.length === 1 ? near : settled,
        (person) =>
          fitsDoing(entry, person.activity) &&
          fitsPlace(entry, person.space, person.deck, this.roomType),
      );
      if (speakers) casts.push({ entry, speakers });
    }
    const choice = this.choose(casts);
    if (choice) this.start(choice.entry, choice.speakers, false, captain);
  }

  /** `?dialog=<id>`: the entry with whoever fits, anywhere on the deck, at any time. */
  private startForced(captain: CaptainView): boolean {
    const entry = this.entries.find((candidate) => candidate.id === this.force);
    if (!entry) return false;
    const onDeck = this.life.people
      .filter((person) => person.deck === captain.deck && person.visible)
      .sort(
        (a, b) =>
          Math.hypot(a.x - captain.x, a.y - captain.y) -
          Math.hypot(b.x - captain.x, b.y - captain.y),
      );
    const speakers = this.cast(
      entry,
      onDeck,
      () => true,
      () => true,
      Infinity,
      false,
    );
    if (!speakers) return false;
    this.start(entry, speakers, entry.toCaptain, captain);
    return true;
  }

  /**
   * Speakers for an entry from `people`: speaker 1 anyone who `fits` (the first, unless
   * `shuffle`), the others the nearest who `joins` within `together` metres of speaker 1, in the
   * same room. Null if the entry can't be cast.
   */
  private cast(
    entry: DialogEntry,
    people: readonly CrewView[],
    fits: (person: CrewView) => boolean,
    joins: (person: CrewView) => boolean = (person) => canJoin(entry, person.activity),
    together: number = TUNING.together,
    shuffle = true,
  ): CrewView[] | null {
    const firsts = people.filter(
      (person) => fitsWords(entry.who[0]!, person.member) && fits(person),
    );
    for (const first of shuffle ? this.rng.shuffled(firsts) : firsts) {
      const speakers = [first];
      for (const words of entry.who.slice(1)) {
        let best: CrewView | null = null;
        let bestDistance = together;
        for (const person of people) {
          if (speakers.includes(person) || !fitsWords(words, person.member) || !joins(person))
            continue;
          const distance = Math.hypot(person.x - first.x, person.y - first.y);
          const company =
            together === Infinity ? person.deck === first.deck : person.space === first.space;
          if (distance <= bestDistance && company) {
            best = person;
            bestDistance = distance;
          }
        }
        if (!best) break;
        speakers.push(best);
      }
      if (speakers.length === entry.who.length) return speakers;
    }
    return null;
  }

  /** Speakers for a reply to the captain: `person` first, anyone else it needs from nearby. */
  private castAround(entry: DialogEntry, person: CrewView): CrewView[] | null {
    if (entry.who.length === 1) return [person];
    const near = this.life.people.filter(
      (other) => other.deck === person.deck && other.visible && other !== person,
    );
    const nearby = (other: CrewView) =>
      other.space === person.space &&
      Math.hypot(other.x - person.x, other.y - person.y) <= TUNING.together &&
      canJoin(entry, other.activity);
    const others = this.cast({ ...entry, who: entry.who.slice(1) }, near, nearby, nearby);
    return others ? [person, ...others] : null;
  }

  /** Picks one entry by weight: specific lines first, recent ones rarely, used `once` ones never. */
  private choose<T extends { entry: DialogEntry }>(options: readonly T[]): T | null {
    const weighted = options
      .filter(({ entry }) => !(entry.once && this.lastUsed.has(entry.id)))
      .map((option) => {
        const used = this.lastUsed.get(option.entry.id);
        const fresh = used === undefined || this.time - used > TUNING.entryRest ? 1 : 0.03;
        return { option, weight: option.entry.weight * option.entry.specificity * fresh };
      });
    const total = weighted.reduce((sum, { weight }) => sum + weight, 0);
    if (total <= 0) return null;
    let roll = this.rng.next() * total;
    for (const { option, weight } of weighted) {
      roll -= weight;
      if (roll < 0) return option;
    }
    return weighted[weighted.length - 1]!.option;
  }

  private rested(person: CrewView): boolean {
    const spoke = this.spokeAt.get(person.member.id);
    return spoke === undefined || this.time - spoke > TUNING.personRest;
  }

  // ---- Playing --------------------------------------------------------------------------

  private start(
    entry: DialogEntry,
    speakers: readonly CrewView[],
    toCaptain: boolean,
    captain: CaptainView,
  ): void {
    this.lastUsed.set(entry.id, this.time);
    for (const speaker of speakers) this.spokeAt.set(speaker.member.id, this.time);
    this.conversation = { entry, speakers, toCaptain, index: 0, nextAt: this.time };
    this.say(this.conversation, captain);
  }

  /** Says the next line, or ends the conversation after the last. */
  private say(talk: Conversation, captain: CaptainView): void {
    const line = talk.entry.lines[talk.index];
    if (!line) {
      this.stop();
      return;
    }
    const speaker = talk.speakers[line.speaker]!;
    const members: CrewMember[] = talk.speakers.map((person) => person.member);
    const text = fillIn(line.text, members, this.names);
    const seconds = Math.min(7.5, Math.max(2.2, 1.6 + text.length * 0.055));
    talk.index++;
    talk.nextAt = this.time + seconds + TUNING.gap;
    this.current = {
      key: ++this.key,
      speaker,
      name: callSign(speaker.member),
      text,
      toCaptain: talk.toCaptain,
    };
    // Speakers face whoever they're talking to: the captain, or speaker 1 (who faces speaker 2).
    // Someone muttering to themselves carries on with what they were doing.
    if (!talk.toCaptain && talk.speakers.length === 1) return;
    const hold = seconds + TUNING.gap + 1;
    talk.speakers.forEach((person, i) => {
      const other = talk.toCaptain ? null : i === 0 ? talk.speakers[1]! : talk.speakers[0]!;
      const point: [number, number] = other ? [other.x, other.y] : [captain.x, captain.y];
      this.life.attend(person.member.id, point, hold, person === speaker);
    });
  }

  /** Breaks off whatever is being said (a saved game was loaded). */
  hush(): void {
    this.stop();
  }

  private stop(): void {
    if (!this.conversation) return;
    this.conversation = null;
    this.current = null;
    this.nextLook =
      this.time + TUNING.pause[0] + this.rng.next() * (TUNING.pause[1] - TUNING.pause[0]);
  }

  /** The captain walked away, or a speaker went out of sight. */
  private lost(talk: Conversation, captain: CaptainView): boolean {
    const first = talk.speakers[0]!;
    if (first.deck !== captain.deck) return true;
    if (talk.speakers.some((person) => !person.visible)) return true;
    return Math.hypot(first.x - captain.x, first.y - captain.y) > TUNING.lose;
  }
}
