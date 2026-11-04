import source from "./study-material.json";
import type { StudyMaterial } from "./material";

// The author explicitly shares this library. Per-user overrides stay in D1.
export const sharedMaterial: StudyMaterial = {
  reasons: source.reasons,
  stories: source.stories.map(({ id, topic, text }) => ({ id, text: `${topic}\n${text}` })),
  frameworks: source.frameworks,
  functions: source.functions,
};
