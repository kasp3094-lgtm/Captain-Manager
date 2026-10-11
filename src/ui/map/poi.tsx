/**
 * Points of interest on the map: one shape and one colour per kind, so they can be told apart
 * without colour too. Colours are in styles.css (.poi--<kind>).
 */
import type { PoiKind } from '../../content/ship';

/** Legend text for each kind. */
export const POI_LABELS: Record<PoiKind, string> = {
  station: 'Station',
  info: 'Information',
  safety: 'Safety',
  social: 'Off duty',
  rest: 'Bunks & lockers',
  medical: 'Medical',
  weapon: 'Weapons',
  machinery: 'Machinery',
};

function points(corners: readonly (readonly [number, number])[], x: number, y: number): string {
  return corners.map(([dx, dy]) => `${x + dx},${y + dy}`).join(' ');
}

/** A filled plus sign, as a path. */
function plus(x: number, y: number, r: number): string {
  const a = r * 0.34;
  return `M${x - a},${y - r}H${x + a}V${y - a}H${x + r}V${y + a}H${x + a}V${y + r}H${x - a}V${y + a}H${x - r}V${y - a}H${x - a}Z`;
}

/** The symbol for a kind of point of interest, centred on (x, y), `size` map units across. */
export function PoiIcon({
  kind,
  x,
  y,
  size = 0.9,
}: {
  kind: PoiKind;
  x: number;
  y: number;
  size?: number;
}) {
  const r = size / 2;
  const className = `map-poi-icon poi--${kind}`;
  switch (kind) {
    case 'station':
      return (
        <rect
          className={className}
          x={x - r * 0.8}
          y={y - r * 0.8}
          width={r * 1.6}
          height={r * 1.6}
        />
      );
    case 'info':
      return <circle className={className} cx={x} cy={y} r={r * 0.85} />;
    case 'safety':
      return (
        <polygon
          className={className}
          points={points(
            [
              [0, -r],
              [r * 0.95, r * 0.75],
              [-r * 0.95, r * 0.75],
            ],
            x,
            y,
          )}
        />
      );
    case 'social':
      return (
        <polygon
          className={className}
          points={points(
            [
              [0, -r],
              [r, 0],
              [0, r],
              [-r, 0],
            ],
            x,
            y,
          )}
        />
      );
    case 'rest':
      return (
        <rect
          className={className}
          x={x - r}
          y={y - r * 0.45}
          width={r * 2}
          height={r * 0.9}
          rx={r * 0.2}
        />
      );
    case 'medical':
      return <path className={className} d={plus(x, y, r)} />;
    case 'weapon':
      return <path className={className} d={plus(x, y, r)} transform={`rotate(45 ${x} ${y})`} />;
    case 'machinery': {
      const hexagon = [0, 1, 2, 3, 4, 5].map((i) => {
        const angle = (Math.PI / 3) * i;
        return [Math.cos(angle) * r, Math.sin(angle) * r] as const;
      });
      return <polygon className={className} points={points(hexagon, x, y)} />;
    }
  }
}

/** A small stand-alone symbol, for legends and the minimap. */
export function PoiSwatch({ kind }: { kind: PoiKind }) {
  return (
    <svg className="poi-swatch" viewBox="-0.6 -0.6 1.2 1.2" aria-hidden="true">
      <PoiIcon kind={kind} x={0} y={0} size={1} />
    </svg>
  );
}
