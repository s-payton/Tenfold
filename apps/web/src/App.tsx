import { Suspense, lazy, useCallback, useEffect, useState } from 'react';
import { rulesFromHouse } from '@tenfold/engine';
import { COPY, apiErrorMessage } from './copy.ts';
import { GameScreen } from './components/GameScreen.tsx';
import { Home } from './components/Home.tsx';
import type { GameClient } from './game/client.ts';
import { createLocalGame } from './game/localGame.ts';
import type { ApiResult } from './net/api.ts';
import { applyTable, loadSettings } from './prefs.ts';
import { applyUpdate, useUpdateReady } from './update.ts';
import type { RoomSnapshot } from './net/room.ts';
import { loadName, loadSavedRoom, saveName, saveRoom, type SavedRoom } from './net/savedRoom.ts';

type Screen =
  | { readonly kind: 'home' }
  | { readonly kind: 'lobby'; readonly room: SavedRoom }
  | { readonly kind: 'game'; readonly client: GameClient; readonly online: boolean };

// Online play (Supabase) loads on first use, so the computer game stays small and offline-ready.
const online = () => import('./net/online.ts');
const Lobby = lazy(() => import('./components/Lobby.tsx').then((m) => ({ default: m.Lobby })));

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

  // A new version applies itself on the home screen; elsewhere the player chooses when.
  const updateReady = useUpdateReady();
  useEffect(() => {
    if (updateReady && screen.kind === 'home') void applyUpdate(true);
  }, [updateReady, screen.kind]);

  // Home shows this device's last table; games and lobbies set their own.
  useEffect(() => {
    if (screen.kind === 'home') applyTable(loadSettings().table);
  }, [screen.kind]);

  const enterRoom = async (request: Promise<ApiResult>, name: string) => {
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

  const lobbyRoom = screen.kind === 'lobby' ? screen.room : null;
  const onStarted = useCallback(
    (snapshot: RoomSnapshot) => {
      if (!lobbyRoom) return;
      void online().then(({ createRemoteGame }) => {
        const client = createRemoteGame(lobbyRoom.roomId, lobbyRoom.playerId, snapshot);
        if (client) setScreen({ kind: 'game', client, online: true });
      });
    },
    [lobbyRoom],
  );

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
          onLocal={(opponents, level, settings) => {
            const seed = seedFromUrl();
            const config = rulesFromHouse(settings.rules);
            applyTable(settings.table);
            const client = createLocalGame({ opponents, level, config, ...(seed === undefined ? {} : { seed }) });
            setScreen({ kind: 'game', client, online: false });
          }}
          onCreate={(name) => void enterRoom(online().then((m) => m.callGame({ type: 'create', name })), name)}
          onJoin={(name, code) =>
            void enterRoom(online().then((m) => m.callGame({ type: 'join', code, name })), name)
          }
        />
      )}
      {screen.kind === 'lobby' && (
        <Suspense fallback={<main className="lobby">{COPY.connecting}</main>}>
        <Lobby
          roomId={screen.room.roomId}
          playerId={screen.room.playerId}
          onStarted={onStarted}
          onLeave={() => {
            const roomId = screen.room.roomId;
            void online().then((m) => m.callGame({ type: 'leave', roomId }));
            saveRoom(null);
            goHome();
          }}
        />
        </Suspense>
      )}
      {screen.kind === 'game' && <GameScreen client={screen.client} onExit={goHome} />}
      {updateReady && screen.kind !== 'home' && (
        <div className="updatebar" role="status">
          <span>{COPY.updateReady}</span>
          <button type="button" className="btn btn--small btn--primary" onClick={() => void applyUpdate(true)}>
            {COPY.updateNow}
          </button>
        </div>
      )}
      <div className="rotate" aria-hidden="true">
        {COPY.rotate}
      </div>
    </>
  );
};
