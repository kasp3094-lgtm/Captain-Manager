/**
 * The shared palette. Flat colours, matte finish: lighting and colour do the work (design doc §11).
 * Each kind of space has its own wall colours and light (ZONES); props pick from SWATCHES.
 * Glowing swatches are lights and screens: drawn unlit and picked up by the glow layer.
 */
import type { Zone } from './ship/layout';

const SWATCHES = {
  // Structure
  bulkhead: '#cbc3ae',
  bulkheadLower: '#7d8a7f',
  bulkheadTrim: '#4f5a53',
  overhead: '#a4a89d',
  fixtureFrame: '#5d6366',
  hatchFrame: '#56656d',
  hazard: '#d9a90f',
  darkness: '#0d0f10',
  shaftWall: '#4a5155',
  // Metals and plastics
  metal: '#9aa2a6',
  metalDark: '#3e4549',
  metalLight: '#b9c0c3',
  steel: '#c3c8c9',
  gunMetal: '#2b3033',
  rubber: '#232628',
  white: '#e8e6df',
  glass: '#2d3b44',
  // Pipes and cables
  pipeBlue: '#3f6ea6',
  pipeRed: '#a63c35',
  pipeGrey: '#80878a',
  pipeGreen: '#4e7d4a',
  pipeYellow: '#c9a227',
  pipeHanger: '#5a6165',
  cableTray: '#4a5155',
  cables: '#22272a',
  duct: '#b3b6ad',
  ductVent: '#3a4043',
  // Berthing
  rackFrame: '#6f777b',
  rackBase: '#56646b',
  rackDrawer: '#46535a',
  mattress: '#3e5b74',
  pillow: '#e6e1d4',
  blanket: '#56606b',
  curtain: '#27384f',
  lockerBody: '#5b707b',
  lockerDoor: '#6a808b',
  lockerVent: '#2d363b',
  lockerBase: '#30383c',
  nameCard: '#efeadf',
  // Furniture
  tableTop: '#8d877b',
  tableEdge: '#4b4e4c',
  seat: '#2f4a63',
  seatRed: '#6e2c28',
  leather: '#4a3326',
  wood: '#8b6a4a',
  woodDark: '#5a4330',
  fabric: '#46525c',
  rug: '#6a2e2c',
  rugBorder: '#b8954f',
  paper: '#efeadf',
  // Stations
  console: '#3a454d',
  consoleTop: '#262d32',
  equipment: '#4d5960',
  // Galley, heads, sickbay
  tile: '#d6dbd8',
  medical: '#dfe6e4',
  medicalGreen: '#5f9a8c',
  mug: '#e8e4dc',
  coffee: '#3a2416',
  // Stores
  crate: '#7a6a4c',
  crateDark: '#574a34',
  boxBlue: '#5f7a8c',
  boxTan: '#a68a5b',
  boxGreen: '#6f8461',
  boxGrey: '#8d8b84',
  // Safety
  fireRed: '#b8261d',
  dcYellow: '#d4a514',
  lanternBody: '#c99a12',
  // Weapons
  olive: '#5b6345',
  missile: '#cdd2d3',
  missileTip: '#9c2a22',
  // Hangar
  hullPaint: '#c9ccc7',
  stripe: '#c9a227',
  // Off duty
  matBlue: '#2c4a6b',
  brass: '#b08d57',
  cards: '#f1efe8',
  datapad: '#262c30',
  // Light sources and screens: unlit, picked up by the glow layer.
  lightPanel: '#fff2d8',
  readingLight: '#ffcb7a',
  lanternLens: '#ffd77a',
  screen: '#7fe3c4',
  screenBlue: '#6fb4ff',
  screenAmber: '#ffbe55',
  ledGreen: '#5dff8a',
  ledRed: '#ff4a3a',
  holo: '#59c8ff',
  holoDim: '#174e66',
  reactorGlow: '#a8ecff',
  jumpGlow: '#a46ef0',
  candle: '#ffd38a',
} as const;

export type Swatch = keyof typeof SWATCHES;

const GLOWING: ReadonlySet<Swatch> = new Set<Swatch>([
  'lightPanel',
  'readingLight',
  'lanternLens',
  'screen',
  'screenBlue',
  'screenAmber',
  'ledGreen',
  'ledRed',
  'holo',
  'holoDim',
  'reactorGlow',
  'jumpGlow',
  'candle',
]);

export function isGlowing(swatch: Swatch): boolean {
  return GLOWING.has(swatch);
}

const rgbCache = new Map<string, readonly [number, number, number]>();

/** A hex colour as 0–1 floats, for vertex colours. */
export function rgb(hex: string): readonly [number, number, number] {
  let colour = rgbCache.get(hex);
  if (!colour) {
    const value = Number.parseInt(hex.slice(1), 16);
    colour = [((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255];
    rgbCache.set(hex, colour);
  }
  return colour;
}

export function swatchRgb(swatch: Swatch): readonly [number, number, number] {
  return rgb(SWATCHES[swatch]);
}

/** How a kind of space looks: wall bands, overhead, deck tint and the colour of its lights. */
export interface ZoneLook {
  readonly upper: string;
  readonly lower: string;
  readonly trim: string;
  readonly overhead: string;
  /** Multiplies the deck plating texture. */
  readonly deck: string;
  readonly light: string;
}

export const ZONES: Record<Zone, ZoneLook> = {
  command: {
    upper: '#c4cad0',
    lower: '#46535f',
    trim: '#2c3640',
    overhead: '#9ea4a8',
    deck: '#b9c3cc',
    light: '#e8eefb',
  },
  habitation: {
    upper: '#cbc3ae',
    lower: '#7d8a7f',
    trim: '#4f5a53',
    overhead: '#a4a89d',
    deck: '#e2ddd0',
    light: '#ffe7c4',
  },
  berthing: {
    upper: '#cbc3ae',
    lower: '#7d8a7f',
    trim: '#4f5a53',
    overhead: '#a4a89d',
    deck: '#d9d6cb',
    light: '#ffe2bd',
  },
  medical: {
    upper: '#e2e7e5',
    lower: '#8fb2ac',
    trim: '#4f7570',
    overhead: '#c4cac8',
    deck: '#e6ece9',
    light: '#f2f7ff',
  },
  weapons: {
    upper: '#bdbab1',
    lower: '#646862',
    trim: '#8f342b',
    overhead: '#94968f',
    deck: '#c9c6bc',
    light: '#eef0f2',
  },
  engineering: {
    upper: '#b6baae',
    lower: '#5c685f',
    trim: '#b8901a',
    overhead: '#8f948a',
    deck: '#c3c2b4',
    light: '#eef3e4',
  },
  stores: {
    upper: '#c2bdaf',
    lower: '#787266',
    trim: '#4d483f',
    overhead: '#9c9a90',
    deck: '#cfcabd',
    light: '#f6f0e0',
  },
  passage: {
    upper: '#d0cab8',
    lower: '#6b796f',
    trim: '#3f4a44',
    overhead: '#a8aba0',
    deck: '#d5d3c8',
    light: '#fff0d8',
  },
  tank: {
    upper: '#808080',
    lower: '#606060',
    trim: '#404040',
    overhead: '#707070',
    deck: '#808080',
    light: '#ffffff',
  },
  shaft: {
    upper: '#a6acad',
    lower: '#59626a',
    trim: '#d9a90f',
    overhead: '#7d8386',
    deck: '#bfc2bf',
    light: '#f1f1ea',
  },
};
