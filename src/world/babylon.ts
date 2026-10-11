/**
 * The parts of Babylon.js the game uses, imported module by module so the bundle carries only
 * what we need. Everything else imports Babylon from here (ESLint enforces it). Add new
 * modules below as they are needed; each non-`.pure` module also registers its side effects.
 */
import '@babylonjs/core/Collisions/collisionCoordinator';

export { FreeCamera } from '@babylonjs/core/Cameras/freeCamera';
export { Engine } from '@babylonjs/core/Engines/engine';
export type { ICanvasRenderingContext } from '@babylonjs/core/Engines/ICanvas';
export { SceneInstrumentation } from '@babylonjs/core/Instrumentation/sceneInstrumentation';
export { GlowLayer } from '@babylonjs/core/Layers/glowLayer';
export { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
export { PointLight } from '@babylonjs/core/Lights/pointLight';
export { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
export { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';
export { Texture } from '@babylonjs/core/Materials/Textures/texture';
export { Color3, Color4 } from '@babylonjs/core/Maths/math.color';
export { Vector3 } from '@babylonjs/core/Maths/math.vector';
export { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder';
export { CreateCylinder } from '@babylonjs/core/Meshes/Builders/cylinderBuilder';
export { CreateGround } from '@babylonjs/core/Meshes/Builders/groundBuilder';
export { CreatePlane } from '@babylonjs/core/Meshes/Builders/planeBuilder';
export { Mesh } from '@babylonjs/core/Meshes/mesh';
export { Scene } from '@babylonjs/core/scene';
