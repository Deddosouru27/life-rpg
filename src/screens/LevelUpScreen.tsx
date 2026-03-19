import { useEffect, useState, useMemo } from 'react'

interface Props {
  level: number
  onClose: () => void
}

interface Particle {
  x: number
  y: number
  size: number
  duration: number
  delay: number
  color: string
}

const COLORS = ['#facc15', '#fb923c', '#fde68a', '#ffffff', '#fef08a', '#f59e0b']

export default function LevelUpScreen({ level, onClose }: Props) {
  const [visible, setVisible] = useState(false)

  const particles = useMemo<Particle[]>(() =>
    Array.from({ length: 35 }, () => ({
      x: Math.random() * 100,
      y: 30 + Math.random() * 60,
      size: Math.random() * 5 + 2,
      duration: Math.random() * 3 + 2.5,
      delay: Math.random() * 5,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
    }))
  , [])

  useEffect(() => {
    setTimeout(() => setVisible(true), 50)
    const timer = setTimeout(() => handleClose(), 7000)
    return () => clearTimeout(timer)
  }, [])

  const handleClose = () => {
    setVisible(false)
    setTimeout(onClose, 500)
  }

  return (
    <div
      onClick={handleClose}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center cursor-pointer"
      style={{
        background: 'radial-gradient(ellipse at center, #1a1000 0%, #0a0a0f 70%)',
        opacity: visible ? 1 : 0,
        transition: 'opacity 0.5s ease',
      }}
    >
      <style>{`
        @keyframes float-particle {
          0%   { transform: translateY(0px) scale(1); opacity: 1; }
          70%  { opacity: 0.6; }
          100% { transform: translateY(-180px) scale(0.2); opacity: 0; }
        }
      `}</style>

      {/* Частицы */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {particles.map((p, i) => (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: `${p.x}%`,
              top: `${p.y}%`,
              width: `${p.size}px`,
              height: `${p.size}px`,
              borderRadius: '50%',
              backgroundColor: p.color,
              animation: `float-particle ${p.duration}s ease-in-out ${p.delay}s infinite`,
            }}
          />
        ))}
      </div>

      {/* Контент */}
      <div
        className="text-center space-y-6 px-8"
        style={{
          transform: visible ? 'translateY(0) scale(1)' : 'translateY(40px) scale(0.8)',
          transition: 'transform 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)',
        }}
      >
        <div className="text-8xl">⚔️</div>

        <div className="space-y-2">
          <p className="text-yellow-400 text-lg font-medium tracking-widest uppercase">
            Уровень получен
          </p>
          <p
            className="font-bold text-white"
            style={{ fontSize: '6rem', lineHeight: 1, textShadow: '0 0 60px #facc15' }}
          >
            {level}
          </p>
        </div>

        <div className="space-y-1">
          <p className="text-yellow-300 text-xl font-semibold">Ты становишься сильнее</p>
          <p className="text-gray-500 text-sm">Нажми чтобы продолжить</p>
        </div>
      </div>

      {/* Свечение */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse at center, rgba(250,204,21,0.08) 0%, transparent 60%)',
          opacity: visible ? 1 : 0,
          transition: 'opacity 1s ease',
        }}
      />
    </div>
  )
}
