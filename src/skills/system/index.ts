import type { Skill, SkillTool } from "../types.js";

// These tools are loaded lazily only when ALLOW_SELF_MODIFICATION=true
// The skill returns empty tools array when self-modification is disabled
const tools: SkillTool[] = [];

const skill: Skill = {
  name: "system",
  version: "1.0.0",
  description: "Autonomous actions and self-evolution (requires ALLOW_SELF_MODIFICATION=true)",
  tools,
  async onInit() {
    if (process.env.ALLOW_SELF_MODIFICATION !== "true") return;
    try {
      const { autonomousTool } = await import("../../tools/autonomous.js");
      const { selfEvolutionTool, rollbackEvolutionTool } = await import(
        "../../tools/selfEvolution.js"
      );

      tools.push({
        name: autonomousTool.name,
        description: autonomousTool.description,
        parameters: autonomousTool.parameters as Record<string, unknown>,
        execute(args, _sessionId) {
          return autonomousTool.execute(args);
        },
      });

      tools.push({
        name: selfEvolutionTool.name,
        description: selfEvolutionTool.description,
        parameters: selfEvolutionTool.parameters as Record<string, unknown>,
        execute(args, _sessionId) {
          return selfEvolutionTool.execute(args);
        },
      });

      tools.push({
        name: rollbackEvolutionTool.name,
        description: rollbackEvolutionTool.description,
        parameters: rollbackEvolutionTool.parameters as Record<string, unknown>,
        execute(args, _sessionId) {
          return rollbackEvolutionTool.execute(args);
        },
      });
    } catch (err) {
      console.error("[SystemSkill] Failed to load self-modification tools:", err);
    }
  },
};

export default skill;
