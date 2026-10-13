import { useEffect, useState } from 'react';
import {
  arrangeRun,
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
import { buzz } from '../haptics.ts';
import { Hand } from './Hand.tsx';
import { HandOver } from './HandOver.tsx';
import { LayDownBuilder, type BuilderSlot } from './LayDownBuilder.tsx';
import { Opponents } from './Opponents.tsx';
import { Piles } from './Piles.tsx';
import { Sheet, type SheetOption } from './Sheet.tsx';
import { TableArea } from './TableArea.tsx';

type Pending =
  | { readonly kind: 'skip'; readonly cardId: string }
  | { readonly kind: 'wild-end'; readonly cardId: string; readonly groupId: string };

interface Props {
  readonly client: GameClient;
  readonly onExit: () => void;
}

const isCard = (c: CardData | undefined): c is CardData => c !== undefined;

const levelsOf = (view: PublicView): Record<string, number> =>
  Object.fromEntries(view.players.map((p) => [p.id, p.level]));

const fitsGroup = (group: LaidGroup, card: CardData, config: RulesConfig): boolean => {
  const result = hit(group, card, config);
  return result.ok || result.error === 'needs-position';
};

export const GameScreen = ({ client, onExit }: Props) => {
  const view = useGameView(client);
  const { config, names, myId } = client;
  const myIndex = view.players.findIndex((p) => p.id === myId);
  const me = view.players[myIndex];
  const isMyTurn = view.status === 'playing' && view.currentIndex === myIndex;
  const canDraw = isMyTurn && view.step === 'draw';
  const canPlay = isMyTurn && view.step === 'play';

  const [selectedIds, setSelectedIds] = useState<readonly string[]>([]);
  const [sortMode, setSortMode] = useState<SortMode>('color');
  const [slots, setSlots] = useState<readonly (readonly string[])[] | null>(null);
  const [shifts, setShifts] = useState<readonly number[]>([]);
  const [pending, setPending] = useState<Pending | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [muted, setMutedState] = useState(false);
  const [handStart, setHandStart] = useState({ hand: view.handNumber, levels: levelsOf(view) });
  if (handStart.hand !== view.handNumber) {
    setHandStart({ hand: view.handNumber, levels: levelsOf(view) });
  }

  useGameSounds(view, myId);

  useEffect(() => {
    if (toast === null) return;
    const timer = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(timer);
  }, [toast]);

  const level = me ? getLevel(config, me.level) : undefined;
  const building = canPlay && me && !me.laidDown && slots !== null ? slots : null;
  const handById = new Map(view.hand.map((c) => [c.id, c]));
  const inSlots = new Set(building?.flat() ?? []);
  const handCards = sortCards(
    view.hand.filter((c) => !inSlots.has(c.id)),
    sortMode,
  );
  const selected = new Set(selectedIds.filter((id) => handById.has(id) && !inSlots.has(id)));
  const selectedCards = [...selected].map((id) => handById.get(id)).filter(isCard);

  const builderSlots: BuilderSlot[] | null =
    building && level
      ? level.requirements.map((requirement, i) => {
          const cards = (building[i] ?? []).map((id) => handById.get(id)).filter(isCard);
          const options = requirement.type === 'run' ? arrangeRun(cards, config) : [];
          const ordered = options[(shifts[i] ?? 0) % Math.max(1, options.length)] ?? cards;
          return {
            requirement,
            cards: ordered,
            result: validateGroup(requirement, ordered, config),
            canShift: options.length > 1,
          };
        })
      : null;

  const hitCard = canPlay && me?.laidDown && selectedCards.length === 1 ? selectedCards[0] : undefined;
  const hittable = new Set(
    hitCard
      ? view.table
          .filter((g) => config.allowHitOnOthers || g.ownerId === myId)
          .filter((g) => fitsGroup(g.group, hitCard, config))
          .map((g) => g.id)
      : [],
  );
  const skipTargets = view.players.filter((p) => p.id !== myId && !p.skipPending);

  const [drawing, setDrawing] = useState(false);

  const send = async (move: Move): Promise<boolean> => {
    setSelectedIds([]);
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

  const toggle = (id: string) => {
    playSound('select');
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const startBuilding = () => {
    if (!level) return;
    setSlots(level.requirements.map(() => []));
    setShifts(level.requirements.map(() => 0));
  };

  const addToSlot = (index: number) => {
    setSlots((prev) => prev?.map((ids, i) => (i === index ? [...ids, ...selected] : ids)) ?? null);
    setSelectedIds([]);
  };

  const removeFromSlot = (cardId: string) =>
    setSlots((prev) => prev?.map((ids) => ids.filter((id) => id !== cardId)) ?? null);

  const shiftWilds = (index: number) =>
    setShifts((prev) => prev.map((n, i) => (i === index ? n + 1 : n)));

  const confirmLayDown = () => {
    if (!builderSlots) return;
    const groups = builderSlots.map((s) => s.cards.map((c) => c.id));
    // The builder already checked the level, so close it now; a refusal shows a message.
    setSlots(null);
    void send({ type: 'lay-down', groups });
  };

  const discard = () => {
    const card = selectedCards[0];
    if (!card || selectedCards.length !== 1) return;
    const needsTarget =
      card.kind === 'skip' && config.skipLosesTurn && view.hand.length > 1 && skipTargets.length > 0;
    if (needsTarget) setPending({ kind: 'skip', cardId: card.id });
    else void send({ type: 'discard', cardId: card.id });
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
  const hint = !isMyTurn
    ? COPY.waiting(names[current?.id ?? ''] ?? '')
    : canDraw
      ? view.discardTop?.kind === 'skip'
        ? COPY.drawHintSkipOnTop
        : COPY.drawHint
      : me?.laidDown
        ? COPY.playHintLaidDown
        : COPY.playHint;

  const toggleMute = () => {
    setMuted(!muted);
    setMutedState(!muted);
  };

  return (
    <div className="game">
      <header className="topbar">
        <button type="button" className="btn btn--small btn--ghost" onClick={onExit}>
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

      <Opponents view={view} names={names} />

      <Piles
        view={view}
        canDraw={canDraw && !drawing}
        pending={drawing}
        onDrawDeck={() => draw('deck')}
        onDrawDiscard={() => draw('discard')}
      />

      <main className="middle">
        {builderSlots ? (
          <LayDownBuilder
            slots={builderSlots}
            hasSelection={selected.size > 0}
            onAdd={addToSlot}
            onRemove={removeFromSlot}
            onShift={shiftWilds}
            onConfirm={confirmLayDown}
            onCancel={() => setSlots(null)}
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
          {canPlay && me && !me.laidDown && !building && (
            <button type="button" className="btn btn--small" onClick={startBuilding}>
              {COPY.layDown}
            </button>
          )}
          {canPlay && !building && (
            <button
              type="button"
              className="btn btn--small btn--primary"
              disabled={selectedCards.length !== 1}
              onClick={discard}
            >
              {COPY.discard}
            </button>
          )}
        </div>
        <Hand
          key={view.handNumber}
          cards={handCards}
          selected={selected}
          onToggle={toggle}
          dealing={!building && view.hand.length <= config.handSize}
        />
      </section>

      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}

      {pending && (
        <Sheet
          title={pending.kind === 'skip' ? COPY.skipWho : COPY.whereWild}
          options={sheetOptions}
          onClose={() => setPending(null)}
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
