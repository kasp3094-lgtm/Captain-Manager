/**
 * Flat panels with a face painted on a canvas: signs, noticeboards, clocks, screens, the stars
 * outside a window, and the deck plating texture. All the panels of a deck are packed into one
 * texture and drawn as one mesh. Painting is deterministic, so screenshots never change between
 * runs.
 */
import {
  Color3,
  DynamicTexture,
  Mesh,
  StandardMaterial,
  VertexData,
  type ICanvasRenderingContext,
  type Scene,
  type TransformNode,
} from './babylon';
import type { Vec3 } from './builder';

/** Paints a panel's face; the canvas area is `width` × `height` pixels. */
export type Painter = (ctx: ICanvasRenderingContext, width: number, height: number) => void;

/** A panel to paint: its size in metres and its corners in the world, as seen from the front. */
export interface Panel {
  readonly width: number;
  readonly height: number;
  readonly paint: Painter;
  /** Bottom left, bottom right, top right, top left. */
  readonly corners: readonly [Vec3, Vec3, Vec3, Vec3];
  readonly normal: Vec3;
}

const ATLAS_SIZE = 2048;
const PADDING = 4;
const PIXELS_PER_METRE = 420;

const FONT_MONO = 'ui-monospace, "DejaVu Sans Mono", Menlo, Consolas, monospace';

/** Collects a deck's panels, then paints them all into one texture and one mesh. */
export class PanelSet {
  private readonly panels: Panel[] = [];

  add(panel: Panel): void {
    this.panels.push(panel);
  }

  /**
   * One mesh for every panel. `glowing` panels (screens, stars) are drawn unlit; the others are
   * lit, with a little light of their own so signs stay legible in dim corners.
   */
  build(name: string, scene: Scene, parent: TransformNode, glowing: boolean): Mesh | null {
    if (this.panels.length === 0) return null;
    const spots = pack(this.panels);
    const texture = new DynamicTexture(
      `${name}-atlas`,
      { width: ATLAS_SIZE, height: ATLAS_SIZE },
      scene,
      true,
    );
    const ctx = texture.getContext();
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, ATLAS_SIZE, ATLAS_SIZE);

    const data = new VertexData();
    const positions: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];
    this.panels.forEach((panel, i) => {
      const spot = spots[i]!;
      ctx.save();
      ctx.translate(spot.x, spot.y);
      ctx.beginPath();
      ctx.rect(0, 0, spot.width, spot.height);
      ctx.clip();
      panel.paint(ctx, spot.width, spot.height);
      ctx.restore();

      const u0 = spot.x / ATLAS_SIZE;
      const u1 = (spot.x + spot.width) / ATLAS_SIZE;
      const vTop = 1 - spot.y / ATLAS_SIZE;
      const vBottom = 1 - (spot.y + spot.height) / ATLAS_SIZE;
      const uv = [u0, vBottom, u1, vBottom, u1, vTop, u0, vTop];
      const start = positions.length / 3;
      panel.corners.forEach((corner, k) => {
        positions.push(...corner);
        normals.push(...panel.normal);
        uvs.push(uv[k * 2]!, uv[k * 2 + 1]!);
      });
      // Wound so the front faces along the normal (Babylon's convention; see Batch.triangle).
      const [a, b, c] = panel.corners;
      const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
      const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
      const n = panel.normal;
      const facing =
        (u[1]! * v[2]! - u[2]! * v[1]!) * n[0] +
        (u[2]! * v[0]! - u[0]! * v[2]!) * n[1] +
        (u[0]! * v[1]! - u[1]! * v[0]!) * n[2];
      if (facing < 0) indices.push(start, start + 1, start + 2, start, start + 2, start + 3);
      else indices.push(start, start + 2, start + 1, start, start + 3, start + 2);
    });
    texture.update();
    texture.anisotropicFilteringLevel = 8;

    data.positions = positions;
    data.normals = normals;
    data.uvs = uvs;
    data.indices = indices;
    const mesh = new Mesh(name, scene);
    data.applyToMesh(mesh, false);
    const material = new StandardMaterial(`${name}-material`, scene);
    material.diffuseTexture = texture;
    material.specularColor = Color3.Black();
    // Unlit panels show emissive × texture, so emissive is white for them.
    if (glowing) material.disableLighting = true;
    material.emissiveColor = glowing ? Color3.White() : new Color3(0.42, 0.42, 0.42);
    mesh.material = material;
    mesh.parent = parent;
    mesh.isPickable = false;
    mesh.freezeWorldMatrix();
    return mesh;
  }
}

