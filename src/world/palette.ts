import { Color3, StandardMaterial, type Scene } from './babylon';

/**
 * The shared palette. Flat colours, matte finish: lighting and colour do the work (design doc §11).
 * Habitation spaces are warm beige and green; metal is blue-grey; hazards are yellow and red.
 */
const SWATCHES = {
  bulkhead: '#cbc3ae',
  bulkheadLower: '#7d8a7f',
  bulkheadTrim: '#4f5a53',
  overhead: '#a4a89d',
  fixtureFrame: '#5d6366',
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
  metal: '#9aa2a6',
  metalDark: '#3e4549',
  pipeBlue: '#3f6ea6',
  pipeRed: '#a63c35',
  pipeGrey: '#80878a',
  pipeHanger: '#5a6165',
  cableTray: '#4a5155',
  cables: '#22272a',
  duct: '#b3b6ad',
  ductVent: '#3a4043',
  hatchFrame: '#56656d',
  hatchDoor: '#71848e',
  hazard: '#d9a90f',
  fireRed: '#b8261d',
  dcYellow: '#d4a514',
  lanternBody: '#c99a12',
  tableTop: '#8d877b',
  tableEdge: '#4b4e4c',
  stoolSeat: '#2f4a63',
  mug: '#e8e4dc',
  coffee: '#3a2416',
  cards: '#f1efe8',
  datapad: '#262c30',
  ventGrille: '#3c4346',
  // Light sources: unlit and picked up by the glow layer.
  lightPanel: '#fff2d8',
  readingLight: '#ffcb7a',
  lanternLens: '#ffd77a',
  screen: '#7fe3c4',
} as const;

export type Swatch = keyof typeof SWATCHES;

const GLOWING: ReadonlySet<Swatch> = new Set([
  'lightPanel',
  'readingLight',
  'lanternLens',
  'screen',
]);

export function isGlowing(swatch: Swatch): boolean {
  return GLOWING.has(swatch);
}

/** One material per swatch, shared by every mesh of that colour. */
export class Materials {
  private readonly cache = new Map<Swatch, StandardMaterial>();

  constructor(private readonly scene: Scene) {}

  get(swatch: Swatch): StandardMaterial {
    let material = this.cache.get(swatch);
    if (!material) {
      material = new StandardMaterial(`mat-${swatch}`, this.scene);
      const color = Color3.FromHexString(SWATCHES[swatch]);
      if (isGlowing(swatch)) {
        material.disableLighting = true;
        material.emissiveColor = color;
      } else {
        material.diffuseColor = color;
        material.specularColor = color.scale(0.08);
      }
      material.maxSimultaneousLights = 6;
      this.cache.set(swatch, material);
    }
    return material;
  }
}
