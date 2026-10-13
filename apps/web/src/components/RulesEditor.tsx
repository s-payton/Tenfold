import { LEVEL_SETS, type HouseRules, type LevelSet } from '@tenfold/engine';
import { TABLE_THEMES, TURN_SECONDS, type RoomSettings, type TurnSeconds } from '@tenfold/server';
import { COPY } from '../copy.ts';

interface Props {
  readonly value: RoomSettings;
  /** Leave out for a read-only view. */
  readonly onChange?: (settings: RoomSettings) => void;
  /** The clock only applies to online games. */
  readonly showTimer: boolean;
}

interface Choice<T> {
  readonly value: T;
  readonly label: string;
}

const Pills = <T,>({
  label,
  options,
  value,
  onPick,
}: {
  readonly label: string;
  readonly options: readonly Choice<T>[];
  readonly value: T;
  readonly onPick: ((value: T) => void) | undefined;
}) => (
  <div className="rules__row">
    <span className="rules__label">{label}</span>
    <div className="rules__pills" role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.label}
          type="button"
          className={`picker__pill picker__pill--small ${o.value === value ? 'picker__pill--on' : ''}`}
          aria-pressed={o.value === value}
          disabled={!onPick}
          onClick={() => onPick?.(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  </div>
);

const Toggle = ({
  label,
  help,
  checked,
  onToggle,
}: {
  readonly label: string;
  readonly help: string;
  readonly checked: boolean;
  readonly onToggle: (() => void) | undefined;
}) => (
  <label className="rules__toggle">
    <span>
      <span className="rules__label">{label}</span>
      <span className="rules__help">{help}</span>
    </span>
    <input type="checkbox" checked={checked} disabled={!onToggle} onChange={() => onToggle?.()} />
  </label>
);

/** House rules, table and clock. Editable for the host, read-only for everyone else. */
export const RulesEditor = ({ value, onChange, showTimer }: Props) => {
  const setRules = onChange
    ? (change: Partial<HouseRules>) => onChange({ ...value, rules: { ...value.rules, ...change } })
    : undefined;
  const { rules } = value;
  return (
    <div className="rules">
      <div className="rules__row">
        <span className="rules__label">{COPY.tableLabel}</span>
        <div className="rules__swatches" role="group" aria-label={COPY.tableLabel}>
          {TABLE_THEMES.map((t) => (
            <button
              key={t}
              type="button"
              className={`swatch swatch--${t} ${t === value.table ? 'swatch--on' : ''}`}
              aria-label={COPY.tables[t]}
              aria-pressed={t === value.table}
              disabled={!onChange}
              onClick={() => onChange?.({ ...value, table: t })}
            />
          ))}
        </div>
      </div>
      <Pills<LevelSet>
        label={COPY.lengthLabel}
        options={LEVEL_SETS.map((l) => ({ value: l, label: COPY.lengths[l] }))}
        value={rules.levelSet}
        onPick={setRules && ((levelSet) => setRules({ levelSet }))}
      />
      {showTimer && (
        <Pills<TurnSeconds>
          label={COPY.timerLabel}
          options={TURN_SECONDS.map((t) => ({ value: t, label: t === null ? COPY.timerOff : COPY.secondsLeft(t) }))}
          value={value.turnSeconds}
          onPick={onChange && ((turnSeconds) => onChange({ ...value, turnSeconds }))}
        />
      )}
      <Pills<HouseRules['nextHandLeader']>
        label={COPY.ruleLeader}
        options={(['hand-winner', 'left-of-dealer'] as const).map((l) => ({ value: l, label: COPY.leaders[l] }))}
        value={rules.nextHandLeader}
        onPick={setRules && ((nextHandLeader) => setRules({ nextHandLeader }))}
      />
      <Toggle
        label={COPY.ruleHitOthers}
        help={COPY.ruleHitOthersHelp}
        checked={rules.hitOnOthers}
        onToggle={setRules && (() => setRules({ hitOnOthers: !rules.hitOnOthers }))}
      />
      <Toggle
        label={COPY.ruleSkips}
        help={COPY.ruleSkipsHelp}
        checked={rules.skipLosesTurn}
        onToggle={setRules && (() => setRules({ skipLosesTurn: !rules.skipLosesTurn }))}
      />
      <Toggle
        label={COPY.ruleWildDiscard}
        help={COPY.ruleWildDiscardHelp}
        checked={rules.wildDiscard}
        onToggle={setRules && (() => setRules({ wildDiscard: !rules.wildDiscard }))}
      />
      <Toggle
        label={COPY.ruleEveryone}
        help={COPY.ruleEveryoneHelp}
        checked={rules.everyoneAdvances}
        onToggle={setRules && (() => setRules({ everyoneAdvances: !rules.everyoneAdvances }))}
      />
    </div>
  );
};
