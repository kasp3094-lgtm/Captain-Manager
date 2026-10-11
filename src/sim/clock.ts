/**
 * Ship's time: which day it is and the minute of the day. Until the day loop (M2) takes over,
 * the clock simply runs at balance.yaml's `time.minutesPerSecond`, so the crew's day plays out
 * while you walk the ship.
 */
import { DAY, clock } from './schedule';

export class ShipClock {
  /** Day 0 is the first day aboard. */
  day: number;
  /** Minutes since midnight, with fractions. */
  minute: number;

  constructor(
    start: { day: number; minute: number },
    /** Ship minutes per real second; 0 stops the clock. */
    public rate: number,
  ) {
    this.day = start.day;
    this.minute = start.minute;
  }

  /** Moves the clock on by `seconds` of real time. */
  advance(seconds: number): void {
    this.minute += seconds * this.rate;
    while (this.minute >= DAY) {
      this.minute -= DAY;
      this.day++;
    }
  }

  /** Minutes since the start of day 0: a single number to compare times by. */
  get total(): number {
    return this.day * DAY + this.minute;
  }

  /** "HH:MM". */
  get time(): string {
    return clock(Math.floor(this.minute));
  }
}
