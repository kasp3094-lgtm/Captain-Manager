/** The Babylon.js scene and its shared look. One scene holds the whole ship. */
import { Color4, GlowLayer, Scene, type Engine } from './babylon';

/** A scene with the shared look: dark clear colour, gentle contrast and vignette, glowing lights. */
export function createScene(engine: Engine): { scene: Scene; glow: GlowLayer } {
  const scene = new Scene(engine);
  scene.clearColor = new Color4(0.02, 0.03, 0.035, 1);
  scene.skipPointerMovePicking = true;

  const look = scene.imageProcessingConfiguration;
  look.contrast = 1.1;
  look.exposure = 1.1;
  look.vignetteEnabled = true;
  look.vignetteWeight = 1.4;
  look.vignetteColor = new Color4(0, 0, 0, 0);

  const glow = new GlowLayer('glow', scene, { blurKernelSize: 24 });
  glow.intensity = 0.6;
  return { scene, glow };
}