/** Shelf-packs panels into the atlas, shrinking them all if they don't fit. */
function pack(panels: readonly Panel[]) {
  for (let scale = 1; ; scale *= 0.85) {
    const ppm = PIXELS_PER_METRE * scale;
    const sizes = panels.map((panel) => ({
      width: Math.max(8, Math.round(panel.width * ppm)),
      height: Math.max(8, Math.round(panel.height * ppm)),
    }));
    const order = sizes.map((_, i) => i).sort((a, b) => sizes[b]!.height - sizes[a]!.height);
    const spots: { x: number; y: number; width: number; height: number }[] = [];
    let x = 0;
    let y = 0;
    let shelf = 0;
    let fits = true;
    for (const i of order) {
      const size = sizes[i]!;
      if (x + size.width > ATLAS_SIZE) {
        x = 0;
        y += shelf + PADDING;
        shelf = 0;
      }
      if (y + size.height > ATLAS_SIZE || size.width > ATLAS_SIZE) {
        fits = false;
        break;
      }
      spots[i] = { x, y, ...size };
      x += size.width + PADDING;
      shelf = Math.max(shelf, size.height);
    }
    if (fits) return spots;
  }
}

export interface SignLine {
  readonly text: string;
  /** Text height as a fraction of the sign's height. */
  readonly size: number;
  readonly color: string;
}

/** Centred lines of text on a plain background, with an optional border. */
export function paintSign(
  background: string,
  lines: readonly SignLine[],
  border?: string,
): Painter {
  return (ctx, width, height) => {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, width, height);
    if (border) {
      const inset = height * 0.06;
      ctx.strokeStyle = border;
      ctx.lineWidth = height * 0.035;
      ctx.strokeRect(inset, inset, width - inset * 2, height - inset * 2);
    }
    const gap = height * 0.06;
    const block =
      lines.reduce((sum, line) => sum + Math.round(line.size * height), 0) +
      gap * (lines.length - 1);
    let top = (height - block) / 2;
    for (const line of lines) {
      const px = Math.round(line.size * height);
      ctx.font = `700 ${px}px ${FONT_MONO}`;
      // Shrink text that would not fit across the sign.
      const fit = Math.min(1, (width * 0.9) / ctx.measureText(line.text).width);
      if (fit < 1) ctx.font = `700 ${Math.floor(px * fit)}px ${FONT_MONO}`;
      ctx.fillStyle = line.color;
      const textWidth = ctx.measureText(line.text).width;
      ctx.fillText(line.text, (width - textWidth) / 2, top + px * 0.8);
      top += px + gap;
    }
  };
}

/** Over a door: the compartment number in amber, the room's name below. */
export function paintCompartmentSign(code: string, name: string): Painter {
  return paintSign(
    '#1d2a33',
    [
      { text: code, size: 0.4, color: '#ffbe55' },
      { text: name, size: 0.22, color: '#e8e2d4' },
    ],
    '#5f7480',
  );
}

/** At ladders and the lift: the deck number, big, on safety yellow. */
export function paintDeckSign(title: string, subtitle: string): Painter {
  return paintSign(
    '#d9a90f',
    [
      { text: title, size: 0.42, color: '#15181a' },
      { text: subtitle, size: 0.2, color: '#15181a' },
    ],
    '#15181a',
  );
}

/** A warning beside a dangerous room's door. */
export function paintDangerSign(warning: string): Painter {
  return (ctx, width, height) => {
    ctx.fillStyle = '#efe9d8';
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = '#b8261d';
    ctx.fillRect(0, 0, width, height * 0.34);
    ctx.strokeStyle = '#15181a';
    ctx.lineWidth = height * 0.03;
    ctx.strokeRect(height * 0.02, height * 0.02, width - height * 0.04, height - height * 0.04);
    paintSign('rgba(0,0,0,0)', [{ text: 'DANGER', size: 0.22, color: '#ffffff' }])(
      ctx,
      width,
      height * 0.34,
    );
    ctx.save();
    ctx.translate(0, height * 0.34);
    const words = warning.split(' ');
    const lines =
      words.length > 2 ? [words.slice(0, 2).join(' '), words.slice(2).join(' ')] : [warning];
    paintSign(
      'rgba(0,0,0,0)',
      lines.map((text) => ({ text, size: 0.2, color: '#15181a' })),
    )(ctx, width, height * 0.66);
    ctx.restore();
  };
}

