import { describe, expect, it } from 'vitest';
import { balance, crew } from '../../src/content/gameContent';
import { Command, parseRequirement } from '../../src/sim/command';

const characters = crew.characters.characters.map((character) => character.id);
const fresh = () => new Command(balance.command, characters);

describe('command meters', () => {
  it('start where balance.yaml says, relations at 0 unless set', () => {
    const command = fresh();
    expect(command.value('budget')).toBe(balance.command.budget);
    expect(command.value('readiness')).toBe(balance.command.readiness);
    expect(command.value('rel.okafor')).toBe(balance.command.relations['okafor']);
    expect(command.value('rel.delgado')).toBe(0);
    expect(command.knows('rel.nobody')).toBe(false);
  });

  it('change only within their ranges, and log every change with its cause', () => {
    const command = fresh();
    const change = command.apply('readiness', 500, 'a miracle');
    expect(command.value('readiness')).toBe(100);
    expect(change).toMatchObject({
      amount: 100 - balance.command.readiness,
      after: 100,
      cause: 'a miracle',
    });
    command.apply('rel.sethi', -300, 'a row');
    expect(command.value('rel.sethi')).toBe(-100);
    command.apply('budget', -1e9, 'a refit');
    expect(command.value('budget')).toBe(0);
    expect(command.log.map((entry) => entry.target)).toEqual(['readiness', 'rel.sethi', 'budget']);
  });

  it('name tiers as the design doc does', () => {
    const command = fresh();
    const tierAt = (target: 'rel.holm' | 'highCommand' | 'crew', value: number) => {
      command.apply(target, value - command.value(target), 'test');
      return command.tier(target);
    };
    expect(tierAt('rel.holm', -60)).toBe('hostile');
    expect(tierAt('rel.holm', -59)).toBe('strained');
    expect(tierAt('rel.holm', 19)).toBe('neutral');
    expect(tierAt('rel.holm', 20)).toBe('trusted');
    expect(tierAt('rel.holm', 60)).toBe('loyal');
    expect(tierAt('highCommand', 25)).toBe('respected');
    expect(tierAt('crew', 39)).toBe('sullen');
    expect(tierAt('crew', 80)).toBe('devoted');
    expect(command.tier('budget')).toBeNull();
  });

  it('check requirements on choices', () => {
    const command = fresh();
    expect(command.unmet(`budget>=${balance.command.budget}`)).toBeNull();
    expect(command.unmet(`budget>=${balance.command.budget + 1}`)).toBe('not met');
    expect(command.unmet('rel.delgado>=trusted')).toBe('not met');
    command.apply('rel.delgado', 25, 'backed her at mast');
    expect(command.unmet('rel.delgado>=trusted')).toBeNull();
    expect(command.unmet('flag:boarded_wren')).toBe('not yet');
    command.flags.add('boarded_wren');
    expect(command.unmet('flag:boarded_wren')).toBeNull();
    expect(command.unmet('!flag:boarded_wren')).toBe('no longer');
    expect(command.unmet('rel.delgado>=friendly')).toMatch(/no tier/);
    expect(parseRequirement('budget >= 400')).toMatchObject({
      target: 'budget',
      op: '>=',
      value: 400,
    });
    expect(parseRequirement('three wishes')).toBeNull();
  });
});
