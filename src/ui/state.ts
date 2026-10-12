/**
 * The state the game shares with the interface. The game (src/game.ts) writes it; React
 * components read it through `useStore`. Separate stores, so that what changes every frame (the
 * player's position, speech) doesn't make the rest of the interface re-render.
 */
import type { PoiKind } from '../content/ship';
import type { SlotId, SlotSummary } from '../saveSlots';
import { createStore } from './store';

/**
 * loading → start screen → playing ⇄ paused, playing ⇄ map (the full ship map),
 * playing ⇄ lift (choosing a deck in the lift), and playing ⇄ event (a scene of an event, with
 * its dialogue and choices).
 */
export type GameMode = 'loading' | 'start' | 'playing' | 'paused' | 'map' | 'lift' | 'event';

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
  /** A ship-wide call ("Now hear this: Captain to the bridge."), new key per call. */
  readonly call: { readonly key: number; readonly text: string } | null;
  /** Where the captain is wanted: "Go to the bridge (deck 1)". */
  readonly objective: string | null;
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
  call: null,
  objective: null,
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

/** A line of an event's scene: who says it (none for narration) and what. */
export interface EventLine {
  readonly key: number;
  readonly speaker: { readonly name: string; readonly role: string } | null;
  readonly text: string;
  /** The captain's own choice, repeated in the transcript. */
  readonly captain?: boolean;
}

export interface EventChoice {
  readonly index: number;
  readonly text: string;
  /** "₡300", if it costs something. */
  readonly cost: string | null;
  /** Why it can't be picked, if it can't. */
  readonly locked: string | null;
}

/** "−₡300", "Lt. Cmdr. Okafor will remember that." */
export interface EventNotice {
  readonly key: number;
  readonly text: string;
  readonly tone: 'up' | 'down' | 'even';
}

/** The event being played, as the dialogue panel shows it. */
export interface EventUiState {
  readonly title: string;
  readonly lines: readonly EventLine[];
  /** The choices to make now; null while a line waits for Continue. */
  readonly choices: readonly EventChoice[] | null;
  readonly notices: readonly EventNotice[];
  /** When it's over: what it changed, for the outcome card. */
  readonly outcome: readonly EventNotice[] | null;
}

export const eventUi = createStore<EventUiState>({
  title: '',
  lines: [],
  choices: null,
  notices: [],
  outcome: null,
});

/** What's in the save slots, for the save and load lists. */
export const savesUi = createStore<{ readonly slots: readonly SlotSummary[] }>({ slots: [] });

/** What the interface may ask the game to do. */
export interface GameControls {
  /** Hand control to the player (locks the mouse pointer where the browser allows it). */
  requestPlay(): void;
  /** Open or close the full ship map. */
  toggleMap(): void;
  /** In the lift: go to a deck, or stay (null). */
  chooseDeck(deck: number | null): void;
  /** In an event: show the next line. */
  continueEvent(): void;
  /** In an event: make a choice (its index from EventChoice). */
  chooseOption(index: number): void;
  /** Close an event's outcome card and play on. */
  closeOutcome(): void;
  /** Save into one of the player's slots. Says how it went: "Saved in slot 1." */
  saveGame(slot: SlotId): string;
  /** Load a slot and play on from there. Null when it loaded; otherwise why it didn't. */
  loadGame(slot: SlotId): string | null;
}
