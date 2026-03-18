import { GoogleGenAI, GenerateContentResponse } from "@google/genai";
import { GeneratedContent, QuizQuestion, StoryOptions, Difficulty } from "../types";

export const getApiKey = (): string | null => {
  try {
    const saved = localStorage.getItem('charly_progress');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed.settings?.apiKey) return parsed.settings.apiKey;
    }
  } catch (e) {}
  return null;
};

const handleApiError = async (e: any) => {
    const isQuota = e.message?.includes('429') || e.status === 429 || e.message?.includes('Quota') || e.message?.includes('RESOURCE_EXHAUSTED');
    
    // Check for Permission/Key Errors (403, 404 Entity Not Found)
    if (e.message?.includes('Requested entity was not found') || e.message?.includes('403') || e.message?.includes('404')) {
        console.warn("API Key issue detected.");
    }
    
    if (!isQuota) {
        console.error("API Call Failed:", e);
    } else {
        console.warn("API Quota Exceeded for all models.");
    }
}

async function callWithRetry<T>(fn: () => Promise<T>, retries = 2, delay = 1000): Promise<T> {
    try {
        return await fn();
    } catch (e: any) {
        if (retries <= 0) throw e;
        const isQuota = e.message?.includes('429') || e.status === 429 || e.message?.includes('Quota') || e.message?.includes('RESOURCE_EXHAUSTED');
        if (isQuota) throw e; // Don't retry quota errors immediately, let fallback handle it
        
        await new Promise(resolve => setTimeout(resolve, delay));
        return callWithRetry(fn, retries - 1, delay * 2);
    }
}

const getAvailableModels = async (ai: any): Promise<string[]> => {
    try {
        const response = await ai.models.list();
        const names: string[] = [];
        for await (const model of response) {
            if (model.name) {
                names.push(model.name.split('/').pop() || '');
            }
        }
        console.log("Available models from API:", names);
        return names;
    } catch (e) {
        console.warn("Failed to list models from API, using hardcoded defaults", e);
        // Return a sensible default list if listing fails
        return ['gemini-3.1-pro-preview', 'gemini-3-flash-preview', 'gemini-3.1-flash-lite-preview'];
    }
}

// Helper to attempt generation with multiple models in sequence
const generateWithFallback = async (
    preferredModels: string[], 
    prompt: string, 
    config: any = { responseMimeType: "application/json" }
): Promise<GenerateContentResponse> => {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error("Reading Key not found! Please set it up in the app.");
  const ai = new GoogleGenAI({ apiKey: apiKey, httpOptions: { apiVersion: 'v1alpha' } });
  
  const available = await getAvailableModels(ai);
  
  // Filter preferred models that are actually available
  let modelsToTry = preferredModels.filter(m => available.includes(m));
  
  // If none of our preferred models are explicitly listed as available, 
  // we'll still try them as a last resort, but we'll also add any other flash models we found
  if (modelsToTry.length === 0) {
      console.warn("None of the preferred models were found in the available list. Using preferred list + any available flash models.");
      const availableFlash = available.filter(m => m.includes('flash') && !preferredModels.includes(m));
      modelsToTry = [...preferredModels, ...availableFlash];
  }

  let lastError = null;
  // Try each model in the list
  for (const model of modelsToTry) {
    try {
      console.log(`Attempting generation with model: ${model}`);
      const response = await callWithRetry<GenerateContentResponse>(() => ai.models.generateContent({
        model: model,
        contents: prompt,
        config: config
      }), 1, 1000);

      if (response.text) {
          console.log(`Success with model: ${model}`);
          return response;
      }
    } catch (e: any) {
      const isQuota = e.message?.includes('429') || e.status === 429 || e.message?.includes('Quota') || e.message?.includes('RESOURCE_EXHAUSTED');
      console.warn(`Model ${model} failed generation:`, e.message);
      lastError = e;
      
      // If it's a quota error or model not found, definitely try the next one
      if (isQuota || e.message?.includes('404') || e.message?.includes('not found')) {
          continue;
      }
    }
  }
  
  if (lastError) await handleApiError(lastError);
  throw lastError || new Error("All models failed to generate content.");
};

/**
 * Helper to attempt streaming with multiple models in sequence
 */
