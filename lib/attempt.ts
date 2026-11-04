export type StoredFile = { key: string; name: string; type: string; size: number };
export type ItemResult = {
  number: number;
  score: number;
  transcript: string;
  reason: string;
  advice: string;
  audibleEvidence: string;
  recommendedAnswer?: string;
  optimizationNote?: string;
  selectedReasons?: { id: number; theme: string; sentence: string; usedPhrase?: string }[];
  reasonNote?: string;
  materialIds?: string[];
  reusedPhrases?: string[];
  reuseNote?: string;
  answerModel?: string;
};
export type Attempt = {
  id: string;
  createdAt: string;
  updatedAt: string;
  title: string;
  prompts: string[];
  images: StoredFile[];
  audio: (StoredFile | null)[];
  results: (ItemResult | null)[];
  band: number | null;
  bandNote: string | null;
  status: string;
};

export const ITEM_COUNT = 11;
export const emptyPrompts = () => Array<string>(ITEM_COUNT).fill("");
export const emptyFiles = () => Array<StoredFile | null>(ITEM_COUNT).fill(null);
export const emptyResults = () => Array<ItemResult | null>(ITEM_COUNT).fill(null);
export const taskName = (number: number) => number <= 7 ? "Listen and Repeat" : "Take an Interview";
