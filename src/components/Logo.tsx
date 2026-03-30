interface LogoProps {
  variant?: 'icon' | 'full'
}

export default function Logo({ variant = 'full' }: LogoProps) {
  const icon = (
    <div style={{
      width: variant === 'icon' ? 110 : 44,
      height: variant === 'icon' ? 110 : 44,
      borderRadius: variant === 'icon' ? 26 : 12,
      background: 'linear-gradient(135deg, #A5B4FC 0%, #4361EE 100%)',
      boxShadow: variant === 'icon'
        ? '0 8px 24px rgba(67,56,202,0.45), inset 0 1px 0 rgba(255,255,255,0.4)'
        : '0 4px 12px rgba(67,56,202,0.35), inset 0 1px 0 rgba(255,255,255,0.3)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    }}>
      <span style={{
        fontFamily: "'Unbounded', sans-serif",
        fontWeight: 900,
        fontSize: variant === 'icon' ? 74 : 28,
        color: '#ffffff',
        lineHeight: 1,
        userSelect: 'none',
      }}>
        B
      </span>
    </div>
  )

  if (variant === 'icon') return icon

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
      {icon}
      <span style={{
        fontFamily: "'Unbounded', sans-serif",
        fontWeight: 900,
        fontSize: 22,
        color: 'var(--color-text-primary)',
        letterSpacing: '-1px',
        userSelect: 'none',
      }}>
        Busted
      </span>
    </div>
  )
}