const streamWithFallback = async function* (
    preferredModels: string[],
    prompt: string,
    config: any = {}
): AsyncGenerator<string, void, unknown> {
    const apiKey = getApiKey();
    if (!apiKey) throw new Error("Reading Key not found! Please set it up in the app.");
    const ai = new GoogleGenAI({ apiKey: apiKey, httpOptions: { apiVersion: 'v1alpha' } });
    
    const available = await getAvailableModels(ai);
    let modelsToTry = preferredModels.filter(m => available.includes(m));
    
    if (modelsToTry.length === 0) {
        console.warn("None of the preferred models were found in the available list. Using preferred list + any available flash models.");
        const availableFlash = available.filter(m => m.includes('flash') && !preferredModels.includes(m));
        modelsToTry = [...preferredModels, ...availableFlash];
    }

    let lastError = null;
    let hasYielded = false;

    for (const model of modelsToTry) {
        try {
            console.log(`Attempting stream with model: ${model}`);
            const streamResult = await ai.models.generateContentStream({
                model: model,
                contents: prompt,
                config: config
            });

            for await (const chunk of streamResult) {
                if (chunk.text) {
                    yield chunk.text;
                    hasYielded = true;
                }
            }
            console.log(`Stream success with model: ${model}`);
            return;
        } catch (e: any) {
            console.warn(`Streaming with model ${model} failed:`, e.message);
            lastError = e;
            
            const isQuota = e.message?.includes('429') || e.status === 429 || e.message?.includes('Quota') || e.message?.includes('RESOURCE_EXHAUSTED');
            const isNotFound = e.message?.includes('404') || e.message?.includes('not found');

            if (hasYielded) {
                throw e;
            }
            
            if (isQuota || isNotFound) {
                continue;
            }
        }
    }
    
    if (lastError) await handleApiError(lastError);
    throw lastError || new Error("All models failed to stream content.");
};

const getLevelConfig = (level: number, difficulty: Difficulty) => {
  let minWords = 250 + ((level - 1) * 350); 
  let complexity = `Grade ${Math.min(12, Math.max(1, level + 1))} reading level.`;
  let increment = 2; // Normal default
  let questionCount = 10 + ((level - 1) * increment);

  // Adjust based on Difficulty
  if (difficulty === 'Easy') {
    minWords = Math.floor(minWords * 0.7);
    complexity = `Grade ${Math.max(1, level)} reading level. Simple words, short sentences.`;
    questionCount = 10 + ((level - 1) * 2);
  } else if (difficulty === 'Normal') {
    questionCount = 10 + ((level - 1) * 2);
  } else if (difficulty === 'Hard') {
    minWords = Math.floor(minWords * 1.2);
    complexity = `Grade ${Math.min(12, level + 2)} reading level. Challenging vocabulary.`;
    questionCount = 10 + ((level - 1) * 3);
  } else if (difficulty === 'Ultra') {
    minWords = Math.floor(minWords * 1.5);
    complexity = `College level reading. Advanced academic vocabulary, abstract concepts.`;
    questionCount = 10 + ((level - 1) * 4);
  } else if (difficulty === 'Secret') {
    minWords = Math.floor(minWords * 0.5); 
    complexity = "Riddles, rhymes, and cryptic storytelling. Highly abstract and poetic.";
    questionCount = 10 + ((level - 1) * 5);
  } else if (difficulty === 'Void') {
    minWords = 800; // Target 500-1000 range
    complexity = "Post-graduate level. Highly technical, archaic, or abstract vocabulary. Complex sentence structures. Themes of entropy, infinity, or metaphysics.";
    questionCount = 10 + ((level - 1) * 5);
  }
  
  return { minWords, complexity, questionCount };
};

export type MascotScene = 'main' | 'library' | 'success' | 'fail' | 'mini' | 'platinum' | 'tuxedo' | 'ultra-victory' | 'secret-victory' | 'void-warp' | 'idea' | 'quiz' | 'settings' | 'loading';

// Helper to attempt image generation with multiple models
const attemptImageGeneration = async (prompt: string, models: string[]): Promise<string | null> => {
    // AI Image Generation is currently disabled as per user request.
    return null; 
};

export const generateMascotImage = async (scene: MascotScene, theme: 'day' | 'night' = 'day', difficulty: Difficulty = 'Normal'): Promise<string | null> => {
  // AI Generation is disabled. Returning hardcoded asset paths.
  const assetScene = (scene === 'mini' || scene === 'void-warp') ? 'main' : scene;
  return `/assets/${assetScene}_${theme}.png`;
};

export const generateLevelBackground = async (level: number): Promise<string | null> => {
    // AI Background generation is disabled.
    return null;
}

