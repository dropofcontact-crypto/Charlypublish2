import React, { useState, useEffect, useRef, useMemo } from 'react';
import { GeneratedContent, AppSettings, AppState } from '../types';
import { interact } from '../utils/haptics';

interface ReaderProps {
  content: GeneratedContent;
  wpm: number;
  settings: AppSettings;
  level: number;
  storyNum: number;
  onFinished: () => void;
  onExit: (to: AppState) => void;
  onSkip: () => void;
  styles?: any;
  isStreaming?: boolean;
}

export const Reader: React.FC<ReaderProps> = ({ content, wpm, settings, level, storyNum, onFinished, onExit, onSkip, styles, isStreaming = false }) => {
  const [phase, setPhase] = useState<'countdown' | 'reading' | 'buffering'>('buffering');
  const [count, setCount] = useState(3);
  const [vanishedIndex, setVanishedIndex] = useState(-1);
  const [isPaused, setIsPaused] = useState(false);
  const [showAutoWarning, setShowAutoWarning] = useState(false);
  const [pendingAction, setPendingAction] = useState<{ type: 'skip' | 'restart' | 'exit', target?: AppState } | null>(null);
  
  // Ref to track vanishedIndex without triggering effect restarts in the scroll loop
  const vanishedIndexRef = useRef(vanishedIndex);
  useEffect(() => { vanishedIndexRef.current = vanishedIndex; }, [vanishedIndex]);

  // Flatten story for continuous index calculation
  const paragraphs = useMemo(() => {
    let globalIndex = 0;
    return content.storyChunks.map(chunk => {
      // Use a more efficient split and cache results if possible
      const words = chunk.split(/\s+/).filter(w => w.length > 0);
      const chunkData = {
        words: words,
        startIndex: globalIndex,
        endIndex: globalIndex + words.length - 1
      };
      globalIndex += words.length;
      return chunkData;
    });
  }, [content.storyChunks]);

  const paragraphsRef = useRef(paragraphs);
  useEffect(() => { paragraphsRef.current = paragraphs; }, [paragraphs]);

  const totalWords = useMemo(() => {
      if (paragraphs.length === 0) return 0;
      return paragraphs[paragraphs.length - 1].endIndex + 1;
  }, [paragraphs]);

  const totalWordsRef = useRef(totalWords);
  useEffect(() => { totalWordsRef.current = totalWords; }, [totalWords]);

  // Refs for scroll elements
  const activeWordRef = useRef<HTMLSpanElement | null>(null);
  const paragraphRefs = useRef<(HTMLDivElement | null)[]>([]);
  const animationFrameRef = useRef<number | null>(null);
  const autoWarningTimeoutRef = useRef<number | null>(null);
  
  // Sub-pixel accumulator
  const exactVIdxRef = useRef<number>(0);
  const isWarningShownRef = useRef(false);
  const lastInteractionTimeRef = useRef<number>(0);
  const fixedModeOffsetRef = useRef<number>(0);

  // Logic for manual scroll detection
  useEffect(() => {
    const handleInteraction = (e: Event) => {
      if (phase !== 'reading' || isPaused) return;
      if (e.type === 'keydown') {
          const key = (e as KeyboardEvent).key;
          if (!['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', ' ', 'Home', 'End'].includes(key)) return;
      }
      lastInteractionTimeRef.current = Date.now();
    };
    
    window.addEventListener('wheel', handleInteraction, { passive: true });
    window.addEventListener('touchstart', handleInteraction, { passive: true });
    window.addEventListener('touchmove', handleInteraction, { passive: true });
    window.addEventListener('keydown', handleInteraction, { passive: true });
    
    return () => {
       window.removeEventListener('wheel', handleInteraction);
       window.removeEventListener('touchstart', handleInteraction);
       window.removeEventListener('touchmove', handleInteraction);
       window.removeEventListener('keydown', handleInteraction);
       if (autoWarningTimeoutRef.current) window.clearTimeout(autoWarningTimeoutRef.current);
    };
  }, [phase, isPaused]);

  // Initial Buffer Check logic
  useEffect(() => {
      // If we are in initial buffering state
      if (phase === 'buffering') {
          // Wait for at least 50 words to start, or if streaming finished but words are low
          if (totalWords > 50 || (!isStreaming && totalWords > 0)) {
              setPhase('countdown');
          }
      }
  }, [totalWords, isStreaming, phase]);

  // Stream Catch-up Logic (Mid-reading buffering)
  useEffect(() => {
      if (phase === 'reading' && isStreaming && !isPaused) {
          // If we are within 10 words of the end, pause for buffer
          if (totalWords - vanishedIndex < 20) {
              setPhase('buffering');
          }
      } else if (phase === 'buffering' && isStreaming) {
          // Resume if we have a healthy buffer (e.g., 40 words ahead)
          if (totalWords - vanishedIndex > 40) {
              setPhase('reading');
          }
      } else if (phase === 'buffering' && !isStreaming) {
          // Stream finished while buffering, just resume
          setPhase('reading');
      }
  }, [totalWords, vanishedIndex, isStreaming, phase, isPaused]);


  // Scroll Loop
  useEffect(() => {
    let lastTime = performance.now();
    
    // Only reset exactVIdx if we are starting fresh or significantly behind
    if (exactVIdxRef.current === 0 || Math.abs(exactVIdxRef.current - vanishedIndexRef.current) > 5) {
        exactVIdxRef.current = vanishedIndexRef.current === -1 ? 0 : vanishedIndexRef.current;
    }

    const updateScroll = () => {
      const now = performance.now();
      const delta = now - lastTime;
      lastTime = now;

      if (phase !== 'reading' || isPaused) {
        animationFrameRef.current = requestAnimationFrame(updateScroll);
        return;
      }

      const currentTotalWords = totalWordsRef.current;
      const currentParagraphs = paragraphsRef.current;

      // 1. Update exact word index continuously
      const msPerWord = 60000 / wpm;
      const wordsToAdvance = delta / msPerWord;
      
      exactVIdxRef.current += wordsToAdvance;
      
      if (exactVIdxRef.current > currentTotalWords + 1) {
          exactVIdxRef.current = currentTotalWords + 1;
      }

      // 2. Update discrete vanishedIndex state when crossing integer boundaries
      const newVanishedIndex = Math.floor(exactVIdxRef.current);
      if (newVanishedIndex !== vanishedIndexRef.current && newVanishedIndex <= currentTotalWords + 1) {
          vanishedIndexRef.current = newVanishedIndex;
          setVanishedIndex(newVanishedIndex);
      }

      // 3. Smooth Auto-Scroll
      if (settings.scrollMode === 'auto' || settings.scrollMode === 'fixed') {
          const exactVIdx = exactVIdxRef.current;
          
          // Find the current paragraph and word position for more accurate scrolling
          let targetY = 0;
          const activeParaIdx = currentParagraphs.findIndex(p => exactVIdx >= p.startIndex && exactVIdx <= p.endIndex);
          
          if (activeParaIdx !== -1) {
              const paraEl = paragraphRefs.current[activeParaIdx];
              if (paraEl) {
                  const paraRect = paraEl.getBoundingClientRect();
                  const paraTop = window.scrollY + paraRect.top;
                  const paraHeight = paraRect.height;
                  
                  const para = currentParagraphs[activeParaIdx];
                  const wordsInPara = para.words.length;
                  const progressInPara = (exactVIdx - para.startIndex) / Math.max(1, wordsInPara);
                  
                  targetY = paraTop + (progressInPara * paraHeight);
              }
          } else if (currentParagraphs.length > 0) {
              // Fallback to simple progress if not in a paragraph (e.g. between paragraphs)
              const firstPara = paragraphRefs.current[0];
              const lastPara = paragraphRefs.current[currentParagraphs.length - 1];
              if (firstPara && lastPara) {
                  const startY = window.scrollY + firstPara.getBoundingClientRect().top;
                  const endY = window.scrollY + lastPara.getBoundingClientRect().bottom;
                  const totalHeight = endY - startY;
                  const exactProgress = exactVIdx / Math.max(1, currentTotalWords);
                  targetY = startY + (exactProgress * totalHeight);
              }
          }

          if (targetY > 0) {
              const targetTopOffset = window.innerHeight * 0.35; 
              const baseIdealScrollY = targetY - targetTopOffset;
              const currentScrollY = window.scrollY;
              
              const timeSinceInteraction = Date.now() - lastInteractionTimeRef.current;
              const isManuallyScrolling = timeSinceInteraction < 500;

              if (isManuallyScrolling) {
                  // User is in control.
                  // 1. Update fixed offset so that when we resume, we resume from exactly here.
                  fixedModeOffsetRef.current = currentScrollY - baseIdealScrollY;
                  
                  // 2. Show warning ONLY in auto mode if they drift far
                  if (settings.scrollMode === 'auto') {
                      if (Math.abs(fixedModeOffsetRef.current) > window.innerHeight * 0.5) {
                          if (!isWarningShownRef.current) {
                              isWarningShownRef.current = true;
                              setShowAutoWarning(true);
                              if (autoWarningTimeoutRef.current) window.clearTimeout(autoWarningTimeoutRef.current);
                              autoWarningTimeoutRef.current = window.setTimeout(() => setShowAutoWarning(false), 1500);
                          }
                      } else if (isWarningShownRef.current) {
                          isWarningShownRef.current = false;
                      }
                  }
              } else {
                  // System is in control.
                  if (isWarningShownRef.current) {
                      isWarningShownRef.current = false;
                  }

                  let idealScrollY = baseIdealScrollY;
                  if (settings.scrollMode === 'fixed') {
                      idealScrollY = baseIdealScrollY + fixedModeOffsetRef.current;
                  }

                  const drift = idealScrollY - currentScrollY;
                  
                  // Only scroll if there's a meaningful difference to avoid micro-stutters
                  if (Math.abs(drift) > 0.5) {
                      // Smooth lerp. A factor of 0.05 gives a nice smooth glide.
                      let nextScrollY = currentScrollY + drift * 0.05;
                      
                      window.scrollTo({
                          top: nextScrollY,
                          behavior: 'instant' 
                      });
                  }
              }
          }
      }
      
      animationFrameRef.current = requestAnimationFrame(updateScroll);
    };

    animationFrameRef.current = requestAnimationFrame(updateScroll);

    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      if (autoWarningTimeoutRef.current) clearTimeout(autoWarningTimeoutRef.current);
    };
  }, [phase, isPaused, settings.scrollMode, wpm]);


  useEffect(() => {
    if (phase === 'countdown') {
      if (count > 0) {
        const timer = setTimeout(() => setCount(c => c - 1), 1000);
        return () => clearTimeout(timer);
      } else {
        setPhase('reading');
      }
    }
  }, [count, phase]);

  // Finished check effect
  useEffect(() => {
    if (phase !== 'reading' || isPaused) return;

    if (vanishedIndex > totalWords && !isStreaming) {
        const timer = setTimeout(() => {
          onFinished();
        }, 500);
        return () => clearTimeout(timer);
    }
  }, [phase, isPaused, vanishedIndex, totalWords, isStreaming, onFinished]);

  // Word vanishing interval effect removed as it is now handled in the scroll loop

  const restartStory = () => {
    setVanishedIndex(-1);
    setIsPaused(false);
    window.scrollTo({ top: 0, behavior: 'instant' });
  };

  const forceDarkBg = ['Ultra', 'Secret', 'Void'].includes(settings.difficulty);
  const isNight = settings.theme === 'night' || forceDarkBg;
  const isVoid = settings.difficulty === 'Void';
  const isHardOrHigher = ['Hard', 'Ultra', 'Secret', 'Void'].includes(settings.difficulty);
  const bgImageTheme = isNight ? 'night' : 'day';
  const overlayBg = isNight ? 'bg-gradient-to-br from-indigo-900 to-purple-800' : 'bg-safari-500';
  const progressBarBg = isNight ? 'bg-indigo-500' : 'bg-safari-500';
  
  // Custom Styles
  let customHeaderBg = styles?.headerBg || 'bg-[var(--card-bg)]';
  let customButtonClass = styles?.buttonPrimary || (isNight ? 'bg-indigo-600 hover:bg-indigo-700 text-white' : 'bg-safari-500 hover:bg-safari-600 text-white');
  let customProgress = progressBarBg;

  // Determine Font Family
  const forceTechFont = settings.difficulty === 'Secret' || settings.difficulty === 'Void';
  const effectiveFontFamily = forceTechFont ? 'Share Tech Mono' : settings.fontFamily;

  if (styles) {
      if (settings.difficulty === 'Ultra') customProgress = 'bg-fuchsia-500';
      if (settings.difficulty === 'Secret') customProgress = 'bg-emerald-500';
      if (settings.difficulty === 'Void') customProgress = 'bg-gray-200';
  }

  if (phase === 'countdown') {
    // Void Specific Gradient override
    const countdownBg = isVoid 
        ? { background: 'radial-gradient(circle, #1a1a1a 0%, #000000 100%)' }
        : { 
            background: styles?.bgGradient ? undefined : undefined, 
            backgroundImage: styles?.bgGradient ? `linear-gradient(to bottom, black, ${settings.difficulty === 'Ultra' ? '#4a044e' : '#022c22'})` : undefined 
          };

    return (
      <div className={`fixed inset-0 z-50 flex flex-col items-center justify-center ${!isVoid ? overlayBg : ''}`} style={countdownBg}>
        <h1 className={`text-9xl font-['Fredoka'] animate-bounce ${isVoid ? 'text-gray-200 drop-shadow-[0_0_15px_rgba(255,255,255,0.5)]' : 'text-white'}`}>
          {count > 0 ? count : "GO!"}
        </h1>
        <p className={`text-2xl mt-4 font-bold ${isVoid ? 'text-gray-400 font-tech tracking-widest' : 'text-white'}`}>
            {isVoid ? "THE VOID AWAITS" : "Get Ready!"}
        </p>
      </div>
    );
  }

  // Text Shadow Logic for Glow
  let textGlowClass = "";
  if (settings.difficulty === 'Secret') textGlowClass = "drop-shadow-[0_0_6px_rgba(52,211,153,0.8)]";
  if (settings.difficulty === 'Void') textGlowClass = "drop-shadow-[0_0_10px_rgba(255,255,255,0.7)]";

  return (
    <div className={`min-h-full flex flex-col select-none relative ${styles && styles.bgGradient ? `bg-gradient-to-b ${styles.bgGradient}` : ''}`} style={{ background: styles ? undefined : 'var(--bg-primary)' }}>
      {/* Background Image for Hard+ Mode */}
      {isHardOrHigher && (
        <div 
          className="fixed inset-0 z-0 pointer-events-none opacity-40 mix-blend-overlay"
          style={{ 
            backgroundImage: `url(/assets/platinum_${bgImageTheme}.png)`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            backgroundAttachment: 'fixed'
          }}
        />
      )}
      
      {/* Warning Toast for Auto Scroll Correction */}
      <div className={`fixed top-24 left-1/2 transform -translate-x-1/2 z-[60] transition-all duration-300 pointer-events-none ${showAutoWarning ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4'}`}>
         <div className="bg-orange-500 text-white font-bold px-6 py-3 rounded-full shadow-lg flex items-center gap-2">
            <span>🔒 Auto Scroll Correcting...</span>
         </div>
      </div>

      {/* Buffering Overlay */}
      {phase === 'buffering' && (
          <div className="fixed bottom-32 left-0 right-0 flex justify-center z-[55] animate-in fade-in zoom-in duration-300">
              <div className="bg-black/70 backdrop-blur-md text-white px-8 py-4 rounded-full flex items-center gap-4 shadow-2xl border-2 border-white/20">
                  <div className="w-4 h-4 bg-white rounded-full animate-bounce"></div>
                  <div className="w-4 h-4 bg-white rounded-full animate-bounce delay-100"></div>
                  <div className="w-4 h-4 bg-white rounded-full animate-bounce delay-200"></div>
                  <span className="font-bold text-lg font-['Fredoka']">Charly is writing more...</span>
              </div>
          </div>
      )}

      {/* Pause Menu Overlay */}
      {isPaused && (
         <div className="fixed inset-0 z-50 backdrop-blur-md bg-black/60 flex flex-col items-center justify-center p-6">
            <h2 className="text-5xl font-bold text-white font-['Fredoka'] mb-6">PAUSED</h2>
            
            {/* Stats Block */}
            <div className="flex gap-4 mb-8 text-white/90">
                <div className="bg-white/20 px-4 py-2 rounded-lg backdrop-blur-sm border border-white/10 flex flex-col items-center">
                    <span className="text-xs font-bold uppercase opacity-70">Speed</span>
                    <span className="text-xl font-black">{wpm} WPM</span>
                </div>
                <div className="bg-white/20 px-4 py-2 rounded-lg backdrop-blur-sm border border-white/10 flex flex-col items-center">
                    <span className="text-xs font-bold uppercase opacity-70">{isVoid ? "Zone" : "Level"}</span>
                    <span className="text-xl font-black">{isVoid ? "VOID" : level}</span>
                </div>
                <div className="bg-white/20 px-4 py-2 rounded-lg backdrop-blur-sm border border-white/10 flex flex-col items-center">
                    <span className="text-xs font-bold uppercase opacity-70">{isVoid ? "Depth" : "Story"}</span>
                    <span className="text-xl font-black">{isVoid ? `#${storyNum}` : `#${storyNum}`}</span>
                </div>
            </div>

            <div className="flex flex-col gap-4 w-full max-w-sm">
              <button 
                onClick={() => { interact(); setIsPaused(false); }}
                className={`w-full py-4 rounded-2xl font-bold text-xl shadow-lg transform hover:scale-105 active:scale-95 transition ${customButtonClass}`}
              >
                ▶ Resume Reading
              </button>
              <button 
                onClick={() => { interact(); setPendingAction({ type: 'skip' }); }}
                disabled={!settings.debugMode && isStreaming && content.storyChunks.length < 5}
                className={`w-full py-4 text-white rounded-2xl font-bold text-xl shadow-lg transform transition ${
                  (!settings.debugMode && isStreaming && content.storyChunks.length < 5) 
                    ? 'bg-gray-400 cursor-not-allowed opacity-50' 
                    : (isNight ? 'bg-sky-700 hover:bg-sky-800 hover:scale-105 active:scale-95' : 'bg-sky-400 hover:bg-sky-500 hover:scale-105 active:scale-95')
                }`}
              >
                {(!settings.debugMode && isStreaming && content.storyChunks.length < 5) ? '⏳ Generating Story...' : '⏩ Skip to Quiz'}
              </button>
              <button 
                onClick={() => { interact(); setPendingAction({ type: 'restart' }); }}
                className={`w-full py-4 text-white rounded-2xl font-bold text-xl shadow-lg transform hover:scale-105 active:scale-95 transition ${isNight ? 'bg-orange-700 hover:bg-orange-800' : 'bg-orange-400 hover:bg-orange-500'}`}
              >
                ↺ Restart Story
              </button>
              <div className="h-4"></div>
              <button 
                onClick={() => { interact(); setPendingAction({ type: 'exit', target: 'library' }); }}
                className={`w-full py-3 border-2 rounded-xl font-bold transition active:scale-95 ${isNight ? 'bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}
              >
                Back to Library
              </button>
              <button 
                onClick={() => { interact(); setPendingAction({ type: 'exit', target: 'main-menu' }); }}
                className={`w-full py-3 border-2 rounded-xl font-bold transition active:scale-95 ${isNight ? 'bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}
              >
                Main Menu
              </button>
            </div>

            {/* Confirmation Dialog */}
            {pendingAction && (
              <div className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-xl flex items-center justify-center p-6 animate-in fade-in zoom-in duration-200">
                <div className="bg-white dark:bg-gray-800 p-8 rounded-[2.5rem] shadow-2xl max-w-sm w-full text-center border-4 border-orange-100 dark:border-gray-700">
                  <div className="mb-4 text-5xl">🤔</div>
                  <h3 className="text-2xl font-black mb-2 text-gray-800 dark:text-white font-['Fredoka']">Are you sure?</h3>
                  <p className="text-gray-600 dark:text-gray-300 mb-8 font-bold leading-relaxed">
                    {pendingAction.type === 'skip' && "You'll miss the rest of the story! Ready for the quiz?"}
                    {pendingAction.type === 'restart' && "This will start the story from the very beginning!"}
                    {pendingAction.type === 'exit' && "You'll lose your progress in this story!"}
                  </p>
                  
                  <div className="flex flex-col gap-3">
                    <button 
                      onClick={() => {
                        interact();
                        if (pendingAction.type === 'skip') onSkip();
                        if (pendingAction.type === 'restart') restartStory();
                        if (pendingAction.type === 'exit' && pendingAction.target) onExit(pendingAction.target);
                        setPendingAction(null);
                      }}
                      className="w-full py-4 bg-orange-500 hover:bg-orange-600 text-white rounded-2xl font-black text-xl shadow-lg active:scale-95 transition"
                    >
                      Yes, I'm Sure!
                    </button>
                    <button 
                      onClick={() => { interact(); setPendingAction(null); }}
                      className="w-full py-3 text-gray-500 dark:text-gray-400 font-bold hover:text-gray-800 dark:hover:text-white transition"
                    >
                      No, Keep Reading!
                    </button>
                  </div>
                </div>
              </div>
            )}
         </div>
      )}

      {/* Header */}
      <div className={`fixed top-0 left-0 right-0 z-40 p-4 backdrop-blur-sm border-b flex justify-between items-center shadow-sm transition-all duration-300 ${customHeaderBg} ${styles?.cardBorder || (isNight ? 'border-indigo-900' : 'border-safari-200')}`}>
        <div className="flex gap-2 w-1/3">
           <div className="h-3 w-full bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden border border-gray-200 dark:border-gray-700">
             <div 
               className={`h-full transition-all duration-300 ${customProgress}`}
               style={{ width: `${(Math.min(vanishedIndex, totalWords) / (Math.max(totalWords, 1))) * 100}%` }}
             ></div>
           </div>
        </div>
        <button 
           onClick={() => { interact(); setIsPaused(true); }}
           className={`font-bold px-6 py-2 rounded-xl transition border-2 bg-white/50 dark:bg-black/30 active:scale-95 ${styles?.accentText || (isNight ? 'text-indigo-200 border-indigo-800 hover:bg-indigo-900' : 'text-safari-600 border-safari-200 hover:bg-safari-50')}`}
         >
           II PAUSE
         </button>
      </div>

      <div className="h-48"></div>

      {/* Main Content List */}
      <div className="flex-grow flex flex-col items-center p-6 md:p-8 pb-96 w-full max-w-4xl mx-auto">
        {paragraphs.map((para, pIdx) => (
          <div 
            key={pIdx} 
            ref={el => { paragraphRefs.current[pIdx] = el; }}
            className={`mb-8 w-full text-left leading-loose ${textGlowClass}`}
            style={{ 
              fontSize: `${settings.fontSize}px`,
              fontFamily: effectiveFontFamily // Applied here
            }}
          >
            {para.words.map((word, wIdx) => {
              const globalWordIndex = para.startIndex + wIdx;
              const isVanishing = globalWordIndex === vanishedIndex;
              const isVanished = globalWordIndex < vanishedIndex;
              
              const colorStyle = isVanished ? 'transparent' : (styles?.textColorOverride ? styles.textColorOverride : 'var(--text-primary)');

              return (
                <span 
                  key={`${pIdx}-${wIdx}`}
                  ref={isVanishing ? activeWordRef : null}
                  className={`inline-block mr-2 transition-all duration-1000 rounded px-1 ${
                    isVanished 
                      ? 'blur-md text-transparent opacity-0 scale-95 translate-y-[-4px]' 
                      : ''
                  }`}
                  style={{ color: colorStyle }}
                >
                  {word}
                </span>
              );
            })}
          </div>
        ))}
        
        {/* End Spacer */}
        <div className="h-64"></div>
      </div>
    </div>
  );
};
