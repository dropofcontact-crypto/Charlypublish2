import React, { useState, useEffect, useRef } from 'react';
import { QuizQuestion, UserProgress, Difficulty } from '../types';
import { CharlyMascot } from './CharlyMascot';
import { vibrate, playSound, interact } from '../utils/haptics';
import { Particles } from './Particles';
import { generateResultCommentary } from '../services/veoService';

interface QuizProps {
  questions: QuizQuestion[];
  commentaries?: { failed: string; passed: string; perfect: string };
  onComplete: (passed: boolean, score: number) => void;
  onNextStorySetup: () => void;
  onRetry: () => void;
  onExit: (to: any) => void;
  progress: UserProgress; // Needed for stats
  isFinalStory?: boolean;
  level: number;
  storyNum: number;
  styles?: any;
}

const getTimerDuration = (difficulty: Difficulty, level: number): number => {
    // Scaling logic per question
    const l = Math.min(9, Math.max(1, level));
    
    if (difficulty === 'Void') return 3;

    switch (difficulty) {
        case 'Easy':
            return Math.floor(120 - ((l - 1) * (60 / 8)));
        case 'Normal':
            return Math.floor(60 - ((l - 1) * (30 / 8)));
        case 'Hard':
            return Math.floor(40 - ((l - 1) * (25 / 8)));
        case 'Ultra':
            return Math.floor(25 - ((l - 1) * (15 / 8)));
        case 'Secret':
            // 15s at level 1, 5s at level 9
            return Math.floor(15 - ((l - 1) * (10 / 8)));
        default:
            return 60;
    }
};