export const generatePlacementTest = async (currentWpm?: number): Promise<{ text: string; question: QuizQuestion }> => {
  const animals = ['elephant', 'penguin', 'giraffe', 'hippo', 'zebra', 'kangaroo', 'platypus', 'sloth', 'meerkat'];
  const settings = ['space station', 'grocery store', 'skate park', 'library', 'underwater city', 'volcano', 'cloud kingdom', 'giant shoe'];
  const randomSubject = animals[Math.floor(Math.random() * animals.length)];
  const randomSetting = settings[Math.floor(Math.random() * settings.length)];

  let complexity = "Simple, easy to read words.";
  if (currentWpm && currentWpm > 200) complexity = "Complex, descriptive language.";
  else if (currentWpm && currentWpm > 100) complexity = "Moderate complexity.";

  const prompt = `Generate a very short, creative, funny paragraph about a ${randomSubject} in a ${randomSetting} (max 40 words). 
  Complexity: ${complexity}
  Also provide 1 simple multiple choice question about it.
  Return JSON: { "text": string, "question": { "question": string, "options": string[], "correctIndex": number } }`;

  try {
    const response = await generateWithFallback(
        ['gemini-3.1-pro-preview', 'gemini-3-flash-preview', 'gemini-3.1-flash-lite-preview'], 
        prompt, 
        { responseMimeType: "application/json", temperature: 1.2 }
    );

    if (!response.text) throw new Error("Failed to generate test.");
    return JSON.parse(response.text);
  } catch (e) {
      console.error("Failed to generate placement test:", e);
      throw e;
  }
};

export const generateStoryOptions = async (
    level: number, 
    exclusions?: { genres: string[], twists: string[], titles: string[] }
): Promise<StoryOptions> => {
  let exclusionPrompt = "";
  if (exclusions) {
      // Limit to last 30 to prevent context bloat
      const recentTitles = exclusions.titles.slice(-30).join('", "');
      const recentTwists = exclusions.twists.slice(-30).join('", "');
      
      if (recentTitles) exclusionPrompt += `\nDo NOT use these exact titles: "${recentTitles}".`;
      if (recentTwists) exclusionPrompt += `\nDo NOT reuse these exact twists: "${recentTwists}".`;
  }

  const prompt = `Generate creative story options for a Level ${level} reading game for kids.
  I need:
  1. 4 distinct Genres.
  2. 4 surprising Plot Twists.
  3. 4 catchy Titles.
  
  ${exclusionPrompt}

  Return strictly JSON:
  {
    "genres": ["...", "...", "...", "..."],
    "twists": ["...", "...", "...", "..."],
    "titles": ["...", "...", "...", "..."]
  }`;

  try {
    const response = await generateWithFallback(
        ['gemini-3.1-pro-preview', 'gemini-3-flash-preview', 'gemini-3.1-flash-lite-preview'],
        prompt
    );

    if (!response.text) throw new Error("Failed to generate options.");
    return JSON.parse(response.text);
  } catch (e) {
      console.error("Story options failed:", e);
      throw e;
  }
};

/**
 * Generator function that streams the story text chunk by chunk.
 */
export async function* streamStory(
  level: number,
  genre: string,
  twist: string,
  title: string,
  difficulty: Difficulty,
  exclusions?: { genres: string[], twists: string[], titles: string[] }
): AsyncGenerator<string, void, unknown> {
  const config = getLevelConfig(level, difficulty);
  
  let exclusionPrompt = "";
  if (exclusions) {
      const recentTitles = exclusions.titles.slice(-20).join('", "');
      const recentTwists = exclusions.twists.slice(-20).join('", "');
      const recentGenres = exclusions.genres.slice(-20).join('", "');
      
      if (recentTitles || recentTwists || recentGenres) {
          exclusionPrompt = `
          
          CONTEXT: The reader has already completed stories with these themes:
          - Recent Titles: ${recentTitles}
          - Recent Twists: ${recentTwists}
          - Recent Genres: ${recentGenres}
          
          Please ensure this NEW story feels fresh, unique, and distinct from those previous ideas. Avoid repeating specific plot points, character names, or unique descriptions from those past adventures.`;
      }
  }
  
  // Note: We do NOT request JSON here to make streaming smoother.
  // We ask for plain text with double newline separation for paragraphs.
  const prompt = `Write a story for a reading game.
  Target Audience: ${difficulty === 'Void' ? 'Adults/Academics' : 'Kids/Teenagers'}.
  Level: ${level}/9.
  Difficulty Setting: ${difficulty}
  Complexity Guidelines: ${config.complexity}
  Approx Word Count: ${config.minWords}.
  
  Genre: ${genre}
  Plot Twist: ${twist}
  Title: ${title}
  ${exclusionPrompt}
  
  IMPORTANT: Output the story in plain text. Separate paragraphs with double newlines. Do not include a title header or "The End". Just the raw story text.
  
  After the story, output exactly "---QUIZ---" on a new line.
  Then output a JSON array of ${config.questionCount} difficult multiple-choice quiz questions based on the story:
  [
    { "question": "...", "options": ["A", "B", "C", "D"], "correctIndex": 0 },
    ...
  ]
  
  After the quiz JSON, output exactly "---COMMENTARY---" on a new line.
  Then output a JSON object with 3 reactions from Charly (a funny, high-energy alligator host using Australian slang like "mate", "crikey", "swamp").
  - failed: Under 80% score. MUST start with "Aw shucks mate...". Supportive but snarky. 5 to 30 words.
  - passed: 80% or more. Include "mate". Super hyped! 5 to 30 words.
  - perfect: 100% score. "A perfect score!" 5 to 30 words.
  {
    "failed": "...",
    "passed": "...",
    "perfect": "..."
  }`;

  const models = ['gemini-3.1-pro-preview', 'gemini-3-flash-preview', 'gemini-3.1-flash-lite-preview'];
  
  try {
    yield* streamWithFallback(models, prompt, { maxOutputTokens: 8192 });
  } catch (e: any) {
      await handleApiError(e);
      throw e;
  }
}

