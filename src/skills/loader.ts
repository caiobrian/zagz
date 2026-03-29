import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { Skill } from "./types.js";

/**
 * Dynamically loads all skills from the skills directory.
 * Each skill is a subdirectory with an index.ts/index.js exporting a default Skill object.
 */
export async function loadSkills(skillsDir: string): Promise<Skill[]> {
  const skills: Skill[] = [];

  let entries: string[];
  try {
    entries = readdirSync(skillsDir);
  } catch {
    console.warn(`[SkillLoader] Directory not found: ${skillsDir}`);
    return skills;
  }

  for (const entry of entries) {
    const entryPath = join(skillsDir, entry);
    try {
      const stat = statSync(entryPath);
      if (!stat.isDirectory()) continue;

      // Try index.js first (compiled), then index.ts (for tsx/ts-node)
      const candidates = ["index.js", "index.ts"];
      let loaded = false;

      for (const candidate of candidates) {
        const filePath = join(entryPath, candidate);
        try {
          statSync(filePath);
          const fileUrl = pathToFileURL(filePath).href;
          const mod = await import(fileUrl);
          const skill: Skill = mod.default ?? mod.skill;
          if (skill?.name && Array.isArray(skill.tools)) {
            if (skill.onInit) {
              await skill.onInit();
            }
            skills.push(skill);
            console.log(`[SkillLoader] Loaded skill: ${skill.name} v${skill.version}`);
            loaded = true;
            break;
          }
        } catch {
          // File doesn't exist or failed to import — try next candidate
        }
      }

      if (!loaded) {
        console.warn(`[SkillLoader] No valid skill found in: ${entryPath}`);
      }
    } catch (err) {
      console.error(`[SkillLoader] Error loading skill from ${entryPath}:`, err);
    }
  }

  return skills;
}
