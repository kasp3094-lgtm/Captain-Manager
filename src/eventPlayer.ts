/**
 * Plays events in the running game: the ship-wide call ("Now hear this: Captain to the bridge."),
 * the objective on screen, the crew an event needs walking to its room, and the dialogue panel
 * scene by scene: lines on Continue, choices, notices of what changed, and an outcome card at
 * the end. A `#goto` in a script closes the panel until the captain walks to the next room.
 *
 * Glue between the event rules (src/sim/events.ts), the crew (src/world/crew/life.ts) and the
 * interface (src/ui/EventPanel.tsx); the Game owns it.
 */
import type { Ship } from './content/ship';
import type { Change, Command, Target } from './sim/command';
import { callSign, type CrewMember } from './sim/crew';
import { EventDirector, type EventSignal, type GameEvent } from './sim/events';
import type { Beat, NarrativeHost, Notice, Speaker } from './sim/narrative';
import { findRoom } from './sim/ship';
import { eventUi, gameUi, type EventLine, type EventNotice } from './ui/state';
import type { CrewLife } from './world/crew/life';

/** How long a notice stays in the panel, and a ship-wide call on screen, in milliseconds. */
const NOTICE_MS = 4500;
const CALL_MS = 7000;

export class EventPlayer {
  readonly director: EventDirector;
  /** Crew sent to rooms for the event under way, to let go when it ends. */
  private summoned = new Set<string>();
  private key = 0;

  constructor(
    events: readonly GameEvent[],
    private readonly command: Command,
    private readonly life: CrewLife,
    private readonly ship: Ship,
    private readonly roster: readonly CrewMember[],
    private readonly shipName: string,
    /** Switches the game into the dialogue panel ('event') or back to walking ('playing'). */
    private readonly setMode: (mode: 'event' | 'playing') => void,
  ) {
    this.director = new EventDirector(events, command, (event) => this.host(event));
  }

  /** Each frame while playing: calls, starts and resumes events. `room` is where the captain is. */
  update(day: number, minute: number, room: string | null): void {
    for (const signal of this.director.update(day, minute, room)) this.handle(signal);
  }

  /** `?event=`: calls an event now. */
  force(id: string): boolean {
    const signal = this.director.force(id);
    if (signal) this.handle(signal);
    return signal !== null;
  }

  /** Shows the next line, if a line is waiting for Continue. */
  continue(): void {
    const ui = eventUi.get();
    if (ui.outcome) {
      this.closeOutcome();
      return;
    }
    if (!ui.choices && this.director.active?.status === 'playing') this.pump();
  }

  /** Makes a choice offered in the panel. */
  choose(index: number): void {
    const narrative = this.director.active?.narrative;
    const choice = eventUi.get().choices?.find((candidate) => candidate.index === index);
    if (!narrative || !choice || choice.locked) return;
    narrative.choose(index);
    this.append({ speaker: null, text: choice.text, captain: true });
    this.notify(narrative.takeNotices());
    eventUi.set({ choices: null });
    this.pump();
  }

  closeOutcome(): void {
    if (!eventUi.get().outcome) return;
    eventUi.set({ title: '', lines: [], choices: null, notices: [], outcome: null });
    this.setMode('playing');
  }

  private handle(signal: EventSignal): void {
    const { event } = signal;
    if (signal.kind === 'call') {
      if (signal.text) {
        const call = { key: ++this.key, text: `Now hear this: ${signal.text}` };
        gameUi.set({ call });
        // Gone after a while, so it doesn't play again when the HUD comes back.
        setTimeout(() => {
          if (gameUi.get().call?.key === call.key) gameUi.set({ call: null });
        }, CALL_MS);
      }
      gameUi.set({ objective: this.objective(event.trigger.room) });
      for (const who of event.summon) this.summon(who, event.trigger.room);
      return;
    }
    gameUi.set({ objective: null, call: null });
    eventUi.set({ title: event.title, lines: [], choices: null, notices: [], outcome: null });
    this.setMode('event');
    this.pump();
  }

