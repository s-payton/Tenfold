import { useEffect, useState } from 'react';
import { m, useReducedMotion } from 'framer-motion';
import { playSound } from '../audio.ts';
import type { ChatEffect } from '../game/useChatEffects.ts';
import { buzz } from '../haptics.ts';
import { Splat } from './Splat.tsx';

interface Anchor {
  readonly x: number;
  readonly y: number;
  readonly top: number;
  readonly bottom: number;
}

const PROJECTILES = { egg: '🥚', pie: '🥧' } as const;
/** Keeps bubbles from running off the sides of the screen. */
const EDGE = 90;

/** Where a player sits on screen: their chip, or your own area (marked with `data-seat`). */
const anchorOf = (playerId: string): Anchor => {
  const el = document.querySelector(`[data-seat="${CSS.escape(playerId)}"]`);
  if (!el) return { x: window.innerWidth / 2, y: 80, top: 80, bottom: 80 };
  const r = el.getBoundingClientRect();
  // Your area is tall, so aim at its top edge rather than the middle of your hand.
  const y = r.height > 150 ? r.top + 24 : r.top + r.height / 2;
  return { x: r.left + r.width / 2, y, top: r.top, bottom: r.bottom };
};

const clampX = (x: number) => Math.min(window.innerWidth - EDGE, Math.max(EDGE, x));

const SayBubble = ({ effect, onDone }: { readonly effect: Extract<ChatEffect, { kind: 'say' }>; readonly onDone: () => void }) => {
  const [anchor] = useState(() => anchorOf(effect.playerId));
  const [below] = useState(() => anchor.y < window.innerHeight / 2);
  useEffect(() => playSound('chat'), []);
  return (
    <m.div
      className={`bubble ${below ? 'bubble--below' : 'bubble--above'} ${effect.big ? 'bubble--emoji' : ''}`}
      style={{
        left: clampX(anchor.x),
        x: '-50%',
        ...(below ? { top: anchor.bottom + 6 } : { bottom: window.innerHeight - anchor.top + 6 }),
      }}
      initial={{ opacity: 0, scale: 0.6 }}
      animate={{ opacity: [0, 1, 1, 0], scale: [0.6, 1.08, 1, 1] }}
      transition={{ duration: effect.big ? 2.6 : 4.2, times: [0, 0.08, 0.85, 1] }}
      onAnimationComplete={onDone}
    >
      {effect.text}
    </m.div>
  );
};

interface ThrowProps {
  readonly effect: Extract<ChatEffect, { kind: 'throw' }>;
  readonly myId: string;
  readonly onDone: () => void;
}

/** Each phase has its own key, so the splat starts a fresh animation instead of inheriting the flight's. */
const ThrowFx = ({ effect, myId, onDone }: ThrowProps) => {
  const [path] = useState(() => ({ from: anchorOf(effect.from), to: anchorOf(effect.to) }));
  const [landed, setLanded] = useState(false);
  const reduced = useReducedMotion();
  const hitsMe = effect.to === myId;
  useEffect(() => playSound('whoosh'), []);

  if (!landed) {
    const dx = path.to.x - path.from.x;
    const dy = path.to.y - path.from.y;
    const lift = Math.min(160, Math.abs(dx) / 2 + 70);
    return (
      <m.div
        key="flight"
        className="projectile"
        style={{ left: path.from.x, top: path.from.y }}
        initial={{ x: 0, y: 0, rotate: 0, scale: 0.8 }}
        animate={{ x: [0, dx / 2, dx], y: [0, dy / 2 - lift, dy], rotate: [0, 320, 640], scale: [0.8, 1.35, 1] }}
        transition={{ duration: reduced ? 0.01 : 0.75, ease: 'easeIn' }}
        onAnimationComplete={() => {
          setLanded(true);
          playSound('splat');
          if (hitsMe) buzz([60, 40, 140]);
        }}
      >
        {PROJECTILES[effect.item]}
      </m.div>
    );
  }

  if (hitsMe) {
    // Right in your face: a big splat that slides down the screen.
    return (
      <m.div
        key="splat"
        className="splatscreen"
        initial={{ opacity: 1 }}
        animate={{ opacity: [1, 1, 1, 0], y: [0, 0, 50, 140] }}
        transition={{ duration: 2.8, times: [0, 0.35, 0.8, 1] }}
        onAnimationComplete={onDone}
      >
        <m.div initial={{ scale: 0.3 }} animate={{ scale: [0.3, 1.12, 1] }} transition={{ duration: 0.3 }}>
          <Splat item={effect.item} className="splatscreen__art" />
        </m.div>
      </m.div>
    );
  }

  return (
    <m.div
      key="splat"
      className="splatchip"
      style={{ left: path.to.x, top: path.to.y, x: '-50%', y: '-50%' }}
      initial={{ scale: 0, opacity: 1 }}
      animate={{ scale: [0, 1.25, 1, 1], opacity: [1, 1, 1, 0] }}
      transition={{ duration: 2.2, times: [0, 0.12, 0.25, 1] }}
      onAnimationComplete={onDone}
    >
      <Splat item={effect.item} className="splatchip__art" />
    </m.div>
  );
};

interface Props {
  readonly effects: readonly ChatEffect[];
  readonly myId: string;
  readonly onDone: (key: number) => void;
}

/** Speech bubbles and flying food, drawn over the table. Taps pass straight through. */
export const ChatLayer = ({ effects, myId, onDone }: Props) => (
  <div className="chatlayer" aria-hidden="true">
    {effects.map((e) =>
      e.kind === 'say' ? (
        <SayBubble key={e.key} effect={e} onDone={() => onDone(e.key)} />
      ) : (
        <ThrowFx key={e.key} effect={e} myId={myId} onDone={() => onDone(e.key)} />
      ),
    )}
  </div>
);
