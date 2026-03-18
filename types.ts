
export type Difficulty = 'Easy' | 'Normal' | 'Hard' | 'Ultra' | 'Secret' | 'Void';

export interface AppSettings {
  fontFamily: 'Nunito' | 'Georgia' | 'Courier New' | 'Share Tech Mono';
  fontSize: number; // Pixel value
  scrollMode: 'auto' | 'manual' | 'fixed';
  difficulty: Difficulty;
  theme: 'day' | 'night';
  parentLockEnabled: boolean;
  parentPin: string | null;
  soundEnabled: boolean;
  debugMode: boolean;
  apiKey: string | null;
}

export interface StoryRecord {
  difficulty: Difficulty;
  score: number; // percentage 0-100
  timestamp: number;
}

export interface SavedStory {
  id: string; // "level-story"
  title: string;
  genre: string;
  twist: string;
  // Content is now optional in memory, fetched from DB if needed
  content?: GeneratedContent; 
}

export interface UserProgress {
  wpm: number;
  unlockedLevel: number; // 1-9
  unlockedStory: number; // 1-10
  hasCompletedPlacement: boolean;
  settings: AppSettings;
  // Key: "level-story" e.g. "1-1"
  storyHistory: Record<string, StoryRecord>; 
  // Persistent storage of story METADATA. Content stored in DB.
  savedStories: Record<string, SavedStory>;
  // Key: level number (1-9). Value: base64 string (loaded from DB)
  levelBackgrounds: Record<number, string>;
  totalStoriesRead: number;
  totalPerfectScores: number;
  prestigeLevel: number; // New Game+ count
  beatenDifficulties: Difficulty[]; // Tracks which difficulties have been beaten
  // Track options used in PASSED stories to avoid repetition
  usedOptions: {
    genres: string[];
    twists: string[];
    titles: string[];
  };
}

export interface StoryOptions {
  genres: string[];
  twists: string[];
  titles: string[];
}

export interface StoryParams {
  level: number;
  genre: string;
  twist: string;
  title: string;
}

export interface QuizQuestion {
  question: string;
  options: string[];
  correctIndex: number;
}

export interface GeneratedContent {
  storyChunks: string[]; 
  quiz: QuizQuestion[];
  commentaries?: {
    failed: string;
    passed: string;
    perfect: string;
  };
}

export type AppState = 
  | 'main-menu'
  | 'onboarding' 
  | 'library' 
  | 'story-setup' 
  | 'generating'
  | 'reading' 
  | 'quiz' 
  | 'success' 
  | 'settings'
  | 'api-setup';