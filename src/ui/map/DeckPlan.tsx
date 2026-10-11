/**
 * Draws one deck as SVG, in deck-plan metres: hull, rooms coloured by type, doors, ladders and
 * the lift, room names and points of interest, plus the captain's marker. Shared by the minimap
 * and the full ship map; each sets its own SVG viewBox to choose what part of the deck shows.
 * Colours live in styles.css (the "Ship map" section).
 */
import { memo } from 'react';
import type { Deck, Point, Poi, Room, Shaft, Ship } from '../../content/ship';
import { shaftsOnDeck } from '../../sim/ship';
import type { PlayerPose } from '../state';
import { LINE_HEIGHT, placeLabel } from './labels';
import { PoiIcon } from './poi';

/** What the pointer is over on the full map. */
export type MapHover =
  | { readonly kind: 'room'; readonly room: Room }
  | { readonly kind: 'poi'; readonly poi: Poi; readonly room: Room }
  | { readonly kind: 'shaft'; readonly shaft: Shaft };

interface DeckPlanProps {
  readonly ship: Ship;
  readonly deck: Deck;
  /** The room the captain is in, outlined in amber. */
  readonly currentRoomId: string | null;
  /** Rooms built in 3D so far; the others are drawn faded as planned. */
  readonly builtRooms: readonly string[];
  /** The point of interest to ring, if the captain is near one. */
  readonly nearbyPoiName: string | null;
  /** Given on the full map only: reports what the pointer is over. */
  readonly onHover?: (hover: MapHover | null) => void;
}

/** Memoised: the minimap re-renders every frame the captain moves, but the deck rarely changes. */
export const DeckPlan = memo(function DeckPlan({
  ship,
  deck,
  currentRoomId,
  builtRooms,
  nearbyPoiName,
  onHover,
}: DeckPlanProps) {
  const hoverProps = (hover: MapHover) =>
    onHover ? { onMouseEnter: () => onHover(hover), onMouseLeave: () => onHover(null) } : {};
  const current = deck.rooms.find((room) => room.id === currentRoomId);

  return (
    <g className="deck-plan">
      <defs>
        <pattern
          id="map-tank-hatch"
          width="0.8"
          height="0.8"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(45)"
        >
          <rect width="0.8" height="0.8" className="map-tank-fill" />
          <line x1="0" y1="0" x2="0" y2="0.8" className="map-tank-line" />
        </pattern>
      </defs>
      <polygon className="map-hull" points={deck.hull.map(([x, y]) => `${x},${y}`).join(' ')} />

      {deck.rooms.map((room) => {
        const [x, y, width, height] = room.rect;
        return (
          <rect
            key={room.id}
            className="map-room"
            data-type={room.type}
            data-planned={builtRooms.includes(room.id) ? undefined : ''}
            x={x}
            y={y}
            width={width}
            height={height}
            {...hoverProps({ kind: 'room', room })}
          />
        );
      })}

      {shaftsOnDeck(ship, deck.deck).map((shaft) => (
        <ShaftMark key={shaft.id} shaft={shaft} hoverProps={hoverProps({ kind: 'shaft', shaft })} />
      ))}

      {deck.rooms.flatMap((room) =>
        room.doors.map((door, index) => (
          <DoorMark key={`${room.id}-${index}`} room={room} at={door} />
        )),
      )}

      {current && (
        <rect
          className="map-room-current"
          x={current.rect[0]}
          y={current.rect[1]}
          width={current.rect[2]}
          height={current.rect[3]}
        />
      )}

      {deck.rooms.map((room) => (
        <RoomLabel key={room.id} room={room} />
      ))}

      {deck.rooms.flatMap((room) =>
        room.pois.map((poi) => (
          <g
            key={`${room.id}-${poi.name}`}
            className="map-poi"
            {...hoverProps({ kind: 'poi', poi, room })}
          >
            {poi.name === nearbyPoiName && (
              <circle className="map-poi-ring" cx={poi.at[0]} cy={poi.at[1]} r={0.85} />
            )}
            <PoiIcon kind={poi.kind} x={poi.at[0]} y={poi.at[1]} />
          </g>
        )),
      )}
    </g>
  );
});

/** The captain: an arrow with a faint view cone, turned to the way they face. */
export function PlayerMarker({ pose }: { pose: PlayerPose }) {
  return (
    <g
      className="map-player"
      transform={`translate(${pose.x} ${pose.y}) rotate(${pose.yawDegrees})`}
    >
      <path className="map-player-cone" d="M0 0 L-2.47 -2.47 A3.5 3.5 0 0 1 2.47 -2.47 Z" />
      <path className="map-player-arrow" d="M0 -0.9 L0.62 0.62 L0 0.28 L-0.62 0.62 Z" />
    </g>
  );
}

/** A door: a light stroke across the wall, along whichever edge of the room it sits on. */
function DoorMark({ room, at: [x, y] }: { room: Room; at: Point }) {
  const [left, , width] = room.rect;
  const onSideWall = Math.abs(x - left) < 1e-6 || Math.abs(x - (left + width)) < 1e-6;
  const half = 0.45;
  return onSideWall ? (
    <line className="map-door" x1={x} y1={y - half} x2={x} y2={y + half} />
  ) : (
    <line className="map-door" x1={x - half} y1={y} x2={x + half} y2={y} />
  );
}

/** A ladderwell (rungs) or the lift (up and down arrows). */
function ShaftMark({ shaft, hoverProps }: { shaft: Shaft; hoverProps: object }) {
  const [x, y, width, height] = shaft.rect;
  const cx = x + width / 2;
  const cy = y + Math.min(height, 2) / 2;
  const icon =
    shaft.type === 'ladder'
      ? [-0.6, -0.2, 0.2, 0.6].map((dy) => `M${x + 0.45},${cy + dy}H${x + width - 0.45}`).join('')
      : `M${cx - 0.45},${cy - 0.12}L${cx + 0.45},${cy - 0.12}L${cx},${cy - 0.75}Z` +
        `M${cx - 0.45},${cy + 0.12}L${cx + 0.45},${cy + 0.12}L${cx},${cy + 0.75}Z`;
  return (
    <g className="map-shaft" data-type={shaft.type} {...hoverProps}>
      <rect x={x} y={y} width={width} height={height} />
      <path d={icon} />
    </g>
  );
}

/** A room's name, sized to fit inside it and kept clear of its symbols; omitted if nothing fits. */
function RoomLabel({ room }: { room: Room }) {
  if (room.type === 'passage') return null;
  const label = placeLabel(
    room.short ?? room.name,
    room.rect,
    room.pois.map((poi) => poi.at),
  );
  if (!label) return null;
  const lineStep = label.size * LINE_HEIGHT;
  const top = label.y - ((label.lines.length - 1) * lineStep) / 2;
  return (
    <text className="map-label" data-type={room.type} fontSize={label.size} textAnchor="middle">
      {label.lines.map((line, index) => (
        <tspan key={index} x={label.x} y={top + index * lineStep} dominantBaseline="central">
          {line}
        </tspan>
      ))}
    </text>
  );
}
