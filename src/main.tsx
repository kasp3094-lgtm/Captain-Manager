import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { balance } from './content/gameContent';
import { parseLaunchParams } from './debug/params';
import { Game } from './game';
import { App } from './ui/App';
import { FatalError } from './ui/FatalError';
import './ui/styles.css';

const params = parseLaunchParams(window.location.search);
const canvas = document.getElementById('game-canvas');
const uiRoot = document.getElementById('ui-root');
if (!(canvas instanceof HTMLCanvasElement) || !uiRoot) {
  throw new Error('index.html must contain #game-canvas and #ui-root');
}
const root = createRoot(uiRoot);

try {
  const game = new Game(canvas, params, balance);
  root.render(
    <StrictMode>
      <App game={game} params={params} />
    </StrictMode>,
  );
  game.start();
} catch (error) {
  console.error(error);
  root.render(<FatalError message={error instanceof Error ? error.message : String(error)} />);
}
