import { useEffect, useState } from 'react';
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
import { playSound, setMuted } from '../audio.ts';
import { COPY, describeLevel, sendErrorMessage } from '../copy.ts';
import { sortCards, type SortMode } from '../game/cardOrder.ts';
import type { GameClient } from '../game/client.ts';
import { useGameSounds } from '../game/useGameSounds.ts';
import { useGameView } from '../game/useGameView.ts';
import { useRoomData } from '../game/useRoomData.ts';
import { buzz } from '../haptics.ts';
import { applyTable } from '../prefs.ts';
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
  const [drawing, setDrawing] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [handStart, setHandStart] = useState({ hand: view.handNumber, levels: levelsOf(view) });
  const [seenTurn, setSeenTurn] = useState(view.turn);
  const [skipFlash, setSkipFlash] = useState<{ readonly key: number; readonly message: string } | null>(null);

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
    setDrawing(true);
    void send({ type: 'draw', source }).finally(() => setDrawing(false));
  };

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
        <button
          type="button"
          className="btn btn--small btn--ghost"
          onClick={toggleMute}
          aria-pressed={muted}
          aria-label="Sound"
        >
          {muted ? '🔇' : '🔊'}
        </button>
      </header>

      <Opponents view={view} names={names} {...(room ? { seats: room.players } : {})} />

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
        pending={drawing}
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

      <section className={`me ${isMyTurn ? 'me--active' : ''}`}>
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
        />
      </section>

      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}

      {skipFlash && <SkipFlash key={skipFlash.key} message={skipFlash.message} />}

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
