import type { LaunchParams } from '../debug/params';
import { gameUi, type GameControls } from './state';
import { useStore } from './store';

export function App({ game, params }: { game: GameControls; params: LaunchParams }) {
  const mode = useStore(gameUi, (state) => state.mode);
  if (!params.showUi) return null;
  return (
    <>
      {mode === 'playing' && <Hud />}
      {(mode === 'loading' || mode === 'start') && (
        <StartScreen loading={mode === 'loading'} onStart={game.requestPlay} />
      )}
      {mode === 'paused' && <PauseScreen onResume={game.requestPlay} />}
      {params.debug && <DebugPanel />}
    </>
  );
}

function StartScreen({ loading, onStart }: { loading: boolean; onStart: () => void }) {
  return (
    <div className="screen">
      <div className="card" role="dialog" aria-labelledby="title">
        <p className="eyebrow">Prototype · M0 test compartment</p>
        <h1 id="title" className="title">
          Captain Manager
        </h1>
        <p className="tagline">Everyone on this ship looks at you.</p>
        <button className="button" onClick={onStart} disabled={loading} autoFocus>
          {loading ? 'Loading…' : 'Take command'}
        </button>
        <Controls />
      </div>
    </div>
  );
}

function PauseScreen({ onResume }: { onResume: () => void }) {
  return (
    <div className="screen">
      <div className="card" role="dialog" aria-labelledby="paused">
        <p className="eyebrow">Paused</p>
        <h2 id="paused" className="title small">
          Standing by
        </h2>
        <button className="button" onClick={onResume} autoFocus>
          Resume
        </button>
        <Controls />
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
        <kbd>Esc</kbd>
      </dt>
      <dd>Pause</dd>
    </dl>
  );
}

function Hud() {
  const room = useStore(gameUi, (state) => state.room);
  return (
    <>
      {room && (
        <div className="hud-room" aria-live="polite">
          <span className="hud-room-code">{room.code}</span>
          <span className="hud-room-name">{room.name}</span>
        </div>
      )}
      <div className="crosshair" aria-hidden="true" />
      <div className="hud-hint">Esc to pause</div>
    </>
  );
}

function DebugPanel() {
  const fps = useStore(gameUi, (state) => state.fps);
  const feet = useStore(gameUi, (state) => state.feet);
  const yaw = useStore(gameUi, (state) => state.yawDegrees);
  const seed = useStore(gameUi, (state) => state.seed);
  const drawCalls = useStore(gameUi, (state) => state.drawCalls);
  const locked = useStore(gameUi, (state) => state.pointerLocked);
  return (
    <div className="debug-panel" data-testid="debug-panel">
      <div>fps {fps}</div>
      <div>draw calls {drawCalls}</div>
      <div>
        pos {feet.x.toFixed(2)}, {feet.z.toFixed(2)} · yaw {yaw.toFixed(0)}°
      </div>
      <div>seed {seed}</div>
      <div>pointer {locked ? 'locked' : 'free'}</div>
    </div>
  );
}
