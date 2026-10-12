/**
 * The save slots, listed for saving (the pause screen) or loading (the start and pause screens):
 * each with the ship's day and time and where the captain was, and how long ago it was saved.
 * The autosave can be loaded but not saved over. A line under the list says how the last save or
 * load went.
 */
import { useState } from 'react';
import { slotName, type SlotSummary } from '../saveSlots';
import { clock } from '../sim/schedule';
import { savesUi } from './state';
import { useStore } from './store';

interface SaveSlotsProps {
  readonly purpose: 'save' | 'load';
  readonly onPick: (summary: SlotSummary) => void;
  readonly onBack: () => void;
  /** How the last save or load went, if it's worth saying. */
  readonly note: string | null;
}

export function SaveSlots({ purpose, onPick, onBack, note }: SaveSlotsProps) {
  const slots = useStore(savesUi, (state) => state.slots);
  const shown = purpose === 'save' ? slots.filter((summary) => summary.slot !== 'auto') : slots;
  // "5 min ago" counts from when the list opened.
  const [now] = useState(() => Date.now());
  return (
    <div className="slots">
      <ul className="slot-list" aria-label={purpose === 'save' ? 'Save in' : 'Load'}>
        {shown.map((summary, i) => (
          <li key={summary.slot}>
            <button
              className="slot"
              onClick={() => onPick(summary)}
              disabled={purpose === 'load' && !summary.save}
              autoFocus={i === 0}
            >
              <span className="slot-name">{slotName(summary.slot)}</span>
              <span className="slot-detail">{describeSave(summary)}</span>
              {summary.save && <span className="slot-when">{ago(summary.save.savedAt, now)}</span>}
            </button>
          </li>
        ))}
      </ul>
      {note && (
        <p className="slot-note" role="status">
          {note}
        </p>
      )}
      <button className="button quiet" onClick={onBack}>
        Back
      </button>
    </div>
  );
}

/** "Day 1, 0842 · Bridge, deck 1", "Empty", or "Can't be read". */
export function describeSave(summary: SlotSummary): string {
  const { save } = summary;
  if (save) {
    const time = clock(Math.floor(save.clock.minute)).replace(':', '');
    return `Day ${save.clock.day + 1}, ${time} · ${save.place}`;
  }
  return summary.problem ? "Can't be read" : 'Empty';
}

/** "Just now", "5 min ago", "3 h ago", or the date. */
function ago(savedAt: string, now: number): string {
  const minutes = Math.floor((now - Date.parse(savedAt)) / 60_000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} min ago`;
  if (minutes < 24 * 60) return `${Math.floor(minutes / 60)} h ago`;
  return new Date(savedAt).toLocaleDateString();
}
