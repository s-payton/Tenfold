import { useState } from 'react';
import { DEFAULT_RULES } from '@tenfold/engine';
import { unlockAudio } from '../audio.ts';
import { COPY, describeLevel } from '../copy.ts';

const OPPONENT_CHOICES = [1, 2, 3, 4, 5];

export const Home = ({ onStart }: { readonly onStart: (opponents: number) => void }) => {
  const [opponents, setOpponents] = useState(3);
  return (
    <main className="home">
      <h1 className="logo">
        <span className="logo__mark">X</span>
        {COPY.appName}
      </h1>
      <p className="home__tagline">{COPY.tagline}</p>
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
      <button
        type="button"
        className="btn btn--primary btn--big"
        onClick={() => {
          unlockAudio();
          onStart(opponents);
        }}
      >
        {COPY.start}
      </button>
      <ol className="levels">
        {DEFAULT_RULES.levels.map((l) => (
          <li key={l.number}>
            <span className="levels__n">{l.number}</span>
            {describeLevel(l.requirements)}
          </li>
        ))}
      </ol>
    </main>
  );
};
