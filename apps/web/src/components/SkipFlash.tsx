import { motion } from 'framer-motion';

interface Props {
  readonly message: string;
}

/** A big animated "no entry" sign when someone loses their turn. */
export const SkipFlash = ({ message }: Props) => (
  <motion.div
    className="skipflash"
    role="status"
    initial={{ opacity: 0 }}
    animate={{ opacity: [0, 1, 1, 0] }}
    transition={{ duration: 1.9, times: [0, 0.12, 0.8, 1] }}
  >
    <motion.svg
      className="skipflash__sign"
      viewBox="0 0 100 100"
      aria-hidden="true"
      initial={{ scale: 0.2, rotate: -120 }}
      animate={{ scale: [0.2, 1.15, 1], rotate: [-120, 0, 0] }}
      transition={{ duration: 0.6, ease: 'easeOut' }}
    >
      <circle cx="50" cy="50" r="40" fill="none" stroke="currentColor" strokeWidth="10" />
      <motion.line
        x1="22"
        y1="78"
        x2="78"
        y2="22"
        stroke="currentColor"
        strokeWidth="10"
        strokeLinecap="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ delay: 0.35, duration: 0.3 }}
      />
    </motion.svg>
    <motion.p
      className="skipflash__text"
      initial={{ y: 20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ delay: 0.3 }}
    >
      {message}
    </motion.p>
  </motion.div>
);
