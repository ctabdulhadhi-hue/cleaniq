import { motion } from 'framer-motion';

export function OrangeWipeOverlay() {
  return (
    <motion.div
      key="mode-switch-orange-wipe"
      id="mode-switch-orange-wipe"
      aria-hidden="true"
      className="fixed inset-0 z-[9998] pointer-events-none will-change-transform"
      style={{
        background:
          'linear-gradient(90deg, rgba(255, 106, 61, 0.08) 0%, rgba(255, 106, 61, 0.3) 50%, rgba(255, 106, 61, 0.08) 100%)',
      }}
      initial={{ x: '-100%', opacity: 0.3 }}
      animate={{ x: '100%', opacity: [0.3, 0.45, 0.2] }}
      transition={{
        duration: 0.22,
        ease: [0.2, 0.8, 0.2, 1],
      }}
    />
  );
}

export default OrangeWipeOverlay;
