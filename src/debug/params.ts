/**
 * Launch parameters read from the page URL, e.g. `?debug=colliders&seed=42&cam=bridge&autostart`.
 *
 * - `debug`      Show the debug panel. `?debug=a,b` also turns on debug flags (see DEBUG_FLAGS).
 * - `seed`       Integer seed for the simulation's random number generator.
 * - `cam`        Start at a viewpoint: a room id, a shaft stop such as `ladder-fwd-deck2`, or
 *                `spawn` (src/world/ship/layout.ts makes them; screenshots and tests use them).
 * - `autostart`  Skip the start screen and hand over control at once (tests, screenshots).
 * - `noui`       Hide the 2D interface (clean screenshots).
 * - `time`       Start at a ship's time, `1555` or `15:55`, instead of balance.yaml's.
 * - `timescale`  Run ship's time and the crew this many times faster; 0 freezes them (screenshots).
 * - `dialog`     Play this walk-by dialog entry (an id from content/dialog/) as soon as the people
 *                it needs are on the captain's deck, and again after every pause: for writers.
 * - `event`      Call this event (an id from content/events/) as soon as the game starts, whatever
 *                the time: for writers and tests.
 *
 * A parameter given as `0`, `false`, `off` or `no` counts as absent.
 */
export interface LaunchParams {
  readonly debug: boolean;
  readonly debugFlags: ReadonlySet<DebugFlag>;
  readonly seed: number | null;
  readonly cam: string | null;
  readonly autostart: boolean;
  readonly showUi: boolean;
  /** Minutes after midnight, or null for balance.yaml's start time. */
  readonly time: number | null;
  readonly timeScale: number;
  readonly dialog: string | null;
  readonly event: string | null;
}

/** Optional debug features, switched on with `?debug=<flag>,<flag>`. */
const DEBUG_FLAGS = {
  colliders: 'Show the invisible collision boxes',
} as const;

export type DebugFlag = keyof typeof DEBUG_FLAGS;

const OFF_VALUES = new Set(['0', 'false', 'off', 'no']);
/** Faster than this and the crew can't keep up with their own day. */
const MAX_TIME_SCALE = 120;
const ON_VALUES = new Set(['', '1', 'true', 'on', 'yes']);

function value(params: URLSearchParams, name: string): string | null {
  const raw = params.get(name);
  return raw === null ? null : raw.trim().toLowerCase();
}

function isOn(params: URLSearchParams, name: string): boolean {
  const raw = value(params, name);
  return raw !== null && !OFF_VALUES.has(raw);
}

function isDebugFlag(flag: string): flag is DebugFlag {
  return Object.hasOwn(DEBUG_FLAGS, flag);
}

export function parseLaunchParams(search: string): LaunchParams {
  const params = new URLSearchParams(search);

  const debug = isOn(params, 'debug');
  const debugValue = value(params, 'debug') ?? '';
  const debugFlags = new Set<DebugFlag>();
  if (debug && !ON_VALUES.has(debugValue)) {
    for (const flag of debugValue.split(',').map((f) => f.trim())) {
      if (isDebugFlag(flag)) debugFlags.add(flag);
    }
  }

  const seedValue = params.get('seed')?.trim() ?? '';
  const seedNumber = /^-?\d+$/.test(seedValue) ? Number(seedValue) : NaN;
  const seed = Number.isSafeInteger(seedNumber) ? seedNumber : null;

  const camValue = params.get('cam')?.trim() ?? '';
  const cam = /^[a-z0-9_-]+$/i.test(camValue) ? camValue.toLowerCase() : null;

  const timeValue = /^([01]\d|2[0-3]):?([0-5]\d)$/.exec(params.get('time')?.trim() ?? '');
  const time = timeValue ? Number(timeValue[1]) * 60 + Number(timeValue[2]) : null;

  const scaleValue = params.get('timescale')?.trim() ?? '';
  const scale = /^\d+(\.\d+)?$/.test(scaleValue) ? Number(scaleValue) : NaN;
  const timeScale = Number.isFinite(scale) && scale <= MAX_TIME_SCALE ? scale : 1;

  const dialogValue = params.get('dialog')?.trim() ?? '';
  const dialog = /^[a-z0-9]+(-[a-z0-9]+)*$/.test(dialogValue) ? dialogValue : null;

  const eventValue = params.get('event')?.trim() ?? '';
  const event = /^[a-z0-9]+(-[a-z0-9]+)*$/.test(eventValue) ? eventValue : null;

  return {
    debug,
    debugFlags,
    seed,
    cam,
    autostart: isOn(params, 'autostart'),
    showUi: !isOn(params, 'noui'),
    time,
    timeScale,
    dialog,
    event,
  };
}
