/**
 * The always-on minimap in the top-right corner of the HUD: the deck around the captain (bow to
 * the left), the deck and room you are in, and the nearest point of interest.
 */
import type { Ship } from '../../content/ship';
import { gameUi, playerPose } from '../state';
import { useStore } from '../store';
import { DeckPlan, PlayerMarker } from './DeckPlan';
import { PoiSwatch } from './poi';

/** How much of the deck the minimap shows around the captain, in metres. */
const VIEW = { width: 24, height: 15 };

export function MiniMap({ ship }: { ship: Ship }) {
  const pose = useStore(playerPose, (state) => state);
  const room = useStore(gameUi, (state) => state.room);
  const nearby = useStore(gameUi, (state) => state.nearbyPoi);
  const deck = ship.decks.find((candidate) => candidate.deck === pose.deck);
  if (!deck) return null;

  const viewBox = `${pose.x - VIEW.width / 2} ${pose.y - VIEW.height / 2} ${VIEW.width} ${VIEW.height}`;
  return (
    <section className="minimap" aria-label="Where you are">
      <header className="minimap-header">
        <span className="minimap-deck">
          Deck {deck.deck} · {deck.name}
        </span>
        {room && (
          <>
            {room.code && <span className="minimap-code">{room.code}</span>}
            {/* Keep a short last word ("…Berthing A") from wrapping onto a line of its own. */}
            <span className="minimap-room">{room.name.replace(/ (\S{1,3})$/, '\u00a0$1')}</span>
          </>
        )}
      </header>
      <svg className="minimap-svg" viewBox={viewBox} aria-hidden="true">
        <DeckPlan
          ship={ship}
          deck={deck}
          currentRoomId={room?.id ?? null}
          nearbyPoiName={nearby?.name ?? null}
        />
        <PlayerMarker pose={pose} />
      </svg>
      <footer className="minimap-footer">
        {nearby ? (
          <span className="minimap-nearby">
            <PoiSwatch kind={nearby.kind} />
            {nearby.name} · {nearby.distance.toFixed(1)} m
          </span>
        ) : (
          <span>◄ Bow</span>
        )}
        <span>
          <kbd>M</kbd> Ship map
        </span>
      </footer>
    </section>
  );
}
