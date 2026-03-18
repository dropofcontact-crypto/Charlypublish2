import React from 'react';
import { MascotScene } from '../services/veoService';
import { Difficulty } from '../types';
import { CharlySVG } from './CharlySVG';

interface CharlyMascotProps {
  scene?: MascotScene;
  theme?: 'day' | 'night';
  difficulty?: Difficulty;
  className?: string;
  onClick?: () => void;
}

export const CharlyMascot: React.FC<CharlyMascotProps> = ({ scene = 'main', theme = 'day', difficulty = 'Normal', className, onClick }) => {
  const containerClass = className || "w-32 h-32 md:w-40 md:h-40";
  const bgClass = theme === 'night' 
    ? 'bg-gradient-to-br from-[#1a0b2e] to-[#2d1b4e] border-indigo-900 shadow-indigo-900/50' 
    : 'bg-safari-100 border-safari-400 shadow-safari-400/30';

  return (
    <div 
        className={`relative flex-shrink-0 ${containerClass} ${onClick ? 'cursor-pointer' : ''} transition-all duration-500`} 
        onClick={onClick}
    >
      <div className={`absolute inset-0 rounded-[2rem] ${bgClass} border-4 opacity-80 z-0`}></div>
      
      <CharlySVG 
        difficulty={difficulty} 
        theme={theme} 
        scene={scene}
        className={`relative z-10 w-full h-full object-contain filter drop-shadow-xl hover:scale-105 transition-all duration-500 ${theme === 'night' ? 'brightness-110' : ''}`}
      />
      
      {/* Difficulty Badge Overlay */}
      <div className="absolute -bottom-2 -right-2 z-30 bg-white dark:bg-gray-800 rounded-full p-1 shadow-lg border-2 border-theme scale-75 md:scale-100">
          <span className="text-lg">
              {difficulty === 'Easy' ? '🥉' : 
               difficulty === 'Normal' ? '🥈' : 
               difficulty === 'Hard' ? '🥇' : 
               difficulty === 'Ultra' ? '💎' : 
               difficulty === 'Secret' ? '🔮' : '🌌'}
          </span>
      </div>
    </div>
  );
};
