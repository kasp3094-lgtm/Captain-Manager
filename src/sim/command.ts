/**
 * The captain's standing: the five command meters (design doc §5) and the state around them.
 * Budget, combat readiness, crew relations, High Command standing and a relation with each
 * named character, plus fatigue and story flags. Everything changes through `apply`, which
 * clamps to each meter's range and logs what changed and why, so the game can always say why a
 * meter moved. Requirements on choices ("Requires: Master Chief — Trusted") are checked here.
 *
 * Pure: no rendering, so the event scripts can be played and tested headless.
 */

/** The meters an effect can change, besides a relation (`rel.<character id>`). */
export const METERS = ['budget', 'readiness', 'crew', 'highCommand', 'fatigue'] as const;
export type Meter = (typeof METERS)[number];

/** What an effect or a requirement names: a meter, or `rel.<character id>`. */
export type Target = Meter | `rel.${string}`;

export interface CommandStart {
  readonly budget: number;
  readonly readiness: number;
  readonly crew: number;
  readonly highCommand: number;
  readonly fatigue: number;
  /** Relations that don't start at 0, by character id. */
  readonly relations: Readonly<Record<string, number>>;
}

/** One change, as the log keeps it. */
export interface Change {
  readonly target: Target;
  /** What actually changed after clamping; 0 if the meter was already at its limit. */
  readonly amount: number;
  readonly before: number;
  readonly after: number;
  /** Why: the event or decision, as the log shows it. */
  readonly cause: string;
}

/** Each meter's range (design doc §5). Budget has no upper limit. */
const RANGES: Record<Meter | 'rel', readonly [number, number]> = {
  budget: [0, Number.POSITIVE_INFINITY],
  readiness: [0, 100],
  crew: [0, 100],
  highCommand: [-100, 100],
  fatigue: [0, 100],
  rel: [-100, 100],
};

/** Tiers, low to high, with the value each starts at (design doc §5). */
const RELATION_TIERS = [
  ['hostile', -100],
  ['strained', -59],
  ['neutral', -19],
  ['trusted', 20],
  ['loyal', 60],
] as const;
const HIGH_COMMAND_TIERS = [
  ['disgraced', -100],
  ['doubted', -59],
  ['unremarkable', -19],
  ['respected', 20],
  ['favoured', 60],
] as const;
const CREW_TIERS = [
  ['mutinous', 0],
  ['sullen', 20],
  ['steady', 40],
  ['good', 60],
  ['devoted', 80],
] as const;

export class Command {
  private readonly values = new Map<string, number>();
  readonly flags = new Set<string>();
  readonly log: Change[] = [];

  constructor(
    start: CommandStart,
    /** Every character with a relation: the named crew. */
    readonly characters: readonly string[],
  ) {
    for (const meter of METERS) this.values.set(meter, start[meter]);
    for (const id of characters) this.values.set(`rel.${id}`, start.relations[id] ?? 0);
  }

  /** True when the target names a meter or a known character's relation. */
  knows(target: string): target is Target {
    return this.values.has(target);
  }

  value(target: Target): number {
    const value = this.values.get(target);
    if (value === undefined) throw new Error(`No such meter or relation: ${target}`);
    return value;
  }

  /** Changes a meter by `amount`, within its range, and logs it. */
  apply(target: Target, amount: number, cause: string): Change {
    const before = this.value(target);
    const [low, high] = RANGES[target.startsWith('rel.') ? 'rel' : (target as Meter)];
    const after = Math.min(high, Math.max(low, before + amount));
    this.values.set(target, after);
    const change = { target, amount: after - before, before, after, cause };
    this.log.push(change);
    return change;
  }

  /** The tier a meter is in, e.g. "trusted"; null for meters without tiers. */
  tier(target: Target): string | null {
    const value = this.value(target);
    const tiers = target.startsWith('rel.')
      ? RELATION_TIERS
      : target === 'highCommand'
        ? HIGH_COMMAND_TIERS
        : target === 'crew'
          ? CREW_TIERS
          : null;
    if (!tiers) return null;
    let name: string = tiers[0][0];
    for (const [tier, from] of tiers) if (value >= from) name = tier;
    return name;
  }

  /**
   * Checks a requirement written in content: `budget>=400`, `readiness<50`, `rel.delgado>=trusted`,
   * `flag:boarded_wren` or `!flag:boarded_wren`. Returns why it isn't met, or null if it is.
   */
  unmet(requirement: string): string | null {
    const parsed = parseRequirement(requirement);
    if (!parsed) return `can't read "${requirement}"`;
    if (parsed.kind === 'flag') {
      return this.flags.has(parsed.flag) === parsed.set
        ? null
        : parsed.set
          ? 'not yet'
          : 'no longer';
    }
    const { target, op, value } = parsed;
    if (!this.knows(target)) return `no such meter: ${target}`;
    const threshold = typeof value === 'number' ? value : tierStart(target, value);
    if (threshold === null) return `no tier "${value}" for ${target}`;
    const current = this.value(target);
    const ok =
      op === '>='
        ? current >= threshold
        : op === '>'
          ? current > threshold
          : op === '<='
            ? current <= threshold
            : current < threshold;
    return ok ? null : 'not met';
  }
}

export type Requirement =
  | { readonly kind: 'flag'; readonly flag: string; readonly set: boolean }
  | {
      readonly kind: 'meter';
      readonly target: Target;
      readonly op: '>=' | '>' | '<=' | '<';
      readonly value: number | string;
    };

/** Reads a requirement written in content; null if it can't be read. */
export function parseRequirement(text: string): Requirement | null {
  const flag = /^(!?)flag:([a-z0-9_-]+)$/.exec(text.trim());
  if (flag) return { kind: 'flag', flag: flag[2]!, set: flag[1] !== '!' };
  const meter = /^((?:rel\.)?[a-zA-Z0-9_-]+)\s*(>=|<=|>|<)\s*(-?\d+|[a-z]+)$/.exec(text.trim());
  if (!meter) return null;
  const raw = meter[3]!;
  return {
    kind: 'meter',
    target: meter[1] as Target,
    op: meter[2] as '>=' | '>' | '<=' | '<',
    value: /^-?\d+$/.test(raw) ? Number(raw) : raw,
  };
}

/** The value a tier starts at for a meter, or null if the meter has no such tier. */
export function tierStart(target: Target, tier: string): number | null {
  const tiers = target.startsWith('rel.')
    ? RELATION_TIERS
    : target === 'highCommand'
      ? HIGH_COMMAND_TIERS
      : target === 'crew'
        ? CREW_TIERS
        : null;
  const found = tiers?.find(([name]) => name === tier);
  return found ? found[1] : null;
}
