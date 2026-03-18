import React, { useState, useEffect } from 'react';
import { generatePlacementTest } from '../services/veoService';
import { QuizQuestion } from '../types';
import { CharlyMascot } from './CharlyMascot';
import { interact } from '../utils/haptics';

interface WpmTestProps {
  onComplete: (wpm: number) => void;
  isRetest?: boolean;
  currentWpm?: number;
}

export const WpmTest: React.FC<WpmTestProps> = ({ onComplete, isRetest, currentWpm }) => {
  const [step, setStep] = useState<'intro' | 'reading' | 'quiz'>('intro');
  const [content, setContent] = useState<{ text: string, question: QuizQuestion } | null>(null);
  const [loading, setLoading] = useState(false);
  const [targetWpm, setTargetWpm] = useState(100); 
  const [passedWpm, setPassedWpm] = useState(100);
  const [attempts, setAttempts] = useState(0);

  const loadTest = async () => {
    interact();
    setLoading(true);
    try {
      // Pass currentWpm if available to scale test difficulty
      const data = await generatePlacementTest(currentWpm);
      if (data && data.text && data.question && data.question.question && data.question.options) {
          setContent(data);
          setStep('reading');
      } else {
         throw new Error("Invalid test content");
      }
    } catch (e) {
      alert("Trouble loading test content. Please check connection.");
    } finally {
      setLoading(false);
    }
  };

  const handleStart = () => {
    loadTest();
  };

  const handleManualSkip = () => {
    interact();
    onComplete(150); 
  };

  const handleAcceptSpeed = () => {
    interact();
    onComplete(targetWpm);
  };

  const handleQuizResult = (correct: boolean) => {
    interact();
    if (correct) {
      setPassedWpm(targetWpm);
      const nextSpeed = targetWpm + 50;
      setTargetWpm(nextSpeed);
      setAttempts(prev => prev + 1);
      setStep('intro');
    } else {
      onComplete(passedWpm);
    }
  };

  if (step === 'intro') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-8 bg-[var(--card-bg)] backdrop-blur rounded-3xl border-4 border-safari-500 shadow-xl max-w-2xl mx-auto page-enter">
        <CharlyMascot scene="main" />
        <h2 className="text-3xl font-bold mt-6 mb-2 font-['Fredoka']" style={{ color: 'var(--text-primary)' }}>
          {attempts === 0 ? "Let's Check Your Speed!" : "Great job! Let's go faster."}
        </h2>
        <p className="mb-8 text-lg opacity-80" style={{ color: 'var(--text-primary)' }}>
          The words will disappear as you read. <br/> 
          Current Speed Level: <span className="font-bold text-orange-600">{targetWpm} WPM</span>
        </p>
        
        <div className="flex flex-col gap-4 w-full max-w-xs">
          <button 
            onClick={handleStart}
            disabled={loading}
            className="bg-orange-500 text-white px-8 py-4 rounded-xl font-bold hover:bg-orange-600 transition text-lg shadow-lg active:scale-95"
          >
            {loading ? "Loading..." : (attempts === 0 ? "Start Test" : `Try ${targetWpm} WPM`)}
          </button>
          
          {attempts > 0 && (
            <button 
              onClick={handleAcceptSpeed}
              className="bg-safari-500 text-white px-8 py-3 rounded-xl font-bold hover:bg-safari-600 transition active:scale-95"
            >
              I'm good with {passedWpm} WPM
            </button>
          )}

          {attempts === 0 && (
             <button onClick={handleManualSkip} className="text-gray-400 font-bold hover:text-gray-600 mt-2 active:scale-95 transition">
               Skip Test (Set to 150 WPM)
             </button>
          )}
        </div>
      </div>
    );
  }

  if (step === 'reading' && content) {
    return <TestReader text={content.text} wpm={targetWpm} onFinish={() => setStep('quiz')} />;
  }

  if (step === 'quiz' && content && content.question) {
    return (
      <div className="max-w-xl mx-auto p-8 bg-[var(--card-bg)] rounded-3xl shadow-2xl border-4 border-sky-400 page-enter">
        <h3 className="text-xl md:text-2xl font-bold mb-6 font-['Fredoka']" style={{ color: 'var(--text-primary)' }}>{content.question.question}</h3>
        <div className="space-y-4">
          {content.question.options.map((opt, idx) => (
            <button
              key={idx}
              onClick={() => handleQuizResult(idx === content.question.correctIndex)}
              className="w-full p-4 md:p-6 text-left rounded-xl border-2 border-slate-200 hover:border-sky-400 hover:bg-sky-50/20 transition text-base md:text-lg font-medium active:scale-[0.98]"
              style={{ color: 'var(--text-primary)' }}
            >
              {opt}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return null;
};

// Sub-component for the disappearing text during test
const TestReader: React.FC<{ text: string, wpm: number, onFinish: () => void }> = ({ text, wpm, onFinish }) => {
  const words = text.split(' ');
  const [vanishedIndex, setVanishedIndex] = useState(-1);
  const [ready, setReady] = useState(false);
  
  useEffect(() => {
    const timer = setTimeout(() => setReady(true), 2000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!ready) return;

    const msPerWord = 60000 / wpm;
    const interval = setInterval(() => {
      setVanishedIndex(prev => {
        if (prev >= words.length - 1) {
          clearInterval(interval);
          setTimeout(onFinish, 500); 
          return prev;
        }
        return prev + 1;
      });
    }, msPerWord);
    
    return () => clearInterval(interval);
  }, [wpm, words.length, onFinish, ready]);

  return (
    <div className="fixed inset-0 backdrop-blur-xl z-50 flex items-center justify-center p-6 page-enter" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <div className="max-w-2xl w-full max-h-[80vh] overflow-y-auto p-4 border-4 border-slate-100 rounded-3xl bg-[var(--card-bg)] relative flex flex-col">
        
        {/* Ready Overlay */}
        {!ready && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-white/90 rounded-3xl">
            <h2 className="text-4xl font-black text-orange-500 animate-bounce">GET READY!</h2>
          </div>
        )}

        <div className="flex justify-between items-center mb-6">
           <div className="bg-slate-100 px-4 py-2 rounded-full inline-block font-bold text-slate-600">
             Testing at {wpm} WPM
           </div>
           <button onClick={() => { interact(); onFinish(); }} className="text-sky-500 hover:text-sky-700 font-bold px-3 py-1 border-2 border-sky-200 rounded-lg hover:bg-sky-50 active:scale-95 transition">
             I'm done reading ⏩
           </button>
        </div>

        <p className={`text-2xl md:text-3xl leading-relaxed font-['Nunito'] font-medium transition-all duration-300 ${!ready ? 'blur-2xl opacity-20 select-none' : ''}`} style={{ color: 'var(--text-primary)' }}>
          {words.map((word, i) => (
            <span 
              key={i} 
              className={`transition-all duration-300 inline-block mr-2 ${i <= vanishedIndex ? 'blur-xl opacity-0 select-none' : ''}`}
              style={{ color: i <= vanishedIndex ? 'transparent' : 'var(--text-primary)' }}
            >
              {word}
            </span>
          ))}
        </p>
      </div>
    </div>
  );
};