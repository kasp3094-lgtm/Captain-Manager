/**
 * Launch parameters read from the page URL, e.g. `?debug=colliders&seed=42&cam=racks&autostart`.
 *
 * - `debug`      Show the debug panel. `?debug=a,b` also turns on debug flags (see DEBUG_FLAGS).
 * - `seed`       Integer seed for the simulation's random number generator.
 * - `cam`        Start at a named camera bookmark (used by screenshots and tests).
 * - `autostart`  Skip the start screen and hand over control at once (tests, screenshots).
 * - `noui`       Hide the 2D interface (clean screenshots).
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
}

/** Optional debug features, switched on with `?debug=<flag>,<flag>`. */
export const DEBUG_FLAGS = {
  colliders: 'Show the invisible collision boxes',
} as const;

export type DebugFlag = keyof typeof DEBUG_FLAGS;

const OFF_VALUES = new Set(['0', 'false', 'off', 'no']);
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

  return {
    debug,
    debugFlags,
    seed,
    cam,
    autostart: isOn(params, 'autostart'),
    showUi: !isOn(params, 'noui'),
  };
}
