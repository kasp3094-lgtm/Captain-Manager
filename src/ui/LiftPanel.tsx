/** The lift's deck buttons: shown when the captain uses the lift. Keys 1–4 pick a deck, Esc stays. */
import type { Ship } from '../content/ship';

interface LiftPanelProps {
  readonly ship: Ship;
  /** The deck the lift is on now. */
  readonly deck: number;
  readonly onChoose: (deck: number | null) => void;
}

export function LiftPanel({ ship, deck, onChoose }: LiftPanelProps) {
  const lift = ship.shafts.find((shaft) => shaft.type === 'lift' && shaft.decks.includes(deck));
  const decks = ship.decks.filter((candidate) => lift?.decks.includes(candidate.deck));
  return (
    <div className="screen">
      <div className="card" role="dialog" aria-labelledby="lift-title">
        <p className="eyebrow">{lift?.name ?? 'Lift'}</p>
        <h2 id="lift-title" className="title small">
          Which deck?
        </h2>
        <div className="lift-decks">
          {decks.map((candidate) => (
            <button
              key={candidate.deck}
              type="button"
              className="lift-deck"
              disabled={candidate.deck === deck}
              autoFocus={candidate.deck !== deck && candidate.deck === (deck === 1 ? 2 : deck - 1)}
              onClick={() => onChoose(candidate.deck)}
            >
              <kbd>{candidate.deck}</kbd>
              <span>
                Deck {candidate.deck} · {candidate.name}
              </span>
              {candidate.deck === deck && <span className="lift-deck-here">You are here</span>}
            </button>
          ))}
        </div>
        <button type="button" className="button" onClick={() => onChoose(null)}>
          Stay on this deck
        </button>
        <p className="tagline" style={{ margin: '14px 0 0' }}>
          Press a deck's number, or <kbd>Esc</kbd> to stay.
        </p>
      </div>
    </div>
  );
}