/**
 * Generates questions based on the fully streamed text.
 */
export const generateQuizFromText = async (
    storyText: string,
    level: number,
    difficulty: Difficulty
): Promise<QuizQuestion[]> => {
    const config = getLevelConfig(level, difficulty);
    const prompt = `Based on the following story, generate ${config.questionCount} difficult multiple-choice quiz questions.
    
    Story:
    "${storyText.substring(0, 15000)}"

    Return strictly JSON:
    [
      { "question": "...", "options": ["A", "B", "C", "D"], "correctIndex": 0 },
      ...
    ]`;

    try {
        const response = await generateWithFallback(
            ['gemini-3.1-pro-preview', 'gemini-3-flash-preview', 'gemini-3.1-flash-lite-preview'],
            prompt,
            { responseMimeType: "application/json" }
        );

        if (!response.text) throw new Error("No quiz generated");
        const parsed = JSON.parse(response.text);
        if (!Array.isArray(parsed)) throw new Error("Invalid quiz format");
        return parsed;
    } catch (e) {
        console.error("Quiz generation failed", e);
        throw e;
    }
}

export const generateStoryAndQuiz = async (
  level: number,
  genre: string,
  twist: string,
  title: string,
  difficulty: Difficulty
): Promise<GeneratedContent> => {
    // Legacy support if needed, or just wrapper
    // For now, we are moving to the streaming pattern in App.tsx
    // This function can remain as a non-streaming fallback
    
  const config = getLevelConfig(level, difficulty);
  
  const prompt = `Write a story for a reading game.
  Target Audience: ${difficulty === 'Void' ? 'Adults/Academics' : 'Kids/Teenagers'}.
  Level: ${level}/9.
  Difficulty Setting: ${difficulty}
  Complexity Guidelines: ${config.complexity}
  Approx Word Count: ${config.minWords}.
  
  Genre: ${genre}
  Plot Twist: ${twist}
  Title: ${title}
  
  Format requirements:
  1. The story must be broken down into an array of paragraphs (chunks), where each chunk is roughly 40-60 words long.
  2. Generate ${config.questionCount} difficult quiz questions based on the story.
  
  Return strictly JSON:
  {
    "storyChunks": ["paragraph 1", "paragraph 2", ...],
    "quiz": [
      { "question": "...", "options": ["A", "B", "C", "D"], "correctIndex": 0 },
      ...
    ]
  }`;

  try {
    const response = await generateWithFallback(
        ['gemini-3.1-pro-preview', 'gemini-3-flash-preview', 'gemini-3.1-flash-lite-preview'],
        prompt
    );

    if (!response.text) throw new Error("No content generated");
    
    const parsed = JSON.parse(response.text);
    
    if (!parsed.quiz || !Array.isArray(parsed.quiz) || parsed.quiz.length === 0) {
        throw new Error("Invalid quiz format");
    }
    
    return parsed;
  } catch (e) {
      await handleApiError(e);
      throw e;
  }
};

