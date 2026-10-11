/**
 * The crew's day: for every crew member, a plan of where they are and what they do from 00:00
 * to 24:00, built from the watch bill and the routine in content/crew/routine.yaml.
 *
 * Watch-standers follow their section's row of the watch bill (duty, sleep, off); day workers
 * work their hours and sleep at night. Sleep starts with a wash; time off is meals plus
 * leisure in places picked by weight. Everyone is in exactly one place at any minute, and
 * rack-mates never sleep at the same time. Pure and seeded per person and day.
 */
import { minutes, type Routine } from '../content/crew';
import { hash, type CrewMember, type Roster } from './crew';
import { Rng } from './rng';

export type Activity = 'duty' | 'patrol' | 'sleep' | 'wash' | 'eat' | 'leisure';

/** One stretch of someone's day. */
export interface Block {
  /** Minutes after midnight; `to` is exclusive and at most DAY. */
  readonly from: number;
  readonly to: number;
  readonly activity: Activity;
  readonly room: string;
}

export const DAY = 24 * 60;
const WASH = 25;
const MEAL = 35;
const LEISURE = { shortest: 45, longest: 100 };
const PATROL = { shortest: 20, longest: 35 };

type Phase = 'duty' | 'sleep' | 'off';
interface Segment {
  from: number;
  to: number;
  phase: Phase;
}

/** Someone's whole day. Deterministic for a crew member and a day number. */
export function dayPlan(member: CrewMember, routine: Routine, day: number): Block[] {
  const rng = Rng.fromSeed(hash(`${member.id}:${day}`));
  const segments = phases(member, routine);
  // Someone who works through every mealtime (the cooks) eats at the start of their longest break.
  const offs = segments.filter((segment) => segment.phase === 'off');
  const ownMeal = offs.some((segment) => mealsIn(routine, segment).length > 0)
    ? null
    : offs.reduce<Segment | null>(
        (best, s) => (!best || s.to - s.from > best.to - best.from ? s : best),
        null,
      );
  const blocks: Block[] = [];
  segments.forEach((segment, i) => {
    const previous = segments[(i + segments.length - 1) % segments.length]!;
    if (segment.phase === 'sleep') {
      let from = segment.from;
      // Wash before turning in, unless this is the same night continuing after midnight.
      if (previous.phase !== 'sleep' && segment.to - from > WASH * 2) {
        blocks.push({ from, to: from + WASH, activity: 'wash', room: routine.heads[member.group] });
        from += WASH;
      }
      blocks.push({ from, to: segment.to, activity: 'sleep', room: sleepRoom(member, routine) });
    } else if (segment.phase === 'duty') {
      blocks.push(...duty(member, segment, rng));
    } else {
      blocks.push(...timeOff(member, routine, segment, rng, segment === ownMeal));
    }
  });
  return merge(blocks);
}

/** The parts of mealtimes that fall in a stretch of time off, long enough for a meal. */
function mealsIn(routine: Routine, segment: Segment): [number, number][] {
  return Object.values(routine.meals)
    .map(([start, end]): [number, number] => [
      Math.max(segment.from, minutes(start)),
      Math.min(segment.to, minutes(end)),
    ])
    .filter(([from, to]) => to - from >= MEAL);
}

/** The block someone is in at a minute of the day. */
export function blockAt(plan: readonly Block[], minute: number): Block {
  const t = ((minute % DAY) + DAY) % DAY;
  return plan.find((block) => t >= block.from && t < block.to) ?? plan[plan.length - 1]!;
}

/** The block after the one at `minute` (wrapping past midnight to the plan's first). */
export function nextBlock(plan: readonly Block[], minute: number): Block {
  const t = ((minute % DAY) + DAY) % DAY;
  const index = plan.findIndex((block) => t >= block.from && t < block.to);
  return plan[(index + 1) % plan.length]!;
}

/** Duty, sleep and time off across the day, before meals and leisure are filled in. */
function phases(member: CrewMember, routine: Routine): Segment[] {
  if (member.watch !== 'day') {
    const section = member.watch;
    return routine.watches.map((row) => ({
      from: minutes(row.from),
      to: minutes(row.to),
      phase: row[section],
    }));
  }
  // Day workers: start from time off, then mark sleep and working hours.
  const marks = new Array<Phase>(DAY).fill('off');
  const mark = ([from, to]: readonly [number, number], phase: Phase) => {
    for (let t = from; t !== to; t = (t + 1) % DAY) marks[t] = phase;
  };
  mark([minutes(routine.daySleep[0]), minutes(routine.daySleep[1])], 'sleep');
  const hours = member.hours ?? routine.dayWork.map(([a, b]) => [minutes(a), minutes(b)] as const);
  for (const span of hours) mark(span, 'duty');
  const segments: Segment[] = [];
  for (let t = 0; t < DAY; t++) {
    const last = segments[segments.length - 1];
    if (last && last.phase === marks[t]) last.to = t + 1;
    else segments.push({ from: t, to: t + 1, phase: marks[t]! });
  }
  return segments;
}

function sleepRoom(member: CrewMember, routine: Routine): string {
  return member.berth?.room ?? routine.berthing[member.group][0]!;
}

