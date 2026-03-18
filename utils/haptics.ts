
export const vibrate = (ms: number = 50) => {
  if (navigator.vibrate) {
    navigator.vibrate(ms);
  }
};

export const playSound = (type: 'success' | 'click' | 'page-flip' | 'buzzer' | 'win' | 'perfect' | 'fail' | 'victory-standard' | 'victory-ultra' | 'victory-secret') => {
  try {
    // Check Settings from LocalStorage to avoid prop drilling
    const saved = localStorage.getItem('charly_progress');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed.settings && parsed.settings.soundEnabled === false) {
        return;
      }
    }

    const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContext) return;
    
    const ctx = new AudioContext();
    const now = ctx.currentTime;

    // Helper for playing a single note
    const playNote = (freq: number, startTime: number, duration: number, type: 'sine' | 'square' | 'sawtooth' | 'triangle' = 'sine', vol: number = 0.1) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      gain.gain.setValueAtTime(vol, startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
      
      osc.start(startTime);
      osc.stop(startTime + duration);
    };

    if (type === 'victory-standard') {
      // Celebratory Major Fanfare (Trumpet-ish)
      const theme = [
        { f: 523.25, d: 0.2 }, // C5
        { f: 523.25, d: 0.2 }, // C5
        { f: 523.25, d: 0.2 }, // C5
        { f: 659.25, d: 0.4 }, // E5
        { f: 783.99, d: 0.4 }, // G5
        { f: 1046.50, d: 0.8 }, // C6
        { f: 783.99, d: 0.2 }, // G5
        { f: 1046.50, d: 1.5 }, // C6
      ];
      
      let t = now;
      theme.forEach(note => {
        playNote(note.f, t, note.d, 'triangle', 0.2);
        playNote(note.f * 0.5, t, note.d, 'sawtooth', 0.1); // Add bass/harmony
        t += note.d * 0.8; // Slight overlap for legato
      });

    } else if (type === 'victory-ultra') {
      // Sci-Fi / Cyberpunk Arpeggios
      // Fast, high pitched, synthetic
      const baseFreq = 440;
      const steps = [0, 4, 7, 11, 12, 16, 19, 24]; // Major 7th arpeggio extended
      let t = now;
      
      // Rapid ascending arpeggio
      for(let i=0; i<16; i++) {
         const pitch = baseFreq * Math.pow(2, steps[i % 8] / 12);
         playNote(pitch, t, 0.1, 'sawtooth', 0.05);
         playNote(pitch * 1.01, t, 0.1, 'square', 0.05); // Detuned chorus effect
         t += 0.08;
      }
      // Final chord swell
      playNote(baseFreq * 2, t, 2.0, 'sawtooth', 0.1);
      playNote(baseFreq * 2.5, t, 2.0, 'sine', 0.1);
      playNote(baseFreq * 3, t, 2.0, 'square', 0.05);

    } else if (type === 'victory-secret') {
      // Secret Agent / Spy Vibe
      // Minor/Chromatic, bass heavy
      // Bass line walking
      const bassNotes = [110, 123.47, 130.81, 123.47]; // A2, B2, C3, B2
      let t = now;
      
      // Play loop twice
      for(let k=0; k<4; k++) {
          bassNotes.forEach(f => {
              playNote(f, t, 0.4, 'triangle', 0.2);
              t += 0.4;
          });
      }
      
      // Melody (High stabs)
      let mt = now + 1.6;
      playNote(880, mt, 0.1, 'square', 0.05); // A5 stab
      playNote(932.33, mt + 0.2, 0.3, 'square', 0.05); // Bb5
      playNote(1046.50, mt + 0.6, 1.0, 'sine', 0.1); // C6 swell

    } else if (type === 'success') {
      // Small success (correct answer)
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(440, now); // A4
      osc.frequency.linearRampToValueAtTime(880, now + 0.1); // A5
      osc.connect(gain);
      gain.connect(ctx.destination);
      gain.gain.setValueAtTime(0.1, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
      osc.start(now);
      osc.stop(now + 0.3);

    } else if (type === 'win') {
      // Level Passed (Simple Fanfare)
      const notes = [523.25, 659.25, 783.99, 1046.50]; // C E G C
      let t = now;
      notes.forEach((freq) => {
        playNote(freq, t, 0.4, 'triangle', 0.1);
        t += 0.15;
      });

    } else if (type === 'perfect') {
      // 100% Score (High energy, sparkly)
      const notes = [523.25, 659.25, 783.99, 1046.50, 1318.51, 1567.98, 2093.00]; 
      let t = now;
      notes.forEach((freq) => {
        playNote(freq, t, 0.3, 'sine', 0.1);
        t += 0.08;
      });

    } else if (type === 'fail') {
      // Womp Womp
      const o1 = ctx.createOscillator();
      const g1 = ctx.createGain();
      o1.type = 'sawtooth';
      o1.connect(g1);
      g1.connect(ctx.destination);
      
      o1.frequency.setValueAtTime(300, now);
      o1.frequency.linearRampToValueAtTime(200, now + 0.4);
      g1.gain.setValueAtTime(0.1, now);
      g1.gain.linearRampToValueAtTime(0, now + 0.4);
      o1.start(now);
      o1.stop(now + 0.4);

      const o2 = ctx.createOscillator();
      const g2 = ctx.createGain();
      o2.type = 'sawtooth';
      o2.connect(g2);
      g2.connect(ctx.destination);
      
      o2.frequency.setValueAtTime(200, now + 0.45);
      o2.frequency.linearRampToValueAtTime(100, now + 1.2);
      g2.gain.setValueAtTime(0.1, now + 0.45);
      g2.gain.linearRampToValueAtTime(0, now + 1.2);
      o2.start(now + 0.45);
      o2.stop(now + 1.2);

    } else if (type === 'page-flip') {
      // Swish sound
      const bufferSize = ctx.sampleRate * 0.3;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      
      const noise = ctx.createBufferSource();
      noise.buffer = buffer;
      
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(400, now);
      filter.frequency.linearRampToValueAtTime(100, now + 0.3);
      
      const noiseGain = ctx.createGain();
      noiseGain.gain.setValueAtTime(0.8, now); 
      noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
      
      noise.connect(filter);
      filter.connect(noiseGain);
      noiseGain.connect(ctx.destination);
      noise.start();

    } else if (type === 'buzzer') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(150, now);
      osc.frequency.linearRampToValueAtTime(100, now + 0.3);
      osc.connect(gain);
      gain.connect(ctx.destination);
      gain.gain.setValueAtTime(0.1, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
      osc.start();
      osc.stop(now + 0.3);
    } else {
      // Click
      playNote(800, now, 0.1, 'sine', 0.05);
    }
  } catch (e) {
    // Silent fail
  }
};

export const interact = () => {
  vibrate(10);
  playSound('click');
};
