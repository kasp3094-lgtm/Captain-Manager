/**
 * What the crew are saying: a bubble over the speaker's head with their name, or a subtitle at
 * the bottom of the screen when they're out of view. The game places it every frame.
 */
import { speech } from './state';
import { useStore } from './store';

export function Speech() {
  const bubble = useStore(speech, (state) => state.bubble);
  if (!bubble) return null;
  const said = (
    <>
      <span className="speech-name">{bubble.name}</span>
      <span className="speech-text">{bubble.text}</span>
    </>
  );
  if (bubble.x === null || bubble.y === null) {
    return (
      <div className="subtitle" role="status" data-testid="speech" key={bubble.key}>
        {said}
      </div>
    );
  }
  return (
    <div
      className="speech"
      role="status"
      data-testid="speech"
      data-to-captain={bubble.toCaptain ? '' : undefined}
      key={bubble.key}
      style={{
        transform: `translate(${bubble.x}px, ${bubble.y}px) translate(-50%, -100%)`,
        opacity: bubble.opacity,
      }}
    >
      {said}
    </div>
  );
}
