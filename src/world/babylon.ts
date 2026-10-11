/**
 * The parts of Babylon.js the game uses, imported module by module so the bundle carries only
 * what we need. Everything else imports Babylon from here (ESLint enforces it). Add new
 * modules below as they are needed; each non-`.pure` module also registers its side effects.
 */
import '@babylonjs/core/Collisions/collisionCoordinator';
// Looking at things: scene.pickWithRay, used to find what the captain can interact with.
import '@babylonjs/core/Culling/ray';
// Drawing many boxes with one mesh: mesh.thinInstanceSetBuffer, used for the crew (crowd.ts).
import '@babylonjs/core/Meshes/thinInstanceMesh';

export { FreeCamera } from '@babylonjs/core/Cameras/freeCamera';
export { Ray } from '@babylonjs/core/Culling/ray';
export { Engine } from '@babylonjs/core/Engines/engine';
export type { ICanvasRenderingContext } from '@babylonjs/core/Engines/ICanvas';
export { SceneInstrumentation } from '@babylonjs/core/Instrumentation/sceneInstrumentation';
export { GlowLayer } from '@babylonjs/core/Layers/glowLayer';
export { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
export { PointLight } from '@babylonjs/core/Lights/pointLight';
export type { Material } from '@babylonjs/core/Materials/material';
export { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
export { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';
export { Texture } from '@babylonjs/core/Materials/Textures/texture';
export { Color3, Color4 } from '@babylonjs/core/Maths/math.color';
export { Matrix, Vector3 } from '@babylonjs/core/Maths/math.vector';
export { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder';
export { Mesh } from '@babylonjs/core/Meshes/mesh';
export type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
export { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
export { TransformNode } from '@babylonjs/core/Meshes/transformNode';
export { Scene } from '@babylonjs/core/scene';
