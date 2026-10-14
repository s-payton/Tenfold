import { useEffect, useRef, useState, type SyntheticEvent } from 'react';
import { m } from 'framer-motion';
import { CHAT_EMOJIS, MAX_CHAT_LENGTH, type ChatBody } from '@tenfold/server';
import { COPY, apiErrorMessage } from '../copy.ts';
import type { ChatEntry } from '../game/client.ts';
import type { ApiError } from '../net/api.ts';

interface Props {
  readonly messages: readonly ChatEntry[];
  readonly names: Readonly<Record<string, string>>;
  readonly myId: string;
  readonly onSend: (body: ChatBody) => Promise<ApiError | null>;
  readonly onClose: () => void;
}

const Line = ({ message, names, myId }: { readonly message: ChatEntry; readonly names: Props['names']; readonly myId: string }) => {
  const name = names[message.playerId] ?? message.playerId;
  const mine = message.playerId === myId;
  const { body } = message;
  if (body.kind === 'throw') {
    const target = body.targetId === myId ? COPY.youObject : (names[body.targetId] ?? body.targetId);
    return <li className="chat__event">{COPY.threw(name, body.item, target)}</li>;
  }
  return (
    <li className={`chat__line ${mine ? 'chat__line--mine' : ''}`}>
      <strong className="chat__name">{name}</strong>
      <span className={body.kind === 'emoji' ? 'chat__emoji' : 'chat__text'}>
        {body.kind === 'emoji' ? body.emoji : body.text}
      </span>
    </li>
  );
};

/** A plain chat: recent messages, quick emoji reactions, and a box to type in. */
export const ChatPanel = ({ messages, names, myId, onSend, onClose }: Props) => {
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const list = useRef<HTMLUListElement>(null);

  // Stay scrolled to the newest message.
  useEffect(() => {
    const el = list.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  const send = (body: ChatBody) => {
    setError(null);
    void onSend(body).then((failed) => {
      if (failed) setError(apiErrorMessage(failed));
    });
  };

  const submit = (event: SyntheticEvent) => {
    event.preventDefault();
    const text = draft.trim();
    if (!text) return;
    setDraft('');
    send({ kind: 'text', text });
  };

  return (
    <div className="overlay overlay--chat" role="dialog" aria-modal="true" aria-label={COPY.chat}>
      <m.div
        className="sheet chat"
        initial={{ y: 200, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 380, damping: 34 }}
      >
        <div className="chat__head">
          <h2 className="sheet__title">{COPY.chat}</h2>
          <button type="button" className="btn btn--small btn--ghost" onClick={onClose}>
            {COPY.close}
          </button>
        </div>
        <ul className="chat__list" ref={list} aria-live="polite">
          {messages.length === 0 && <li className="chat__event">{COPY.chatEmpty}</li>}
          {messages.map((message) => (
            <Line key={message.id} message={message} names={names} myId={myId} />
          ))}
        </ul>
        <div className="chat__emojis" role="group" aria-label={COPY.chatEmojis}>
          {CHAT_EMOJIS.map((emoji) => (
            <button key={emoji} type="button" className="chat__emojibtn" onClick={() => send({ kind: 'emoji', emoji })}>
              {emoji}
            </button>
          ))}
        </div>
        <form className="chat__form" onSubmit={submit}>
          <input
            aria-label={COPY.chatPlaceholder}
            placeholder={COPY.chatPlaceholder}
            value={draft}
            maxLength={MAX_CHAT_LENGTH}
            enterKeyHint="send"
            autoComplete="off"
            onChange={(e) => setDraft(e.target.value)}
          />
          <button type="submit" className="btn btn--small btn--primary" disabled={draft.trim() === ''}>
            {COPY.send}
          </button>
        </form>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
      </m.div>
    </div>
  );
};
