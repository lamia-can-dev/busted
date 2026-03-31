import { motion } from 'framer-motion'

interface Props {
  onClose: () => void
  children: React.ReactNode
  borderTop?: string
  background?: string
}

export default function BottomSheet({ onClose, children, borderTop, background }: Props) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      style={styles.backdrop}
    >
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 28, stiffness: 300 }}
        onClick={(e) => e.stopPropagation()}
        style={{
          ...styles.sheet,
          ...(background ? { background } : {}),
          ...(borderTop ? { borderTop } : {}),
        }}
      >
        <div style={styles.handle} />
        {children}
      </motion.div>
    </motion.div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  backdrop: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.6)',
    zIndex: 200,
    display: 'flex',
    alignItems: 'flex-end',
  },
  sheet: {
    background: 'var(--color-surface)',
    borderRadius: '20px 20px 0 0',
    padding: '0.75rem 1.5rem calc(2.5rem + env(safe-area-inset-bottom, 0px))',
    width: '100%',
    maxWidth: '560px',
    margin: '0 auto',
    boxShadow: '0 -4px 40px rgba(0,0,0,0.4)',
  },
  handle: {
    width: '32px',
    height: '3px',
    background: 'var(--color-border)',
    borderRadius: '2px',
    margin: '0 auto 1.25rem',
  },
}
