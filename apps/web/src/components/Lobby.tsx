import { useEffect, useRef, useState } from 'react';
import { BOT_LEVELS, MAX_PLAYERS, MIN_PLAYERS, type BotLevel } from '@tenfold/engine';
import { COPY, apiErrorMessage } from '../copy.ts';
import { callGame } from '../net/api.ts';
import { watchRoom, type RoomSnapshot } from '../net/room.ts';
import { saveName } from '../net/savedRoom.ts';

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
  const handedOff = useRef(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [botLevel, setBotLevel] = useState<BotLevel>('medium');

  useEffect(() => {
    const watch = watchRoom(roomId, (next) => {
      if (!next.data.table) {
        setSnapshot(next);
      } else if (!handedOff.current) {
        handedOff.current = true;
        onStarted(next);
      }
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

  const rename = async (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setError(null);
    // Joining again with a new name renames this seat while the room is in the lobby.
    const result = await callGame({ type: 'join', code: data.code, name: trimmed });
    if (!result.ok) {
      setError(apiErrorMessage(result.error));
      return;
    }
    saveName(trimmed);
    setEditing(null);
    setSnapshot(result.snapshot);
  };

  const act = async (action: Parameters<typeof callGame>[0]) => {
    setError(null);
    const result = await callGame(action);
    if (result.ok) setSnapshot(result.snapshot);
    else setError(apiErrorMessage(result.error));
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
        {data.players.map((p) =>
          p.id === playerId && editing !== null ? (
            <li key={p.id}>
              <input
                aria-label={COPY.yourName}
                value={editing}
                maxLength={16}
                autoFocus
                onChange={(e) => setEditing(e.target.value)}
              />
              <button type="button" className="btn btn--small btn--primary" onClick={() => void rename(editing)}>
                {COPY.save}
              </button>
            </li>
          ) : (
            <li key={p.id}>
              <span>{p.name}</span>
              {p.id === playerId && <span className="tag">{COPY.you}</span>}
              {p.id === data.hostPlayerId && <span className="tag tag--host">{COPY.host}</span>}
              {p.bot && <span className="tag">🤖 {COPY.levels[p.bot]}</span>}
              {isHost && p.id !== playerId && (
                <button
                  type="button"
                  className="btn btn--small btn--ghost lobby__rename"
                  aria-label={`${COPY.remove} ${p.name}`}
                  onClick={() => void act({ type: 'remove', roomId, playerId: p.id })}
                >
                  {COPY.remove}
                </button>
              )}
              {p.id === playerId && (
                <button type="button" className="btn btn--small btn--ghost lobby__rename" onClick={() => setEditing(p.name)}>
                  {COPY.changeName}
                </button>
              )}
            </li>
          ),
        )}
      </ul>

      {isHost && data.players.length < MAX_PLAYERS && (
        <div className="addbot">
          <div className="addbot__levels" role="group" aria-label={COPY.difficulty}>
            {BOT_LEVELS.map((l) => (
              <button
                key={l}
                type="button"
                className={`picker__pill ${l === botLevel ? 'picker__pill--on' : ''}`}
                aria-pressed={l === botLevel}
                onClick={() => setBotLevel(l)}
              >
                {COPY.levels[l]}
              </button>
            ))}
          </div>
          <button type="button" className="btn" onClick={() => void act({ type: 'add-bot', roomId, level: botLevel })}>
            {COPY.addComputer}
          </button>
        </div>
      )}

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
