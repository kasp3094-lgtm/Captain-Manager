/**
 * Plays an event's Ink script: line by line, with who says it, then the choices, some locked
 * with the reason ("Requires: Lt. Holm — Trusted") and some with a cost ("₡300"). The script
 * changes the command meters through fx() and the game says who noticed ("Lt. Cmdr. Okafor will
 * remember that."), never the number, except for budget and readiness.
 *
 * Tags the game reads (tech plan §3): on a line, `#speaker:<id>` (a named character, a job, or
 * one of the event's cast) and `#goto:<room>` (the captain must walk there before the story goes
 * on); on a choice, `#req:<requirement>` and `#cost:budget:<credits>`. A choice that needs a flag
 * stays hidden until the flag is set. Pure: tests play every branch headless.
 */
import { Story } from 'inkjs';
import type { Command, Target } from './command';

/** Who says a line, as the dialogue shows it. */
export interface Speaker {
  readonly id: string;
  /** "Lt. Cmdr. Okafor", "Captain Ilse Varga". */
  readonly name: string;
  /** "Executive officer", "Master of the Sable Wren". */
  readonly role: string;
}

export interface ChoiceView {
  /** Pass to choose(). */
  readonly index: number;
  readonly text: string;
  /** "₡300", if it costs something. */
  readonly cost: string | null;
  /** Why it can't be picked ("Requires: Lt. Holm — Trusted"); null if it can. */
  readonly locked: string | null;
}

export type Beat =
  | { readonly kind: 'line'; readonly speaker: Speaker | null; readonly text: string }
  | { readonly kind: 'choices'; readonly choices: readonly ChoiceView[] }
  | { readonly kind: 'goto'; readonly room: string }
  | { readonly kind: 'end' };

/** A short note that something changed: "−₡300", "The crew approve." */
export interface Notice {
  readonly text: string;
  /** Good news, bad news, or neither. */
  readonly tone: 'up' | 'down' | 'even';
}

/** What the script needs from the game. */
export interface NarrativeHost {
  readonly command: Command;
  /** The event's title, for the log. */
  readonly cause: string;
  /** A speaker by id: a named character, a job (whoever holds it), or a cast member. */
  speaker(id: string): Speaker | null;
  /** The ship's name as the crew say it. */
  readonly ship: string;
  /** Sends a crew member to a room, to wait there until the event ends. */
  summon(who: string, room: string): void;
}

export class Narrative {
  private readonly story: Story;
  /** Notices since the last call to takeNotices(). */
  private notices: Notice[] = [];
  private pendingGoto: string | null = null;
  /** Choices as last offered, to check a pick against. */
  private offered: ChoiceView[] = [];

  constructor(
    json: string,
    private readonly host: NarrativeHost,
  ) {
    this.story = new Story(json);
    this.bind();
  }

  /** The next thing to show. Call again after a line or a goto; after choices, call choose(). */
  next(): Beat {
    if (this.pendingGoto) {
      const room = this.pendingGoto;
      this.pendingGoto = null;
      return { kind: 'goto', room };
    }
    while (this.story.canContinue) {
      const text = (this.story.Continue() ?? '').trim();
      const tags = parseTags(this.story.currentTags ?? []);
      if (tags.goto) this.pendingGoto = tags.goto;
      if (text === '') {
        if (this.pendingGoto) return this.next();
        continue;
      }
      return { kind: 'line', speaker: tags.speaker ? this.host.speaker(tags.speaker) : null, text };
    }
    const choices = this.story.currentChoices
      .map((choice) => this.view(choice.index, choice.text, parseTags(choice.tags ?? [])))
      .filter((choice): choice is ChoiceView => choice !== null);
    this.offered = choices;
    if (choices.length > 0) return { kind: 'choices', choices };
    return { kind: 'end' };
  }

  /** Picks a choice that was offered and isn't locked. */
  choose(index: number): void {
    const choice = this.offered.find((offered) => offered.index === index);
    if (!choice) throw new Error(`Choice ${index} wasn't offered`);
    if (choice.locked) throw new Error(`Choice ${index} is locked: ${choice.locked}`);
    this.offered = [];
    this.story.ChooseChoiceIndex(index);
  }

  /** What changed since last asked, as notices for the player. */
  takeNotices(): Notice[] {
    const notices = this.notices;
    this.notices = [];
    return notices;
  }

  /** Where the script has got to, for save files (src/sim/save.ts). */
  save(): string {
    return this.story.state.ToJson() as string;
  }

  /** Picks the script up where a save left it (between scenes: never with choices waiting). */
  load(saved: string): void {
    this.story.state.LoadJson(saved);
    this.pendingGoto = null;
    this.offered = [];
    this.notices = [];
  }

