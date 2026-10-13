import { useState } from 'react';
import { BOT_LEVELS, levelsFor, type BotLevel } from '@tenfold/engine';
import { unlockAudio } from '../audio.ts';
import { COPY, describeLevel } from '../copy.ts';
import type { RoomSettings } from '@tenfold/server';
import type { SavedRoom } from '../net/savedRoom.ts';
import { applyTable, loadSettings, saveSettings } from '../prefs.ts';
import { RulesEditor } from './RulesEditor.tsx';
import { useInstall } from '../install.ts';

const OPPONENT_CHOICES = [1, 2, 3, 4, 5];
type Mode = 'computer' | 'friends';

interface Props {
  readonly initialName: string;
  readonly initialCode: string;
  readonly savedRoom: SavedRoom | null;
  readonly busy: boolean;
  readonly error: string | null;
  readonly onLocal: (opponents: number, level: BotLevel, settings: RoomSettings) => void;
  readonly onCreate: (name: string) => void;
  readonly onJoin: (name: string, code: string) => void;
}

export const Home = (props: Props) => {
  const [mode, setMode] = useState<Mode>(props.initialCode || props.savedRoom ? 'friends' : 'computer');
  const [opponents, setOpponents] = useState(3);
  const [level, setLevel] = useState<BotLevel>('medium');
  const [settings, setSettings] = useState(loadSettings);
  const changeSettings = (next: RoomSettings) => {
    setSettings(next);
    saveSettings(next);
    applyTable(next.table);
  };
  const [name, setName] = useState(props.initialName);
  const [code, setCode] = useState(props.initialCode);
  const [localError, setLocalError] = useState<string | null>(null);

  const withName = (run: (trimmed: string) => void) => () => {
    unlockAudio();
    const trimmed = name.trim();
    if (!trimmed) {
      setLocalError(COPY.needName);
      return;
    }
    if (trimmed.toUpperCase() === code.trim().toUpperCase()) {
      setLocalError(COPY.nameIsCode);
      return;
    }
    setLocalError(null);
    run(trimmed);
  };

  const error = localError ?? props.error;
  const install = useInstall();

  return (
    <main className="home">
      <h1 className="logo">
        <span className="logo__mark">X</span>
        {COPY.appName}
      </h1>
      <p className="home__tagline">{COPY.tagline}</p>

      <div className="modes" role="tablist">
        {(['computer', 'friends'] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            className={`modes__tab ${mode === m ? 'modes__tab--on' : ''}`}
            onClick={() => setMode(m)}
          >
            {m === 'computer' ? COPY.modeComputer : COPY.modeFriends}
          </button>
        ))}
      </div>

      {mode === 'computer' ? (
        <>
          <fieldset className="picker">
            <legend>{COPY.opponentsLabel}</legend>
            {OPPONENT_CHOICES.map((n) => (
              <button
                key={n}
                type="button"
                className={`picker__option ${n === opponents ? 'picker__option--on' : ''}`}
                aria-pressed={n === opponents}
                onClick={() => setOpponents(n)}
              >
                {n}
              </button>
            ))}
          </fieldset>
          <fieldset className="picker">
            <legend>{COPY.difficulty}</legend>
            {BOT_LEVELS.map((l) => (
              <button
                key={l}
                type="button"
                className={`picker__pill ${l === level ? 'picker__pill--on' : ''}`}
                aria-pressed={l === level}
                onClick={() => setLevel(l)}
              >
                {COPY.levels[l]}
              </button>
            ))}
          </fieldset>
          <button
            type="button"
            className="btn btn--primary btn--big"
            onClick={() => {
              unlockAudio();
              props.onLocal(opponents, level, settings);
            }}
          >
            {COPY.start}
          </button>
          <details className="rules-panel">
            <summary>{COPY.houseRules}</summary>
            <RulesEditor value={settings} onChange={changeSettings} showTimer={false} />
          </details>
        </>
      ) : (
        <div className="friends">
          {props.savedRoom && (
            <button
              type="button"
              className="btn btn--primary"
              disabled={props.busy}
              onClick={withName((n) => props.onJoin(n, props.savedRoom?.code ?? ''))}
            >
              {COPY.rejoin(props.savedRoom.code)}
            </button>
          )}
          <label className="field">
            <span>{COPY.yourName}</span>
            <input
              value={name}
              maxLength={16}
              placeholder={COPY.namePlaceholder}
              autoComplete="nickname"
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <button
            type="button"
            className="btn btn--primary btn--big"
            disabled={props.busy}
            onClick={withName(props.onCreate)}
          >
            {props.busy ? COPY.working : COPY.createRoom}
          </button>
          <p className="friends__or">{COPY.haveCode}</p>
          <label className="field" htmlFor="room-code">
            <span>{COPY.roomCode}</span>
          </label>
          <div className="join">
            <input
              id="room-code"
              className="join__code"
              value={code}
              maxLength={4}
              placeholder="ABCD"
              autoCapitalize="characters"
              autoComplete="off"
              onChange={(e) => setCode(e.target.value.toUpperCase())}
            />
            <button
              type="button"
              className="btn"
              disabled={props.busy || code.trim().length !== 4}
              onClick={withName((n) => props.onJoin(n, code))}
            >
              {COPY.join}
            </button>
          </div>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
        </div>
      )}

      {install.kind === 'prompt' && (
        <button type="button" className="btn" onClick={install.install}>
          {COPY.installApp}
        </button>
      )}
      {install.kind === 'ios-hint' && <p className="install-hint">{COPY.installIos}</p>}

      <dl className="glossary">
        {COPY.glossary.map(([term, meaning]) => (
          <div key={term}>
            <dt>{term}</dt>
            <dd>{meaning}</dd>
          </div>
        ))}
      </dl>

      <ol className="levels">
        {levelsFor(settings.rules.levelSet).map((l) => (
          <li key={l.number}>
            <span className="levels__n">{l.number}</span>
            {describeLevel(l.requirements)}
          </li>
        ))}
      </ol>
    </main>
  );
};
