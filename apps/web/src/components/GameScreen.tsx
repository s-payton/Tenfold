import { useEffect, useState, useSyncExternalStore } from 'react';
import {
  arrangeRun,
  findLevel,
  getLevel,
  hit,
  validateGroup,
  type Card as CardData,
  type LaidGroup,
  type Move,
  type PublicView,
  type RulesConfig,
} from '@tenfold/engine';
import { THROWABLES, type ChatBody } from '@tenfold/server';
import { playSound, setMuted } from '../audio.ts';
import { COPY, apiErrorMessage, describeLevel, sendErrorMessage } from '../copy.ts';
import { sortCards, type SortMode } from '../game/cardOrder.ts';
import type { GameClient } from '../game/client.ts';
import { useChatEffects } from '../game/useChatEffects.ts';
import { useGameSounds } from '../game/useGameSounds.ts';
import { useGameView } from '../game/useGameView.ts';
import { useRoomData } from '../game/useRoomData.ts';
import { buzz } from '../haptics.ts';
import { applyTable } from '../prefs.ts';
import { ChatLayer } from './ChatLayer.tsx';
import { ChatPanel } from './ChatPanel.tsx';
import { Hand } from './Hand.tsx';
import { HandOver } from './HandOver.tsx';
import { LayDownBuilder, type BuilderSlot } from './LayDownBuilder.tsx';
import { Opponents } from './Opponents.tsx';
import { Piles } from './Piles.tsx';
import { Sheet, type SheetOption } from './Sheet.tsx';
import { SkipFlash } from './SkipFlash.tsx';
import { TableArea } from './TableArea.tsx';
import { TurnClock } from './TurnClock.tsx';

type Pending =
  | { readonly kind: 'skip'; readonly cardId: string }
  | { readonly kind: 'wild-end'; readonly cardId: string; readonly groupId: string };

interface Building {
  /** Card ids per level group. */
  readonly slots: readonly (readonly string[])[];
  /** The box that tapped hand cards go into. */
  readonly active: number;
  /** Which arrangement each run box uses, when wilds could go more than one way. */
  readonly shifts: readonly number[];
}

interface Props {
  readonly client: GameClient;
  readonly onExit: () => void;
}

const SKIP_FLASH_MS = 1900;

const isCard = (c: CardData | undefined): c is CardData => c !== undefined;

const levelsOf = (view: PublicView): Record<string, number> =>
  Object.fromEntries(view.players.map((p) => [p.id, p.level]));

const fitsGroup = (group: LaidGroup, card: CardData, config: RulesConfig): boolean => {
  const result = hit(group, card, config);
  return result.ok || result.error === 'needs-position';
};

