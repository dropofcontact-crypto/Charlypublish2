import React from 'react';
import { Difficulty } from '../types';
import { MascotScene } from '../services/veoService';

interface CharlySVGProps {
  difficulty: Difficulty;
  theme: 'day' | 'night';
  scene?: MascotScene;
  className?: string;
}

export const CharlySVG: React.FC<CharlySVGProps> = ({ difficulty, theme, scene = 'main', className }) => {
  const isNight = theme === 'night';
  
  // Core Colors
  const bodyColor = isNight ? '#22c55e' : '#4ade80'; // Vibrant Green
  const finColor = isNight ? '#ea580c' : '#f97316'; // Orange
  const bellyColor = isNight ? '#86efac' : '#bbf7d0'; // Light Green
  const outlineColor = '#0f172a'; // Thick dark outline
  
  // Difficulty specific overrides
  const isVoid = difficulty === 'Void';
  const isSecret = difficulty === 'Secret';
  const isUltra = difficulty === 'Ultra';
  const isHard = difficulty === 'Hard';

  const actualBodyColor = isVoid ? '#475569' : (isSecret ? '#312e81' : bodyColor);
  const actualFinColor = isVoid ? '#94a3b8' : (isSecret ? '#a855f7' : finColor);
  const actualBellyColor = isVoid ? '#94a3b8' : (isSecret ? '#4f46e5' : bellyColor);

  // Scene logic
  const isFail = scene === 'fail';
  const isSuccess = scene === 'success' || scene === 'platinum' || scene === 'ultra-victory';
  const isLibrary = scene === 'library';
  const isTuxedo = scene === 'tuxedo' || scene === 'secret-victory';
  const isWarp = scene === 'void-warp';
  const isMini = scene === 'mini';
  const isSettings = scene === 'settings';
  const isIdea = scene === 'idea';
  const isQuiz = scene === 'quiz';
  const isLoading = scene === 'loading';

  // Y-offset for floating animation in void-warp
  const yOffset = isWarp ? 10 : 0;

  // Mouth path
  let mouthPath = "M 100 80 Q 135 95 160 75"; // Default smile
  let mouthFill = "none";
  if (isFail) {
    mouthPath = "M 100 85 Q 135 70 160 85"; // Sad
  } else if (isSuccess || isTuxedo || isIdea) {
    mouthPath = "M 100 80 Q 130 110 160 80 Z"; // Cheering open mouth
    mouthFill = "#991b1b"; // Dark red interior
  } else if (isQuiz) {
    mouthPath = "M 110 85 Q 135 90 150 80"; // Smirk/Thinking
  } else if (isLoading) {
    mouthPath = "M 110 80 Q 130 100 150 80 Z"; // Panting/Running
    mouthFill = "#991b1b";
  }

  return (
    <svg viewBox={isMini ? "40 20 120 100" : "0 0 200 200"} className={className} xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="ultraAura" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#fef08a" stopOpacity="0.6" />
          <stop offset="100%" stopColor="#fbbf24" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="voidAura" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#c084fc" stopOpacity="0.5" />
          <stop offset="100%" stopColor="#581c87" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Background Auras */}
      {isUltra && <circle cx="100" cy="100" r="90" fill="url(#ultraAura)" />}
      {isVoid && <circle cx="100" cy="100" r="90" fill="url(#voidAura)" />}

      {/* Void Warp Effects */}
      {isWarp && (
        <g opacity="0.6">
          <circle cx="100" cy="100" r="80" fill="none" stroke="#a855f7" strokeWidth="4" strokeDasharray="10 10" />
          <circle cx="100" cy="100" r="60" fill="none" stroke="#c084fc" strokeWidth="4" strokeDasharray="15 15" />
          <circle cx="100" cy="100" r="40" fill="none" stroke="#e879f9" strokeWidth="2" strokeDasharray="5 5" />
        </g>
      )}

      {/* Loading Scene Effects (Hamster Wheel) */}
      {isLoading && (
        <g stroke={outlineColor} strokeWidth="4" fill="none" opacity="0.3">
          <circle cx="100" cy="130" r="60" />
          <circle cx="100" cy="130" r="50" />
          <line x1="40" y1="130" x2="160" y2="130" />
          <line x1="100" y1="70" x2="100" y2="190" />
          <line x1="57" y1="87" x2="143" y2="173" />
          <line x1="57" y1="173" x2="143" y2="87" />
        </g>
      )}

      <g stroke={outlineColor} strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" transform={`translate(0, ${yOffset})`}>
        
        {/* --- CAPE (Ultra/Secret) --- */}
        {isUltra && (
          <path d="M 60 90 L 30 180 Q 100 190 170 180 L 140 90 Z" fill="#dc2626" />
        )}
        {isSecret && (
          <path d="M 50 80 L 20 190 Q 100 200 180 190 L 150 80 Z" fill="#1e1b4b" />
        )}

        {/* --- TAIL --- */}
        <path d="M 70 150 Q 20 180 30 120 Q 50 130 70 120" fill={actualBodyColor} />
        {/* Tail Fins (Orange) - Removed bottom two per user request */}

        {/* --- BODY --- */}
        <rect x="60" y="90" width="80" height="80" rx="35" fill={actualBodyColor} />
        {/* Belly */}
        <rect x="75" y="100" width="50" height="65" rx="20" fill={actualBellyColor} />

        {/* Back Fins (Orange) */}
        <polygon points="60,100 35,90 60,115" fill={actualFinColor} />
        <polygon points="60,120 35,110 60,135" fill={actualFinColor} />

        {/* --- LEGS & FEET --- */}
        {isLoading ? (
          <g>
            {/* Running Legs */}
            <path d="M 80 165 L 70 185" fill="none" />
            <path d="M 120 165 L 130 175" fill="none" />
            <path d="M 70 185 L 55 190 M 70 185 L 65 195 M 70 185 L 75 195 M 70 185 L 85 190" fill="none" strokeWidth="4" />
            <path d="M 130 175 L 115 180 M 130 175 L 125 185 M 130 175 L 135 185 M 130 175 L 145 180" fill="none" strokeWidth="4" />
          </g>
        ) : (
          <g>
            <path d="M 80 165 L 80 185" fill="none" />
            <path d="M 120 165 L 120 185" fill="none" />
            {/* Left Foot (4 Claws) */}
            <path d="M 80 185 L 65 190 M 80 185 L 75 195 M 80 185 L 85 195 M 80 185 L 95 190" fill="none" strokeWidth="4" />
            {/* Right Foot (4 Claws) */}
            <path d="M 120 185 L 105 190 M 120 185 L 115 195 M 120 185 L 125 195 M 120 185 L 140 190" fill="none" strokeWidth="4" />
          </g>
        )}

        {/* --- TUXEDO / CLOAK (If applicable) --- */}
        {isTuxedo ? (
          <g>
            {/* Jacket */}
            <path d="M 60 100 L 140 100 L 140 160 L 60 160 Z" fill="#1e293b" />
            {/* White Shirt */}
            <polygon points="75,100 125,100 100,140" fill="white" />
            {/* Bowtie */}
            <polygon points="100,110 85,100 85,120" fill="#ef4444" />
            <polygon points="100,110 115,100 115,120" fill="#ef4444" />
            <circle cx="100" cy="110" r="3" fill="#ef4444" />
          </g>
        ) : isSecret && (
          <g>
            {/* Cloak Overlap */}
            <path d="M 55 95 L 145 95 L 135 165 L 65 165 Z" fill="#312e81" opacity="0.9" />
            {/* Glowing Runes on Cloak */}
            <path d="M 80 120 L 90 110 L 90 130 Z" fill="#a855f7" stroke="none" />
            <path d="M 110 140 L 120 130 L 120 150 Z" fill="#a855f7" stroke="none" />
          </g>
        )}

        {/* --- HEAD --- */}
        {/* Main Head Shape */}
        <rect x="50" y="30" width="90" height="70" rx="30" fill={actualBodyColor} />
        {/* Snout */}
        <rect x="90" y="50" width="80" height="45" rx="20" fill={actualBodyColor} />
        
        {/* Mouth */}
        <path d={mouthPath} fill={mouthFill} strokeWidth="5" />
        {isSuccess || isTuxedo || isIdea || isLoading ? (
          <path d="M 115 95 Q 130 110 145 95" fill="#fca5a5" stroke="none" /> // Tongue
        ) : null}

        {/* Nostril */}
        <circle cx="155" cy="60" r="2" fill={outlineColor} stroke="none" />

        {/* --- GLASSES (Square, Orange Rims) --- */}
        <rect x="65" y="35" width="35" height="35" rx="6" fill="white" stroke={actualFinColor} strokeWidth="6" />
        <rect x="110" y="35" width="35" height="35" rx="6" fill="white" stroke={actualFinColor} strokeWidth="6" />
        {/* Glasses Bridge */}
        <line x1="100" y1="52" x2="110" y2="52" stroke={actualFinColor} strokeWidth="6" />
        {/* Glasses Arm */}
        <line x1="50" y1="52" x2="65" y2="52" stroke={actualFinColor} strokeWidth="6" />

        {/* --- EYES --- */}
        {isFail ? (
          <g>
            <path d="M 75 52 Q 85 45 95 52" fill="none" strokeWidth="4" />
            <path d="M 120 52 Q 130 45 140 52" fill="none" strokeWidth="4" />
            {/* Tear */}
            <path d="M 85 65 Q 85 75 90 75 Q 95 75 95 65 Q 90 55 85 65" fill="#60a5fa" stroke="none" />
          </g>
        ) : isQuiz ? (
          <g>
            {/* Squinting/Thinking Eyes */}
            <line x1="75" y1="52" x2="95" y2="52" strokeWidth="5" />
            <circle cx="130" cy="52" r="5" fill={outlineColor} stroke="none" />
          </g>
        ) : (
          <g>
            <circle cx="85" cy="52" r="5" fill={outlineColor} stroke="none" />
            <circle cx="130" cy="52" r="5" fill={outlineColor} stroke="none" />
          </g>
        )}

        {/* Eyebrows for Hard/Ultra (Determined) */}
        {(isHard || isUltra) && !isFail && (
          <g>
            <line x1="75" y1="40" x2="95" y2="45" strokeWidth="4" />
            <line x1="140" y1="40" x2="120" y2="45" strokeWidth="4" />
          </g>
        )}

        {/* --- HEADGEAR / ACCESSORIES (Based on Difficulty & Scene) --- */}
        {isSettings ? (
          <g>
            {/* Hard Hat */}
            <path d="M 45 35 Q 95 0 145 35 Z" fill="#eab308" />
            <rect x="40" y="35" width="110" height="8" rx="4" fill="#ca8a04" />
          </g>
        ) : isQuiz ? (
          <g>
            {/* Graduation Cap */}
            <polygon points="95,5 45,20 95,35 145,20" fill="#1e293b" />
            <rect x="70" y="25" width="50" height="15" fill="#1e293b" />
            <line x1="95" y1="20" x2="155" y2="35" stroke="#fbbf24" strokeWidth="3" />
            <circle cx="155" cy="35" r="3" fill="#fbbf24" />
          </g>
        ) : isHard ? (
          <g>
            {/* Red Headband */}
            <path d="M 45 40 Q 95 30 145 40 L 145 50 Q 95 40 45 50 Z" fill="#ef4444" />
            {/* Spiked Bracelets */}
            <line x1="65" y1="125" x2="85" y2="125" stroke="#475569" strokeWidth="4" />
            <line x1="115" y1="125" x2="135" y2="125" stroke="#475569" strokeWidth="4" />
          </g>
        ) : isUltra ? (
          <g>
            {/* Big Gold Crown */}
            <path d="M 45 30 L 35 -5 L 75 15 L 95 -15 L 115 15 L 155 -5 L 145 30 Z" fill="#fbbf24" strokeLinejoin="miter" />
            <circle cx="35" cy="-5" r="4" fill="#ef4444" />
            <circle cx="95" cy="-15" r="4" fill="#3b82f6" />
            <circle cx="155" cy="-5" r="4" fill="#ef4444" />
          </g>
        ) : isSecret && !isTuxedo ? (
          <g>
            {/* Hood */}
            <path d="M 40 30 Q 95 -10 150 30 L 160 100 L 30 100 Z" fill="#312e81" opacity="0.8" />
          </g>
        ) : isVoid ? (
          <g stroke="#a855f7" strokeWidth="3" fill="none">
            {/* Glitchy Geometry */}
            <polygon points="30,30 40,20 50,40" />
            <rect x="160" y="70" width="10" height="10" />
            <circle cx="40" cy="150" r="4" />
            <line x1="80" y1="20" x2="110" y2="10" />
          </g>
        ) : null}

        {/* --- IDEA SCENE (Lightbulb) --- */}
        {isIdea && (
          <g transform="translate(95, -20)">
            <path d="M -10 10 Q -15 0 0 -10 Q 15 0 10 10 L 5 15 L -5 15 Z" fill="#fef08a" />
            <line x1="-5" y1="18" x2="5" y2="18" strokeWidth="3" />
            <line x1="-3" y1="22" x2="3" y2="22" strokeWidth="3" />
            {/* Glow rays */}
            <line x1="0" y1="-15" x2="0" y2="-25" stroke="#facc15" strokeWidth="3" />
            <line x1="-15" y1="-5" x2="-22" y2="-10" stroke="#facc15" strokeWidth="3" />
            <line x1="15" y1="-5" x2="22" y2="-10" stroke="#facc15" strokeWidth="3" />
          </g>
        )}

        {/* --- ARMS & PROPS --- */}
        {isFail ? (
          <g>
            {/* Drooping Arms */}
            <path d="M 70 110 Q 50 150 50 170" fill="none" />
            <path d="M 50 170 L 40 175 M 50 170 L 45 180 M 50 170 L 55 180 M 50 170 L 60 175" fill="none" strokeWidth="3" />
            
            <path d="M 130 110 Q 150 150 150 170" fill="none" />
            <path d="M 150 170 L 140 175 M 150 170 L 145 180 M 150 170 L 155 180 M 150 170 L 160 175" fill="none" strokeWidth="3" />
          </g>
        ) : isSuccess || isWarp ? (
          <g>
            {/* Arms Up */}
            <path d="M 70 110 Q 40 80 30 50" fill="none" />
            <path d="M 30 50 L 20 45 M 30 50 L 25 35 M 30 50 L 35 35 M 30 50 L 40 45" fill="none" strokeWidth="3" />
            
            <path d="M 130 110 Q 160 80 170 50" fill="none" />
            <path d="M 170 50 L 160 45 M 170 50 L 165 35 M 170 50 L 175 35 M 170 50 L 180 45" fill="none" strokeWidth="3" />
            
            {/* Trophy for Platinum/Ultra-Victory */}
            {(scene === 'platinum' || scene === 'ultra-victory') && (
              <g transform="translate(140, 10)">
                <path d="M 10 10 L 40 10 L 35 30 Q 25 40 15 30 Z" fill="#fbbf24" />
                <rect x="20" y="30" width="10" height="15" fill="#fbbf24" />
                <rect x="15" y="45" width="20" height="5" fill="#fbbf24" />
                {/* Star on trophy */}
                <path d="M 25 15 L 27 20 L 32 20 L 28 23 L 29 28 L 25 25 L 21 28 L 22 23 L 18 20 L 23 20 Z" fill="white" stroke="none" />
              </g>
            )}
          </g>
        ) : isLibrary ? (
          <g>
            {/* Stack of Books */}
            <rect x="70" y="140" width="60" height="15" rx="2" fill="#ef4444" />
            <rect x="75" y="125" width="50" height="15" rx="2" fill="#3b82f6" />
            <rect x="80" y="110" width="40" height="15" rx="2" fill="#10b981" />
            <rect x="85" y="95" width="30" height="15" rx="2" fill="#f59e0b" />
            
            {/* Arms holding stack */}
            <path d="M 70 110 Q 50 140 70 150" fill="none" />
            <path d="M 130 110 Q 150 140 130 150" fill="none" />
          </g>
        ) : isTuxedo ? (
          <g>
            {/* Left Arm holding cane/staff */}
            <path d="M 70 110 Q 50 130 75 135" fill="none" />
            <line x1="75" y1="100" x2="75" y2="180" strokeWidth="6" stroke={isSecret ? "#a855f7" : "#1e293b"} />
            {isSecret ? (
              <polygon points="75,85 85,100 65,100" fill="#c084fc" /> // Magic Staff Top
            ) : (
              <circle cx="75" cy="100" r="6" fill="#fbbf24" /> // Gold Cane Top
            )}
            
            {/* Right Arm behind back */}
            <path d="M 130 110 Q 150 130 140 150" fill="none" />
          </g>
        ) : isSettings ? (
          <g>
            {/* Wrench */}
            <g transform="translate(100, 130) rotate(45)">
              <rect x="-5" y="-20" width="10" height="40" fill="#94a3b8" />
              <path d="M -15 -20 Q 0 -30 15 -20 L 10 -10 Q 0 -15 -10 -10 Z" fill="#64748b" />
              <path d="M -15 20 Q 0 30 15 20 L 10 10 Q 0 15 -10 10 Z" fill="#64748b" />
            </g>
            
            {/* Arms holding wrench */}
            <path d="M 70 110 Q 50 130 85 135" fill="none" />
            <path d="M 130 110 Q 150 130 115 135" fill="none" />
          </g>
        ) : isIdea ? (
          <g>
            {/* Notepad */}
            <rect x="110" y="110" width="40" height="50" rx="4" fill="#fef08a" />
            <line x1="115" y1="120" x2="145" y2="120" strokeWidth="3" stroke="#ca8a04" />
            <line x1="115" y1="130" x2="145" y2="130" strokeWidth="3" stroke="#ca8a04" />
            <line x1="115" y1="140" x2="135" y2="140" strokeWidth="3" stroke="#ca8a04" />
            
            {/* Pencil */}
            <g transform="translate(75, 130) rotate(-45)">
              <rect x="-5" y="-15" width="10" height="30" fill="#f59e0b" />
              <polygon points="-5,-15 5,-15 0,-25" fill="#fca5a5" />
              <polygon points="-5,15 5,15 0,25" fill="#1e293b" />
            </g>

            {/* Arms */}
            <path d="M 70 110 Q 50 130 75 135" fill="none" />
            <path d="M 130 110 Q 150 130 125 135" fill="none" />
          </g>
        ) : isQuiz ? (
          <g>
            {/* Magnifying Glass */}
            <circle cx="75" cy="125" r="15" fill="#bae6fd" stroke="#0f172a" strokeWidth="6" />
            <line x1="65" y1="135" x2="50" y2="150" stroke="#0f172a" strokeWidth="8" strokeLinecap="round" />
            
            {/* Arms */}
            <path d="M 70 110 Q 50 120 60 140" fill="none" />
            <path d="M 130 110 Q 150 130 140 150" fill="none" /> {/* Right arm thinking on chin */}
          </g>
        ) : isLoading ? (
          <g>
            {/* Running Arms */}
            <path d="M 70 110 Q 50 130 80 140" fill="none" />
            <path d="M 130 110 Q 150 90 120 80" fill="none" />
          </g>
        ) : (
          <g>
            {/* Default: Reading Book */}
            <rect x="75" y="120" width="50" height="35" rx="4" fill={isVoid ? '#1e293b' : '#3b82f6'} />
            <line x1="100" y1="120" x2="100" y2="155" strokeWidth="4" />
            <line x1="82" y1="130" x2="95" y2="130" strokeWidth="3" stroke="white" />
            <line x1="82" y1="140" x2="95" y2="140" strokeWidth="3" stroke="white" />
            <line x1="105" y1="130" x2="118" y2="130" strokeWidth="3" stroke="white" />
            <line x1="105" y1="140" x2="118" y2="140" strokeWidth="3" stroke="white" />

            {/* Left Arm */}
            <path d="M 70 110 Q 50 130 75 135" fill="none" />
            <path d="M 75 135 L 70 130 M 75 135 L 75 125 M 75 135 L 82 128 M 75 135 L 85 135" fill="none" strokeWidth="3" />

            {/* Right Arm */}
            <path d="M 130 110 Q 150 130 125 135" fill="none" />
            <path d="M 125 135 L 130 130 M 125 135 L 125 125 M 125 135 L 118 128 M 125 135 L 115 135" fill="none" strokeWidth="3" />
          </g>
        )}

      </g>
    </svg>
  );
};
