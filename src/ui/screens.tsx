/**
 * Full-screen cards: the start screen, the pause screen, and the error shown when the 3D view
 * can't start. All share the controls list.
 */

export function StartScreen({ loading, onStart }: { loading: boolean; onStart: () => void }) {
  return (
    <div className="screen">
      <div className="card" role="dialog" aria-labelledby="title">
        <p className="eyebrow">Prototype · the ship</p>
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

export function PauseScreen({ onResume }: { onResume: () => void }) {
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
      <dd>Use: climb a ladder, take the lift</dd>
      <dt>
        <kbd>M</kbd>
      </dt>
      <dd>Ship map</dd>
      <dt>
        <kbd>Esc</kbd>
      </dt>
      <dd>Pause</dd>
    </dl>
  );
}
