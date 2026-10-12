/**
 * The 2D interface laid over the 3D view. Shows what fits the current mode: the start screen,
 * the HUD with the minimap while playing, the pause screen (with saving and loading), the full
 * ship map, the lift's deck buttons, or an event's dialogue; and the fade to black between decks.
 * `?noui` hides it all (clean screenshots); `?debug` adds the debug panel.
 */
import type { Ship } from '../content/ship';
import type { LaunchParams } from '../debug/params';
import { DebugPanel } from './DebugPanel';
import { EventPanel } from './EventPanel';
import { Hud } from './Hud';
import { LiftPanel } from './LiftPanel';
import { ShipMap } from './map/ShipMap';
import { PauseScreen, StartScreen } from './screens';
import { gameUi, playerPose, type GameControls } from './state';
import { useStore } from './store';

interface AppProps {
  readonly game: GameControls;
  readonly params: LaunchParams;
  readonly ship: Ship;
}

export function App({ game, params, ship }: AppProps) {
  const mode = useStore(gameUi, (state) => state.mode);
  const fading = useStore(gameUi, (state) => state.fading);
  const deck = useStore(playerPose, (state) => state.deck);
  if (!params.showUi) return null;
  return (
    <>
      {mode === 'playing' && <Hud ship={ship} />}
      {(mode === 'loading' || mode === 'start') && (
        <StartScreen loading={mode === 'loading'} game={game} />
      )}
      {mode === 'paused' && <PauseScreen game={game} />}
      {mode === 'map' && <ShipMap ship={ship} onClose={game.toggleMap} />}
      {mode === 'lift' && <LiftPanel ship={ship} deck={deck} onChoose={game.chooseDeck} />}
      {mode === 'event' && <EventPanel game={game} />}
      <div className="fade" data-on={fading ? '' : undefined} aria-hidden="true" />
      {params.debug && <DebugPanel />}
    </>
  );
}