export const Quiz: React.FC<QuizProps> = ({ questions, commentaries, onComplete, onNextStorySetup, onRetry, onExit, progress, isFinalStory, level, storyNum, styles }) => {
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [showResult, setShowResult] = useState(false);
  const [timeLeft, setTimeLeft] = useState(getTimerDuration(progress.settings.difficulty, level));
  const [isActive, setIsActive] = useState(true);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
  const [commentary, setCommentary] = useState<string>("Calculating chomp-tastic results...");
  const [questionResults, setQuestionResults] = useState<boolean[]>([]);
  const [showStats, setShowStats] = useState(false);
  const initialBestScore = useRef<number>(progress.storyHistory[`${level}-${storyNum}`]?.score || 0);
  
  useEffect(() => {
    window.scrollTo(0, 0);
    initialBestScore.current = progress.storyHistory[`${level}-${storyNum}`]?.score || 0;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [level, storyNum]);

  // Audio context ref for timer ticking if needed
  const timerRef = useRef<number | null>(null);

  const currentQ = questions[currentQuestionIndex] || { question: "Loading...", options: [], correctIndex: 0 };
  const difficulty = progress.settings.difficulty;
  const forceDarkBg = ['Ultra', 'Secret', 'Void'].includes(difficulty);
  const isNight = progress.settings.theme === 'night' || forceDarkBg;
  const isHardOrHigher = ['Hard', 'Ultra', 'Secret', 'Void'].includes(difficulty);
  const bgImageTheme = isNight ? 'night' : 'day';

  useEffect(() => {
    // Reset timer for each question
    setTimeLeft(getTimerDuration(difficulty, level));
    setIsActive(true);
  }, [currentQuestionIndex, difficulty, level]);

  useEffect(() => {
    if (isActive && timeLeft > 0 && !showResult) {
      timerRef.current = window.setTimeout(() => {
        setTimeLeft(prev => prev - 1);
        if (timeLeft <= 5) playSound('click'); // Ticking sound
      }, 1000);
      return () => {
        if (timerRef.current) clearTimeout(timerRef.current);
      };
    } else if (timeLeft === 0 && isActive && !showResult) {
       // Time run out treated as wrong answer
       handleAnswer(-1); 
    }
  }, [timeLeft, isActive, showResult]);

  useEffect(() => {
      if (showResult) {
          const fetchCommentary = async () => {
              const total = questions.length;
              if (commentaries) {
                  const percentage = (score / total) * 100;
                  if (percentage === 100) setCommentary(commentaries.perfect);
                  else if (percentage >= 80) setCommentary(commentaries.passed);
                  else setCommentary(commentaries.failed);
              } else {
                  // Fallback if not pre-generated
                  const comm = await generateResultCommentary(score, total, score > 0, difficulty);
                  setCommentary(comm);
              }
          };
          fetchCommentary();
          
          if (score === questions.length) playSound('perfect');
          else if (score / questions.length >= 0.8) playSound('win');
          else playSound('fail');
      }
  }, [showResult, score, questions.length, commentaries, difficulty]);

  const handleAnswer = (index: number) => {
    if (selectedOption !== null) return; // Prevent double clicks
    
    interact();
    setSelectedOption(index);
    setIsActive(false);

    const correct = index === currentQ.correctIndex;
    setIsCorrect(correct);
    setQuestionResults(prev => [...prev, correct]);

    if (correct) {
      playSound('success');
      setScore(prev => prev + 1);
    } else {
      playSound('buzzer');
      vibrate(200);
    }

    setTimeout(() => {
      if (currentQuestionIndex < questions.length - 1) {
        setCurrentQuestionIndex(prev => prev + 1);
        setSelectedOption(null);
        setIsCorrect(null);
      } else {
        setShowResult(true);
      }
    }, 1500);
  };

  const hasCompletedRef = useRef(false);

  useEffect(() => {
    if (showResult && !hasCompletedRef.current) {
      hasCompletedRef.current = true;
      const passed = (score / questions.length) >= 0.8;
      onComplete(passed, Math.round((score / questions.length) * 100));
    }
  }, [showResult, score, questions.length, onComplete]);

  const handleDebugWin = () => {
    interact();
    setScore(questions.length);
    setQuestionResults(questions.map(() => true));
    setShowResult(true);
  };

  const handleFinish = () => {
    interact();
    const passed = (score / questions.length) >= 0.8;
    onComplete(passed, Math.round((score / questions.length) * 100));
  };

  if (!questions || questions.length === 0) {
      return (
          <div className={`min-h-screen flex flex-col items-center justify-center p-6 ${isNight ? 'bg-slate-900 text-white' : 'bg-safari-50 text-safari-900'}`}>
              <CharlyMascot scene="thinking" theme={progress.settings.theme} difficulty={difficulty} className="w-48 h-48 mb-8 animate-pulse" />
              <h2 className="text-2xl font-bold font-['Fredoka'] mb-4">Charly is writing the quiz</h2>
              <div className="flex justify-center gap-2">
                  <div className="w-3 h-3 bg-current rounded-full animate-bounce [animation-delay:-0.3s] opacity-60"></div>
                  <div className="w-3 h-3 bg-current rounded-full animate-bounce [animation-delay:-0.15s] opacity-60"></div>
                  <div className="w-3 h-3 bg-current rounded-full animate-bounce opacity-60"></div>
              </div>
          </div>
      );
  }

  if (showResult) {
    const percentage = Math.round((score / questions.length) * 100);
    const passed = percentage >= 80;
    const isPerfect = percentage === 100;
    
    let mascotScene: any = 'fail';
    if (passed) {
      if (difficulty === 'Ultra' || difficulty === 'Hard') mascotScene = 'ultra-victory';
      else if (difficulty === 'Secret' || difficulty === 'Void') mascotScene = 'secret-victory';
      else mascotScene = 'success';
    }

    // XP Calculation
    let diffBase = 2; let diffBonus = 1;
    if (difficulty === 'Easy') { diffBase = 1; diffBonus = 1; }
    else if (difficulty === 'Normal') { diffBase = 2; diffBonus = 1; }
    else if (difficulty === 'Hard') { diffBase = 3; diffBonus = 2; }
    else if (difficulty === 'Ultra') { diffBase = 5; diffBonus = 3; }
    else if (difficulty === 'Secret' || difficulty === 'Void') { diffBase = 7; diffBonus = 4; }

    const storyKey = `${level}-${storyNum}`;
    const previousBest = initialBestScore.current;
    const isFirstPass = previousBest < 80;
    const isFirstPerfect = previousBest < 100 && isPerfect;

    let baseGain = 0;
    let bonusGain = 0;
    let levelBonus = 0;

    if (difficulty === 'Void') {
        if (passed) baseGain = 10;
        if (isPerfect) bonusGain = 10;
    } else {
        if (passed && isFirstPass) {
            baseGain = diffBase;
            if (isFinalStory) {
                if (difficulty === 'Easy') levelBonus = 5;
                else if (difficulty === 'Normal') levelBonus = 10;
                else if (difficulty === 'Hard') levelBonus = 15;
                else if (difficulty === 'Ultra') levelBonus = 25;
                else if (difficulty === 'Secret') levelBonus = 50;
            }
        }
        if (isFirstPerfect) bonusGain = diffBonus;
    }

    const totalGain = baseGain + bonusGain + levelBonus;

    return (
      <div className={`min-h-screen flex flex-col items-center justify-start p-6 page-enter overflow-y-auto ${styles.bgGradient ? `bg-gradient-to-b ${styles.bgGradient}` : ''}`} style={{ background: styles.bgGradient ? undefined : 'var(--bg-primary)' }}>
        {isPerfect && <Particles type={difficulty === 'Ultra' ? 'platinum' : 'gold'} />}
        {passed && !isPerfect && <Particles type="celebration" />}
        
        <div className={`max-w-md w-full bg-[var(--card-bg)] backdrop-blur-xl rounded-3xl p-8 shadow-2xl border-4 text-center relative z-10 mt-24 mb-8 ${styles.cardBorder || (passed ? 'border-theme' : 'border-red-400')}`}>
          <div className="absolute -top-20 left-1/2 transform -translate-x-1/2">
             <CharlyMascot scene={mascotScene} difficulty={difficulty} theme={progress.settings.theme} className="w-40 h-40" />
          </div>
          
          <h2 className={`text-4xl font-black mt-16 mb-2 font-['Fredoka'] ${styles.accentText || (passed ? 'text-theme' : 'text-red-500')}`}>
            {passed ? (isPerfect ? "PERFECT CLEAR!" : "STAGE CLEARED!") : "MISSION FAILED!"}
          </h2>
          
          <div className="text-6xl font-black mb-4" style={{ color: 'var(--text-primary)' }}>
            {percentage}%
          </div>
          
          <div className="bg-gray-100 dark:bg-gray-800 rounded-2xl p-4 mb-6 relative border border-gray-200 dark:border-gray-700">
            <div className="absolute -top-2 left-1/2 transform -translate-x-1/2 w-4 h-4 bg-gray-100 dark:bg-gray-800 rotate-45 border-t border-l border-gray-200 dark:border-gray-700 z-0"></div>
            <div className="relative z-10 px-2">
              <p className="font-bold opacity-90 italic break-words whitespace-pre-wrap leading-relaxed text-[clamp(0.875rem,3.5vw,1.125rem)]" style={{ color: 'var(--text-primary)' }}>
                "{commentary}"
              </p>
            </div>
          </div>

          {/* Adventure Log */}
          <div className="bg-black/5 dark:bg-white/5 rounded-2xl p-4 mb-6 text-left border-2 border-dashed border-gray-300 dark:border-gray-600">
            <h3 className="text-sm font-bold uppercase tracking-widest mb-3 opacity-70" style={{ color: 'var(--text-primary)' }}>Adventure Log</h3>
            <div className="space-y-2 mb-4">
               {passed && (
                 <>
                   <div className="flex justify-between items-center text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
                     <span>Stage Clear XP:</span>
                     <span className="text-green-500 dark:text-green-400">+{baseGain}</span>
                   </div>
                   {bonusGain > 0 && (
                     <div className="flex justify-between items-center text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
                       <span>Perfect Bonus XP:</span>
                       <span className="text-yellow-500 dark:text-yellow-400">+{bonusGain}</span>
                     </div>
                   )}
                   {levelBonus > 0 && (
                     <div className="flex justify-between items-center text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
                       <span>Boss Stage Bonus XP:</span>
                       <span className="text-purple-500 dark:text-purple-400">+{levelBonus}</span>
                     </div>
                   )}
                   <div className="flex justify-between items-center text-base font-black pt-2 border-t border-gray-300 dark:border-gray-600" style={{ color: 'var(--text-primary)' }}>
                     <span>Total XP Gained:</span>
                     <span className="text-theme">+{totalGain}</span>
                   </div>
                 </>
               )}
               {!passed && (
                 <div className="text-sm font-bold text-red-500 dark:text-red-400 text-center">
                   No XP gained. Try again!
                 </div>
               )}
            </div>
            
            <div className="max-h-32 overflow-y-auto pr-2 space-y-1 custom-scrollbar">
               {questionResults.map((res, idx) => (
                 <div key={idx} className="flex items-center text-xs font-bold opacity-80" style={{ color: 'var(--text-primary)' }}>
                   <span className="w-6">{idx + 1}.</span>
                   <span className={res ? 'text-green-500 dark:text-green-400' : 'text-red-500 dark:text-red-400'}>
                     {res ? '✅ Correct' : '❌ Incorrect'}
                   </span>
                 </div>
               ))}
            </div>
          </div>

          <div className="space-y-3">
            {passed ? (
               <button onClick={isFinalStory ? () => onExit('library') : onNextStorySetup} className={`w-full py-4 rounded-2xl font-bold text-xl shadow-lg active:scale-95 transition animate-bounce-slight ${styles.buttonPrimary || 'btn-primary'}`}>
                 {isFinalStory ? "Back to Library" : "Next Adventure ➔"}
               </button>
            ) : (
               <button onClick={() => { interact(); onRetry(); }} className="w-full py-4 bg-orange-500 text-white rounded-2xl font-bold text-xl shadow-lg active:scale-95 transition hover:bg-orange-600">
                 ↺ Read Again
               </button>
            )}
            
            <div className="grid grid-cols-2 gap-3">
                <button onClick={() => { interact(); onExit('library'); }} className={`py-3 rounded-xl font-bold border-2 active:scale-95 transition ${progress.settings.theme === 'night' ? 'border-gray-600 text-gray-300 hover:bg-gray-800' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
                  Library
                </button>
                <button onClick={() => { interact(); onExit('main-menu'); }} className={`py-3 rounded-xl font-bold border-2 active:scale-95 transition ${progress.settings.theme === 'night' ? 'border-gray-600 text-gray-300 hover:bg-gray-800' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
                  Main Menu
                </button>
            </div>
            
            <button onClick={() => { interact(); setShowStats(true); }} className={`w-full py-3 rounded-xl font-bold border-2 active:scale-95 transition ${progress.settings.theme === 'night' ? 'border-indigo-900/50 text-indigo-300 hover:bg-indigo-900/30' : 'border-indigo-200 text-indigo-600 hover:bg-indigo-50'}`}>
              📊 View Stats
            </button>
          </div>
        </div>

        {showStats && (
            <div className="fixed inset-0 z-[200] bg-black/80 flex items-center justify-center p-6 backdrop-blur-sm animate-in fade-in zoom-in duration-300">
                <div className="bg-[var(--card-bg)] max-w-sm w-full p-6 rounded-3xl shadow-2xl border-4 border-theme relative max-h-[80vh] overflow-y-auto custom-scrollbar">
                    <button onClick={() => { interact(); setShowStats(false); }} className="absolute top-4 right-4 w-8 h-8 bg-gray-200 dark:bg-gray-700 rounded-full flex items-center justify-center font-bold hover:bg-gray-300 dark:hover:bg-gray-600 transition">✕</button>
                    <h3 className="text-2xl font-black mb-6 font-['Fredoka'] text-theme text-center">Reeder Stats</h3>
                    
                    <div className="space-y-4 text-left">
                        <div className="bg-black/5 dark:bg-white/5 p-3 rounded-xl">
                            <div className="text-xs font-bold uppercase tracking-wider opacity-60 mb-1" style={{ color: 'var(--text-primary)' }}>Current Difficulty</div>
                            <div className="text-lg font-black" style={{ color: 'var(--text-primary)' }}>{difficulty}</div>
                        </div>
                        <div className="bg-black/5 dark:bg-white/5 p-3 rounded-xl">
                            <div className="text-xs font-bold uppercase tracking-wider opacity-60 mb-1" style={{ color: 'var(--text-primary)' }}>Total Reading Power (WPM)</div>
                            <div className="text-2xl font-black text-theme">{progress.wpm} <span className="text-sm opacity-60">XP</span></div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="bg-black/5 dark:bg-white/5 p-3 rounded-xl">
                                <div className="text-xs font-bold uppercase tracking-wider opacity-60 mb-1" style={{ color: 'var(--text-primary)' }}>Stories Passed</div>
                                <div className="text-xl font-black" style={{ color: 'var(--text-primary)' }}>{progress.totalStoriesRead}</div>
                            </div>
                            <div className="bg-black/5 dark:bg-white/5 p-3 rounded-xl">
                                <div className="text-xs font-bold uppercase tracking-wider opacity-60 mb-1" style={{ color: 'var(--text-primary)' }}>Perfect Clears</div>
                                <div className="text-xl font-black text-yellow-500">{progress.totalPerfectScores}</div>
                            </div>
                        </div>
                        <div className="bg-black/5 dark:bg-white/5 p-3 rounded-xl">
                            <div className="text-xs font-bold uppercase tracking-wider opacity-60 mb-1" style={{ color: 'var(--text-primary)' }}>Current Position</div>
                            <div className="text-lg font-black" style={{ color: 'var(--text-primary)' }}>Level {progress.unlockedLevel} - Story {progress.unlockedStory}</div>
                        </div>
                    </div>
                </div>
            </div>
        )}
      </div>
    );
  }

  // Quiz Interface
  const progressPercent = ((currentQuestionIndex) / questions.length) * 100;

  return (
    <div className={`min-h-screen flex flex-col p-4 md:p-6 relative overflow-hidden ${styles.bgGradient ? `bg-gradient-to-b ${styles.bgGradient}` : ''}`} style={{ background: styles.bgGradient ? undefined : 'var(--bg-primary)' }}>
      {/* Background Image for Hard+ Mode */}
      {isHardOrHigher && (
        <div 
          className="absolute inset-0 z-0 pointer-events-none opacity-30 mix-blend-overlay"
          style={{ 
            backgroundImage: `url(/assets/ultra-victory_${bgImageTheme}.png)`,
            backgroundSize: 'cover',
            backgroundPosition: 'center'
          }}
        />
      )}
      
      {/* Header Stats */}
      <div className={`max-w-3xl mx-auto w-full flex justify-between items-center mb-8 p-4 rounded-2xl bg-[var(--card-bg)] backdrop-blur border-2 ${styles.cardBorder || 'border-transparent'} shadow-sm`}>
         <div className="flex items-center gap-4">
            <div className="text-2xl" title="Score">🏆 {score}</div>
            <div className={`font-mono text-xl font-bold ${timeLeft < 10 ? 'text-red-500 animate-pulse' : ''}`} style={{ color: timeLeft < 10 ? undefined : 'var(--text-primary)' }}>
               ⏱️ {timeLeft}s
            </div>
         </div>
         <div className="text-sm font-bold opacity-60" style={{ color: 'var(--text-primary)' }}>
            Question {currentQuestionIndex + 1} of {questions.length}
         </div>
      </div>

      {/* Progress Bar */}
      <div className="max-w-3xl mx-auto w-full h-4 bg-gray-200 dark:bg-gray-700 rounded-full mb-8 overflow-hidden">
         <div className={`h-full transition-all duration-500 ${styles.buttonPrimary ? 'bg-current opacity-80' : 'bg-theme'}`} style={{ width: `${progressPercent}%`, backgroundColor: styles.buttonPrimary ? undefined : 'var(--accent-color)' }}></div>
      </div>

      {/* Question Card */}
      <div className={`max-w-3xl mx-auto w-full flex-grow flex flex-col justify-center bg-[var(--card-bg)] p-6 md:p-10 rounded-[2rem] shadow-xl border-4 relative page-enter ${styles.cardBorder || 'border-white'}`}>
         
         {/* Mascot Peek */}
         <div className="absolute -top-12 -right-4 md:-right-12 rotate-12">
            <CharlyMascot scene="quiz" difficulty={difficulty} theme={progress.settings.theme} className="w-24 h-24 md:w-32 md:h-32" />
         </div>

         <h2 className={`text-2xl md:text-3xl font-bold mb-8 leading-snug font-['Fredoka'] pr-16 md:pr-24 ${styles.accentText || 'text-[var(--text-primary)]'}`}>
            {currentQ.question}
         </h2>

         <div className="grid grid-cols-1 gap-4">
            {currentQ.options.map((opt, idx) => {
               let stateClass = "";
               if (selectedOption !== null) {
                  if (idx === currentQ.correctIndex) stateClass = "bg-green-500 text-white border-green-600 scale-[1.02]";
                  else if (idx === selectedOption) stateClass = "bg-red-500 text-white border-red-600 opacity-80";
                  else stateClass = "opacity-50 cursor-not-allowed";
               } else {
                  stateClass = styles.buttonPrimary ? `${styles.cardBorder} hover:bg-black/10` : "hover:border-theme hover:bg-safari-50 dark:hover:bg-indigo-900/50 cursor-pointer active:scale-[0.98]";
               }

               return (
                  <button
                    key={idx}
                    onClick={() => handleAnswer(idx)}
                    disabled={selectedOption !== null}
                    className={`p-5 rounded-2xl border-4 text-left font-bold text-lg transition-all duration-200 ${stateClass} ${selectedOption === null && !styles.buttonPrimary ? 'bg-[var(--card-bg)] border-gray-200 dark:border-gray-700' : ''}`}
                    style={{ color: selectedOption !== null ? 'white' : (styles.buttonPrimary ? undefined : 'var(--text-primary)') }}
                  >
                     <span className="opacity-60 mr-4">{String.fromCharCode(65 + idx)}.</span>
                     {opt}
                  </button>
               )
            })}
         </div>
      </div>
      
      {/* Skip Button (Developer/Debug) */}
      {progress.settings.debugMode && (
          <button onClick={handleDebugWin} className="mx-auto mt-8 text-[10px] uppercase tracking-tighter opacity-30 hover:opacity-100 transition-opacity z-20">
              [DEBUG] Skip & Win
          </button>
      )}
    </div>
  );
};