export const generateResultCommentary = async (score: number, total: number, isImprovement: boolean, difficulty: Difficulty): Promise<string> => {
  const percentage = Math.round((score / total) * 100);
  const passed = percentage >= 80;
  const isPerfect = percentage === 100;

  // Fallback System (Mail-merger style with 100s of variations)
  const getFallback = () => {
    const pick = (arr: string[]) => arr[Math.floor(Math.random() * arr.length)];

    if (!passed) {
      const reasons = [
        "that quiz was a bit of a swamp.",
        "the current was a bit too strong.",
        "those questions had some real teeth.",
        "we got a bit tangled in the weeds.",
        "that was a tricky one.",
        "the mud was a bit thick today.",
        "those snappers almost got us.",
        "the river was a bit rough.",
        "we missed the mark by a tail-length.",
        "the library was a bit foggy."
      ];
      const encouragements = [
        "Don't let it snap your spirit.",
        "Even the best explorers get lost.",
        "We'll get 'em next time.",
        "A quick re-read will fix that.",
        "Shake off the mud.",
        "Keep your chin up.",
        "You're still a legend to me.",
        "I know you've got this.",
        "Let's dry off and try again.",
        "Don't let the crocs get you down."
      ];
      const closings = [
        "Ready for another go?",
        "Let's dive back in!",
        "Practice makes perfect!",
        "I believe in you!",
        "Back to the library?",
        "One more try?",
        "Let's snap to it!",
        "Round two?",
        "I'm ready when you are!",
        "Let's go again!"
      ];
      return `Aw shucks mate... ${pick(reasons)} ${pick(encouragements)} ${pick(closings)}`;
    }

    const greetings = [
      "Crikey mate!",
      "Whoa mate!",
      "G'day mate!",
      "Stellar work mate!",
      "Top notch mate!",
      "Legendary stuff mate!",
      "Absolute ripper mate!",
      "Whoa there mate!",
      "My word mate!",
      "Check you out mate!"
    ];
    const actions = [
      "You sailed through that!",
      "You crushed those questions!",
      "You're reading like a pro!",
      "You've got a sharp eye!",
      "You're a natural!",
      "You tore through that story!",
      "You're a reading machine!",
      "You've got some serious skills!",
      "You're at the top of the food chain!",
      "You're making this look easy!"
    ];
    const praise = [
      "You're a legend.",
      "That was massive.",
      "I'm impressed.",
      "You're a star.",
      "You're unstoppable.",
      "You're a champion.",
      "That was flawless.",
      "You're a genius.",
      "You're a pro.",
      "You're a hero."
    ];
    const closings = [
      "Keep it up!",
      "On to the next one!",
      "Fantastic effort!",
      "Absolute ripper!",
      "I'm doing a tail-wag for you!",
      "You're a star!",
      "Keep those eyes sharp!",
      "Incredible work!",
      "You're a legend!",
      "Spot on!"
    ];

    if (difficulty === 'Void' && isPerfect) {
        return `Mate, you conquered the VOID? You're not even human anymore! The resonance is strong with you.`;
    }

    if (isPerfect) {
        return `${pick(greetings)} A perfect score! ${pick(actions)} ${pick(praise)} ${pick(closings)}`;
    }

    return `${pick(greetings)} ${pick(actions)} ${pick(praise)} ${pick(closings)}`;
  };

  const prompt = `You are Charly, a funny, high-energy, encouraging game show host alligator. 
  You use Australian slang like "mate", "crikey", "legend", "snapper", "swamp".
  The player just finished a reading comprehension quiz on ${difficulty} difficulty.
  Score: ${score}/${total} (${percentage}%).
  Did they improve from their last attempt? ${isImprovement ? "YES" : "NO"}.
  
  Write a reaction. 
  - If they failed (under 80%), you MUST start with "Aw shucks mate...". Be supportive but snarky about the difficulty. Give them specific encouragement to try again.
  - If they passed (80% or more), include "mate" at least once. Be super hyped and energetic!
  - Use alligator puns and swamp metaphors (e.g., "muddy waters", "sharp teeth", "swamp").
  - Reference the difficulty level if it's high (Ultra, Secret, Void).
  - Ensure the text is between 5 and 30 words maximum.
  - NEVER use generic phrases like "Good job".`;

  try {
    const response = await generateWithFallback(
        ['gemini-3-flash-preview', 'gemini-3.1-flash-lite-preview', 'gemini-3.1-pro-preview'], 
        prompt,
        { responseMimeType: "text/plain" }
    );

    return response.text || getFallback();
  } catch (e) {
      return getFallback();
  }
};
