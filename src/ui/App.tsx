/**
 * The 2D interface laid over the 3D view. Shows what fits the current mode: the start screen,
 * the HUD with the minimap while playing, the pause screen, or the full ship map.
 * `?noui` hides it all (clean screenshots); `?debug` adds the debug panel.
 */
import type { Ship } from '../content/ship';
import type { LaunchParams } from '../debug/params';
import { DebugPanel } from './DebugPanel';
import { Hud } from './Hud';
import { ShipMap } from './map/ShipMap';
import { PauseScreen, StartScreen } from './screens';
import { gameUi, type GameControls } from './state';
import { useStore } from './store';

interface AppProps {
  readonly game: GameControls;
  readonly params: LaunchParams;
  readonly ship: Ship;
}

export function App({ game, params, ship }: AppProps) {
  const mode = useStore(gameUi, (state) => state.mode);
  if (!params.showUi) return null;
  return (
    <>
      {mode === 'playing' && <Hud ship={ship} />}
      {(mode === 'loading' || mode === 'start') && (
        <StartScreen loading={mode === 'loading'} onStart={game.requestPlay} />
      )}
      {mode === 'paused' && <PauseScreen onResume={game.requestPlay} />}
      {mode === 'map' && <ShipMap ship={ship} onClose={game.toggleMap} />}
      {params.debug && <DebugPanel />}
    </>
  );
}