  /** Plays on until there's something to show: a line, choices, a goto or the end. */
  private pump(): void {
    const narrative = this.director.active?.narrative;
    if (!narrative) return;
    const beat: Beat = narrative.next();
    this.notify(narrative.takeNotices());
    switch (beat.kind) {
      case 'line':
        this.append({
          speaker: beat.speaker && { name: beat.speaker.name, role: beat.speaker.role },
          text: beat.text,
        });
        break;
      case 'choices':
        eventUi.set({ choices: beat.choices.map((choice) => ({ ...choice })) });
        break;
      case 'goto':
        this.director.away(beat.room);
        gameUi.set({ objective: this.objective(beat.room) });
        eventUi.set({ lines: [], choices: null });
        this.setMode('playing');
        break;
      case 'end': {
        const changes = this.director.finish();
        for (const who of this.summoned) this.life.dismiss(who);
        this.summoned.clear();
        eventUi.set({ choices: null, outcome: this.summarise(changes) });
        break;
      }
    }
  }

  private append(line: Omit<EventLine, 'key'>): void {
    eventUi.set({ lines: [...eventUi.get().lines, { ...line, key: ++this.key }] });
  }

  private notify(notices: readonly Notice[]): void {
    if (notices.length === 0) return;
    const added: EventNotice[] = notices.map((notice) => ({ ...notice, key: ++this.key }));
    eventUi.set({ notices: [...eventUi.get().notices, ...added] });
    const keys = new Set(added.map((notice) => notice.key));
    setTimeout(() => {
      eventUi.set({ notices: eventUi.get().notices.filter((notice) => !keys.has(notice.key)) });
    }, NOTICE_MS);
  }

  /** "Go to the Hangar (deck 3)", with the room's short name from the deck plans. */
  private objective(room: string): string {
    const found = findRoom(this.ship, room);
    if (!found) return `Go to ${room}`;
    return `Go to the ${found.room.short ?? found.room.name} (deck ${found.deck.deck})`;
  }

  private summon(who: string, room: string): void {
    this.summoned.add(who);
    this.life.summon(who, room);
  }

  /** What an event changed, meter by meter, for the outcome card. */
  private summarise(changes: readonly Change[]): EventNotice[] {
    const totals = new Map<Target, number>();
    for (const change of changes)
      totals.set(change.target, (totals.get(change.target) ?? 0) + change.amount);
    const lines: EventNotice[] = [];
    for (const [target, amount] of totals) {
      if (amount === 0) continue;
      const tone = (target === 'fatigue' ? -amount : amount) > 0 ? 'up' : 'down';
      const arrow = amount > 0 ? '▲' : '▼';
      const value = this.command.value(target);
      const tier = this.command.tier(target);
      const sign = amount > 0 ? '+' : '−';
      const text =
        target === 'budget'
          ? `Budget ${sign}₡${Math.abs(amount).toLocaleString('en-GB')}, now ₡${value.toLocaleString('en-GB')}`
          : target === 'readiness'
            ? `Readiness ${sign}${Math.abs(amount)} %, now ${value} %`
            : target === 'fatigue'
              ? `Crew fatigue ${arrow}`
              : target === 'crew'
                ? `Crew relations ${arrow} (${capitalise(tier ?? '')})`
                : target === 'highCommand'
                  ? `High Command ${arrow} (${capitalise(tier ?? '')})`
                  : `${this.speaker(target.slice(4), null)?.name ?? target} ${arrow} (${capitalise(tier ?? '')})`;
      lines.push({ key: ++this.key, text, tone });
    }
    return lines;
  }

  /** What a script needs from the game, for one event. */
  private host(event: GameEvent): NarrativeHost {
    return {
      command: this.command,
      cause: event.title,
      ship: this.shipName,
      speaker: (id) => this.speaker(id, event),
      summon: (who, room) => this.summon(who, room),
    };
  }

  /** A named character, whoever holds a job (on duty if possible), or one of the event's cast. */
  private speaker(id: string, event: GameEvent | null): Speaker | null {
    const named = this.roster.find((member) => member.id === id);
    const holders = named ? [] : this.roster.filter((member) => member.billet === id);
    const onDuty = holders.find((member) => this.life.person(member.id)?.activity === 'duty');
    const member = named ?? onDuty ?? holders[0];
    if (member) return { id, name: callSign(member), role: member.title };
    const guest = event?.cast[id];
    return guest ? { id, name: guest.name, role: guest.role } : null;
  }
}

function capitalise(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}
