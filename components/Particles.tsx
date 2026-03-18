import React from 'react';

interface ParticlesProps {
  type: 'gold' | 'platinum' | 'celebration';
}

export const Particles: React.FC<ParticlesProps> = ({ type }) => {
  // Platinum gets more particles
  const count = type === 'platinum' ? 60 : 40;
  const items = Array.from({ length: count });
  
  const getEmojis = () => {
    switch(type) {
      case 'gold': return ['🌟', '🪙', '✨', '🏆', '💫', '🤩'];
      case 'platinum': return ['💎', '💠', '💍', '👑', '✨', '🌪️', '🦄'];
      case 'celebration': return ['🎈', '🎉', '🎊', '🎆', '🍦', '🥳'];
      default: return ['✨'];
    }
  };

  const emojis = getEmojis();

  return (
    <>
      <style>
        {`
          @keyframes particleFall {
            0% { 
              transform: translateY(-10vh) rotate(0deg) translateX(0px); 
              opacity: 0; 
            }
            10% {
              opacity: 1;
            }
            100% { 
              transform: translateY(110vh) rotate(720deg) translateX(20px); 
              opacity: 0; 
            }
          }
          .particle-item {
            position: fixed;
            top: 0;
            user-select: none;
            pointer-events: none;
            animation-name: particleFall;
            animation-timing-function: linear;
            animation-iteration-count: infinite;
            z-index: 0; 
          }
        `}
      </style>
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        {items.map((_, i) => {
          const left = Math.random() * 100;
          // Randomize delay so they don't all start at once, but some start immediately
          const delay = Math.random() * 5; 
          const duration = 4 + Math.random() * 6; // 4s to 10s fall time
          const size = 1 + Math.random() * 2; // 1rem to 3rem
          const char = emojis[Math.floor(Math.random() * emojis.length)];

          return (
            <div 
              key={i}
              className="particle-item"
              style={{
                left: `${left}%`,
                fontSize: `${size}rem`,
                animationDelay: `${delay}s`,
                animationDuration: `${duration}s`
              }}
            >
              {char}
            </div>
          );
        })}
      </div>
    </>
  );
};