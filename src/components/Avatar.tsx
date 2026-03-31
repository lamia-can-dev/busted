import { getUserColor } from '../lib/userColor'

interface Props {
  src?: string | null
  name: string
  userId: string
  size?: number
}

export default function Avatar({ src, name, userId, size = 28 }: Props) {
  const style: React.CSSProperties = {
    width: size,
    height: size,
    borderRadius: '50%',
    objectFit: 'cover',
    flexShrink: 0,
  }

  if (src) {
    return <img src={src} style={style} alt="" />
  }

  return (
    <div
      style={{
        ...style,
        background: getUserColor(userId),
        color: '#fff',
        fontSize: size * 0.4,
        fontWeight: 700,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {name[0]?.toUpperCase() ?? '?'}
    </div>
  )
}
