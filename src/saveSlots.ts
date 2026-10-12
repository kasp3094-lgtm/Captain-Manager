/**
 * Save slots in the browser: the autosave and three slots of the player's own, kept in
 * localStorage (this browser, this site). Reading a slot checks the save and brings an older one
 * up to date (src/sim/save.ts). Storage can be missing (some private windows) or full: saving
 * then reports failure and the game plays on.
 */
import { parseSave, type SaveFile } from './sim/save';

export const SLOTS = ['auto', '1', '2', '3'] as const;
export type SlotId = (typeof SLOTS)[number];

/** A slot as the save and load lists show it. */
export interface SlotSummary {
  readonly slot: SlotId;
  /** Null when the slot is empty or its save can't be read. */
  readonly save: SaveFile | null;
  /** Why the save in the slot can't be loaded, if it can't. */
  readonly problem: string | null;
}

const KEY = 'captain-manager:save:';

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** Stores a save in a slot; false if the browser won't keep it. */
export function writeSlot(slot: SlotId, save: SaveFile): boolean {
  const store = storage();
  if (!store) return false;
  try {
    store.setItem(KEY + slot, JSON.stringify(save));
    return true;
  } catch (error) {
    console.warn(`Couldn't save in slot ${slot}:`, error);
    return false;
  }
}

export function readSlot(slot: SlotId): SlotSummary {
  const text = readText(slot);
  if (text === null) return { slot, save: null, problem: null };
  const read = parseSave(text);
  return 'save' in read
    ? { slot, save: read.save, problem: null }
    : { slot, save: null, problem: read.error };
}

function readText(slot: SlotId): string | null {
  try {
    return storage()?.getItem(KEY + slot) ?? null;
  } catch {
    return null;
  }
}

export function listSlots(): SlotSummary[] {
  return SLOTS.map(readSlot);
}

/** The most recent save in any slot, for Continue. */
export function latestSave(slots: readonly SlotSummary[]): SlotSummary | null {
  let latest: SlotSummary | null = null;
  for (const summary of slots) {
    if (summary.save && (!latest || summary.save.savedAt > latest.save!.savedAt)) latest = summary;
  }
  return latest;
}

/** "Autosave", "Slot 1". */
export function slotName(slot: SlotId): string {
  return slot === 'auto' ? 'Autosave' : `Slot ${slot}`;
}
