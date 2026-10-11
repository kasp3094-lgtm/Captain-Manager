/**
 * The full ship map, opened with M: one deck at a time (tabs to switch), every room, ladder,
 * lift and point of interest, and where the captain is. Hovering anything names it below the
 * map. The game is paused while it is open.
 */
import { useMemo, useState } from 'react';
import { POI_KINDS, type Deck, type Ship } from '../../content/ship';
import { gameUi, playerPose, type CurrentRoom } from '../state';
import { useStore } from '../store';
import { DeckPlan, PlayerMarker, type MapHover } from './DeckPlan';
import { POI_LABELS, PoiSwatch } from './poi';

export function ShipMap({ ship, onClose }: { ship: Ship; onClose: () => void }) {
  const pose = useStore(playerPose, (state) => state);
  const room = useStore(gameUi, (state) => state.room);
  const nearby = useStore(gameUi, (state) => state.nearbyPoi);
  const [deckNumber, setDeckNumber] = useState(pose.deck);
  const [hover, setHover] = useState<MapHover | null>(null);
  const viewBox = useMemo(() => shipViewBox(ship), [ship]);

  const deck = ship.decks.find((candidate) => candidate.deck === deckNumber) ?? ship.decks[0]!;

  return (
    <div className="screen map-screen">
      <div className="map-card" role="dialog" aria-modal="true" aria-labelledby="map-title">
        <header className="map-header">
          <div>
            <p className="eyebrow">
              {ship.name} · {ship.class}
            </p>
            <h2 id="map-title" className="title small">
              Ship map
            </h2>
          </div>
          <div className="map-tabs" role="tablist" aria-label="Decks">
            {ship.decks.map((candidate) => (
              <button
                key={candidate.deck}
                type="button"
                role="tab"
                className="map-tab"
                aria-selected={candidate.deck === deck.deck}
                onClick={() => {
                  setDeckNumber(candidate.deck);
                  setHover(null);
                }}
              >
                <span className="map-tab-number">Deck {candidate.deck}</span> {candidate.name}
                {candidate.deck === pose.deck && (
                  <span className="map-tab-here" title="You are on this deck">
                    {' '}
                    ●
                  </span>
                )}
              </button>
            ))}
          </div>
        </header>

        <svg
          className="map-svg"
          viewBox={viewBox.box}
          role="img"
          aria-label={`Plan of deck ${deck.deck}, ${deck.name}`}
        >
          <text
            className="map-edge-label"
            x={viewBox.left + 0.4}
            y={viewBox.top + 0.9}
            fontSize={0.7}
          >
            ◄ BOW · STARBOARD SIDE ▲
          </text>
          <text
            className="map-edge-label"
            x={viewBox.right - 0.4}
            y={viewBox.bottom - 0.4}
            fontSize={0.7}
            textAnchor="end"
          >
            PORT SIDE ▼ · STERN ►
          </text>
          <DeckPlan
            ship={ship}
            deck={deck}
            currentRoomId={room?.id ?? null}
            nearbyPoiName={nearby?.name ?? null}
            onHover={setHover}
          />
          {deck.deck === pose.deck && <PlayerMarker pose={pose} />}
        </svg>

        <p className="map-info" aria-live="polite">
          {describe(hover, room, deck)}
        </p>

        <footer className="map-footer">
          <ul className="map-legend" aria-label="Legend">
            <li>
              <svg className="poi-swatch" viewBox="-1 -1 2 2" aria-hidden="true">
                <path className="map-player-arrow" d="M0 -0.9 L0.62 0.62 L0 0.28 L-0.62 0.62 Z" />
              </svg>
              You
            </li>
            {POI_KINDS.map((kind) => (
              <li key={kind}>
                <PoiSwatch kind={kind} />
                {POI_LABELS[kind]}
              </li>
            ))}
          </ul>
          <button type="button" className="button" onClick={onClose} autoFocus>
            Back to the ship
          </button>
        </footer>
        <p className="map-note">
          <kbd>M</kbd> closes the map, <kbd>Esc</kbd> pauses. Ladders and the lift join the decks:
          look at one and press <kbd>E</kbd>.
        </p>
      </div>
    </div>
  );
}

/** The line under the map: what the pointer is over, or else where the captain is. */
function describe(hover: MapHover | null, current: CurrentRoom | null, deck: Deck): string {
  if (hover?.kind === 'poi') return `${hover.poi.name} · ${hover.room.name}`;
  if (hover?.kind === 'shaft') return `${hover.shaft.name} · decks ${hover.shaft.decks.join(', ')}`;
  if (hover?.kind === 'room') {
    const { room } = hover;
    const parts = [room.code, room.name];
    if (room.racks) parts.push(`${room.racks} racks${room.hotRacked ? ', shared by watch' : ''}`);
    if (room.id === current?.id) parts.push('you are here');
    return parts.join(' · ');
  }
  if (current && current.deck === deck.deck) {
    return `You are here: ${[current.code, current.name].filter(Boolean).join(' · ')}`;
  }
  return `Deck ${deck.deck} · ${deck.name}. Point at a room or symbol to see what it is.`;
}

/** One viewBox for every deck, so decks line up when switching tabs. */
function shipViewBox(ship: Ship) {
  const points = ship.decks.flatMap((deck) => deck.hull);
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  const left = Math.min(...xs) - 1.5;
  const right = Math.max(...xs) + 1.5;
  const top = Math.min(...ys) - 1.8;
  const bottom = Math.max(...ys) + 1.8;
  return { left, right, top, bottom, box: `${left} ${top} ${right - left} ${bottom - top}` };
}
