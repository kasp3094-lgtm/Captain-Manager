/**
 * Schemas and types for the ship's layout: content/ship/ship.yaml (the ship as a whole, with its
 * ladders and lift) and content/ship/deck*.yaml (one deck plan each).
 *
 * The deck plans are the single source for the ship map and the 3D ship. Positions are metres on
 * a top-down plan: x from the bow towards the stern, y from starboard to port. The rules that
 * span files (rooms inside the hull, doors that lead somewhere, every room reachable) live in
 * src/sim/ship.ts; how a room is furnished in 3D lives in src/world/ship/fits.ts.
 */
import { z } from 'zod';

/** [x, y] in metres. */
const PointSchema = z.tuple([z.number(), z.number()]);

/** [x, y, width, depth] in metres. */
const RectSchema = z.tuple([z.number(), z.number(), z.number().positive(), z.number().positive()]);

/** What a room is for; sets its colour on the map. `tank` covers tanks and voids: no one goes in. */
const ROOM_TYPES = [
  'command',
  'habitation',
  'berthing',
  'medical',
  'weapons',
  'engineering',
  'stores',
  'passage',
  'tank',
] as const;

/** Kinds of points of interest; each has its own icon on the map (src/ui/map/poi.tsx). */
export const POI_KINDS = [
  'station',
  'info',
  'safety',
  'social',
  'rest',
  'medical',
  'weapon',
  'machinery',
] as const;

/** Directions on the plan: towards the bow, towards the stern, to starboard, to port. */
export const FACINGS = ['fwd', 'aft', 'stbd', 'port'] as const;

/**
 * How a room is furnished in 3D. Each fit is a template in src/world/ship/fits.ts that fills the
 * room around its doors and its points of interest. Passages and berthing have defaults.
 */
export const FITS = [
  'empty',
  'passage',
  'berthing',
  'stateroom',
  'cabin',
  'captain',
  'bridge',
  'operations',
  'wardroom',
  'briefing',
  'equipment',
  'head',
  'stores',
  'sickbay',
  'office',
  'mess',
  'galley',
  'chapel',
  'laundry',
  'gym',
  'railgun',
  'magazine',
  'armory',
  'brig',
  'hangar',
  'machinery',
  'workshop',
  'reactor',
  'drive',
  'crawlway',
] as const;

/**
 * Objects a point of interest can stand for in 3D, built where the point is (sizes and shapes
 * in src/world/ship/fits.ts and props.ts). A point without one marks something its room's fit
 * builds anyway, such as the racks in a berthing.
 */
export const PROPS = [
  'airlock',
  'bunk',
  'capacitor-bank',
  'card-table',
  'coffee-machine',
  'command-chair',
  'console',
  'console-bank',
  'console-pair',
  'cutter',
  'damage-board',
  'dc-locker',
  'desk',
  'dining-table',
  'equipment-racks',
  'gym-machines',
  'helm',
  'holotable',
  'jump-core',
  'launch-cells',
  'lathe',
  'life-support',
  'main-drive',
  'medical-beds',
  'memorial',
  'noticeboard',
  'operating-table',
  'pumps',
  'railgun',
  'range',
  'reactor',
  'switchboards',
  'wall-screen',
  'washers',
  'water-reclaimer',
  'weapon-racks',
] as const;

const PoiSchema = z.strictObject({
  name: z.string().min(1),
  kind: z.enum(POI_KINDS),
  at: PointSchema,
  /** What to build here in 3D. Within 0.8 m of a wall it stands with its back to that wall. */
  prop: z.enum(PROPS).optional(),
  /** Which way the prop's front faces. Defaults to away from the nearest wall. */
  facing: z.enum(FACINGS).optional(),
});

const RoomSchema = z.strictObject({
  id: z.string().regex(/^[a-z0-9-]+$/, 'use lower-case letters, digits and dashes'),
  name: z.string().min(1),
  /** Shorter name for map labels; defaults to `name`. */
  short: z.string().min(1).optional(),
  /** Naval compartment number, deck-frame-position-use, e.g. 2-30-2-L. */
  code: z.string().regex(/^\d-\d+-\d+-[A-Z]$/, 'expected deck-frame-position-use, e.g. 2-30-2-L'),
  type: z.enum(ROOM_TYPES),
  /** How the room is furnished in 3D; see FITS. */
  fit: z.enum(FITS).optional(),
  rect: RectSchema,
  /** Door centres, each on the room's edge. */
  doors: z.array(PointSchema).default([]),
  /** Bunks in the room. */
  racks: z.number().int().positive().optional(),
  /** True when two sailors on different watches share each rack. */
  hotRacked: z.boolean().optional(),
  pois: z.array(PoiSchema).default([]),
});

export const DeckSchema = z.strictObject({
  deck: z.number().int().min(1),
  name: z.string().min(1),
  /** Outline of the deck, for the map. Every room must fit inside it. */
  hull: z.array(PointSchema).min(3),
  rooms: z.array(RoomSchema).min(1),
});

const ShaftSchema = z.strictObject({
  id: z.string().regex(/^[a-z0-9-]+$/, 'use lower-case letters, digits and dashes'),
  name: z.string().min(1),
  type: z.enum(['ladder', 'lift']),
  rect: RectSchema,
  /** Where you step on and off: a point on the shaft's edge, the same on every deck. */
  opening: PointSchema,
  decks: z.array(z.number().int().min(1)).min(2),
});

export const ShipInfoSchema = z.strictObject({
  name: z.string().min(1),
  class: z.string().min(1),
  /** The room every day starts in; every room must be reachable from it. */
  startRoom: z.string().min(1),
  shafts: z.array(ShaftSchema),
});

export type Point = z.infer<typeof PointSchema>;
export type Rect = z.infer<typeof RectSchema>;
export type PoiKind = (typeof POI_KINDS)[number];
export type Facing = (typeof FACINGS)[number];
export type Fit = (typeof FITS)[number];
export type Prop = (typeof PROPS)[number];
export type Poi = z.infer<typeof PoiSchema>;
export type Room = z.infer<typeof RoomSchema>;
export type Deck = z.infer<typeof DeckSchema>;
export type Shaft = z.infer<typeof ShaftSchema>;
export type ShipInfo = z.infer<typeof ShipInfoSchema>;

/** The whole ship: ship.yaml plus every deck plan, decks ordered from the top (deck 1) down. */
export interface Ship extends ShipInfo {
  readonly decks: readonly Deck[];
}

export function assembleShip(info: ShipInfo, decks: readonly Deck[]): Ship {
  return { ...info, decks: [...decks].sort((a, b) => a.deck - b.deck) };
}
