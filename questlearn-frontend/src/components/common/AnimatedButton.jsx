import { motion } from 'framer-motion';

const CLASSES = {
  primary: 'btn-primary',
  arcane: 'btn-arcane',
  ghost: 'btn-ghost',
  danger: 'btn-danger',
};

export default function AnimatedButton({
  variant = 'primary',
  className = '',
  children,
  ...props
}) {
  return (
    <motion.button
      whileHover={{ y: -1 }}
      whileTap={{ scale: 0.97 }}
      transition={{ type: 'spring', stiffness: 400, damping: 24 }}
      className={`${CLASSES[variant] ?? CLASSES.primary} ${className}`}
      {...props}
    >
      {children}
    </motion.button>
  );
}