  private view(index: number, text: string, tags: Tags): ChoiceView | null {
    const command = this.host.command;
    const requirements = [...tags.req];
    let cost: string | null = null;
    if (tags.cost) {
      cost = `₡${tags.cost.toLocaleString('en-GB')}`;
      requirements.push(`budget>=${tags.cost}`);
    }
    let locked: string | null = null;
    for (const requirement of requirements) {
      const unmet = command.unmet(requirement);
      if (!unmet) continue;
      // Options that need something the captain did earlier stay secret until they did it.
      if (requirement.includes('flag:')) return null;
      locked ??= this.describe(requirement);
    }
    return { index, text: text.trim(), cost, locked };
  }

  /** "Requires: Lt. Holm — Trusted", "Requires: ₡300", "Requires: readiness 60 %". */
  private describe(requirement: string): string {
    const [, target = '', , value = ''] =
      /^((?:rel\.)?[\w-]+)\s*(>=|<=|>|<)\s*(.+)$/.exec(requirement) ?? [];
    if (target.startsWith('rel.')) {
      const who = this.host.speaker(target.slice(4))?.name ?? target.slice(4);
      return `Requires: ${who} — ${capitalise(value)}`;
    }
    if (target === 'budget') return `Requires: ₡${Number(value).toLocaleString('en-GB')}`;
    if (target === 'readiness') return `Requires: readiness ${value} %`;
    if (target === 'crew' || target === 'highCommand') {
      const meter = target === 'crew' ? 'Crew' : 'High Command';
      return `Requires: ${meter} — ${capitalise(value)}`;
    }
    return `Requires: ${requirement}`;
  }

  /** The functions every script can call (declared for it by src/content/ink.ts). */
  private bind(): void {
    const { story, host } = this;
    const command = host.command;
    story.BindExternalFunction('fx', (what: string, amount: number) => {
      if (!command.knows(what)) throw new Error(`fx: no meter or relation "${what}"`);
      const change = command.apply(what, amount, host.cause);
      if (change.amount !== 0) this.notices.push(this.notice(what, change.amount));
    });
    story.BindExternalFunction('flag', (name: string) => {
      command.flags.add(name);
    });
    story.BindExternalFunction('has', (name: string) => command.flags.has(name), true);
    story.BindExternalFunction('meter', (what: string) => command.value(what as Target), true);
    story.BindExternalFunction('tier', (what: string) => command.tier(what as Target) ?? '', true);
    story.BindExternalFunction('summon', (who: string, room: string) => host.summon(who, room));
    story.BindExternalFunction('name', (who: string) => host.speaker(who)?.name ?? who, true);
    story.BindExternalFunction(
      'last',
      (who: string) => host.speaker(who)?.name.split(' ').pop() ?? who,
      true,
    );
    story.BindExternalFunction('ship', () => host.ship, true);
  }

  private notice(target: Target, amount: number): Notice {
    const tone = amount > 0 ? 'up' : 'down';
    switch (target) {
      case 'budget':
        return {
          text: `${amount > 0 ? '+' : '−'}₡${Math.abs(amount).toLocaleString('en-GB')}`,
          tone,
        };
      case 'readiness':
        return { text: `Readiness ${amount > 0 ? '+' : '−'}${Math.abs(amount)} %`, tone };
      case 'fatigue':
        // More fatigue is bad news.
        return {
          text: amount > 0 ? 'The crew are wearier.' : 'The crew are better rested.',
          tone: amount > 0 ? 'down' : 'up',
        };
      case 'crew':
        return { text: amount > 0 ? 'The crew approve.' : "The crew won't like that.", tone };
      case 'highCommand':
        return {
          text: amount > 0 ? 'High Command will approve.' : "High Command won't like that.",
          tone,
        };
      default: {
        const who = this.host.speaker(target.slice(4))?.name ?? target.slice(4);
        return { text: `${who} will remember that.`, tone };
      }
    }
  }
}

interface Tags {
  speaker?: string;
  goto?: string;
  req: string[];
  cost?: number;
}

/** Reads `#speaker:okafor`, `#goto:hangar`, `#req:…` and `#cost:budget:300`. */
function parseTags(tags: readonly string[]): Tags {
  const out: Tags = { req: [] };
  for (const raw of tags) {
    const tag = raw.trim();
    const colon = tag.indexOf(':');
    if (colon < 0) continue;
    const [name, value] = [tag.slice(0, colon).trim(), tag.slice(colon + 1).trim()];
    if (name === 'speaker') out.speaker = value;
    else if (name === 'goto') out.goto = value;
    else if (name === 'req') out.req.push(value);
    else if (name === 'cost') {
      const cost = /^budget:(\d+)$/.exec(value);
      if (cost) out.cost = Number(cost[1]);
    }
  }
  return out;
}

function capitalise(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}
