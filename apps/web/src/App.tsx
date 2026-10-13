import { useCallback, useState } from 'react';
import { COPY, apiErrorMessage } from './copy.ts';
import { GameScreen } from './components/GameScreen.tsx';
import { Home } from './components/Home.tsx';
import { Lobby } from './components/Lobby.tsx';
import type { GameClient } from './game/client.ts';
import { createLocalGame } from './game/localGame.ts';
import { callGame } from './net/api.ts';
import { createRemoteGame } from './net/remoteGame.ts';
import type { RoomSnapshot } from './net/room.ts';
import { loadName, loadSavedRoom, saveName, saveRoom, type SavedRoom } from './net/savedRoom.ts';

type Screen =
  | { readonly kind: 'home' }
  | { readonly kind: 'lobby'; readonly room: SavedRoom }
  | { readonly kind: 'game'; readonly client: GameClient; readonly online: boolean };

const params = new URLSearchParams(window.location.search);

/** `?seed=123` replays the same local deal, for testing and bug reports. */
const seedFromUrl = (): number | undefined => {
  const seed = Number(params.get('seed') ?? NaN);
  return Number.isInteger(seed) ? seed : undefined;
};

/** `?room=ABCD` comes from an invite link. */
const codeFromUrl = (): string => (params.get('room') ?? '').toUpperCase().slice(0, 4);

export const App = () => {
  const [screen, setScreen] = useState<Screen>({ kind: 'home' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const enterRoom = async (request: Promise<Awaited<ReturnType<typeof callGame>>>, name: string) => {
    setBusy(true);
    setError(null);
    saveName(name);
    const result = await request;
    setBusy(false);
    if (!result.ok) {
      setError(apiErrorMessage(result.error));
      if (result.error.code === 'room-not-found' || result.error.code === 'game-started') saveRoom(null);
      return;
    }
    const room = { roomId: result.roomId, code: result.code, playerId: result.playerId };
    saveRoom(room);
    setScreen({ kind: 'lobby', room });
  };

  const onStarted = useCallback((snapshot: RoomSnapshot) => {
    setScreen((current) => {
      if (current.kind !== 'lobby') return current;
      const client = createRemoteGame(current.room.roomId, current.room.playerId, snapshot);
      return client ? { kind: 'game', client, online: true } : current;
    });
  }, []);

  const goHome = () => {
    if (screen.kind === 'game') screen.client.dispose();
    setError(null);
    setScreen({ kind: 'home' });
  };

  return (
    <>
      {screen.kind === 'home' && (
        <Home
          initialName={loadName()}
          initialCode={codeFromUrl()}
          savedRoom={loadSavedRoom()}
          busy={busy}
          error={error}
          onLocal={(opponents) => {
            const seed = seedFromUrl();
            const client = createLocalGame({ opponents, ...(seed === undefined ? {} : { seed }) });
            setScreen({ kind: 'game', client, online: false });
          }}
          onCreate={(name) => void enterRoom(callGame({ type: 'create', name }), name)}
          onJoin={(name, code) => void enterRoom(callGame({ type: 'join', code, name }), name)}
        />
      )}
      {screen.kind === 'lobby' && (
        <Lobby
          roomId={screen.room.roomId}
          playerId={screen.room.playerId}
          onStarted={onStarted}
          onLeave={() => {
            saveRoom(null);
            goHome();
          }}
        />
      )}
      {screen.kind === 'game' && <GameScreen client={screen.client} onExit={goHome} />}
      <div className="rotate" aria-hidden="true">
        {COPY.rotate}
      </div>
    </>
  );
};
