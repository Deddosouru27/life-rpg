import { useEffect, useState } from 'react'

interface Props {
  level: number
  onClose: () => void
}

export default function LevelUpScreen({ level, onClose }: Props) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    setTimeout(() => setVisible(true), 50)
    const timer = setTimeout(() => handleClose(), 4000)
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
      {/* Частицы */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {Array.from({ length: 20 }).map((_, i) => (
          <div
            key={i}
            className="absolute w-1 h-1 bg-yellow-400 rounded-full"
            style={{
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              opacity: visible ? Math.random() : 0,
              transform: visible ? `scale(${Math.random() * 3 + 1})` : 'scale(0)',
              transition: `all ${Math.random() * 2 + 1}s ease`,
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