/**
 * The state the game shares with the interface. The game (src/game.ts) writes it; React
 * components read it through `useStore`. Two stores, so that the player's position, which
 * changes every frame, doesn't make the rest of the interface re-render.
 */
import type { PoiKind } from '../content/ship';
import { createStore } from './store';

/**
 * loading → start screen → playing ⇄ paused, playing ⇄ map (the full ship map), and
 * playing ⇄ lift (choosing a deck in the lift).
 */
export type GameMode = 'loading' | 'start' | 'playing' | 'paused' | 'map' | 'lift';

export interface CurrentRoom {
  readonly id: string;
  /** Naval compartment number, e.g. 2-30-2-L; empty in ladderwells and the lift. */
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
  /** What pressing E would do, e.g. "Climb down to Deck 2"; null when nothing is in reach. */
  readonly prompt: string | null;
  /** True while the view fades to black for a trip between decks. */
  readonly fading: boolean;
  /** Ship's time, "0752", and the day aboard (0 is the first). */
  readonly time: string;
  readonly day: number;
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
  prompt: null,
  fading: false,
  time: '',
  day: 0,
  fps: 0,
  drawCalls: 0,
  seed: 0,
  pointerLocked: false,
});

/** A line the crew are saying, placed on screen by the game every frame. */
export interface SpeechBubble {
  /** New for every line. */
  readonly key: number;
  /** Who says it, e.g. "PO2 Barros". */
  readonly name: string;
  readonly text: string;
  /** Said to the captain, rather than overheard. */
  readonly toCaptain: boolean;
  /** Above the speaker's head, in CSS pixels; null when they're off screen (shown as a subtitle). */
  readonly x: number | null;
  readonly y: number | null;
  /** 1 close by, fainter further off. */
  readonly opacity: number;
}

/** What's being said; its own store, since it moves every frame. */
export const speech = createStore<{ readonly bubble: SpeechBubble | null }>({ bubble: null });

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
  /** In the lift: go to a deck, or stay (null). */
  chooseDeck(deck: number | null): void;
}
