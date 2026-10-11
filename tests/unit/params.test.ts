import { describe, expect, it } from 'vitest';
import { parseLaunchParams } from '../../src/debug/params';

describe('parseLaunchParams', () => {
  it('defaults to a normal game', () => {
    const params = parseLaunchParams('');
    expect(params).toMatchObject({
      debug: false,
      seed: null,
      cam: null,
      autostart: false,
      showUi: true,
    });
    expect(params.debugFlags.size).toBe(0);
  });

  it('turns debug on with or without a value', () => {
    expect(parseLaunchParams('?debug').debug).toBe(true);
    expect(parseLaunchParams('?debug=1').debug).toBe(true);
    expect(parseLaunchParams('?debug=true').debugFlags.size).toBe(0);
  });

  it('treats off-values as absent', () => {
    for (const off of ['0', 'false', 'off', 'no', 'OFF']) {
      expect(parseLaunchParams(`?debug=${off}`).debug).toBe(false);
      expect(parseLaunchParams(`?autostart=${off}`).autostart).toBe(false);
      expect(parseLaunchParams(`?noui=${off}`).showUi).toBe(true);
    }
  });

  it('keeps known debug flags and drops unknown ones', () => {
    const params = parseLaunchParams('?debug=colliders,warp-drive');
    expect(params.debug).toBe(true);
    expect([...params.debugFlags]).toEqual(['colliders']);
  });

  it('reads integer seeds only', () => {
    expect(parseLaunchParams('?seed=42').seed).toBe(42);
    expect(parseLaunchParams('?seed=-7').seed).toBe(-7);
    expect(parseLaunchParams('?seed=4.2').seed).toBeNull();
    expect(parseLaunchParams('?seed=abc').seed).toBeNull();
    expect(parseLaunchParams('?seed=').seed).toBeNull();
    expect(parseLaunchParams('?seed=99999999999999999999').seed).toBeNull();
  });

  it('reads camera bookmarks as safe lower-case names', () => {
    expect(parseLaunchParams('?cam=Racks').cam).toBe('racks');
    expect(parseLaunchParams('?cam=../etc').cam).toBeNull();
    expect(parseLaunchParams('?cam=').cam).toBeNull();
  });

  it('reads autostart and noui', () => {
    const params = parseLaunchParams('?autostart&noui');
    expect(params.autostart).toBe(true);
    expect(params.showUi).toBe(false);
  });
});
