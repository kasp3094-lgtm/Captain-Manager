/**
 * What's on screen while walking: the minimap, the crosshair, what E would do, what the crew
 * are saying, ship-wide calls and where the captain is wanted, and key hints.
 */
import type { Ship } from '../content/ship';
import { MiniMap } from './map/MiniMap';
import { Speech } from './Speech';
import { gameUi } from './state';
import { useStore } from './store';

export function Hud({ ship }: { ship: Ship }) {
  const prompt = useStore(gameUi, (state) => state.prompt);
  const call = useStore(gameUi, (state) => state.call);
  const objective = useStore(gameUi, (state) => state.objective);
  return (
    <>
      <MiniMap ship={ship} />
      {call && (
        // Keyed by the call, so the banner plays again for every new call.
        <div className="ship-call" role="alert" key={call.key}>
          {call.text}
        </div>
      )}
      {objective && (
        <div className="objective" role="status" data-testid="objective">
          {objective}
        </div>
      )}
      <Speech />
      <div className="crosshair" aria-hidden="true" />
      {prompt && (
        <div className="interact-prompt" role="status">
          <kbd>E</kbd>
          {prompt}
        </div>
      )}
      <div className="hud-hint">
        <kbd>E</kbd> use · <kbd>M</kbd> ship map · <kbd>Esc</kbd> pause
      </div>
    </>
  );
}
