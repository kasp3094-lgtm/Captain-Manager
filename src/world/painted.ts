/**
 * Flat panels with a face painted on a canvas: signs, the noticeboard, the clock, and the deck
 * plating texture. Painting is deterministic, so screenshots never change between runs.
 */
import {
  Color3,
  DynamicTexture,
  StandardMaterial,
  type ICanvasRenderingContext,
  type Mesh,
  type Scene,
  CreatePlane,
} from './babylon';
import type { Vec3 } from './builder';

/** Which way a wall-mounted panel faces, i.e. the direction you look from to read it. */
export type Facing = '+x' | '-x' | '+z' | '-z';

// A plane's readable side faces -z; these turn it to face the given direction.
const FACING_YAW: Record<Facing, number> = {
  '+x': -Math.PI / 2,
  '-x': Math.PI / 2,
  '+z': Math.PI,
  '-z': 0,
};

const PIXELS_PER_METRE = 600;

const FONT_MONO = 'ui-monospace, "DejaVu Sans Mono", Menlo, Consolas, monospace';

export interface PanelOptions {
  readonly width: number;
  readonly height: number;
  readonly position: Vec3;
  readonly facing: Facing;
  /** Draws the panel's face; the canvas is width × height metres at PIXELS_PER_METRE. */
  readonly paint: (ctx: ICanvasRenderingContext, width: number, height: number) => void;
}

/** A flat, wall-mounted panel with a painted face: signs, noticeboards, clocks. */
export function createPanel(scene: Scene, name: string, options: PanelOptions): Mesh {
  const width = Math.round(options.width * PIXELS_PER_METRE);
  const height = Math.round(options.height * PIXELS_PER_METRE);
  const texture = new DynamicTexture(`${name}-texture`, { width, height }, scene, true);
  options.paint(texture.getContext(), width, height);
  texture.update();
  texture.anisotropicFilteringLevel = 8;

  const material = new StandardMaterial(`${name}-material`, scene);
  material.diffuseTexture = texture;
  material.specularColor = Color3.Black();
  // A little self-illumination keeps signs legible in dim corners.
  material.emissiveColor = new Color3(0.22, 0.22, 0.22);

  const plane = CreatePlane(name, { width: options.width, height: options.height }, scene);
  plane.material = material;
  plane.position.set(options.position.x, options.position.y, options.position.z);
  plane.rotation.y = FACING_YAW[options.facing];
  plane.isPickable = false;
  plane.freezeWorldMatrix();
  return plane;
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
): PanelOptions['paint'] {
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

/** A tiny deterministic generator for painted detail, so screenshots never change. */
function speckles(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

/** Cork board with pinned papers: the watch bill, the mess menu and a notice. */
export const paintNoticeboard: PanelOptions['paint'] = (ctx, width, height) => {
  const random = speckles(7);
  ctx.fillStyle = '#9c774f';
  ctx.fillRect(0, 0, width, height);
  for (let i = 0; i < 1400; i++) {
    ctx.fillStyle = random() > 0.5 ? 'rgba(70,45,20,0.25)' : 'rgba(210,170,120,0.22)';
    ctx.fillRect(random() * width, random() * height, 3, 3);
  }
  ctx.strokeStyle = '#4e3a27';
  ctx.lineWidth = 18;
  ctx.strokeRect(9, 9, width - 18, height - 18);

  const paper = (x: number, y: number, w: number, h: number, angle: number, title: string) => {
    ctx.save();
    ctx.translate(x + w / 2, y + h / 2);
    ctx.rotate(angle);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(-w / 2 + 5, -h / 2 + 6, w, h);
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

/** A bulkhead clock showing ship's time. */
export function paintClock(hours: number, minutes: number): PanelOptions['paint'] {
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
    // Naval clocks run on a 24-hour dial.
    const hand = (angle: number, length: number, thickness: number, color: string) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = thickness;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.sin(angle) * length, cy - Math.cos(angle) * length);
      ctx.stroke();
    };
    hand(((hours + minutes / 60) / 24) * Math.PI * 2, size * 0.22, size * 0.045, '#1d2327');
    hand((minutes / 60) * Math.PI * 2, size * 0.34, size * 0.025, '#1d2327');
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
