import { useState } from 'react';
import { GameScreen } from './components/GameScreen.tsx';
import { Home } from './components/Home.tsx';
import type { GameClient } from './game/client.ts';
import { createLocalGame } from './game/localGame.ts';

/** `?seed=123` replays the same deal, for testing and bug reports. */
const seedFromUrl = (): number | undefined => {
  const seed = Number(new URLSearchParams(window.location.search).get('seed') ?? NaN);
  return Number.isInteger(seed) ? seed : undefined;
};

export const App = () => {
  const [client, setClient] = useState<GameClient | null>(null);
  return (
    <>
      {client ? (
        <GameScreen
          client={client}
          onExit={() => {
            client.dispose();
            setClient(null);
          }}
        />
      ) : (
        <Home
          onStart={(opponents) => {
            const seed = seedFromUrl();
            setClient(createLocalGame({ opponents, ...(seed === undefined ? {} : { seed }) }));
          }}
        />
      )}
      <div className="rotate" aria-hidden="true">
        Turn your phone upright to play.
      </div>
    </>
  );
};
