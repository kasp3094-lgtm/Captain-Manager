/**
 * The state the game shares with the interface. The game (src/game.ts) writes it; React
 * components read it through `useStore`. Two stores, so that the player's position, which
 * changes every frame, doesn't make the rest of the interface re-render.
 */
import type { PoiKind } from '../content/ship';
import { createStore } from './store';

/** loading → start screen → playing ⇄ paused, and playing ⇄ map (the full ship map). */
export type GameMode = 'loading' | 'start' | 'playing' | 'paused' | 'map';

export interface CurrentRoom {
  readonly id: string;
  /** Naval compartment number, e.g. 2-30-2-L. */
  readonly code: string;
  readonly name: string;
  readonly deck: number;
}

export interface NearbyPoi {
  readonly name: string;
  readonly kind: PoiKind;
  /** Metres, rounded to 0.1. */
  readonly distance: number;
}

export interface GameUiState {
  readonly mode: GameMode;
  /** The room the captain is standing in, from the deck plan. */
  readonly room: CurrentRoom | null;
  /** The closest point of interest within a few metres, shown on the minimap. */
  readonly nearbyPoi: NearbyPoi | null;
  /** Rooms that exist in 3D so far; the map shows the rest as planned. */
  readonly builtRooms: readonly string[];
  /** Debug panel figures. */
  readonly fps: number;
  readonly drawCalls: number;
  readonly seed: number;
  readonly pointerLocked: boolean;
}

export const gameUi = createStore<GameUiState>({
  mode: 'loading',
  room: null,
  nearbyPoi: null,
  builtRooms: [],
  fps: 0,
  drawCalls: 0,
  seed: 0,
  pointerLocked: false,
});

/** Where the captain is on the deck plan: metres from the bow (x) and from starboard (y). */
export interface PlayerPose {
  readonly deck: number;
  readonly x: number;
  readonly y: number;
  /** Heading in degrees, clockwise on the map; 0 points to starboard (the top of the map). */
  readonly yawDegrees: number;
}

export const playerPose = createStore<PlayerPose>({ deck: 1, x: 0, y: 0, yawDegrees: 0 });

/** What the interface may ask the game to do. */
export interface GameControls {
  /** Hand control to the player (locks the mouse pointer where the browser allows it). */
  requestPlay(): void;
  /** Open or close the full ship map. */
  toggleMap(): void;
}
