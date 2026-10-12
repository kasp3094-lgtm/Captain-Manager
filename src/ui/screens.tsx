/**
 * Full-screen cards: the start screen (take command, or continue a saved game), the pause screen
 * (resume, save, load), and the error shown when the 3D view can't start. The first two share the
 * controls list.
 */
import { useState } from 'react';
import { latestSave, type SlotSummary } from '../saveSlots';
import { SaveSlots, describeSave } from './SaveSlots';
import { savesUi, type GameControls } from './state';
import { useStore } from './store';

export function StartScreen({ loading, game }: { loading: boolean; game: GameControls }) {
  const slots = useStore(savesUi, (state) => state.slots);
  const [choosing, setChoosing] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const latest = loading ? null : latestSave(slots);
  const load = (summary: SlotSummary) => setNote(game.loadGame(summary.slot));
  return (
    <div className="screen">
      <div className="card" role="dialog" aria-labelledby="title">
        <p className="eyebrow">Prototype · the ship</p>
        <h1 id="title" className="title">
          Captain Manager
        </h1>
        <p className="tagline">Everyone on this ship looks at you.</p>
        {choosing ? (
          <SaveSlots
            purpose="load"
            onPick={load}
            onBack={() => {
              setChoosing(false);
              setNote(null);
            }}
            note={note}
          />
        ) : (
          <div className="menu">
            {latest && (
              <button className="button" onClick={() => load(latest)} autoFocus>
                Continue
                <span className="button-detail">{describeSave(latest)}</span>
              </button>
            )}
            <button
              className={latest ? 'button quiet' : 'button'}
              onClick={game.requestPlay}
              disabled={loading}
              autoFocus={!latest}
            >
              {loading ? 'Loading…' : 'Take command'}
            </button>
            {latest && (
              <button className="button quiet" onClick={() => setChoosing(true)}>
                Load game
              </button>
            )}
            {note && (
              <p className="slot-note" role="status">
                {note}
              </p>
            )}
          </div>
        )}
        <Controls />
      </div>
    </div>
  );
}

export function PauseScreen({ game }: { game: GameControls }) {
  const [view, setView] = useState<'menu' | 'save' | 'load'>('menu');
  const [note, setNote] = useState<string | null>(null);
  const show = (next: 'menu' | 'save' | 'load') => {
    setView(next);
    setNote(null);
  };
  return (
    <div className="screen">
      <div className="card" role="dialog" aria-labelledby="paused">
        <p className="eyebrow">Paused</p>
        <h2 id="paused" className="title small">
          {view === 'save' ? 'Save game' : view === 'load' ? 'Load game' : 'Standing by'}
        </h2>
        {view === 'menu' ? (
          <>
            <div className="menu">
              <button className="button" onClick={game.requestPlay} autoFocus>
                Resume
              </button>
              <button className="button quiet" onClick={() => show('save')}>
                Save game
              </button>
              <button className="button quiet" onClick={() => show('load')}>
                Load game
              </button>
            </div>
            <Controls />
          </>
        ) : (
          <SaveSlots
            purpose={view}
            onPick={(summary) =>
              setNote(view === 'save' ? game.saveGame(summary.slot) : game.loadGame(summary.slot))
            }
            onBack={() => show('menu')}
            note={note}
          />
        )}
      </div>
    </div>
  );
}

/** Shown instead of the game when the 3D view can't start (usually: no WebGL 2). */
export function FatalError({ message }: { message: string }) {
  return (
    <div className="screen">
      <div className="card" role="alert">
        <p className="eyebrow">Can't start</p>
        <h1 className="title small">The ship won't load</h1>
        <p className="tagline">
          This game needs WebGL 2. Try a current version of Chrome, Edge or Firefox, and check that
          hardware acceleration is switched on.
        </p>
        <pre className="error-detail">{message}</pre>
      </div>
    </div>
  );
}

function Controls() {
  return (
    <dl className="controls">
      <dt>
        <kbd>W</kbd> <kbd>A</kbd> <kbd>S</kbd> <kbd>D</kbd>
      </dt>
      <dd>Walk</dd>
      <dt>Mouse</dt>
      <dd>Look around</dd>
      <dt>
        <kbd>Shift</kbd>
      </dt>
      <dd>Walk faster</dd>
      <dt>
        <kbd>E</kbd>
      </dt>
      <dd>Use: climb a ladder, take the lift, talk to someone</dd>
      <dt>
        <kbd>M</kbd>
      </dt>
      <dd>Ship map</dd>
      <dt>
        <kbd>Esc</kbd>
      </dt>
      <dd>Pause, save and load</dd>
    </dl>
  );
}
