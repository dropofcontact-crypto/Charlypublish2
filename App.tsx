import React, { useState, useEffect, useRef } from 'react';
import { UserProgress, GeneratedContent, AppState, StoryOptions, Difficulty, SavedStory } from './types';
import { generateStoryAndQuiz, generateStoryOptions, generateLevelBackground, MascotScene, streamStory, generateQuizFromText } from './services/veoService';
import { WpmTest } from './components/WpmTest';
import { CharlyMascot } from './components/CharlyMascot';
import { Reader } from './components/Reader';
import { Quiz } from './components/Quiz';
import { vibrate, playSound, interact } from './utils/haptics';
import { saveImageToDB, getImageFromDB, saveStoryToDB, getStoryFromDB, clearDB, deleteImageFromDB } from './utils/db';
import { notifyAndroid } from './utils/androidBridge';
import { Particles } from './components/Particles';

// Helper for Theme Styles based on Difficulty
const getModeStyles = (difficulty: Difficulty, theme: 'day' | 'night') => {
    const isNight = theme === 'night';
    
    if (difficulty === 'Hard') {
        return {
            appFrameBorder: isNight ? 'border-red-900/40' : 'border-red-400/50',
            buttonPrimary: isNight ? 'bg-red-900 border-red-700 text-red-100' : 'bg-red-500 border-red-600 text-white',
            headerBg: isNight ? 'bg-red-950/80' : 'bg-red-50/90',
            cardBorder: isNight ? 'border-red-900' : 'border-red-400',
            accentText: isNight ? 'text-red-400' : 'text-red-600',
            glow: '',
            bgGradient: isNight ? 'from-red-950 to-black' : 'from-red-50 to-white',
            loadingGlow: isNight ? 'bg-red-900' : 'bg-red-400'
        };
    }
    
    if (difficulty === 'Ultra') {
        return {
            appFrameBorder: 'border-fuchsia-500/50',
            buttonPrimary: 'bg-black/60 border-2 border-fuchsia-400 text-fuchsia-300 shadow-[0_0_15px_rgba(232,121,249,0.4)] hover:bg-fuchsia-900/50 hover:text-white hover:border-fuchsia-200 backdrop-blur-md',
            headerBg: 'bg-black/80 backdrop-blur-xl border-b border-fuchsia-500/30',
            cardBorder: 'border-fuchsia-500/50',
            accentText: 'text-fuchsia-300',
            glow: 'shadow-[0_0_30px_rgba(232,121,249,0.2)]',
            bgGradient: 'from-fuchsia-950 via-[#2e0249] to-black',
            textColorOverride: '#e9d5ff', // Always light because bgGradient is always dark
            loadingGlow: 'bg-fuchsia-600'
        };
    }

    if (difficulty === 'Secret') {
        return {
            appFrameBorder: 'border-emerald-900/50',
            buttonPrimary: 'bg-black border border-emerald-500/50 text-emerald-400 font-tech hover:bg-emerald-900/20 shadow-[0_0_10px_rgba(16,185,129,0.2)] hover:text-emerald-200 hover:border-emerald-400',
            headerBg: 'bg-black/90 border-b border-emerald-900',
            cardBorder: 'border-emerald-800',
            accentText: 'text-emerald-400 font-tech drop-shadow-[0_0_5px_rgba(16,185,129,0.8)]',
            glow: 'shadow-[inset_0_0_20px_rgba(16,185,129,0.1)]',
            bgGradient: 'from-black via-[#002b1d] to-black',
            textColorOverride: '#6ee7b7', // Always light because bgGradient is always dark
            loadingGlow: 'bg-emerald-600'
        };
    }
    
    if (difficulty === 'Void') {
        return {
            appFrameBorder: 'border-gray-800',
            buttonPrimary: 'bg-gray-900 text-gray-300 border border-gray-700 hover:text-white hover:border-gray-500 font-tech tracking-widest',
            headerBg: 'bg-black border-b border-gray-800',
            cardBorder: 'border-gray-800',
            accentText: 'text-gray-300 font-tech drop-shadow-[0_0_8px_rgba(255,255,255,0.4)]',
            glow: '',
            bgGradient: 'from-black to-[#0a0a0a]',
            textColorOverride: '#f3f4f6', // Always light because bgGradient is always dark
            loadingGlow: 'bg-gray-700'
        };
    }

    // Default (Easy/Normal)
    return {
        appFrameBorder: isNight ? 'border-indigo-900/30' : 'border-white/30',
        buttonPrimary: 'btn-primary', // Use CSS class
        headerBg: 'bg-[var(--card-bg)] border-b-4 border-theme',
        cardBorder: 'border-theme',
        accentText: 'text-theme',
        glow: '',
        bgGradient: '',
        loadingGlow: isNight ? 'bg-indigo-900' : 'bg-orange-400'
    };
};

const defaultSettings = {
  fontFamily: 'Nunito',
  fontSize: 24,
  scrollMode: 'auto' as const, // Changed default from 'fixed' to 'auto'
  difficulty: 'Normal' as const,
  theme: 'day' as const,
  parentLockEnabled: false,
  parentPin: null as string | null,
  soundEnabled: true,
  debugMode: false,
  apiKey: null as string | null
};

