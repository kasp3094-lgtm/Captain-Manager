import { createStore } from './store';

/** loading → start screen → playing ⇄ paused */
export type GameMode = 'loading' | 'start' | 'playing' | 'paused';

export interface GameUiState {
  readonly mode: GameMode;
  readonly room: { readonly code: string; readonly name: string } | null;
  readonly fps: number;
  readonly feet: { readonly x: number; readonly y: number; readonly z: number };
  readonly yawDegrees: number;
  readonly seed: number;
  readonly drawCalls: number;
  readonly pointerLocked: boolean;
}

export const gameUi = createStore<GameUiState>({
  mode: 'loading',
  room: null,
  fps: 0,
  feet: { x: 0, y: 0, z: 0 },
  yawDegrees: 0,
  seed: 0,
  drawCalls: 0,
  pointerLocked: false,
});

/** What the interface may ask the game to do. */
export interface GameControls {
  /** Hand control to the player (locks the mouse pointer where the browser allows it). */
  requestPlay(): void;
}
