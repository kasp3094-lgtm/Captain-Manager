/**
 * An event's scene: who says what (narration in italics, the captain's choices as "You"), then
 * the choices, numbered, with costs and with locked ones greyed out and the reason shown;
 * notices of what changed ("Lt. Cmdr. Okafor will remember that."); and at the end an outcome
 * card with everything the event changed. Space or Enter goes on, 1–9 choose.
 */
import { useEffect, useRef, type MouseEvent } from 'react';
import { eventUi, type GameControls } from './state';
import { useStore } from './store';

export function EventPanel({ game }: { game: GameControls }) {
  const { title, lines, choices, notices, outcome } = useStore(eventUi, (state) => state);
  const transcript = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Keep the newest line in view.
    const box = transcript.current;
    if (box) box.scrollTop = box.scrollHeight;
  }, [lines.length, choices, outcome]);

  return (
    <section className="event" role="dialog" aria-label={title} data-testid="event">
      <header className="event-title">{title}</header>
      <div className="event-lines" ref={transcript}>
        {lines.map((line) => (
          <p
            key={line.key}
            className="event-line"
            data-kind={line.captain ? 'captain' : line.speaker ? 'speech' : 'narration'}
          >
            {line.captain && <span className="event-speaker">You</span>}
            {line.speaker && (
              <span className="event-speaker">
                {line.speaker.name}
                <span className="event-role">{line.speaker.role}</span>
              </span>
            )}
            <span className="event-text">{line.text}</span>
          </p>
        ))}
      </div>
      {notices.length > 0 && (
        <ul className="event-notices" aria-live="polite">
          {notices.map((notice) => (
            <li key={notice.key} data-tone={notice.tone}>
              {notice.text}
            </li>
          ))}
        </ul>
      )}
      {outcome ? (
        <div className="event-outcome" data-testid="event-outcome">
          <h3>Logged</h3>
          <ul>
            {outcome.map((change) => (
              <li key={change.key} data-tone={change.tone}>
                {change.text}
              </li>
            ))}
          </ul>
          <button type="button" onMouseDown={keepFocus} onClick={game.closeOutcome}>
            Back to the ship <kbd>Enter</kbd>
          </button>
        </div>
      ) : choices ? (
        <ol className="event-choices">
          {choices.map((choice, i) => (
            <li key={choice.index}>
              <button
                type="button"
                disabled={choice.locked !== null}
                onMouseDown={keepFocus}
                onClick={() => game.chooseOption(choice.index)}
              >
                <kbd>{i + 1}</kbd>
                <span className="event-choice-text">
                  {choice.text}
                  {choice.cost && <span className="event-cost">{choice.cost}</span>}
                  {choice.locked && <span className="event-locked">{choice.locked}</span>}
                </span>
              </button>
            </li>
          ))}
        </ol>
      ) : (
        <button
          type="button"
          className="event-continue"
          onMouseDown={keepFocus}
          onClick={game.continueEvent}
        >
          Continue <kbd>Space</kbd>
        </button>
      )}
    </section>
  );
}

/** Buttons here don't take the focus, so Space and Enter always reach the game's own keys. */
function keepFocus(event: MouseEvent): void {
  event.preventDefault();
}