export const App: React.FC = () => {
  // State initialization
  const [progress, setProgress] = useState<UserProgress>(() => {
    const saved = localStorage.getItem('charly_progress');
    
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        let loadedSettings = { ...defaultSettings, ...(parsed.settings || {}) };
        
        // --- Migration Logic for Scroll Mode ---
        const sm = (loadedSettings as any).scrollMode;
        if (sm === 'fixed') loadedSettings.scrollMode = 'auto';
        else if (sm === 'none') loadedSettings.scrollMode = 'manual';
        else if (sm === 'free') loadedSettings.scrollMode = 'manual'; // Fallback
        
        // Ensure strictly valid enum
        if (loadedSettings.scrollMode !== 'auto' && loadedSettings.scrollMode !== 'manual') {
             loadedSettings.scrollMode = 'auto';
        }
        // ---------------------------------------

        if (typeof loadedSettings.fontSize === 'string') loadedSettings.fontSize = 24;
        if (loadedSettings.soundEnabled === undefined) loadedSettings.soundEnabled = true;
        if (loadedSettings.debugMode === undefined) loadedSettings.debugMode = false;

        return { 
          ...parsed, 
          settings: loadedSettings,
          storyHistory: parsed.storyHistory || {},
          savedStories: parsed.savedStories || {},
          levelBackgrounds: {}, 
          totalStoriesRead: parsed.totalStoriesRead || 0,
          totalPerfectScores: parsed.totalPerfectScores || 0,
          prestigeLevel: parsed.prestigeLevel || 0,
          beatenDifficulties: parsed.beatenDifficulties || [],
          usedOptions: parsed.usedOptions || { genres: [], twists: [], titles: [] }
        };
      } catch (e) {
          console.error("Save file corrupted", e);
      }
    }
    return { 
      wpm: 0, unlockedLevel: 1, unlockedStory: 1, hasCompletedPlacement: false,
      settings: defaultSettings, storyHistory: {}, savedStories: {}, levelBackgrounds: {},
      totalStoriesRead: 0, totalPerfectScores: 0, prestigeLevel: 0, beatenDifficulties: [],
      usedOptions: { genres: [], twists: [], titles: [] }
    };
  });

  const [appState, setAppState] = useState<AppState>(() => {
    const saved = localStorage.getItem('charly_progress');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (!parsed.settings?.apiKey) return 'api-setup';
        return 'main-menu';
      } catch (e) {}
    }
    return 'api-setup';
  });
  const prevStateRef = useRef<AppState>('main-menu');
  const appFrameRef = useRef<HTMLDivElement>(null);
  const [viewingLevel, setViewingLevel] = useState<number | null>(null);
  const [currentLevel, setCurrentLevel] = useState(1);
  const [currentStoryNum, setCurrentStoryNum] = useState(1);
  const [storyOptions, setStoryOptions] = useState<StoryOptions | null>(null);
  const [generatedContent, setGeneratedContent] = useState<GeneratedContent | null>(null);
  const [currentStoryParams, setCurrentStoryParams] = useState<{genre: string, twist: string, title: string} | null>(null);
  const [tempTitleReveal, setTempTitleReveal] = useState<string | null>(null); 
  const [loadingMsg, setLoadingMsg] = useState<string | null>(null);
  const [isWarping, setIsWarping] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showEndGamePopup, setShowEndGamePopup] = useState(false);
  const [showQuotaPopup, setShowQuotaPopup] = useState(false);
  
  // Streaming State
  const [isStreaming, setIsStreaming] = useState(false);
  
  // Track failed/attempted backgrounds per session to avoid infinite retries
  const attemptedBackgrounds = useRef<Set<number>>(new Set());

  useEffect(() => {
    // One-time cleanup to free up localStorage from large mascot images
    const cleanupStorage = () => {
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('charly_mascot_')) {
          keysToRemove.push(key);
        }
      }
      if (keysToRemove.length > 0) {
        console.log(`Cleaning up ${keysToRemove.length} mascot images from localStorage...`);
        keysToRemove.forEach(k => localStorage.removeItem(k));
      }
    };
    cleanupStorage();
  }, []);

  useEffect(() => {
    const toSave = {
        ...progress,
        levelBackgrounds: {}, 
        savedStories: Object.keys(progress.savedStories).reduce((acc, key) => {
            const { content, ...meta } = progress.savedStories[key];
            acc[key] = meta;
            return acc;
        }, {} as Record<string, SavedStory>)
    };
    localStorage.setItem('charly_progress', JSON.stringify(toSave));
    
    const forceDark = ['Ultra', 'Secret', 'Void'].includes(progress.settings.difficulty);
    if (progress.settings.theme === 'night' || forceDark) {
      document.body.classList.add('dark');
      document.body.classList.remove('day');
    } else {
      document.body.classList.remove('dark');
      document.body.classList.add('day');
    }
  }, [progress]);

  useEffect(() => {
    if (appState === 'main-menu') setViewingLevel(null);
  }, [appState]);

  useEffect(() => {
      const loadBackgrounds = async () => {
          try {
            const loaded: Record<number, string> = {};
            const limit = progress.settings.debugMode ? 9 : progress.unlockedLevel;
            for (let i = 1; i <= limit; i++) {
                const bg = await getImageFromDB(`level_bg_${i}`);
                if (bg) loaded[i] = bg;
            }
            setProgress(p => ({ ...p, levelBackgrounds: { ...p.levelBackgrounds, ...loaded } }));
          } catch (e) {
            console.warn("Failed to load backgrounds from DB", e);
          }
      };
      loadBackgrounds();
  }, [progress.unlockedLevel, progress.settings.debugMode]);

  useEffect(() => {
    if (prevStateRef.current !== appState) {
      playSound('page-flip');
      window.scrollTo(0, 0);
      appFrameRef.current?.scrollTo(0, 0);
      prevStateRef.current = appState;
    }
  }, [appState]);

  useEffect(() => {
    if (tempTitleReveal && viewingLevel) {
        setTimeout(() => {
            const targetId = `story-card-${currentStoryNum}`;
            const el = document.getElementById(targetId);
            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 100);
    }
  }, [tempTitleReveal, viewingLevel, currentStoryNum]);

  // SAFE BACKGROUND GENERATOR (Prevents Infinite API Loops)
  useEffect(() => {
    const checkAndGenerateBG = async () => {
        if (progress.settings.debugMode) return;
        const limit = progress.unlockedLevel;
        for (let i = 1; i <= limit; i++) {
            // Check session cache to avoid retrying failed generations
            if (attemptedBackgrounds.current.has(i)) continue;

            if (!progress.levelBackgrounds[i]) {
                attemptedBackgrounds.current.add(i); // Mark as attempted immediately
                try {
                    const inDB = await getImageFromDB(`level_bg_${i}`);
                    if (!inDB) {
                        // Only try once per session
                        const bgUrl = await generateLevelBackground(i);
                        if (bgUrl) {
                            await saveImageToDB(`level_bg_${i}`, bgUrl);
                            setProgress(p => ({
                                ...p,
                                levelBackgrounds: { ...p.levelBackgrounds, [i]: bgUrl }
                            }));
                        }
                    } else {
                         // Sync DB state to Memory
                         setProgress(p => ({
                            ...p,
                            levelBackgrounds: { ...p.levelBackgrounds, [i]: inDB }
                        }));
                    }
                } catch (e) { 
                    console.warn(`Background gen failed for level ${i}`, e);
                }
            }
        }
    };
    if (appState === 'library') checkAndGenerateBG();
  }, [progress.unlockedLevel, progress.levelBackgrounds, appState, progress.settings.debugMode]);

  const handleStartRead = () => {
    interact();
    if (progress.hasCompletedPlacement && progress.wpm > 0) setAppState('library');
    else setAppState('onboarding');
  };

  const handleWpmSet = (wpm: number) => {
    setProgress(p => ({ ...p, wpm, hasCompletedPlacement: true }));
    setAppState('library');
  };

  const startStorySetup = async (level: number, storyNum: number) => {
    setCurrentLevel(level);
    setCurrentStoryNum(storyNum);
    setTempTitleReveal(null);
    const storyId = `${level}-${storyNum}`;
    const savedMeta = progress.savedStories[storyId];
    if (savedMeta) {
      try {
        const content = await getStoryFromDB(storyId) || savedMeta.content;
        if (content) {
            setGeneratedContent(content);
            setCurrentStoryParams({ genre: savedMeta.genre, twist: savedMeta.twist, title: savedMeta.title });
            setAppState('reading');
            return;
        }
      } catch (e) { console.error("Error loading saved story", e); }
    }
    setLoadingMsg("Charly is imagining brand new story ideas");
    setAppState('generating'); 
    try {
        const options = await generateStoryOptions(level, progress.usedOptions);
        setStoryOptions(options);
        setAppState('story-setup');
    } catch (e: any) { 
        const isQuota = e.message?.includes('quota') || e.message?.includes('429') || e.message?.includes('RESOURCE_EXHAUSTED');
        if (isQuota) setShowQuotaPopup(true);
        setAppState('library'); 
    }
  };

  const handleRefreshStoryOptions = async () => {
     setLoadingMsg("Spinning the wheel of imagination");
     setAppState('generating');
     try {
        const options = await generateStoryOptions(currentLevel, progress.usedOptions);
        setStoryOptions(options);
        setAppState('story-setup');
     } catch (e: any) { 
        const isQuota = e.message?.includes('quota') || e.message?.includes('429') || e.message?.includes('RESOURCE_EXHAUSTED');
        if (isQuota) setShowQuotaPopup(true);
        setAppState('library'); 
     }
  }

  const handleTitleChosen = async (genre: string, twist: string, title: string) => {
    setCurrentStoryParams({ genre, twist, title });
    setTempTitleReveal(title);
    setAppState('library');
    setViewingLevel(currentLevel); 
    // Wait for animation, then trigger generation
    setTimeout(() => { generateActualStory(genre, twist, title); }, 2000);
  };

  const startVoidStory = async () => {
      const genre = "Abstract / Metaphysical";
      const twist = "The narrator is an algorithm";
      const title = `Void Echo ${Math.floor(Math.random() * 1000)}`;
      setCurrentLevel(99); 
      const voidCount = progress.totalStoriesRead + 1;
      setCurrentStoryNum(voidCount); 
      setCurrentStoryParams({ genre, twist, title });
      generateActualStory(genre, twist, title, 'Void');
  }

  const generateActualStory = async (genre: string, twist: string, title: string, overrideDifficulty?: Difficulty) => {
    setLoadingMsg(`Writing "${title}"`);
    setAppState('generating');
    setTempTitleReveal(null);
    setIsStreaming(true);
    
    const difficulty = overrideDifficulty || progress.settings.difficulty;
    
    // Initialize empty content structure for streaming
    const contentPlaceholder: GeneratedContent = {
        storyChunks: [],
        quiz: []
    };
    setGeneratedContent(contentPlaceholder);

    let accumulatedText = "";
    let hasSwitchedToReading = false;

    let lastUpdate = Date.now();

    try {
      // 1. Start streaming the story text
      const stream = streamStory(currentLevel, genre, twist, title, difficulty, progress.usedOptions);
      
      let storyText = "";
      let quizText = "";
      let commentaryText = "";

      for await (const chunk of stream) {
          accumulatedText += chunk;
          
          if (accumulatedText.includes('---QUIZ---')) {
              const parts = accumulatedText.split('---QUIZ---');
              storyText = parts[0];
              const rest = parts[1];
              
              if (rest.includes('---COMMENTARY---')) {
                  const subParts = rest.split('---COMMENTARY---');
                  quizText = subParts[0];
                  commentaryText = subParts[1];
              } else {
                  quizText = rest;
              }
          } else {
              storyText = accumulatedText;
          }
          
          const now = Date.now();
          // Only update state every 150ms to prevent UI lag
          if (now - lastUpdate > 150) {
              const chunks = storyText.split(/\n\n+/).filter(c => c.trim().length > 0);
              
              setGeneratedContent(prev => ({
                  ...prev!,
                  storyChunks: chunks
              }));

              // 2. Buffer logic: Switch to reading mode once we have at least 1 paragraph
              if (!hasSwitchedToReading && chunks.length >= 1) {
                  setLoadingMsg(null);
                  setAppState('reading');
                  hasSwitchedToReading = true;
              }
              lastUpdate = now;
          }
      }
      
      // Final update to ensure we have everything
      const finalChunks = storyText.split(/\n\n+/).filter(c => c.trim().length > 0);
      
      let parsedQuiz = [];
      let parsedCommentaries = undefined;
      
      const extractJSON = (text: string) => {
          if (!text) return null;
          try {
              // Try direct parse first
              const clean = text.replace(/```json/g, '').replace(/```/g, '').trim();
              return JSON.parse(clean);
          } catch (e) {
              // Try to find the first [ or { and last ] or }
              const firstBracket = Math.min(
                  text.indexOf('[') === -1 ? Infinity : text.indexOf('['),
                  text.indexOf('{') === -1 ? Infinity : text.indexOf('{')
              );
              const lastBracket = Math.max(text.lastIndexOf(']'), text.lastIndexOf('}'));
              
              if (firstBracket !== Infinity && lastBracket !== -1 && lastBracket > firstBracket) {
                  const candidate = text.substring(firstBracket, lastBracket + 1);
                  try {
                      return JSON.parse(candidate);
                  } catch (e2) {
                      return null;
                  }
              }
              return null;
          }
      };

      try {
          if (quizText) {
              parsedQuiz = extractJSON(quizText);
              if (!parsedQuiz) throw new Error("Quiz JSON extraction failed");
          } else {
              throw new Error("No quiz text found in stream");
          }
      } catch (e) {
          console.warn("Failed to parse quiz JSON from stream, falling back to separate generation", e);
          // Fallback to old method if parsing fails
          parsedQuiz = await generateQuizFromText(storyText, currentLevel, difficulty);
      }
      
      try {
          if (commentaryText) {
              parsedCommentaries = extractJSON(commentaryText);
          }
      } catch (e) {
          console.warn("Failed to parse commentary JSON from stream", e);
      }

      setGeneratedContent(prev => ({
          ...prev!,
          storyChunks: finalChunks,
          quiz: parsedQuiz || [],
          commentaries: parsedCommentaries
      }));
      
      setIsStreaming(false);

      // If we finished streaming but didn't switch yet (short story?), switch now
      if (!hasSwitchedToReading) {
          setLoadingMsg(null);
          setAppState('reading');
      }

    } catch (e: any) {
      console.error("Story Generation Failed:", e);
      setIsStreaming(false);
      
      const isQuota = e.message?.includes('quota') || e.message?.includes('429') || e.message?.includes('RESOURCE_EXHAUSTED');
      
      if (isQuota) {
        setShowQuotaPopup(true);
      } else {
        setLoadingMsg("Charly's imagination is a bit foggy... try again?");
        setTimeout(() => setAppState('library'), 2000);
      }
    }
  };

  const handleReadingFinished = () => { setAppState('quiz'); };

  const handleQuizComplete = (passed: boolean, percentage: number) => {
    let updatedSavedStories = { ...progress.savedStories };
    let updatedUsedOptions = { ...progress.usedOptions };
    const storyId = `${currentLevel}-${currentStoryNum}`;
    const diff = progress.settings.difficulty;

    notifyAndroid('onQuizComplete', { passed, percentage, wpm: progress.wpm });

    if (passed && generatedContent && currentStoryParams && diff !== 'Void') {
       if (!updatedSavedStories[storyId]) {
          updatedSavedStories[storyId] = {
             id: storyId, title: currentStoryParams.title, genre: currentStoryParams.genre, twist: currentStoryParams.twist,
          };
          saveStoryToDB(storyId, generatedContent).catch(e => console.error(e));
       }
       if (currentStoryParams) {
           updatedUsedOptions.genres = Array.from(new Set([...updatedUsedOptions.genres, currentStoryParams.genre]));
           updatedUsedOptions.twists = Array.from(new Set([...updatedUsedOptions.twists, currentStoryParams.twist]));
           updatedUsedOptions.titles = Array.from(new Set([...updatedUsedOptions.titles, currentStoryParams.title]));
       }
    }

    if (passed) {
      let baseGain = 0;
      let bonusGain = 0;
      let levelBonus = 0;
      if (diff === 'Void') {
          baseGain = 10;
          if (percentage === 100) bonusGain = 10;
      } else {
          let diffBase = 2; let diffBonus = 1;
          if (diff === 'Easy') { diffBase = 1; diffBonus = 1; }
          else if (diff === 'Normal') { diffBase = 2; diffBonus = 1; }
          else if (diff === 'Hard') { diffBase = 3; diffBonus = 2; }
          else if (diff === 'Ultra') { diffBase = 5; diffBonus = 3; }
          else if (diff === 'Secret') { diffBase = 7; diffBonus = 4; }

          const storyKey = `${currentLevel}-${currentStoryNum}`;
          const newHistory = { ...progress.storyHistory };
          const previousBest = newHistory[storyKey]?.score || 0;
          const isFirstPass = previousBest < 80;
          const isFirstPerfect = previousBest < 100 && percentage === 100;

          if (isFirstPass) {
              baseGain = diffBase;
              if (currentStoryNum === 10) {
                  if (diff === 'Easy') levelBonus = 5;
                  else if (diff === 'Normal') levelBonus = 10;
                  else if (diff === 'Hard') levelBonus = 15;
                  else if (diff === 'Ultra') levelBonus = 25;
                  else if (diff === 'Secret') levelBonus = 50;
              }
          }
          if (isFirstPerfect) bonusGain = diffBonus;
          
          newHistory[storyKey] = { difficulty: progress.settings.difficulty, score: Math.max(previousBest, percentage), timestamp: Date.now() };
          let newTotalPerfect = progress.totalPerfectScores;
          if (isFirstPerfect) newTotalPerfect++;
          setProgress(p => ({ ...p, storyHistory: newHistory, totalPerfectScores: newTotalPerfect }));
      }

      const totalGain = baseGain + bonusGain + levelBonus;
      let nextStory = progress.unlockedStory;
      let nextLevel = progress.unlockedLevel;

      if (diff !== 'Void') {
          if (currentLevel === progress.unlockedLevel && currentStoryNum === progress.unlockedStory) {
            if (progress.unlockedStory < 10) nextStory = progress.unlockedStory + 1;
            else if (progress.unlockedLevel < 9) { nextLevel = progress.unlockedLevel + 1; nextStory = 1; }
          }
          if (currentLevel === 9 && currentStoryNum === 10) setShowEndGamePopup(true);
      }

      setProgress(p => ({
        ...p,
        wpm: p.wpm + totalGain,
        unlockedLevel: nextLevel,
        unlockedStory: nextStory,
        savedStories: updatedSavedStories,
        totalStoriesRead: (diff === 'Void' || (progress.storyHistory[`${currentLevel}-${currentStoryNum}`]?.score || 0) < 80) ? p.totalStoriesRead + 1 : p.totalStoriesRead,
        usedOptions: updatedUsedOptions
      }));
    } 
  };

  const handleNextStorySetup = () => {
     if (showEndGamePopup) return; 
     if (progress.settings.difficulty === 'Void') { startVoidStory(); return; }
     let targetLevel = currentLevel;
     let targetStory = currentStoryNum + 1;
     if (targetStory > 10) { targetLevel++; targetStory = 1; }
     if (targetLevel > 9) targetLevel = 9; 
     startStorySetup(targetLevel, targetStory);
  };

  const handleRetryStory = () => {
    if (showEndGamePopup) return;
    if (progress.settings.difficulty === 'Void') { startVoidStory(); return; }
    
    // If we have current parameters, generate a NEW story with them
    if (currentStoryParams) {
      generateActualStory(currentStoryParams.genre, currentStoryParams.twist, currentStoryParams.title);
    } else {
      const storyId = `${currentLevel}-${currentStoryNum}`;
      if (progress.savedStories[storyId]) setAppState('reading');
      else startStorySetup(currentLevel, currentStoryNum);
    }
  };

  const getVictoryMessage = (difficulty: Difficulty) => {
      switch(difficulty) {
          case 'Easy': return "You've mastered the basics! Ready for a real challenge?";
          case 'Normal': return "You are an amazing reader! The adventures get tougher now!";
          case 'Hard': return "Incredible! You have conquered the Hard mode!";
          case 'Ultra': return "LEGENDARY! You beat Ultra Mode! Are you the chosen one?";
          case 'Secret': return "COSMIC CONQUEROR! You have finished the game completely!";
          default: return "You are officially a Reading Legend!";
      }
  }

  const handleNewGamePlus = async () => {
      interact();
      setIsWarping(true);
      setShowEndGamePopup(false);
      if (progress.settings.difficulty === 'Secret') playSound('victory-secret'); else playSound('win'); 

      const currentDiff = progress.settings.difficulty;
      const updatedBeatenDiffs = Array.from(new Set([...progress.beatenDifficulties, currentDiff]));
      
      let nextDifficulty: Difficulty = currentDiff;
      if (currentDiff === 'Easy') nextDifficulty = 'Normal';
      else if (currentDiff === 'Normal') nextDifficulty = 'Hard';
      else if (currentDiff === 'Hard') nextDifficulty = 'Ultra';
      else if (currentDiff === 'Ultra') {
          if (progress.totalPerfectScores >= 90) nextDifficulty = 'Secret';
          else nextDifficulty = 'Ultra';
      }
      else if (currentDiff === 'Secret') nextDifficulty = 'Void';
      else if (currentDiff === 'Void') nextDifficulty = 'Void';

      await clearDB();
      setTimeout(() => {
          setProgress(p => ({
              ...p,
              settings: { ...p.settings, difficulty: nextDifficulty },
              unlockedLevel: 1, unlockedStory: 1, storyHistory: {}, savedStories: {},
              levelBackgrounds: {}, totalStoriesRead: 0, totalPerfectScores: 0,
              prestigeLevel: p.prestigeLevel + 1, beatenDifficulties: updatedBeatenDiffs
          }));
          setIsWarping(false);
          setViewingLevel(null);
          setAppState('main-menu');
          window.scrollTo(0, 0);
      }, 7000); 
  };

  const updateSettings = (key: keyof UserProgress['settings'], value: any) => {
    interact();
    setProgress(p => ({ ...p, settings: { ...p.settings, [key]: value } }));
  };

  const updateProgressRoot = (updates: Partial<UserProgress>) => setProgress(p => ({ ...p, ...updates }));

  const resetAllProgress = async () => {
    try {
      await clearDB();
    } catch (e) {
      console.error("Error clearing DB", e);
    }
    try {
      localStorage.removeItem('charly_progress');
    } catch (e) {
      console.error("Error clearing localStorage", e);
    }
    
    // Reset state instead of reloading
    setProgress({ 
      wpm: 0, unlockedLevel: 1, unlockedStory: 1, hasCompletedPlacement: false,
      settings: defaultSettings, storyHistory: {}, savedStories: {}, levelBackgrounds: {},
      totalStoriesRead: 0, totalPerfectScores: 0, prestigeLevel: 0, beatenDifficulties: [],
      usedOptions: { genres: [], twists: [], titles: [] }
    });
    setAppState('api-setup');
    setShowResetConfirm(false);
  };

  const getLevelColorClasses = (level: number, isNight: boolean) => {
      if (level <= 3) return isNight ? { border: 'border-[#5a7d65]', bg: 'bg-[#3d5a45]', text: 'text-[#a8cfb5]', pill: 'bg-[#2a4d35]' } : { border: 'border-safari-500', bg: 'bg-safari-100', text: 'text-safari-800', pill: 'bg-safari-200' };
      else if (level <= 6) return isNight ? { border: 'border-[#7d655a]', bg: 'bg-[#5a453d]', text: 'text-[#cfb5a8]', pill: 'bg-[#4d352a]' } : { border: 'border-orange-500', bg: 'bg-orange-100', text: 'text-orange-800', pill: 'bg-orange-200' };
      else return isNight ? { border: 'border-[#7d5a5a]', bg: 'bg-[#5a3d3d]', text: 'text-[#cfa8a8]', pill: 'bg-[#4d2a2a]' } : { border: 'border-red-500', bg: 'bg-red-100', text: 'text-red-800', pill: 'bg-red-200' };
  };

  const getBadgeIcon = (diff: Difficulty) => {
      switch(diff) {
          case 'Easy': return { icon: '🥉', label: 'Bronze' };
          case 'Normal': return { icon: '🥈', label: 'Silver' };
          case 'Hard': return { icon: '🥇', label: 'Gold' };
          case 'Ultra': return { icon: '💎', label: 'Platinum' };
          case 'Secret': return { icon: '🔮', label: 'Cosmic' };
          case 'Void': return { icon: '🌌', label: 'Void' };
          default: return { icon: '🎖️', label: 'Reeder' };
      }
  }

  const isUltra = progress.settings.difficulty === 'Ultra';
  const isSecret = progress.settings.difficulty === 'Secret';
  const isVoid = progress.settings.difficulty === 'Void';
  const isHard = progress.settings.difficulty === 'Hard';
  const styles = getModeStyles(progress.settings.difficulty, progress.settings.theme);

  const isUltraUnlocked = () => progress.beatenDifficulties.includes('Hard') || progress.settings.debugMode;
  const isSecretUnlocked = () => (progress.beatenDifficulties.includes('Ultra') && progress.totalPerfectScores >= 90) || progress.settings.debugMode;
  const isPerfectionist = progress.totalPerfectScores >= 90;

  const renderContent = () => {
    if (appState === 'api-setup') {
      return (
        <ApiSetupScreen 
          onComplete={(key) => {
            updateSettings('apiKey', key);
            setAppState('main-menu');
          }} 
          styles={styles} 
        />
      );
    }

    if (appState === 'main-menu') {
      return (
        <div className={`flex flex-col items-center justify-between py-12 min-h-full page-enter relative ${isUltra ? 'ultra-glow' : ''}`}>
           <style>{`
             .ultra-glow { box-shadow: inset 0 0 50px rgba(168, 85, 247, 0.4); }
             .secret-bg-layer { background: linear-gradient(135deg, #000000 0%, #1e1e2f 100%) !important; background-size: 200% 200%; animation: cosmicBG 10s ease infinite; }
             .void-bg-layer { background: #000000 !important; color: #a3a3a3 !important; }
             .ultra-bg-layer { background-image: linear-gradient(rgba(232, 121, 249, 0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(232, 121, 249, 0.1) 1px, transparent 1px); background-size: 40px 40px; background-position: center; mask-image: radial-gradient(circle, black 40%, transparent 80%); }
             @keyframes cosmicBG { 0% { background-position: 0% 50%; } 50% { background-position: 100% 50%; } 100% { background-position: 0% 50%; } }
           `}</style>
          {isSecret && <div className="absolute inset-0 z-0 secret-bg-layer"></div>}
          {isVoid && <div className="absolute inset-0 z-0 void-bg-layer"></div>}
          {isUltra && <div className="absolute inset-0 z-0 ultra-bg-layer pointer-events-none"></div>}
          {progress.settings.debugMode && <div className="absolute top-0 left-0 right-0 bg-red-500/90 text-white text-xs font-bold text-center py-1 z-50">DEBUG MODE ACTIVE: ALL LEVELS UNLOCKED</div>}

          <div className="text-center z-10 mt-8 relative w-full">
             {progress.prestigeLevel > 0 && (
                <div className="flex flex-col items-center mb-6 animate-in fade-in slide-in-from-top-4 duration-1000">
                    <div className={`${isVoid ? 'bg-white/20' : 'bg-black/10 dark:bg-white/10'} px-4 py-1 rounded-full mb-2 backdrop-blur-sm`}>
                        <span className={`font-bold uppercase tracking-[0.2em] opacity-70 ${isVoid ? 'text-xl text-white' : 'text-xs'}`}>Hall of Reeders</span>
                    </div>
                    <div className="flex gap-2 flex-wrap justify-center max-w-xs">
                        {progress.beatenDifficulties.length > 0 ? (
                            progress.beatenDifficulties.map((d, i) => (
                                <div key={i} className="flex flex-col items-center group cursor-help relative" title={`Beaten on ${d}`}>
                                    <span className={`filter drop-shadow-md hover:scale-125 transition-transform ${isVoid ? 'text-4xl' : 'text-3xl'}`}>{getBadgeIcon(d).icon}</span>
                                </div>
                            ))
                        ) : (
                             <div className="flex flex-col items-center" title="Legacy Champion">
                                <span className="text-3xl filter drop-shadow-md">👑</span>
                                <span className="text-[0.5rem] font-bold bg-red-500 text-white px-1 rounded-full absolute -top-1 -right-1">{progress.prestigeLevel}</span>
                            </div>
                        )}
                    </div>
                </div>
             )}
             <h1 className={`text-6xl md:text-8xl font-black font-['Fredoka'] tracking-tight drop-shadow-sm mb-2 ${isSecret ? 'text-transparent bg-clip-text bg-gradient-to-r from-emerald-500 to-cyan-500 animate-pulse font-tech' : ''} ${isUltra ? 'text-transparent bg-clip-text bg-gradient-to-r from-fuchsia-400 to-cyan-400 drop-shadow-[0_0_10px_rgba(232,121,249,0.5)]' : ''} ${isVoid ? 'text-gray-200' : ''}`} style={{ color: (isSecret || isVoid || isUltra) ? undefined : 'var(--text-primary)' }}>
               {isVoid ? "THE VOID" : "Charly Reeds"}
             </h1>
             <p className={`text-xl font-bold opacity-75 ${isUltra ? 'text-fuchsia-300' : ''} ${isSecret ? 'text-emerald-400 font-tech tracking-widest' : ''} ${isVoid ? 'text-white/60' : ''}`}>
                 {isVoid ? "There is no end." : (isSecret ? "CLASSIFIED MISSION" : "Adventures in Reading")}
             </p>
             {isSecret && <p className="text-xs font-tech text-emerald-600 mt-2 tracking-widest animate-pulse">/// ACCESS GRANTED ///</p>}
             {isVoid && <div className="mt-4 animate-pulse"><span className="text-xs font-bold text-gray-600 tracking-[0.3em]">VOID RESONANCE</span><div className="text-3xl font-black text-white">{progress.wpm} BPM</div></div>}
          </div>

          <div className="flex flex-col items-center gap-6 z-10 w-full max-w-sm px-4">
             <button onClick={handleStartRead} className={`group w-full h-32 rounded-3xl shadow-lg active:scale-95 transition-all duration-150 flex items-center justify-center border-b-8 animate-zoom-pulse ${styles.buttonPrimary} ${styles.glow}`}>
                <span className={`text-5xl font-black font-['Fredoka'] tracking-wide`}>{isVoid ? "ENTER" : "READ"}</span>
             </button>
             <button onClick={() => { interact(); setAppState('settings'); }} className={`w-full py-4 rounded-2xl font-bold text-xl transition active:scale-95 border-4 bg-[var(--card-bg)] ${isUltra ? 'border-fuchsia-400 text-fuchsia-400' : (isSecret ? 'border-emerald-800 text-emerald-600 font-tech' : 'border-slate-200 dark:border-slate-700 text-slate-400 dark:text-slate-300 hover:border-slate-400 hover:text-slate-600')}`}>SETTINGS</button>
          </div>
          <div className="relative z-10 mt-8 mb-8">
             <CharlyMascot scene="main" theme={progress.settings.theme} difficulty={progress.settings.difficulty} className="w-64 h-64 md:w-80 md:h-80" />
          </div>
        </div>
      );
    }
    if (appState === 'onboarding') return <div className="flex items-center justify-center p-4 min-h-screen"><WpmTest onComplete={handleWpmSet} currentWpm={progress.wpm} /></div>;
    if (appState === 'settings') return (
        <>
            <SettingsScreen 
                progress={progress} 
                updateSettings={updateSettings} 
                updateProgressRoot={updateProgressRoot} 
                onBack={() => { setViewingLevel(null); setAppState('main-menu'); window.scrollTo(0, 0); }} 
                isUltraUnlocked={isUltraUnlocked()} 
                isSecretUnlocked={isSecretUnlocked()} 
                onReset={() => setShowResetConfirm(true)} 
                onRetest={() => setAppState('onboarding')} 
                styles={styles} 
            />
            {showResetConfirm && (
                <div className="fixed inset-0 z-[10000] bg-black/90 flex items-center justify-center p-6 backdrop-blur-md animate-in fade-in zoom-in duration-300">
                    <div className="bg-white dark:bg-gray-800 max-w-sm w-full p-8 rounded-[3rem] text-center border-4 border-red-500 shadow-2xl">
                        <div className="text-6xl mb-4">⚠️</div>
                        <h2 className="text-2xl font-black mb-4 text-gray-900 dark:text-white font-['Fredoka']">ERASE EVERYTHING?</h2>
                        <p className="text-gray-600 dark:text-gray-300 mb-8 font-bold">This will permanently delete all your progress, stories, and parent locks. This cannot be undone!</p>
                        <div className="space-y-3">
                            <button onClick={() => { interact(); resetAllProgress(); }} className="w-full py-4 bg-red-500 text-white rounded-2xl font-black text-xl shadow-lg active:scale-95 transition hover:bg-red-600">YES, DELETE ALL</button>
                            <button onClick={() => { interact(); setShowResetConfirm(false); }} className="w-full py-4 bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-2xl font-bold text-xl active:scale-95 transition">CANCEL</button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
    
    if (appState === 'library') {
      const forceDark = ['Ultra', 'Secret', 'Void'].includes(progress.settings.difficulty);
      const isNight = progress.settings.theme === 'night' || forceDark;
      if (progress.settings.difficulty === 'Void') {
          return (
            <div className="min-h-screen bg-black flex flex-col items-center justify-center p-6 page-enter">
                <div className="text-center mb-12"><h1 className="text-6xl font-black text-gray-200 font-['Fredoka'] mb-4 tracking-widest">VOID MODE</h1><p className="text-gray-500 max-w-md mx-auto">Progress is an illusion. The stories here are infinite, difficult, and yield little reward.</p></div>
                <button onClick={() => { interact(); startVoidStory(); }} className="w-full max-w-sm h-48 bg-gray-900 border-4 border-gray-800 hover:border-gray-600 rounded-3xl flex flex-col items-center justify-center gap-4 transition-all hover:scale-105 active:scale-95 shadow-[0_0_50px_rgba(255,255,255,0.05)] group"><span className="text-6xl group-hover:animate-pulse">🌌</span><span className="text-2xl font-bold text-gray-400 group-hover:text-white tracking-widest">ENTER VOID</span></button>
                <button onClick={() => { interact(); setAppState('main-menu'); }} className="mt-12 text-gray-600 hover:text-white transition">Back to Menu</button>
            </div>
          );
      }
      return (
        <div className="pb-12 page-enter">
          <header className={`p-4 shadow-sm border-b-4 sticky top-0 z-20 ${styles.headerBg} ${styles.cardBorder}`}>
            <div className="max-w-4xl mx-auto flex justify-between items-center">
              <div className="flex items-center gap-3">
                <button onClick={() => { interact(); setAppState('main-menu'); }} className={`flex items-center gap-2 px-3 py-1 rounded-lg hover:bg-black/10 transition active:scale-95 ${styles.accentText}`}><span className="text-2xl">🔙</span><span className="font-bold text-sm hidden md:inline">Back</span></button>
                <h1 className={`text-xl md:text-2xl font-bold font-['Fredoka'] truncate ${isUltra || isSecret ? 'text-white' : ''}`}>Library</h1>
              </div>
              <div className="flex gap-4"><div className={`px-3 py-1 rounded-full font-bold text-sm flex items-center border ${styles.cardBorder} ${isUltra ? 'bg-fuchsia-900/20 text-fuchsia-300' : (isSecret ? 'bg-emerald-900/20 text-emerald-400' : 'bg-orange-100 dark:bg-orange-900/50 text-orange-600 dark:text-orange-300 border-orange-200 dark:border-orange-800')}`}>⚡ {progress.wpm} WPM</div></div>
            </div>
          </header>
          <main className="max-w-4xl mx-auto p-4 mt-6">
            <div className={`flex flex-col md:flex-row items-center justify-center gap-4 mb-12 bg-[var(--card-bg)] backdrop-blur p-8 rounded-3xl border-2 shadow-sm relative overflow-visible text-center md:text-left ${styles.cardBorder} ${styles.glow}`}>
              <div className="relative z-10 flex-grow flex flex-col items-center md:items-start">
                <h2 className={`text-4xl font-bold font-['Fredoka'] mb-2 ${isUltra ? (isNight ? 'text-fuchsia-400' : 'text-fuchsia-700') : (isSecret ? (isNight ? 'text-emerald-400 font-tech' : 'text-emerald-700 font-tech') : '')}`}>{viewingLevel ? `Level ${viewingLevel}` : "Your Library"}</h2>
                <p className={`opacity-75 text-lg mb-6 ${isSecret ? 'font-tech' : ''}`}>{viewingLevel ? "Select a story" : `Playing on ${progress.settings.difficulty} Mode`}</p>
                {viewingLevel && <button onClick={() => { interact(); setViewingLevel(null); }} className={`text-sm font-bold underline opacity-60 hover:opacity-100 ${isUltra ? (isNight ? 'text-fuchsia-300' : 'text-fuchsia-700') : (isSecret ? (isNight ? 'text-emerald-400' : 'text-emerald-700') : '')}`}>← Back to Levels</button>}
              </div>
              <div className="relative z-10 flex-shrink-0"><CharlyMascot scene="library" theme={progress.settings.theme} difficulty={progress.settings.difficulty} className="w-48 h-48 md:w-64 md:h-64" /></div>
            </div>
            {viewingLevel ? (
                <div className="space-y-4">
                    {[1,2,3,4,5,6,7,8,9,10].map(storyNum => {
                        const effectiveLevel = progress.unlockedLevel;
                        const effectiveStory = progress.unlockedStory;
                        const isLocked = !progress.settings.debugMode && (viewingLevel > effectiveLevel || (viewingLevel === effectiveLevel && storyNum > effectiveStory));
                        const isBeingGenerated = tempTitleReveal && viewingLevel === currentLevel && storyNum === currentStoryNum;
                        const storyId = `${viewingLevel}-${storyNum}`;
                        const savedData = progress.savedStories[storyId];
                        const history = progress.storyHistory[storyId];
                        let displayTitle = "Locked";
                        if (!isLocked) displayTitle = "Choose Your Adventure!";
                        if (savedData) displayTitle = savedData.title;
                        if (isBeingGenerated) displayTitle = `Loading: ${tempTitleReveal}`;
                        let colors = getLevelColorClasses(viewingLevel, isNight);
                        if (!isLocked) {
                            if (isUltra) colors = { border: isNight ? 'border-fuchsia-400' : 'border-fuchsia-600', bg: isNight ? 'bg-black/40' : 'bg-fuchsia-50', text: isNight ? 'text-fuchsia-200' : 'text-fuchsia-900', pill: isNight ? 'bg-fuchsia-800 text-fuchsia-200' : 'bg-fuchsia-200 text-fuchsia-900' };
                            else if (isSecret) colors = { border: isNight ? 'border-emerald-700' : 'border-emerald-800', bg: isNight ? 'bg-black/60' : 'bg-emerald-50', text: isNight ? 'text-emerald-400 font-tech' : 'text-emerald-900 font-tech', pill: isNight ? 'bg-emerald-900 text-emerald-400' : 'bg-emerald-200 text-emerald-900' };
                            else if (isHard) colors = { border: isNight ? 'border-red-800' : 'border-red-400', bg: isNight ? 'bg-red-950/30' : 'bg-red-50', text: isNight ? 'text-red-200' : 'text-red-800', pill: isNight ? 'bg-red-900' : 'bg-red-200' };
                            else if (isNight) colors = { border: 'border-indigo-500', bg: 'bg-[#24243e]', text: 'text-indigo-200', pill: 'bg-indigo-600' };
                        }
                        return (
                            <button key={storyNum} id={`story-card-${storyNum}`} disabled={isLocked || (tempTitleReveal !== null)} onClick={() => { interact(); startStorySetup(viewingLevel, storyNum); }} className={`w-full p-6 rounded-2xl border-2 transition-all flex items-center justify-between group text-left ${isLocked ? 'bg-gray-100 dark:bg-gray-800 border-gray-200 dark:border-gray-700 opacity-60 cursor-not-allowed' : `${colors.bg} ${colors.border} shadow-sm hover:shadow-md active:scale-[0.99] hover:border-l-8 disabled:opacity-50 disabled:cursor-wait`}`} style={{ color: isLocked ? undefined : (isUltra ? (isNight ? '#e879f9' : '#4a044e') : (isSecret ? (isNight ? '#34d399' : '#064e3b') : 'var(--text-primary)')) }}>
                                <div className="flex items-center gap-4"><div className={`w-12 h-12 rounded-full flex items-center justify-center font-bold text-lg ${isLocked ? 'bg-gray-200 dark:bg-gray-700 text-gray-500' : `${colors.pill} ${isSecret || isUltra || isHard ? '' : colors.text}`}`}>{storyNum}</div><div><h3 className={`text-xl font-bold ${isLocked ? 'opacity-50' : ''}`}>{displayTitle} {isBeingGenerated && <span className="animate-pulse">...</span>}</h3>{history && (<div className="text-sm font-bold opacity-60">High Score: <span className={history.score === 100 ? 'text-orange-500' : ''}>{history.score}%</span></div>)}</div></div>{!isLocked && !tempTitleReveal && <span className="text-2xl group-hover:translate-x-2 transition-transform">➔</span>}
                            </button>
                        )
                    })}
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(level => {
                    const effectiveLevel = progress.unlockedLevel;
                    const effectiveStory = progress.unlockedStory;
                    const isLocked = !progress.settings.debugMode && level > effectiveLevel;
                    const storiesComplete = progress.settings.debugMode ? 10 : (level < effectiveLevel ? 10 : (level === effectiveLevel ? effectiveStory - 1 : 0));
                    let colors = getLevelColorClasses(level, isNight);
                    if (!isLocked) {
                        if (isUltra) colors = { border: isNight ? 'border-fuchsia-500/50' : 'border-fuchsia-600', bg: isNight ? 'bg-fuchsia-950/40' : 'bg-fuchsia-100', text: isNight ? 'text-fuchsia-200' : 'text-fuchsia-900', pill: isNight ? 'bg-fuchsia-900 border border-fuchsia-500 text-fuchsia-200' : 'bg-fuchsia-200 border border-fuchsia-400 text-fuchsia-900' };
                        else if (isSecret) colors = { border: isNight ? 'border-emerald-700' : 'border-emerald-800', bg: isNight ? 'bg-black/60' : 'bg-emerald-50', text: isNight ? 'text-emerald-400 font-tech' : 'text-emerald-900 font-tech', pill: isNight ? 'bg-emerald-900 border border-emerald-500 text-emerald-400' : 'bg-emerald-200 border border-emerald-500 text-emerald-900' };
                        else if (isHard) colors = { border: isNight ? 'border-red-800' : 'border-red-400', bg: isNight ? 'bg-red-950/50' : 'bg-red-50/90', text: isNight ? 'text-red-200' : 'text-red-800', pill: isNight ? 'bg-red-900' : 'bg-red-200' };
                    }
                    const bgImage = progress.levelBackgrounds[level];
                    return (
                    <div key={level} className={`relative p-6 rounded-3xl border-4 transition-all overflow-hidden ${isLocked ? 'bg-gray-100 dark:bg-gray-800 border-gray-200 dark:border-gray-700 opacity-70' : `${colors.bg} bg-opacity-90 ${colors.border} cursor-pointer shadow-sm hover:shadow-md`}`}>
                        {!isLocked && bgImage && (<div className="absolute inset-0 z-0 pointer-events-none mix-blend-multiply dark:mix-blend-overlay opacity-30" style={{ backgroundImage: `url(${bgImage})`, backgroundSize: 'cover', backgroundPosition: 'center' }}></div>)}
                        {isLocked && (<div className="absolute inset-0 flex items-center justify-center z-10 bg-gray-100/50 dark:bg-black/50 backdrop-blur-[1px] rounded-2xl"><span className="text-4xl bg-white dark:bg-gray-800 p-4 rounded-full shadow-sm">🔒</span></div>)}
                        <div className="relative z-10"><div className="flex justify-between items-start mb-4"><span className={`text-sm font-bold px-3 py-1 rounded-full ${isLocked ? 'bg-gray-200 dark:bg-gray-700 text-gray-500' : `${colors.pill} ${isUltra || isSecret || isHard ? '' : colors.text}`}`}>Level {level}</span></div><h3 className={`text-xl font-bold mb-2 font-['Fredoka'] ${isUltra ? (isNight ? 'text-fuchsia-300' : 'text-fuchsia-900') : (isSecret ? (isNight ? 'text-emerald-300' : 'text-emerald-900') : '')}`}>{level < 4 ? 'Beginner' : level < 7 ? 'Intermediate' : 'Advanced'} Adventures</h3><div className="w-full bg-white/50 dark:bg-black/20 rounded-full h-3 mb-6"><div className={`h-3 rounded-full transition-all ${isUltra ? 'bg-fuchsia-500' : (isSecret ? 'bg-emerald-500' : colors.pill)}`} style={{ width: `${(storiesComplete / 10) * 100}%` }}></div><div className="text-right text-xs mt-1 font-bold opacity-50">{storiesComplete}/10</div></div><button disabled={isLocked} onClick={() => { interact(); setViewingLevel(level); }} className={`w-full py-3 rounded-xl font-bold text-lg shadow-sm active:translate-y-1 active:scale-95 transition-all ${isLocked ? 'bg-gray-200 dark:bg-gray-700 text-gray-400' : `bg-white dark:bg-black/30 text-[var(--text-primary)] hover:bg-white/80 ${isUltra ? (isNight ? 'text-fuchsia-600' : 'text-fuchsia-800') : (isSecret ? (isNight ? 'text-emerald-600' : 'text-emerald-800') : '')}`}`}>{isLocked ? 'Locked' : 'Open Level'}</button></div></div>
                    );
                })}
                </div>
            )}
          </main>
        </div>
      );
    }

    if (appState === 'story-setup' && storyOptions) return <StorySetup level={currentLevel} difficulty={progress.settings.difficulty} theme={progress.settings.theme} options={storyOptions} onGenerate={handleTitleChosen} onBack={() => setAppState('library')} onRefresh={handleRefreshStoryOptions} styles={styles} />;
    
    if (appState === 'generating') {
      const isNight = progress.settings.theme === 'night';
      const containerClass = styles?.bgGradient ? `bg-gradient-to-b ${styles.bgGradient}` : (isNight ? 'bg-gradient-to-br from-indigo-950 to-purple-950' : 'bg-[var(--bg-primary)]');
      return (
        <div className={`min-h-screen ${containerClass} flex flex-col items-center justify-center p-8 text-center page-enter relative overflow-hidden`} style={{ background: styles?.bgGradient ? undefined : (styles ? undefined : 'var(--bg-primary)') }}>
          {/* Decorative background elements */}
          <div className={`absolute top-1/4 -left-20 w-64 h-64 ${styles?.loadingGlow || 'bg-theme'} opacity-10 rounded-full blur-3xl animate-pulse`}></div>
          <div className={`absolute bottom-1/4 -right-20 w-96 h-96 ${styles?.loadingGlow || 'bg-orange-400'} opacity-10 rounded-full blur-3xl animate-pulse-slow`}></div>
          
          <div className={`relative z-10 rounded-[3rem] p-12 mb-8 transition-all duration-500 flex flex-col items-center justify-center ${isNight || isUltra || isSecret ? 'bg-white/5 border-4 border-white/10 backdrop-blur-md' : 'bg-white/30 border-4 border-white/50 backdrop-blur-sm shadow-xl'}`}>
            <div className="relative flex items-center justify-center">
              <div className={`absolute inset-0 ${styles?.loadingGlow || 'bg-theme'} opacity-20 rounded-full blur-xl animate-ping`}></div>
              <CharlyMascot scene="loading" difficulty={progress.settings.difficulty} theme={progress.settings.theme} className="w-40 h-40 animate-bounce relative z-10 mx-auto" />
            </div>
            
            <div className="mt-8 space-y-4">
              <h2 className={`text-4xl font-black font-['Fredoka'] animate-pulse max-w-lg ${styles?.accentText || (isNight ? 'text-white' : 'text-theme')}`}>
                {loadingMsg}
              </h2>
              <div className="flex justify-center gap-2">
                <div className="w-3 h-3 bg-current rounded-full animate-bounce [animation-delay:-0.3s] opacity-60"></div>
                <div className="w-3 h-3 bg-current rounded-full animate-bounce [animation-delay:-0.15s] opacity-60"></div>
                <div className="w-3 h-3 bg-current rounded-full animate-bounce opacity-60"></div>
              </div>
            </div>
          </div>
        </div>
      );
    }

    if (appState === 'reading' && generatedContent) return <Reader content={generatedContent} wpm={progress.wpm} settings={progress.settings} level={currentLevel} storyNum={currentStoryNum} onFinished={handleReadingFinished} onExit={(to) => setAppState(to)} onSkip={() => setAppState('quiz')} styles={styles} isStreaming={isStreaming} />;

    if (appState === 'quiz' && generatedContent) {
      let popupMascot: MascotScene = 'platinum';
      if (progress.settings.difficulty === 'Ultra') popupMascot = 'ultra-victory';
      if (progress.settings.difficulty === 'Secret') popupMascot = 'secret-victory';
      return (
        <div className="relative">
            {showEndGamePopup && (
                <div className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-6 backdrop-blur-md animate-in fade-in zoom-in duration-500">
                    <Particles type="platinum" />
                    <div className={`bg-[var(--card-bg)] max-w-xl w-full p-8 rounded-[3rem] text-center border-8 shadow-[0_0_80px_rgba(255,215,0,0.6)] animate-shake ${progress.settings.difficulty === 'Ultra' ? 'border-fuchsia-500 shadow-[0_0_80px_rgba(232,121,249,0.5)]' : (progress.settings.difficulty === 'Secret' ? 'border-emerald-500 shadow-[0_0_80px_rgba(16,185,129,0.5)]' : 'border-yellow-400')}`}>
                        <CharlyMascot scene={popupMascot} difficulty={progress.settings.difficulty} theme={progress.settings.theme} className="w-48 h-48 mx-auto mb-6 hover:scale-110 transition-transform" />
                        <h1 className="text-4xl md:text-6xl font-black mb-4 text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 via-orange-500 to-red-500 font-['Fredoka'] drop-shadow-sm">VICTORY!</h1>
                        <p className="text-xl md:text-2xl font-bold mb-8 opacity-90 leading-relaxed text-[var(--text-primary)]">"{getVictoryMessage(progress.settings.difficulty)}"</p>
                        <button onClick={handleNewGamePlus} className="w-full py-6 bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 hover:from-indigo-500 hover:to-pink-500 text-white font-black text-3xl rounded-3xl shadow-2xl transform hover:scale-105 active:scale-95 transition-all border-b-8 border-indigo-900 animate-pulse-slow relative overflow-hidden group"><span className="relative z-10">START NEW GAME +</span><div className="absolute inset-0 bg-white/20 transform -skew-x-12 -translate-x-full group-hover:translate-x-full transition-transform duration-1000"></div></button>
                        <div className="mt-6 bg-black/10 dark:bg-white/10 p-4 rounded-xl border-2 border-dashed border-gray-400/50"><p className="text-sm font-bold opacity-80 uppercase tracking-widest mb-1 text-[var(--text-primary)]">NEW GAME + FEATURES</p><p className="text-xs opacity-60 text-[var(--text-primary)]">Keep WPM Speed • Reset Levels • Earn Badge • Unlock Secret Modes</p>{progress.settings.difficulty === 'Ultra' && !isPerfectionist && (<p className="mt-2 text-xs font-bold text-yellow-600 dark:text-yellow-400 animate-pulse">💡 Hint: To unlock the final secret, you must achieve PERFECTION (100%) in every single story...</p>)}</div>
                    </div>
                </div>
            )}
            {showQuotaPopup && (
                <div className="fixed inset-0 z-[10000] bg-black/90 flex items-center justify-center p-6 backdrop-blur-md animate-in fade-in zoom-in duration-300">
                    <div className="bg-white dark:bg-gray-800 max-w-sm w-full p-8 rounded-[3rem] text-center border-4 border-orange-500 shadow-2xl">
                        <div className="text-6xl mb-4">😴</div>
                        <h2 className="text-2xl font-black mb-4 text-gray-900 dark:text-white font-['Fredoka']">CHARLY IS TIRED!</h2>
                        <p className="text-gray-600 dark:text-gray-300 mb-8 font-bold">
                            Crikey! Charly has been imagining so many stories that he needs a little swamp nap. 
                            <br/><br/>
                            Take a rest from reading and return tomorrow for more adventures!
                        </p>
                        <button onClick={() => setShowQuotaPopup(false)} className="w-full py-4 bg-orange-500 text-white rounded-2xl font-black text-xl shadow-lg active:scale-95 transition hover:bg-orange-600">
                            GOT IT, MATE!
                        </button>
                    </div>
                </div>
            )}
            <Quiz questions={generatedContent.quiz} commentaries={generatedContent.commentaries} onComplete={handleQuizComplete} onNextStorySetup={handleNextStorySetup} onRetry={handleRetryStory} onExit={(to) => setAppState(to)} progress={progress} isFinalStory={currentStoryNum === 10} level={currentLevel} storyNum={currentStoryNum} styles={styles} />
        </div>
      );
    }
    
    // Default fallback to prevent blank screen if no other state matches
    setTimeout(() => setAppState('main-menu'), 0);
    return null;
  };

  return (
    <>
        {isWarping && (<div className={`fixed inset-0 z-[200] flex items-center justify-center overflow-hidden ${styles.bgGradient ? `bg-gradient-to-b ${styles.bgGradient}` : 'bg-black'}`}><style>{`@keyframes warp { 0% { transform: scale(1) rotate(0deg); opacity: 0; } 50% { opacity: 1; } 100% { transform: scale(20) rotate(180deg); opacity: 0; } } .warp-tunnel { position: absolute; width: 100vw; height: 100vh; background: radial-gradient(circle, transparent 20%, #4f46e5 20%, #818cf8 40%, transparent 40%, transparent 60%, #c084fc 60%, #e879f9 80%, transparent 80%); background-size: 200% 200%; animation: warp 2s infinite linear; }`}</style>{progress.settings.difficulty === 'Secret' || progress.settings.difficulty === 'Void' ? (<div className="absolute inset-0 flex flex-col items-center justify-center z-[210]"><CharlyMascot scene="void-warp" theme="night" difficulty={progress.settings.difficulty} className="w-64 h-64 animate-spin mb-8" /><h1 className="text-white font-black text-4xl animate-pulse text-center max-w-lg leading-tight font-tech">GETTING SUCKED INTO THE VOID...</h1></div>) : (<><div className="warp-tunnel" style={{ filter: isUltra ? 'hue-rotate(90deg)' : 'none' }}></div><div className="warp-tunnel" style={{ animationDelay: '0.5s', filter: isUltra ? 'hue-rotate(90deg)' : 'none' }}></div><div className="warp-tunnel" style={{ animationDelay: '1s', filter: isUltra ? 'hue-rotate(90deg)' : 'none' }}></div><div className={`relative z-[210] font-black text-4xl animate-pulse ${isUltra ? 'text-fuchsia-200' : 'text-white'}`}>WARPING TO START...</div></>)}</div>)}
        <div ref={appFrameRef} className={`app-frame ${styles.appFrameBorder}`}>{renderContent()}</div>
    </>
  );
};

// ... Sub Components ...

const ApiSetupScreen: React.FC<{
  onComplete: (key: string) => void;
  styles: any;
}> = ({ onComplete, styles }) => {
  const [keyInput, setKeyInput] = useState("");
  const [isCopied, setIsCopied] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  // Check clipboard periodically when in this screen
  useEffect(() => {
    const checkClipboard = async () => {
      try {
        const text = await navigator.clipboard.readText();
        if (text && text.length > 20 && text.startsWith('AIza')) { // Basic heuristic for Gemini key
          setKeyInput(text);
          setIsCopied(true);
        }
      } catch (err) {
        // Ignore clipboard read errors (user might not have granted permission yet)
      }
    };

    const interval = setInterval(checkClipboard, 1000);
    
    // Also check on window focus
    const onFocus = () => checkClipboard();
    window.addEventListener('focus', onFocus);

    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', onFocus);
    };
  }, []);

  const handleSave = () => {
    if (keyInput.trim().length > 10) {
      setErrorMsg("");
      onComplete(keyInput.trim());
    } else {
      setErrorMsg("Please enter a valid Reading Key.");
      setTimeout(() => setErrorMsg(""), 3000);
    }
  };

  const openBrowser = () => {
    window.open('https://aistudio.google.com/apikey', '_blank');
  };

  return (
    <div className={`min-h-screen flex flex-col items-center justify-center p-6 ${styles.bgGradient ? `bg-gradient-to-b ${styles.bgGradient}` : 'bg-safari-100 dark:bg-gray-900'}`}>
      
      {/* Charly Mascot - Outside the card */}
      <div className="w-full max-w-md flex justify-end mb-[-1.5rem] relative z-10 pr-4">
        <div className="w-32 h-32 rotate-6">
           <CharlyMascot scene="onboarding" theme="day" difficulty="Normal" className="w-full h-full drop-shadow-lg" />
        </div>
      </div>

      <div className="max-w-md w-full bg-white dark:bg-gray-800 rounded-3xl shadow-xl p-8 relative border-4 border-orange-200 dark:border-gray-700">
        
        <h1 className="text-3xl font-black mb-2 text-orange-600 dark:text-orange-400 font-['Fredoka'] relative z-10">
          G'day, Reeder!
        </h1>
        
        <p className="text-gray-700 dark:text-gray-300 font-bold mb-6 relative z-10 text-lg leading-relaxed">
          I'm Charly! To unlock the magic library and start our reading adventure, we need to find a special <span className="text-blue-500">Reading Key</span>! 
          <br/><br/>
          <span className="text-sm opacity-80 bg-orange-50 dark:bg-gray-700 p-2 rounded-lg block border border-orange-100 dark:border-gray-600">
            ⚠️ <strong className="text-orange-600 dark:text-orange-400">Ask a "Big Reeder" (parent) for help!</strong>
          </span>
        </p>

        {errorMsg && <div className="mb-4 p-3 bg-red-100 text-red-700 rounded-xl font-bold animate-in fade-in relative z-10">{errorMsg}</div>}

        <div className="space-y-6 relative z-10">
          <div className="bg-blue-50 dark:bg-blue-900/30 p-4 rounded-2xl border-2 border-blue-100 dark:border-blue-800">
            <h3 className="font-black text-blue-800 dark:text-blue-300 mb-2 flex items-center gap-2">
              <span className="bg-blue-500 text-white w-6 h-6 rounded-full flex items-center justify-center text-sm">1</span>
              The Quest for the Key
            </h3>
            <p className="text-sm text-blue-700 dark:text-blue-200 mb-3 font-medium">
              Tap the button below to open a magical portal (your browser, Chrome is best!). Sign in with a Google account and tap the shiny "Create API key" button. It's completely free and gives you heaps of reading magic!
            </p>
            <button 
              onClick={openBrowser}
              className="w-full bg-blue-500 hover:bg-blue-600 text-white font-bold py-3 px-4 rounded-xl transition-transform active:scale-95 shadow-md flex items-center justify-center gap-2"
            >
              <span>✨</span> Open AI Studio Portal
            </button>
          </div>

          <div className="bg-green-50 dark:bg-green-900/30 p-4 rounded-2xl border-2 border-green-100 dark:border-green-800">
            <h3 className="font-black text-green-800 dark:text-green-300 mb-2 flex items-center gap-2">
              <span className="bg-green-500 text-white w-6 h-6 rounded-full flex items-center justify-center text-sm">2</span>
              Unlock the Library
            </h3>
            <p className="text-sm text-green-700 dark:text-green-200 mb-3 font-medium">
              Once you have your shiny new key, copy it! We'll try to magically grab it when you come back, or you can paste it right here:
            </p>
            <input 
              type="text" 
              placeholder="Paste Reading Key here..." 
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              className="w-full p-3 rounded-xl border-2 border-green-200 dark:border-green-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white font-mono text-sm focus:border-green-500 outline-none transition-colors"
            />
            {isCopied && (
              <p className="text-xs text-green-600 dark:text-green-400 mt-2 font-bold animate-pulse">
                ✨ Key detected from clipboard!
              </p>
            )}
          </div>

          <button 
            onClick={handleSave}
            disabled={keyInput.length < 10}
            className={`w-full py-4 rounded-2xl font-black text-xl shadow-lg transition-all ${
              keyInput.length > 10 
                ? 'bg-orange-500 hover:bg-orange-600 text-white active:scale-95' 
                : 'bg-gray-200 dark:bg-gray-700 text-gray-400 cursor-not-allowed'
            }`}
          >
            START ADVENTURE!
          </button>
          
          <div className="mt-6 p-4 bg-orange-50 dark:bg-orange-900/20 border-2 border-orange-200 dark:border-orange-800 rounded-2xl text-center">
            <p className="text-xs text-orange-800 dark:text-orange-300 font-black mb-1 uppercase tracking-wider">
              Parents/Adults
            </p>
            <p className="text-sm text-orange-700 dark:text-orange-200 font-bold leading-relaxed">
              By starting our adventure, you agree to our <a href="https://sites.google.com/view/charly-reeds-terms-conditions/home?read_current=1" target="_blank" rel="noopener noreferrer" className="underline font-black hover:text-orange-500">Terms & Conditions</a>. 
              It's super important to read them first!
            </p>
          </div>
          
          <p className="text-center text-[10px] text-gray-400 dark:text-gray-500 font-medium mt-4">
            🔒 Never share your Reading Key with anyone else!
          </p>
        </div>
      </div>
    </div>
  );
};

const SettingsScreen: React.FC<{
  progress: UserProgress, updateSettings: (k: keyof UserProgress['settings'], v: any) => void, updateProgressRoot: (u: Partial<UserProgress>) => void, onBack: () => void, isUltraUnlocked: boolean, isSecretUnlocked: boolean, onReset: () => void, onRetest: () => void, styles: any
}> = ({ progress, updateSettings, updateProgressRoot, onBack, isUltraUnlocked, isSecretUnlocked, onReset, onRetest, styles }) => {
  const [locked, setLocked] = useState(progress.settings.parentLockEnabled);
  const [pinInput, setPinInput] = useState("");
  const [setupPin, setSetupPin] = useState("");
  const [manualWpm, setManualWpm] = useState(progress.wpm);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const handleUnlock = () => { 
    if (pinInput === progress.settings.parentPin) { 
      setLocked(false); 
      setPinInput(""); 
      setErrorMsg(""); 
    } else {
      setErrorMsg("Incorrect PIN");
      setTimeout(() => setErrorMsg(""), 3000);
    }
  };

  const handleEnableLock = () => { 
    if (setupPin.length === 4) { 
      updateSettings('parentPin', setupPin); 
      updateSettings('parentLockEnabled', true); 
      setLocked(true); 
      setSetupPin(""); 
      setErrorMsg("");
    } else {
      setErrorMsg("PIN must be 4 digits");
      setTimeout(() => setErrorMsg(""), 3000);
    }
  };

  const handleWpmChange = (e: React.ChangeEvent<HTMLInputElement>) => { setManualWpm(parseInt(e.target.value)); };

  const saveWpm = () => { 
    if (manualWpm >= 40 && manualWpm <= 500) { 
      updateProgressRoot({ wpm: manualWpm, hasCompletedPlacement: true }); 
      setSuccessMsg("WPM Updated & Speed Test Skipped");
      setTimeout(() => setSuccessMsg(""), 3000);
    } 
  };
  const containerStyle = locked ? { height: '100vh', overflow: 'hidden' } : { minHeight: '100%' };
  const isVoid = progress.settings.difficulty === 'Void';
  
  const [showApiKey, setShowApiKey] = useState(false);
  const [showClearKeyConfirm, setShowClearKeyConfirm] = useState(false);
  const [appVersion, setAppVersion] = useState("1.0.0");

  useEffect(() => {
    fetch('/version.txt')
      .then(res => res.text())
      .then(text => setAppVersion(text.trim()))
      .catch(() => setAppVersion("1.0.0"));
  }, []);
  
  // Define available fonts dynamically
  const fontOptions = [
      { val: 'Nunito', label: 'Nunito (Sans)' }, 
      { val: 'Georgia', label: 'Georgia (Serif)' }, 
      { val: 'Courier New', label: 'Courier (Mono)' }
  ];
  
  // Only show Tech font if Secret difficulty is unlocked
  if (isSecretUnlocked) {
      fontOptions.push({ val: 'Share Tech Mono', label: 'Alien/Tech (Mono)' });
  }

  return (
    <div className={`p-6 page-enter ${styles.bgGradient ? `bg-gradient-to-b ${styles.bgGradient} min-h-screen` : ''}`} style={containerStyle}>
      {locked && (<div className="fixed inset-0 z-[9999] bg-black/80 flex flex-col items-center justify-center p-8 backdrop-blur-xl animate-in fade-in duration-300"><div className="bg-white dark:bg-gray-800 p-8 rounded-3xl text-center shadow-2xl max-w-sm w-full"><div className="mb-4 text-5xl">🔒</div><h3 className="text-2xl font-bold mb-6 text-gray-800 dark:text-white">Parent Lock Active</h3><input type="password" maxLength={4} placeholder="PIN" value={pinInput} onChange={(e) => setPinInput(e.target.value)} className="text-center text-3xl tracking-[0.5em] p-3 border-2 border-gray-300 focus:border-theme rounded-xl w-full bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white outline-none mb-6 font-mono" /><button onClick={handleUnlock} className="w-full btn-primary py-3 rounded-xl font-bold text-lg shadow-lg active:scale-95 transition">Unlock</button></div></div>)}
      <div className="max-w-2xl mx-auto">
        <button onClick={() => { interact(); onBack(); }} className={`mb-4 opacity-50 hover:opacity-100 font-bold active:scale-95 transition-transform ${styles.accentText || 'text-[var(--text-primary)]'}`}>← Back to Menu</button>
        <h1 className={`text-4xl font-bold mb-8 font-['Fredoka'] ${styles.accentText || 'text-[var(--text-primary)]'}`}>Settings</h1>
        
        {errorMsg && <div className="mb-4 p-4 bg-red-100 text-red-700 rounded-xl font-bold animate-in fade-in">{errorMsg}</div>}
        {successMsg && <div className="mb-4 p-4 bg-green-100 text-green-700 rounded-xl font-bold animate-in fade-in">{successMsg}</div>}

        <div className={`bg-[var(--card-bg)] backdrop-blur p-8 rounded-3xl shadow-sm space-y-8 relative border-2 ${styles.cardBorder || 'border-transparent'}`}>
          {/* Settings Mascot in Corner */}
          <div className="absolute -top-12 -right-4 md:-right-8 rotate-[15deg] z-10">
            <CharlyMascot scene="settings" difficulty={progress.settings.difficulty} theme={progress.settings.theme} className="w-24 h-24 md:w-32 md:h-32" />
          </div>
          <div><h2 className="text-xl font-bold mb-4 opacity-80" style={{ color: 'var(--text-primary)' }}>Audio</h2><button onClick={() => updateSettings('soundEnabled', !progress.settings.soundEnabled)} className={`flex items-center gap-3 px-6 py-4 rounded-xl border-2 font-bold w-full transition active:scale-95 ${progress.settings.soundEnabled ? (styles.buttonPrimary ? styles.buttonPrimary : 'bg-sky-50 dark:bg-slate-800 border-sky-500 text-sky-700') : 'border-gray-300 bg-gray-50 dark:bg-gray-800 text-gray-500'}`}><span className="text-3xl">{progress.settings.soundEnabled ? '🔊' : '🔇'}</span><span className="text-lg">Sound Effects: {progress.settings.soundEnabled ? 'ON' : 'OFF'}</span></button></div>
          <div><h2 className="text-xl font-bold mb-4 opacity-80" style={{ color: 'var(--text-primary)' }}>App Theme</h2><div className="flex gap-4"><button onClick={() => updateSettings('theme', 'day')} className={`px-4 py-2 rounded-xl border-2 font-bold active:scale-95 transition-transform ${progress.settings.theme === 'day' ? 'bg-orange-100 border-orange-400 text-orange-700' : 'border-gray-200 dark:border-gray-600'}`}>☀️ Day Time</button><button onClick={() => updateSettings('theme', 'night')} className={`px-4 py-2 rounded-xl border-2 font-bold active:scale-95 transition-transform ${progress.settings.theme === 'night' ? 'bg-indigo-900 border-indigo-500 text-indigo-100' : 'border-gray-200 dark:border-gray-600'}`}>🌙 Night Time</button></div>{['Ultra', 'Secret', 'Void'].includes(progress.settings.difficulty) && <p className="text-xs font-bold mt-2 opacity-60" style={{ color: 'var(--text-primary)' }}>* Theme is forced to Night Time for {progress.settings.difficulty} mode.</p>}</div>
          {!isVoid && (<div><h2 className="text-xl font-bold mb-4 opacity-80" style={{ color: 'var(--text-primary)' }}>Difficulty</h2><div className="flex flex-wrap gap-2">{['Easy', 'Normal', 'Hard'].map((d) => (<button key={d} onClick={() => updateSettings('difficulty', d)} className={`px-4 py-2 rounded-lg border-2 font-bold active:scale-95 transition-transform ${progress.settings.difficulty === d ? 'border-theme bg-safari-100 dark:bg-indigo-900 text-theme' : 'border-gray-200 dark:border-gray-600 opacity-60'}`}>{d}</button>))}<button onClick={() => isUltraUnlocked && updateSettings('difficulty', 'Ultra')} className={`px-4 py-2 rounded-lg border-2 font-bold flex items-center gap-1 active:scale-95 transition-transform ${!isUltraUnlocked ? 'opacity-50 cursor-not-allowed border-gray-200 dark:border-gray-600' : (progress.settings.difficulty === 'Ultra' ? 'border-purple-500 bg-purple-50 dark:bg-purple-900 text-purple-700 dark:text-purple-200' : 'border-purple-200 dark:border-purple-900 text-purple-400')}`}>{!isUltraUnlocked && <span>🔒</span>} Ultra</button><button onClick={() => isSecretUnlocked && updateSettings('difficulty', 'Secret')} className={`px-4 py-2 rounded-lg border-2 font-bold flex items-center gap-1 active:scale-95 transition-transform ${!isSecretUnlocked ? 'opacity-50 cursor-not-allowed border-gray-200 dark:border-gray-600' : (progress.settings.difficulty === 'Secret' ? 'border-black bg-gray-800 text-white' : 'border-gray-400 text-gray-600')}`}>{!isSecretUnlocked && <span>🔒</span>} ???</button></div></div>)}
          <div className="pt-4 mt-4 border-t border-gray-200 dark:border-gray-700"><div className="flex items-center justify-between"><label className="font-bold opacity-70" style={{ color: 'var(--text-primary)' }}>🐛 Developer Mode</label><input type="checkbox" checked={progress.settings.debugMode} onChange={(e) => updateSettings('debugMode', e.target.checked)} className="w-6 h-6 accent-[var(--accent-color)]" /></div></div>
          
          {progress.settings.parentLockEnabled && (<div className="p-4 bg-orange-50/50 dark:bg-orange-900/20 rounded-xl border border-orange-100 dark:border-orange-900 mt-4"><h2 className="text-lg font-bold mb-2 text-orange-800 dark:text-orange-200">Manual WPM Override</h2><div className="flex items-center gap-4"><input type="number" min="40" max="500" value={manualWpm} onChange={handleWpmChange} className="w-24 p-2 rounded-lg border text-lg font-bold text-black bg-white outline-none" /><button onClick={saveWpm} className="bg-orange-500 text-white px-4 py-2 rounded-lg font-bold text-sm">Update WPM</button></div></div>)}
          <div><div className="flex items-center justify-between bg-slate-50/50 dark:bg-black/20 p-4 rounded-xl border border-slate-100 dark:border-slate-800"><span className="text-theme font-bold text-2xl" style={{ color: 'var(--text-primary)' }}>{progress.wpm} WPM</span><button onClick={onRetest} className="bg-white dark:bg-slate-800 border-2 border-sky-100 dark:border-sky-900 text-sky-600 dark:text-sky-300 px-6 py-2 rounded-lg font-bold hover:bg-sky-50 dark:hover:bg-sky-900 active:scale-95 transition-transform">Retest Speed</button></div></div>
          <div><h2 className="text-xl font-bold mb-4 opacity-80" style={{ color: 'var(--text-primary)' }}>Appearance</h2><div className="space-y-6"><div><label className="block text-sm font-bold opacity-50 mb-2" style={{ color: 'var(--text-primary)' }}>Font Family</label><div className="flex flex-wrap gap-2">{fontOptions.map(f => (<button key={f.val} onClick={() => updateSettings('fontFamily', f.val as any)} className={`px-4 py-2 rounded-lg border-2 active:scale-95 transition-transform ${progress.settings.fontFamily === f.val ? 'border-theme bg-safari-50 dark:bg-indigo-900 text-theme' : 'border-gray-100 dark:border-gray-700 opacity-60'}`} style={{ fontFamily: f.val, color: 'var(--text-primary)', borderColor: progress.settings.fontFamily === f.val ? undefined : 'currentColor' }}>{f.label}</button>))}</div></div><div><div className="flex justify-between items-center mb-2"><label className="text-sm font-bold opacity-50" style={{ color: 'var(--text-primary)' }}>Font Size</label><span className="text-xs font-bold bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">{progress.settings.fontSize}px</span></div><div className="flex items-center gap-4"><span className="text-xs font-bold" style={{ color: 'var(--text-primary)' }}>A</span><input type="range" min="16" max="48" step="2" value={progress.settings.fontSize} onChange={(e) => updateSettings('fontSize', parseInt(e.target.value))} className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700 accent-[var(--accent-color)]" /><span className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>A</span></div></div>
          <div><label className="block text-sm font-bold opacity-50 mb-2" style={{ color: 'var(--text-primary)' }}>Auto Scroll Behavior</label><div className="grid grid-cols-1 md:grid-cols-3 gap-3">{['auto', 'fixed', 'manual'].map((mode) => (<button key={mode} onClick={() => updateSettings('scrollMode', mode)} className={`p-4 rounded-xl border-2 text-left active:scale-95 transition-transform ${progress.settings.scrollMode === mode ? 'border-theme bg-safari-50 dark:bg-indigo-900' : 'border-gray-100 dark:border-gray-700'}`}><div className="font-bold capitalize" style={{ color: 'var(--text-primary)' }}>{mode}</div></button>))}</div></div></div></div>
          <div className="pt-8 border-t border-gray-100 dark:border-gray-700"><h2 className="text-xl font-bold mb-4 opacity-80" style={{ color: 'var(--text-primary)' }}>Parental Controls</h2>{!progress.settings.parentLockEnabled ? (<div className="flex gap-2 items-end"><div><label className="text-xs font-bold block mb-1" style={{ color: 'var(--text-primary)' }}>Set 4-digit PIN</label><input type="password" maxLength={4} className="border-2 rounded-lg p-2 w-32 text-black bg-white outline-none" value={setupPin} onChange={(e) => setSetupPin(e.target.value)} /></div><button onClick={handleEnableLock} className="bg-gray-800 text-white px-4 py-2 rounded-lg font-bold">Enable Lock</button></div>) : (<button onClick={() => { updateSettings('parentLockEnabled', false); updateSettings('parentPin', null); setLocked(false); }} className="bg-gray-200 text-gray-600 px-4 py-2 rounded-lg font-bold">Disable Lock</button>)}
          
          {/* API Key Management */}
          <div className="pt-8 mt-8 border-t border-gray-200 dark:border-gray-700">
            <h2 className="text-xl font-bold mb-4 opacity-80" style={{ color: 'var(--text-primary)' }}>Reading Key (API)</h2>
            <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-xl border border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between mb-4">
                <span className="font-mono text-sm text-gray-600 dark:text-gray-400 truncate mr-4">
                  {showApiKey ? progress.settings.apiKey : '••••••••••••••••••••••••••••••••••••'}
                </span>
                <button 
                  onClick={() => setShowApiKey(!showApiKey)}
                  className="text-sm font-bold text-blue-500 hover:text-blue-600"
                >
                  {showApiKey ? 'Hide' : 'Reveal'}
                </button>
              </div>
              <div className="flex items-center gap-4">
                <button 
                  onClick={() => window.open('https://aistudio.google.com/apikey', '_blank')}
                  className="text-sm font-bold bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg transition"
                >
                  Get Key Online
                </button>
                <button 
                  onClick={() => setShowClearKeyConfirm(true)}
                  className="text-sm font-bold text-red-500 hover:text-red-600"
                >
                  Clear Key
                </button>
              </div>
            </div>
          </div>

          <div className="mt-8 flex justify-center"><button onClick={onReset} className="text-red-500 font-bold hover:bg-red-50 dark:hover:bg-red-900/20 px-6 py-3 rounded-xl border-2 border-transparent hover:border-red-100 dark:hover:border-red-900 transition active:scale-95 mx-auto block">Reset All Progress</button></div></div>
          
          {/* Dark Pattern Privacy Policy & Version Number */}
          <div className="mt-12 text-center opacity-10 hover:opacity-50 transition-opacity duration-500 space-y-1">
            <a 
              href="https://sites.google.com/view/charly-reeds-privacy-policy/home" 
              target="_blank" 
              rel="noopener noreferrer"
              className="block text-[8px] font-mono hover:underline"
              style={{ color: 'var(--text-primary)' }}
            >
              Privacy Policy
            </a>
            <span className="text-[10px] font-mono" style={{ color: 'var(--text-primary)' }}>v{appVersion}</span>
          </div>
        </div>
      </div>
      
      {showClearKeyConfirm && (
        <div className="fixed inset-0 z-[10000] bg-black/90 flex items-center justify-center p-6 backdrop-blur-md animate-in fade-in zoom-in duration-300">
            <div className="bg-white dark:bg-gray-800 max-w-sm w-full p-8 rounded-[3rem] text-center border-4 border-red-500 shadow-2xl">
                <div className="text-6xl mb-4">🔑</div>
                <h2 className="text-2xl font-black mb-4 text-gray-900 dark:text-white font-['Fredoka']">CLEAR KEY?</h2>
                <p className="text-gray-600 dark:text-gray-300 mb-8 font-bold">Are you sure you want to clear your Reading Key? You will need to set it up again to read stories.</p>
                <div className="space-y-3">
                    <button onClick={() => { 
                        updateSettings('apiKey', null);
                        // Instead of reload, we can just let the parent component handle the state change
                        // The parent component will see apiKey is null and redirect to api-setup
                        setShowClearKeyConfirm(false);
                        window.location.href = window.location.href; // Fallback to reload if needed, but state should update
                    }} className="w-full py-4 bg-red-500 text-white rounded-2xl font-black text-xl shadow-lg active:scale-95 transition hover:bg-red-600">YES, CLEAR KEY</button>
                    <button onClick={() => setShowClearKeyConfirm(false)} className="w-full py-4 bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-2xl font-bold text-xl active:scale-95 transition">CANCEL</button>
                </div>
            </div>
        </div>
      )}
    </div>
  )
}

const StorySetup: React.FC<{ level: number, difficulty: Difficulty, theme: 'day' | 'night', options: StoryOptions, onGenerate: (g: string, t: string, title: string) => void, onBack: () => void, onRefresh: () => void, styles: any }> = ({ level, difficulty, theme, options, onGenerate, onBack, onRefresh, styles }) => {
  const [step, setStep] = useState(1);
  const [genre, setGenre] = useState("");
  const [twist, setTwist] = useState("");
  const handleNext = (val: string) => { interact(); if (step === 1) { setGenre(val); setStep(2); } else if (step === 2) { setTwist(val); setStep(3); } else { onGenerate(genre, twist, val); } };
  return (
    <div className={`flex flex-col h-full page-enter p-6 ${styles.bgGradient ? `bg-gradient-to-b ${styles.bgGradient}` : ''}`} style={{ background: styles.bgGradient ? undefined : 'var(--bg-primary)' }}>
       <div className="max-w-xl mx-auto w-full flex-grow flex flex-col justify-center relative"><div className="flex justify-between items-center mb-8"><button onClick={() => { interact(); onBack(); }} className={`opacity-50 hover:opacity-100 font-bold text-lg active:scale-95 transition-transform ${styles.accentText || 'text-[var(--text-primary)]'}`}>← Cancel</button><button onClick={() => { interact(); onRefresh(); }} className={`flex items-center gap-2 px-4 py-2 rounded-full font-bold text-sm active:scale-95 transition ${styles.buttonPrimary ? styles.buttonPrimary : 'bg-orange-100 text-orange-700 hover:bg-orange-200'}`} title="Get new ideas!"><span>🔄</span> Refresh Options</button></div><div className="mb-4 flex justify-center"><CharlyMascot scene="idea" difficulty={difficulty} theme={theme} className="w-32 h-32" /></div><h2 className={`text-4xl font-bold text-center mb-2 font-['Fredoka'] ${styles.accentText || 'text-[var(--text-primary)]'}`}>{step === 1 ? "Pick a Genre" : step === 2 ? "Add a Twist" : "Choose a Title"}</h2><p className="text-center opacity-60 mb-8 font-bold" style={{ color: 'var(--text-primary)' }}>Level {level} Story Setup</p><div className="grid grid-cols-1 gap-4">{(step === 1 ? options.genres : step === 2 ? options.twists : options.titles).map((opt, i) => (<button key={i} onClick={() => handleNext(opt)} className={`p-6 rounded-2xl border-2 backdrop-blur text-xl font-bold transition text-left shadow-sm hover:shadow-md active:scale-95 transform ${styles.buttonPrimary ? styles.buttonPrimary : 'border-[var(--card-bg)] hover:border-theme bg-[var(--card-bg)] text-[var(--text-primary)]'}`} style={{ color: styles.buttonPrimary ? undefined : 'var(--text-primary)' }}>{opt}</button>))}</div><div className="flex justify-center mt-12 gap-3"><div className={`h-3 w-12 rounded-full transition-colors ${step >= 1 ? (styles.accentText ? 'bg-current opacity-80' : 'btn-primary') : 'bg-gray-200 dark:bg-gray-700'}`}></div><div className={`h-3 w-12 rounded-full transition-colors ${step >= 2 ? (styles.accentText ? 'bg-current opacity-80' : 'btn-primary') : 'bg-gray-200 dark:bg-gray-700'}`}></div><div className={`h-3 w-12 rounded-full transition-colors ${step >= 3 ? (styles.accentText ? 'bg-current opacity-80' : 'btn-primary') : 'bg-gray-200 dark:bg-gray-700'}`}></div></div></div>
    </div>
  );
}