/** On duty: at the station, or making rounds of the patrol rooms. */
function duty(member: CrewMember, segment: Segment, rng: Rng): Block[] {
  if (member.patrol.length === 0) {
    return [{ from: segment.from, to: segment.to, activity: 'duty', room: member.station }];
  }
  const blocks: Block[] = [];
  let index = rng.int(0, member.patrol.length - 1);
  for (let from = segment.from; from < segment.to;) {
    const length = rng.int(PATROL.shortest, PATROL.longest);
    const to = segment.to - (from + length) < PATROL.shortest ? segment.to : from + length;
    blocks.push({
      from,
      to,
      activity: 'patrol',
      room: member.patrol[index % member.patrol.length]!,
    });
    index++;
    from = to;
  }
  return blocks;
}

/** Off duty and awake: a meal at any mealtime in reach (or first, if none is), leisure between. */
function timeOff(
  member: CrewMember,
  routine: Routine,
  segment: Segment,
  rng: Rng,
  mealFirst: boolean,
): Block[] {
  const mess = routine.mess[member.group];
  const meals: Block[] = mealsIn(routine, segment).map(([from, to]) => {
    const at = from + rng.int(0, to - from - MEAL);
    return { from: at, to: at + MEAL, activity: 'eat', room: mess };
  });
  if (mealFirst && segment.to - segment.from >= MEAL + 10) {
    meals.push({
      from: segment.from + 10,
      to: segment.from + 10 + MEAL,
      activity: 'eat',
      room: mess,
    });
  }
  meals.sort((a, b) => a.from - b.from);

  const blocks: Block[] = [];
  let cursor = segment.from;
  let last: string | null = null;
  const fill = (until: number) => {
    while (cursor < until) {
      const length = rng.int(LEISURE.shortest, LEISURE.longest);
      const to = until - (cursor + length) < 30 ? until : cursor + length;
      const room = leisureRoom(member, routine, rng, last);
      blocks.push({ from: cursor, to, activity: 'leisure', room });
      last = room;
      cursor = to;
    }
  };
  for (const meal of meals) {
    fill(meal.from);
    blocks.push(meal);
    last = meal.room;
    cursor = meal.to;
  }
  fill(segment.to);
  return blocks;
}

function leisureRoom(member: CrewMember, routine: Routine, rng: Rng, last: string | null): string {
  const weights = Object.entries(routine.leisure[member.group]).map(
    ([room, weight]) => [room === 'berthing' ? sleepRoom(member, routine) : room, weight] as const,
  );
  const options = weights.filter(([room]) => room !== last);
  const pool = options.length > 0 ? options : weights;
  const total = pool.reduce((sum, [, weight]) => sum + weight, 0);
  let roll = rng.next() * total;
  for (const [room, weight] of pool) {
    roll -= weight;
    if (roll < 0) return room;
  }
  return pool[pool.length - 1]![0];
}

/** Joins neighbouring blocks that do the same thing in the same place. */
function merge(blocks: readonly Block[]): Block[] {
  const out: Block[] = [];
  for (const block of blocks) {
    const last = out[out.length - 1];
    if (
      last &&
      last.to === block.from &&
      last.activity === block.activity &&
      last.room === block.room
    ) {
      out[out.length - 1] = { ...last, to: block.to };
    } else {
      out.push(block);
    }
  }
  return out;
}

/**
 * The schedule rules: every plan covers the whole day with no gaps or overlaps, people sleep in
 * their own berthing, and no rack has two sleepers at once. Returns problems as sentences.
 */
export function checkSchedules(roster: Roster, routine: Routine, days = 2): string[] {
  const problems: string[] = [];
  const sleepers = new Map<string, { id: string; plans: Block[][] }[]>();
  for (const member of roster.members) {
    const plans: Block[][] = [];
    for (let day = 0; day < days; day++) {
      const plan = dayPlan(member, routine, day);
      plans.push(plan);
      let cursor = 0;
      for (const block of plan) {
        if (block.from !== cursor) {
          problems.push(`${member.id}: day ${day} has a gap or overlap at ${clock(cursor)}`);
          break;
        }
        cursor = block.to;
        if (block.activity === 'sleep' && member.berth && block.room !== member.berth.room) {
          problems.push(
            `${member.id}: sleeps in ${block.room}, not their berth ${member.berth.room}`,
          );
        }
      }
      if (cursor !== DAY) problems.push(`${member.id}: day ${day} ends at ${clock(cursor)}`);
    }
    if (member.berth) {
      const key = `${member.berth.room}#${member.berth.rack}`;
      sleepers.set(key, [...(sleepers.get(key) ?? []), { id: member.id, plans }]);
    }
  }
  for (const [rack, people] of sleepers) {
    if (people.length < 2) continue;
    for (let day = 0; day < days; day++) {
      for (let t = 0; t < DAY; t += 5) {
        const asleep = people.filter(({ plans }) => blockAt(plans[day]!, t).activity === 'sleep');
        if (asleep.length > 1) {
          problems.push(
            `rack ${rack}: ${asleep.map((p) => p.id).join(' and ')} both sleep at ${clock(t)}`,
          );
          t = DAY;
        }
      }
    }
  }
  return problems;
}

/** Minutes after midnight as "HH:MM". */
export function clock(minute: number): string {
  const t = ((Math.round(minute) % DAY) + DAY) % DAY;
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}