/** A small label, e.g. DAMAGE CONTROL. */
export function paintLabel(text: string, background: string, color: string): Painter {
  return paintSign(background, [{ text, size: 0.5, color }]);
}

/** A tiny deterministic generator for painted detail, so screenshots never change. */
function speckles(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

/** Cork board with pinned papers: the watch bill, the mess menu and a notice. */
export const paintNoticeboard: Painter = (ctx, width, height) => {
  const random = speckles(7);
  ctx.fillStyle = '#9c774f';
  ctx.fillRect(0, 0, width, height);
  for (let i = 0; i < 900; i++) {
    ctx.fillStyle = random() > 0.5 ? 'rgba(70,45,20,0.25)' : 'rgba(210,170,120,0.22)';
    ctx.fillRect(random() * width, random() * height, 2, 2);
  }
  ctx.strokeStyle = '#4e3a27';
  ctx.lineWidth = Math.max(6, width * 0.025);
  ctx.strokeRect(
    ctx.lineWidth / 2,
    ctx.lineWidth / 2,
    width - ctx.lineWidth,
    height - ctx.lineWidth,
  );

  const paper = (x: number, y: number, w: number, h: number, angle: number, title: string) => {
    ctx.save();
    ctx.translate(x + w / 2, y + h / 2);
    ctx.rotate(angle);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(-w / 2 + 4, -h / 2 + 5, w, h);
    ctx.fillStyle = '#f2eee3';
    ctx.fillRect(-w / 2, -h / 2, w, h);
    ctx.fillStyle = '#1f2a33';
    ctx.font = `700 ${Math.round(h * 0.09)}px ${FONT_MONO}`;
    ctx.fillText(title, -w / 2 + w * 0.08, -h / 2 + h * 0.15);
    ctx.fillStyle = 'rgba(31,42,51,0.55)';
    for (let line = 0; line < 7; line++) {
      const lineWidth = w * (0.55 + ((line * 37) % 30) / 100);
      ctx.fillRect(-w / 2 + w * 0.08, -h / 2 + h * (0.28 + line * 0.095), lineWidth, h * 0.022);
    }
    ctx.fillStyle = '#b8261d';
    ctx.beginPath();
    ctx.arc(0, -h / 2 + h * 0.04, w * 0.035, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  };

  paper(width * 0.06, height * 0.12, width * 0.36, height * 0.74, -0.03, 'WATCH BILL');
  paper(width * 0.47, height * 0.1, width * 0.26, height * 0.42, 0.05, 'MESS MENU');
  paper(width * 0.5, height * 0.56, width * 0.4, height * 0.32, -0.02, 'NOTICE');
};

/** A bulkhead clock showing ship's time on a 24-hour dial. */
export function paintClock(hours: number, minutes: number): Painter {
  return (ctx, width, height) => {
    const size = Math.min(width, height);
    const cx = width / 2;
    const cy = height / 2;
    ctx.fillStyle = '#2b3236';
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = '#eceae2';
    ctx.beginPath();
    ctx.arc(cx, cy, size * 0.44, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#1d2327';
    for (let tick = 0; tick < 24; tick++) {
      const angle = (tick / 24) * Math.PI * 2;
      const inner = size * (tick % 6 === 0 ? 0.32 : 0.37);
      ctx.lineWidth = tick % 6 === 0 ? size * 0.03 : size * 0.012;
      ctx.beginPath();
      ctx.moveTo(cx + Math.sin(angle) * inner, cy - Math.cos(angle) * inner);
      ctx.lineTo(cx + Math.sin(angle) * size * 0.41, cy - Math.cos(angle) * size * 0.41);
      ctx.stroke();
    }
    const hand = (angle: number, length: number, thickness: number) => {
      ctx.strokeStyle = '#1d2327';
      ctx.lineWidth = thickness;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.sin(angle) * length, cy - Math.cos(angle) * length);
      ctx.stroke();
    };
    hand(((hours + minutes / 60) / 24) * Math.PI * 2, size * 0.22, size * 0.045);
    hand((minutes / 60) * Math.PI * 2, size * 0.34, size * 0.025);
    ctx.fillStyle = '#b8261d';
    ctx.beginPath();
    ctx.arc(cx, cy, size * 0.03, 0, Math.PI * 2);
    ctx.fill();
  };
}

/** Deck plating: square plates with dark seams and corner fasteners. One plate per texture repeat. */
export function paintDeckPlate(ctx: ICanvasRenderingContext, width: number, height: number): void {
  const random = speckles(3);
  ctx.fillStyle = '#4b544f';
  ctx.fillRect(0, 0, width, height);
  for (let i = 0; i < 900; i++) {
    ctx.fillStyle = random() > 0.5 ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.04)';
    ctx.fillRect(random() * width, random() * height, 4, 4);
  }
  ctx.strokeStyle = '#2c322f';
  ctx.lineWidth = 6;
  ctx.strokeRect(3, 3, width - 6, height - 6);
  ctx.fillStyle = '#3a423e';
  const inset = width * 0.06;
  for (const [x, y] of [
    [inset, inset],
    [width - inset, inset],
    [inset, height - inset],
    [width - inset, height - inset],
  ] as const) {
    ctx.beginPath();
    ctx.arc(x, y, width * 0.012, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Space, seen through a window: stars on near-black, a faint band of the galaxy. */
export function paintStarfield(seed: number): Painter {
  return (ctx, width, height) => {
    const random = speckles(seed);
    ctx.fillStyle = '#03060b';
    ctx.fillRect(0, 0, width, height);
    for (let i = 0; i < 60; i++) {
      const x = random() * width;
      const y = height * (0.35 + (random() - 0.5) * 0.5) + (x / width - 0.5) * height * 0.3;
      ctx.fillStyle = `rgba(${120 + random() * 60},${130 + random() * 60},${170 + random() * 60},0.05)`;
      ctx.beginPath();
      ctx.arc(x, y, height * (0.08 + random() * 0.15), 0, Math.PI * 2);
      ctx.fill();
    }
    const stars = Math.round((width * height) / 900);
    for (let i = 0; i < stars; i++) {
      const bright = random();
      const size = bright > 0.97 ? 2.2 : bright > 0.85 ? 1.5 : 1;
      ctx.fillStyle = bright > 0.9 ? '#ffffff' : bright > 0.6 ? '#c9d6ff' : '#8c94a8';
      ctx.fillRect(random() * width, random() * height, size, size);
    }
  };
}

export type ScreenKind = 'plot' | 'status' | 'schematic' | 'chart';

/** A display: a tactical plot, status bars, the ship's outline or a graph, in console colours. */
export function paintScreen(kind: ScreenKind, seed: number): Painter {
  return (ctx, width, height) => {
    const random = speckles(seed);
    ctx.fillStyle = '#071a1c';
    ctx.fillRect(0, 0, width, height);
    const ink = '#7fe3c4';
    const dim = 'rgba(127,227,196,0.25)';
    ctx.strokeStyle = dim;
    ctx.lineWidth = Math.max(1, width / 300);
    ctx.strokeRect(width * 0.02, height * 0.04, width * 0.96, height * 0.92);
    if (kind === 'plot') {
      for (let i = 1; i < 6; i++) {
        ctx.beginPath();
        ctx.arc(width / 2, height / 2, (Math.min(width, height) * i) / 12, 0, Math.PI * 2);
        ctx.stroke();
      }
      for (let i = 0; i < 7; i++) {
        const x = width * (0.2 + random() * 0.6);
        const y = height * (0.15 + random() * 0.7);
        ctx.fillStyle = i === 0 ? '#ffbe55' : ink;
        ctx.fillRect(x - 3, y - 3, 7, 7);
      }
    } else if (kind === 'status') {
      for (let i = 0; i < 6; i++) {
        const y = height * (0.14 + i * 0.13);
        ctx.fillStyle = dim;
        ctx.fillRect(width * 0.08, y, width * 0.84, height * 0.07);
        ctx.fillStyle = random() > 0.85 ? '#ffbe55' : ink;
        ctx.fillRect(width * 0.08, y, width * 0.84 * (0.3 + random() * 0.65), height * 0.07);
      }
    } else if (kind === 'schematic') {
      ctx.strokeStyle = ink;
      ctx.lineWidth = Math.max(1.5, width / 200);
      ctx.beginPath();
      ctx.moveTo(width * 0.08, height * 0.5);
      ctx.lineTo(width * 0.2, height * 0.25);
      ctx.lineTo(width * 0.9, height * 0.25);
      ctx.lineTo(width * 0.9, height * 0.75);
      ctx.lineTo(width * 0.2, height * 0.75);
      ctx.closePath();
      ctx.stroke();
      for (let i = 0; i < 9; i++) {
        ctx.fillStyle = random() > 0.8 ? 'rgba(255,190,85,0.6)' : 'rgba(127,227,196,0.35)';
        ctx.fillRect(width * (0.24 + i * 0.072), height * 0.3, width * 0.06, height * 0.4);
      }
    } else {
      ctx.strokeStyle = ink;
      ctx.lineWidth = Math.max(1.5, width / 220);
      ctx.beginPath();
      let y = height * 0.6;
      for (let x = width * 0.05; x < width * 0.95; x += width / 40) {
        y = Math.max(height * 0.15, Math.min(height * 0.85, y + (random() - 0.5) * height * 0.15));
        if (x === width * 0.05) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  };
}

/** The damage board: the ship from the side, every compartment green but one. */
export const paintDamageBoard: Painter = (ctx, width, height) => {
  ctx.fillStyle = '#0b1416';
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = '#ffbe55';
  ctx.font = `700 ${Math.round(height * 0.08)}px ${FONT_MONO}`;
  ctx.fillText('DAMAGE CONTROL · ALL DECKS', width * 0.04, height * 0.12);
  const left = width * 0.06;
  const top = height * 0.2;
  const w = width * 0.88;
  const h = height * 0.7;
  for (let deck = 0; deck < 4; deck++) {
    const rowTop = top + (deck * h) / 4;
    const start = deck === 0 ? 0.12 : 0;
    const end = deck === 0 ? 0.75 : 1;
    for (let i = 0; i < 14; i++) {
      const x0 = start + ((end - start) * i) / 14;
      ctx.fillStyle = deck === 2 && i === 9 ? '#d9a90f' : '#2f8f62';
      ctx.fillRect(left + w * x0 + 2, rowTop + 3, (w * (end - start)) / 14 - 4, h / 4 - 6);
    }
  }
};

/** A brass plaque with rows of names, for the memorial wall. */
export const paintMemorial: Painter = (ctx, width, height) => {
  const random = speckles(11);
  ctx.fillStyle = '#6b5432';
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = '#b08d57';
  ctx.fillRect(width * 0.04, height * 0.06, width * 0.92, height * 0.88);
  ctx.fillStyle = '#3d2e18';
  ctx.font = `700 ${Math.round(height * 0.09)}px ${FONT_MONO}`;
  const title = 'IN MEMORIAM';
  ctx.fillText(title, (width - ctx.measureText(title).width) / 2, height * 0.2);
  for (let row = 0; row < 7; row++) {
    for (let column = 0; column < 3; column++) {
      ctx.fillRect(
        width * (0.1 + column * 0.29),
        height * (0.3 + row * 0.085),
        width * (0.16 + random() * 0.08),
        height * 0.025,
      );
    }
  }
};

/** A framed picture: hills under a dawn sky, somewhere far from here. */
export function paintPicture(seed: number): Painter {
  return (ctx, width, height) => {
    const random = speckles(seed);
    ctx.fillStyle = '#2b2219';
    ctx.fillRect(0, 0, width, height);
    const inset = Math.min(width, height) * 0.08;
    const hue = Math.floor(random() * 360);
    ctx.fillStyle = `hsl(${hue}, 35%, 62%)`;
    ctx.fillRect(inset, inset, width - inset * 2, height - inset * 2);
    for (let layer = 0; layer < 3; layer++) {
      ctx.fillStyle = `hsl(${(hue + 120 + layer * 20) % 360}, 25%, ${42 - layer * 10}%)`;
      ctx.beginPath();
      ctx.moveTo(inset, height - inset);
      for (let x = inset; x <= width - inset; x += (width - inset * 2) / 8) {
        ctx.lineTo(x, height * (0.45 + layer * 0.12) + (random() - 0.5) * height * 0.12);
      }
      ctx.lineTo(width - inset, height - inset);
      ctx.closePath();
      ctx.fill();
    }
  };
}
