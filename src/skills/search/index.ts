import { placesSearchTool } from "../../tools/placesSearch.js";
import { tavilySearchTool } from "../../tools/tavilySearch.js";
import type { Skill, SkillTool } from "../types.js";

const skill: Skill = {
  name: "search",
  version: "1.0.0",
  description: "Web search (Tavily) and nearby places search (Google Places)",
  tools: [
    {
      name: tavilySearchTool.name,
      description: tavilySearchTool.description,
      parameters: tavilySearchTool.parameters as Record<string, unknown>,
      rateLimit: 30,
      execute(args, _sessionId) {
        return tavilySearchTool.execute(args as Parameters<typeof tavilySearchTool.execute>[0]);
      },
    } satisfies SkillTool,
    {
      name: placesSearchTool.name,
      description: placesSearchTool.description,
      parameters: placesSearchTool.parameters as Record<string, unknown>,
      rateLimit: 30,
      execute(args, _sessionId) {
        return placesSearchTool.execute(args as Parameters<typeof placesSearchTool.execute>[0]);
      },
    } satisfies SkillTool,
  ],
};

export default skill;