const listNames = (names: readonly string[]): string =>
  names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names.at(-1) ?? ''}`;

export const GameScreen = ({ client, onExit }: Props) => {
  const view = useGameView(client);
  const room = useRoomData(client);
  const { config, names, myId } = client;
  const myIndex = view.players.findIndex((p) => p.id === myId);
  const me = view.players[myIndex];
  const isMyTurn = view.status === 'playing' && view.currentIndex === myIndex;
  const canDraw = isMyTurn && view.step === 'draw';
  const canPlay = isMyTurn && view.step === 'play';

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sortMode, setSortMode] = useState<SortMode>('color');
  const [building, setBuilding] = useState<Building | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [muted, setMutedState] = useState(false);
  const [drawing, setDrawing] = useState<'deck' | 'discard' | null>(null);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [handStart, setHandStart] = useState({ hand: view.handNumber, levels: levelsOf(view) });
  const [seenTurn, setSeenTurn] = useState(view.turn);
  const [skipFlash, setSkipFlash] = useState<{ readonly key: number; readonly message: string } | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [throwAt, setThrowAt] = useState<string | null>(null);
  const [readUpTo, setReadUpTo] = useState(0);

  const messages = useSyncExternalStore(client.subscribe, client.chat.getMessages);
  const { effects, done: effectDone } = useChatEffects(messages);
  const lastMessageId = messages.at(-1)?.id ?? 0;
  if (chatOpen && lastMessageId > readUpTo) setReadUpTo(lastMessageId);
  const unread = messages.filter(
    (m) => m.live && m.id > readUpTo && m.playerId !== myId && m.body.kind !== 'throw',
  ).length;

  if (handStart.hand !== view.handNumber) {
    setHandStart({ hand: view.handNumber, levels: levelsOf(view) });
  }
  if (seenTurn !== view.turn) {
    setSeenTurn(view.turn);
    if (view.lastSkipped.length > 0) {
      const message = view.lastSkipped.includes(myId)
        ? COPY.youSkipped
        : COPY.othersSkipped(listNames(view.lastSkipped.map((id) => names[id] ?? id)));
      setSkipFlash({ key: view.turn, message });
    }
  }

  useGameSounds(view, myId);

  useEffect(() => {
    if (!skipFlash) return;
    playSound('skip');
    if (skipFlash.message === COPY.youSkipped) buzz([80, 60, 80]);
    const timer = setTimeout(() => setSkipFlash(null), SKIP_FLASH_MS);
    return () => clearTimeout(timer);
  }, [skipFlash]);

  useEffect(() => {
    if (toast === null) return;
    const timer = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(timer);
  }, [toast]);

  const level = me ? getLevel(config, me.level) : undefined;
  const handById = new Map(view.hand.map((c) => [c.id, c]));
  const activeBuild = canPlay && me && !me.laidDown ? building : null;
  const inSlots = new Set(activeBuild?.slots.flat() ?? []);
  const handCards = sortCards(
    view.hand.filter((c) => !inSlots.has(c.id)),
    sortMode,
  );
  const selected = selectedId && handById.has(selectedId) && !activeBuild ? handById.get(selectedId) : undefined;

  // The game checks the hand for you: the Lay down button only shows when it will work.
  const solution =
    canPlay && me && !me.laidDown && level ? findLevel(view.hand, level, config) : null;

  const slotsFor = (build: Building): BuilderSlot[] =>
    (level?.requirements ?? []).map((requirement, i) => {
      const cards = (build.slots[i] ?? []).map((id) => handById.get(id)).filter(isCard);
      const options = requirement.type === 'run' ? arrangeRun(cards, config) : [];
      const ordered = options[(build.shifts[i] ?? 0) % Math.max(1, options.length)] ?? cards;
      return {
        requirement,
        cards: ordered,
        result: validateGroup(requirement, ordered, config),
        canShift: options.length > 1,
      };
    });
  const builderSlots = activeBuild ? slotsFor(activeBuild) : null;

  const hitCard = canPlay && me?.laidDown ? selected : undefined;
  const hittable = new Set(
    hitCard
      ? view.table
          .filter((g) => config.allowHitOnOthers || g.ownerId === myId)
          .filter((g) => fitsGroup(g.group, hitCard, config))
          .map((g) => g.id)
      : [],
  );
  const skipTargets = view.players.filter((p) => p.id !== myId && !p.skipPending);

  const send = async (move: Move): Promise<boolean> => {
    setSelectedId(null);
    const error = await client.send(move);
    if (error) {
      setToast(sendErrorMessage(error));
      playSound('error');
      buzz([30, 40, 30]);
      return false;
    }
    return true;
  };

  /** A draw needs the server (the card is secret), so block a second tap until it lands. */
  const draw = (source: 'deck' | 'discard') => {
    if (drawing) return;
    setDrawing(source);
    void send({ type: 'draw', source }).finally(() => setDrawing(null));
  };
  // Show the draw at once: the known discard, or a face-down card from the deck.
  const stillDrawing = drawing !== null && view.step === 'draw';
  const incoming = !stillDrawing ? null : drawing === 'discard' ? view.discardTop : 'face-down';

  const nextOpenBox = (build: Building, from: number): number => {
    const slots = slotsFor(build);
    for (let k = 0; k < slots.length; k++) {
      const i = (from + k) % slots.length;
      if (!slots[i]?.result.ok) return i;
    }
    return from;
  };

  const tapHandCard = (id: string) => {
    playSound('select');
    if (activeBuild) {
      // While laying down, a tapped card goes straight into the active box.
      const slots = activeBuild.slots.map((ids, i) => (i === activeBuild.active ? [...ids, id] : ids));
      const next = { ...activeBuild, slots };
      const filled = slotsFor(next)[activeBuild.active]?.result.ok;
      setBuilding({ ...next, active: filled ? nextOpenBox(next, activeBuild.active) : activeBuild.active });
      return;
    }
    // Otherwise only one card is picked at a time, so Discard always knows which one.
    setSelectedId((current) => (current === id ? null : id));
  };

  const startBuilding = () => {
    if (!level) return;
    const slots = solution
      ? solution.map((group) => group.map((c) => c.id))
      : level.requirements.map(() => []);
    const build = { slots, active: 0, shifts: level.requirements.map(() => 0) };
    setSelectedId(null);
    setBuilding({ ...build, active: nextOpenBox(build, 0) });
  };

  const removeFromBox = (cardId: string) =>
    setBuilding((b) => (b ? { ...b, slots: b.slots.map((ids) => ids.filter((id) => id !== cardId)) } : b));

  const confirmLayDown = () => {
    if (!builderSlots) return;
    const groups = builderSlots.map((s) => s.cards.map((c) => c.id));
    setBuilding(null);
    void send({ type: 'lay-down', groups });
  };

  const discard = () => {
    if (!selected) return;
    const needsTarget =
      selected.kind === 'skip' && config.skipLosesTurn && view.hand.length > 1 && skipTargets.length > 0;
    if (needsTarget) setPending({ kind: 'skip', cardId: selected.id });
    else void send({ type: 'discard', cardId: selected.id });
  };

  const hitGroup = (groupId: string) => {
    const group = view.table.find((g) => g.id === groupId);
    if (!hitCard || !group) return;
    const result = hit(group.group, hitCard, config);
    if (!result.ok && result.error === 'needs-position') {
      setPending({ kind: 'wild-end', cardId: hitCard.id, groupId });
    } else {
      void send({ type: 'hit', groupId, cardId: hitCard.id });
    }
  };

  const pick = (move: Move) => () => {
    setPending(null);
    void send(move);
  };

  const sheetOptions: SheetOption[] =
    pending?.kind === 'skip'
      ? skipTargets.map((p) => ({
          label: names[p.id] ?? p.id,
          onPick: pick({ type: 'discard', cardId: pending.cardId, skipTarget: p.id }),
        }))
      : pending?.kind === 'wild-end'
        ? [
            {
              label: COPY.hitLow,
              onPick: pick({ type: 'hit', groupId: pending.groupId, cardId: pending.cardId, position: 'start' }),
            },
            {
              label: COPY.hitHigh,
              onPick: pick({ type: 'hit', groupId: pending.groupId, cardId: pending.cardId, position: 'end' }),
            },
          ]
        : [];

  const current = view.players[view.currentIndex];
  const hint = (() => {
    if (!isMyTurn) return COPY.waiting(names[current?.id ?? ''] ?? '');
    if (canDraw) return view.discardTop?.kind === 'skip' ? COPY.drawHintSkipOnTop : COPY.drawHint;
    if (activeBuild) return COPY.buildHint;
    if (hitCard && hittable.size > 0) return COPY.playHintHit;
    if (selected) return COPY.playHintSelected;
    if (solution) return COPY.playHintCanLayDown;
    return me?.laidDown ? COPY.playHintLaidDown : COPY.playHint;
  })();

  const mySeat = room?.players.find((p) => p.id === myId);
  const currentSeat = room?.players.find((p) => p.id === current?.id);
  const clockTotal = (room?.settings.turnSeconds ?? 30) * 1000;
  const table = room?.settings.table;
  useEffect(() => {
    if (table) applyTable(table);
  }, [table]);

  const paused = room?.paused ?? null;
  // Pausing is for timed games, and only while a clock is running.
  const canPause =
    client.pause !== undefined && room !== null && room.settings.turnSeconds !== null && room.turnDeadline !== null && !paused;

  const sendChat = async (body: ChatBody) => {
    const error = await client.chat.send(body);
    if (error && !chatOpen) setToast(apiErrorMessage(error));
    return error;
  };

  const exit = () => {
    if (client.leave && view.status === 'playing') setConfirmLeave(true);
    else onExit();
  };

  const toggleMute = () => {
    setMuted(!muted);
    setMutedState(!muted);
  };

  return (
    <div className="game">
      <header className="topbar">
        <button type="button" className="btn btn--small btn--ghost" onClick={exit}>
          {COPY.home}
        </button>
        <span className="topbar__title">{COPY.appName}</span>
        <div className="topbar__tools">
          {canPause && (
            <button type="button" className="btn btn--small btn--ghost" onClick={client.pause} aria-label={COPY.pause}>
              ⏸
            </button>
          )}
          {client.chat.canTalk && (
            <button
              type="button"
              className="btn btn--small btn--ghost topbar__chat"
              onClick={() => setChatOpen(true)}
              aria-label={unread > 0 ? COPY.chatUnread(unread) : COPY.chat}
            >
              💬
              {unread > 0 && <span className="badge">{unread > 9 ? '9+' : unread}</span>}
            </button>
          )}
          <button
            type="button"
            className="btn btn--small btn--ghost"
            onClick={toggleMute}
            aria-pressed={muted}
            aria-label="Sound"
          >
            {muted ? '🔇' : '🔊'}
          </button>
        </div>
      </header>

      <Opponents view={view} names={names} onPick={setThrowAt} {...(room ? { seats: room.players } : {})} />

      {room && !currentSeat?.bot && (
        <TurnClock deadline={room.turnDeadline} totalMs={clockTotal} mine={isMyTurn} />
      )}

      {mySeat?.bot && client.reclaim && (
        <div className="seatbanner" role="alert">
          <span>{COPY.botPlayingForYou}</span>
          <button type="button" className="btn btn--small btn--primary" onClick={client.reclaim}>
            {COPY.imBack}
          </button>
        </div>
      )}

      <Piles
        view={view}
        canDraw={canDraw && !drawing}
        pending={stillDrawing}
        takingTop={stillDrawing && drawing === 'discard'}
        onDrawDeck={() => draw('deck')}
        onDrawDiscard={() => draw('discard')}
      />

      <main className="middle">
        {builderSlots && activeBuild ? (
          <LayDownBuilder
            slots={builderSlots}
            active={activeBuild.active}
            onActivate={(i) => setBuilding((b) => (b ? { ...b, active: i } : b))}
            onRemove={removeFromBox}
            onShift={(i) =>
              setBuilding((b) => (b ? { ...b, shifts: b.shifts.map((n, j) => (j === i ? n + 1 : n)) } : b))
            }
            onConfirm={confirmLayDown}
            onCancel={() => setBuilding(null)}
          />
        ) : (
          <TableArea groups={view.table} names={names} hittable={hittable} onHit={hitGroup} />
        )}
      </main>

      <section className={`me ${isMyTurn ? 'me--active' : ''}`} data-seat={myId}>
        <div className="me__info">
          <strong>{COPY.levelOf(me?.level ?? 1)}</strong>
          <span>{level ? describeLevel(level.requirements) : ''}</span>
          {me?.laidDown && <span className="chip__done">✓</span>}
          <span className="me__score">{COPY.points(me?.score ?? 0)}</span>
        </div>
        <p className="me__hint" aria-live="polite">
          {hint}
        </p>
        <div className="me__actions">
          <button
            type="button"
            className="btn btn--small btn--ghost"
            onClick={() => setSortMode(sortMode === 'color' ? 'number' : 'color')}
          >
            {sortMode === 'color' ? COPY.sortByColor : COPY.sortByNumber}
          </button>
          {solution && !activeBuild && (
            <button type="button" className="btn btn--small btn--go" onClick={startBuilding}>
              {COPY.layDown}
            </button>
          )}
          {canPlay && !activeBuild && (
            <button
              type="button"
              className="btn btn--small btn--primary"
              disabled={!selected}
              onClick={discard}
            >
              {COPY.discard}
            </button>
          )}
        </div>
        <Hand
          key={view.handNumber}
          cards={handCards}
          selected={new Set(selected ? [selected.id] : [])}
          onToggle={tapHandCard}
          dealing={!activeBuild && view.hand.length <= config.handSize}
          incoming={incoming}
        />
      </section>

      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}

      {skipFlash && <SkipFlash key={skipFlash.key} message={skipFlash.message} />}

      {throwAt && (
        <Sheet
          title={COPY.throwAt(names[throwAt] ?? throwAt)}
          options={THROWABLES.map((item) => ({
            label: COPY.throwItems[item],
            onPick: () => {
              setThrowAt(null);
              void sendChat({ kind: 'throw', item, targetId: throwAt });
            },
          }))}
          onClose={() => setThrowAt(null)}
        />
      )}

      {paused && view.status === 'playing' && (
        <div className="pauseover" role="alertdialog" aria-modal="true" aria-label={COPY.pausedBy(names[paused.by] ?? '')}>
          <p className="pauseover__icon" aria-hidden="true">
            ⏸
          </p>
          <h2 className="pauseover__title">{COPY.pausedBy(names[paused.by] ?? paused.by)}</h2>
          <p className="pauseover__hint">{COPY.pausedHint}</p>
          <button type="button" className="btn btn--primary btn--big" onClick={client.resume}>
            {COPY.resume}
          </button>
          {client.chat.canTalk && (
            <button type="button" className="btn btn--ghost" onClick={() => setChatOpen(true)}>
              {unread > 0 ? COPY.chatUnread(unread) : COPY.chat}
            </button>
          )}
        </div>
      )}

      <ChatLayer effects={effects} myId={myId} onDone={effectDone} />

      {chatOpen && (
        <ChatPanel
          messages={messages}
          names={names}
          myId={myId}
          onSend={sendChat}
          onClose={() => setChatOpen(false)}
        />
      )}

      {pending && (
        <Sheet
          title={pending.kind === 'skip' ? COPY.skipWho : COPY.whereWild}
          options={sheetOptions}
          onClose={() => setPending(null)}
        />
      )}

      {confirmLeave && (
        <Sheet
          title={COPY.leaveGameTitle}
          options={[
            {
              label: COPY.leaveGame,
              onPick: () => {
                setConfirmLeave(false);
                void client.leave?.().finally(onExit);
              },
            },
          ]}
          onClose={() => setConfirmLeave(false)}
          note={COPY.leaveGameBody}
          cancelLabel={COPY.stay}
        />
      )}

      {view.status !== 'playing' && (
        <HandOver
          view={view}
          startLevels={handStart.levels}
          names={names}
          onNext={client.nextHand}
          onHome={onExit}
        />
      )}
    </div>
  );
};
