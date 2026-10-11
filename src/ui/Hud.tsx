/**
 * What's on screen while walking: the minimap, the crosshair, what E would do, what the crew
 * are saying, and key hints.
 */
import type { Ship } from '../content/ship';
import { MiniMap } from './map/MiniMap';
import { Speech } from './Speech';
import { gameUi } from './state';
import { useStore } from './store';

export function Hud({ ship }: { ship: Ship }) {
  const prompt = useStore(gameUi, (state) => state.prompt);
  return (
    <>
      <MiniMap ship={ship} />
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
