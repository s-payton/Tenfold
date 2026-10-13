import { useEffect, useState } from 'react';
import { MAX_PLAYERS, MIN_PLAYERS } from '@tenfold/engine';
import { COPY, apiErrorMessage } from '../copy.ts';
import { callGame } from '../net/api.ts';
import { watchRoom, type RoomSnapshot } from '../net/room.ts';

interface Props {
  readonly roomId: string;
  readonly playerId: string;
  readonly onStarted: (snapshot: RoomSnapshot) => void;
  readonly onLeave: () => void;
}

const inviteLink = (code: string) =>
  `${window.location.origin}${import.meta.env.BASE_URL}?room=${code}`;

export const Lobby = ({ roomId, playerId, onStarted, onLeave }: Props) => {
  const [snapshot, setSnapshot] = useState<RoomSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    const watch = watchRoom(roomId, (next) => {
      if (next.data.table) onStarted(next);
      else setSnapshot(next);
    });
    return watch.stop;
  }, [roomId, onStarted]);

  if (!snapshot) return <main className="lobby">{COPY.connecting}</main>;

  const { data } = snapshot;
  const isHost = data.hostPlayerId === playerId;
  const host = data.players.find((p) => p.id === data.hostPlayerId);
  const canStart = isHost && data.players.length >= MIN_PLAYERS;

  const invite = async () => {
    const link = inviteLink(data.code);
    // Older browsers lack these, whatever the DOM types say.
    const nav: Partial<Navigator> = navigator;
    try {
      if (nav.share) {
        await nav.share({ title: COPY.appName, text: COPY.inviteText(data.code), url: link });
      } else if (nav.clipboard) {
        await nav.clipboard.writeText(link);
        setNotice(COPY.inviteCopied);
      }
    } catch {
      // The share sheet was closed, or clipboard access was refused.
    }
  };

  const start = async () => {
    setStarting(true);
    setError(null);
    const result = await callGame({ type: 'start', roomId });
    setStarting(false);
    if (!result.ok) setError(apiErrorMessage(result.error));
  };

  return (
    <main className="lobby">
      <p className="lobby__label">{COPY.roomCode}</p>
      <p className="lobby__code">{data.code}</p>
      <button type="button" className="btn" onClick={() => void invite()}>
        {COPY.invite}
      </button>
      {notice && <p className="lobby__notice">{notice}</p>}

      <h2 className="lobby__heading">{COPY.playersCount(data.players.length, MAX_PLAYERS)}</h2>
      <ul className="lobby__players">
        {data.players.map((p) => (
          <li key={p.id}>
            <span>{p.name}</span>
            {p.id === playerId && <span className="tag">{COPY.you}</span>}
            {p.id === data.hostPlayerId && <span className="tag tag--host">{COPY.host}</span>}
          </li>
        ))}
      </ul>

      {isHost ? (
        <button
          type="button"
          className="btn btn--primary btn--big"
          disabled={!canStart || starting}
          onClick={() => void start()}
        >
          {starting ? COPY.working : COPY.startGame}
        </button>
      ) : null}
      <p className="lobby__wait">
        {isHost
          ? canStart
            ? ''
            : COPY.needMorePlayers
          : COPY.waitingForHost(host?.name ?? COPY.host)}
      </p>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <button type="button" className="btn btn--ghost" onClick={onLeave}>
        {COPY.leave}
      </button>
    </main>
  );
};
