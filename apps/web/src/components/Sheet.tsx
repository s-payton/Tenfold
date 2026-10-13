import { motion } from 'framer-motion';
import { COPY } from '../copy.ts';

export interface SheetOption {
  readonly label: string;
  readonly onPick: () => void;
}

interface Props {
  readonly title: string;
  readonly options: readonly SheetOption[];
  readonly onClose: () => void;
}

/** A bottom sheet with a short list of choices. */
export const Sheet = ({ title, options, onClose }: Props) => (
  <div className="overlay" role="dialog" aria-modal="true" aria-label={title}>
    <motion.div
      className="sheet"
      initial={{ y: 200, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 380, damping: 34 }}
    >
      <h2 className="sheet__title">{title}</h2>
      {options.map((o) => (
        <button key={o.label} type="button" className="btn btn--primary" onClick={o.onPick}>
          {o.label}
        </button>
      ))}
      <button type="button" className="btn btn--ghost" onClick={onClose}>
        {COPY.cancel}
      </button>
    </motion.div>
  </div>
);
