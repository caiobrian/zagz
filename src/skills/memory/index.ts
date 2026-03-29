import { cronManageTool, memoryReadTool, memoryWriteTool } from "../../tools/memory-tool.js";
import type { Skill, SkillTool } from "../types.js";

const skill: Skill = {
  name: "memory",
  version: "1.0.0",
  description: "Semantic memory read/write and cron job management",
  tools: [
    {
      name: memoryReadTool.name,
      description: memoryReadTool.description,
      parameters: memoryReadTool.parameters as Record<string, unknown>,
      execute(args, _sessionId) {
        return memoryReadTool.execute(args as Parameters<typeof memoryReadTool.execute>[0]);
      },
    } satisfies SkillTool,
    {
      name: memoryWriteTool.name,
      description: memoryWriteTool.description,
      parameters: memoryWriteTool.parameters as Record<string, unknown>,
      execute(args, _sessionId) {
        return memoryWriteTool.execute(args as Parameters<typeof memoryWriteTool.execute>[0]);
      },
    } satisfies SkillTool,
    {
      name: cronManageTool.name,
      description: cronManageTool.description,
      parameters: cronManageTool.parameters as Record<string, unknown>,
      execute(args, sessionId) {
        return cronManageTool.execute({
          ...(args as Parameters<typeof cronManageTool.execute>[0]),
          sessionId,
        });
      },
    } satisfies SkillTool,
  ],
};

export default skill;
