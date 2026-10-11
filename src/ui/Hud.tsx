/** What's on screen while walking: the minimap (where you are), the crosshair and key hints. */
import type { Ship } from '../content/ship';
import { MiniMap } from './map/MiniMap';

export function Hud({ ship }: { ship: Ship }) {
  return (
    <>
      <MiniMap ship={ship} />
      <div className="crosshair" aria-hidden="true" />
      <div className="hud-hint">
        <kbd>M</kbd> ship map · <kbd>Esc</kbd> pause
      </div>
    </>
  );
}
