import type { StudyMaterial } from "./material";
import { sharedMaterial } from "./shared-material";
import { validateMaterial } from "./material";
import { getBindings } from "./server";

export async function getMaterial(ownerId: string): Promise<StudyMaterial | null> {
  const row = await getBindings().db.prepare("SELECT content FROM study_materials WHERE owner_id = ?").bind(ownerId).first<{ content: string }>();
  return row ? validateMaterial(JSON.parse(row.content)) : null;
}

export async function requireMaterial(ownerId: string): Promise<StudyMaterial> {
  const material = await getMaterial(ownerId);
  return material ?? sharedMaterial;
}
