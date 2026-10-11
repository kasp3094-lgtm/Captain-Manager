/** Debug figures, shown with `?debug`: frame rate, draw calls, position on the plan, seed. */
import { gameUi, playerPose } from './state';
import { useStore } from './store';

export function DebugPanel() {
  const fps = useStore(gameUi, (state) => state.fps);
  const drawCalls = useStore(gameUi, (state) => state.drawCalls);
  const seed = useStore(gameUi, (state) => state.seed);
  const locked = useStore(gameUi, (state) => state.pointerLocked);
  const pose = useStore(playerPose, (state) => state);
  return (
    <div className="debug-panel" data-testid="debug-panel">
      <div>fps {fps}</div>
      <div>draw calls {drawCalls}</div>
      <div>
        deck {pose.deck} · x {pose.x.toFixed(1)} y {pose.y.toFixed(1)} ·{' '}
        {pose.yawDegrees.toFixed(0)}°
      </div>
      <div>seed {seed}</div>
      <div>pointer {locked ? 'locked' : 'free'}</div>
    </div>
  );
}
