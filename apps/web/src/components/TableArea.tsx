import type { LaidGroup, TableGroup } from '@tenfold/engine';
import { COPY } from '../copy.ts';
import { Card } from './Card.tsx';

interface Props {
  readonly groups: readonly TableGroup[];
  readonly names: Readonly<Record<string, string>>;
  readonly hittable: ReadonlySet<string>;
  readonly onHit: (groupId: string) => void;
}

const groupLabel = (group: LaidGroup): string => {
  switch (group.type) {
    case 'set':
      return group.value === null ? 'Set' : `Set of ${String(group.value)}s`;
    case 'run':
      return `Run ${String(group.start)} to ${String(group.end)}`;
    case 'color':
      return group.color === null ? 'One color' : `All ${group.color}`;
  }
};

export const TableArea = ({ groups, names, hittable, onHit }: Props) => {
  if (groups.length === 0) return <p className="table__empty">{COPY.emptyTable}</p>;
  return (
    <ul className="table">
      {groups.map((g) => {
        const canHit = hittable.has(g.id);
        return (
          <li key={g.id}>
            <button
              type="button"
              className={`group ${canHit ? 'group--hittable' : ''}`}
              disabled={!canHit}
              onClick={() => onHit(g.id)}
            >
              <span className="group__label">
                {names[g.ownerId] ?? g.ownerId} · {groupLabel(g.group)}
              </span>
              <span className="group__cards">
                {g.group.cards.map((c) => (
                  <Card key={c.id} card={c} size="sm" />
                ))}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
};
