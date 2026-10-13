import type { PublicView } from '@tenfold/engine';
import type { RoomPlayer } from '@tenfold/server';
import { COPY } from '../copy.ts';

interface Props {
  readonly view: PublicView;
  readonly names: Readonly<Record<string, string>>;
  /** Online seat info, to mark computer seats. */
  readonly seats?: readonly RoomPlayer[];
}

export const Opponents = ({ view, names, seats }: Props) => (
  <ul className="opponents" aria-label={COPY.opponentsLabel}>
    {view.players.map((p, i) =>
      p.id === view.viewerId ? null : (
        <li
          key={p.id}
          className={`chip ${i === view.currentIndex ? 'chip--active' : ''}`}
          aria-current={i === view.currentIndex ? 'true' : undefined}
        >
          <span className="chip__name">
            {names[p.id] ?? p.id}
            {i === view.dealerIndex && <span className="chip__dealer" title={COPY.dealer}>D</span>}
          </span>
          <span className="chip__level">{COPY.levelOf(p.level)}</span>
          <span className="chip__meta">
            {COPY.cards(p.handCount)}
            {p.laidDown && <span className="chip__done">✓</span>}
          </span>
          {p.skipPending && <span className="chip__skip">{COPY.skipped}</span>}
          {(() => {
            const bot = seats?.find((seat) => seat.id === p.id)?.bot;
            return bot ? <span className="chip__bot">🤖 {COPY.levels[bot]}</span> : null;
          })()}
        </li>
      ),
    )}
  </ul>
);
