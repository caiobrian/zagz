import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { toolsLogQueries } from "../db/queries/tools.js";
import { mcpManager } from "../mcp/client.js";
import { loadExternalConfig } from "../skills/external/loader.js";
import { loadSkills } from "../skills/loader.js";
import type { Skill, SkillTool } from "../skills/types.js";

const allowSelfModification = process.env.ALLOW_SELF_MODIFICATION === "true";

// Tool map built during init: toolName → SkillTool
const _toolMap = new Map<string, SkillTool>();

// Rate limiter in-memory
const _rateCounts = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(tool: SkillTool): string | null {
  const limit = tool.rateLimit;
  if (!limit) return null;
  const name = tool.name;
  const now = Date.now();
  const entry = _rateCounts.get(name);
  if (!entry || now >= entry.resetAt) {
    _rateCounts.set(name, { count: 1, resetAt: now + 3600_000 });
    return null;
  }
  if (entry.count >= limit) {
    return `Limite de ${limit} chamadas/hora atingido para "${name}". Tente novamente mais tarde.`;
  }
  entry.count++;
  return null;
}

// Masks sensitive patterns before persisting in logs
function sanitizeForLog(value: unknown): unknown {
  if (typeof value === "string") {
    return value
      .replace(/\b\d{13,19}\b/g, "****")
      .replace(/\b\d{3,4}\b(?=.*cvv|.*cvc)/gi, "***")
      .replace(/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g, "***.***.***-**");
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, sanitizeForLog(v)])
    );
  }
  return value;
}

type ToolDeclaration = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
};

/**
 * Initializes the registry by loading all skills from the skills directory.
 * Must be called once at startup (after initSelfModificationTools is no longer needed).
 */
async function initRegistry(extraSkills?: Skill[]): Promise<void> {
  const __dirname = fileURLToPath(new URL(".", import.meta.url));
  const skillsDir = join(__dirname, "../skills");

  const skills = await loadSkills(skillsDir);

  // Load custom skill directories from skills.json
  const externalConfig = loadExternalConfig();
  if (externalConfig.customSkills.length > 0) {
    console.log(
      `[Registry] Loading ${externalConfig.customSkills.length} custom skill(s) from skills.json...`
    );
    for (const skillPath of externalConfig.customSkills) {
      const customSkills = await loadSkills(skillPath);
      skills.push(...customSkills);
    }
  }

  // Also include any extra skills passed directly (e.g. runtime registration)
  if (extraSkills) {
    skills.push(...extraSkills);
  }

  for (const skill of skills) {
    for (const tool of skill.tools) {
      _toolMap.set(tool.name, tool);
    }
  }

  console.log(`[Registry] Loaded ${_toolMap.size} tools from ${skills.length} skills.`);
}

/**
 * Returns all Gemini function declarations (built-in + MCP).
 */
function getDeclarations(): ToolDeclaration[] {
  const declarations: ToolDeclaration[] = [];

  for (const tool of _toolMap.values()) {
    declarations.push({
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    });
  }

  const mcpTools = mcpManager.getToolsForGemini();
  for (const t of mcpTools) {
    declarations.push({
      name: t.name,
      description: t.description ?? "",
      parameters: t.parameters as Record<string, unknown>,
    });
  }

  return declarations;
}

/**
 * Executes a tool by name. Returns a string result.
 */
async function execute(
  name: string,
  args: Record<string, unknown>,
  sessionId?: string
): Promise<string> {
  const start = Date.now();

  const tool = _toolMap.get(name);

  if (tool) {
    const rateLimitError = checkRateLimit(tool);
    if (rateLimitError) return rateLimitError;

    try {
      const result = await tool.execute(args, sessionId);

      if (!tool.logBlocklist) {
        toolsLogQueries.log(
          name,
          sanitizeForLog(args),
          sanitizeForLog(result),
          Date.now() - start,
          sessionId
        );
      }
      return result;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      if (!tool.logBlocklist) {
        toolsLogQueries.log(
          name,
          sanitizeForLog(args),
          { error: errorMsg },
          Date.now() - start,
          sessionId
        );
      }
      console.error(`[Registry] Tool "${name}" failed:`, error);
      return `Ferramenta "${name}" falhou: ${errorMsg}`;
    }
  }

  // MCP fallthrough
  try {
    const result = await mcpManager.callTool(name, args);
    toolsLogQueries.log(
      name,
      sanitizeForLog(args),
      sanitizeForLog(result),
      Date.now() - start,
      sessionId
    );
    return result;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    toolsLogQueries.log(
      name,
      sanitizeForLog(args),
      { error: errorMsg },
      Date.now() - start,
      sessionId
    );
    console.error(`[Registry] MCP tool "${name}" failed:`, error);
    return `Ferramenta "${name}" falhou: ${errorMsg}`;
  }
}

/**
 * @deprecated Use initRegistry() instead. Kept for backward compatibility during transition.
 */
async function initSelfModificationTools(): Promise<void> {
  // Self-modification tools are now loaded via the system skill in initRegistry()
  if (!allowSelfModification) return;
  console.log(
    "[Registry] Self-modification tools will be loaded via system skill in initRegistry()."
  );
}

/**
 * Adds a skill at runtime (used by external skills loader and evolve_agent).
 */
function registerSkill(skill: Skill): void {
  for (const tool of skill.tools) {
    _toolMap.set(tool.name, tool);
  }
  console.log(
    `[Registry] Registered skill "${skill.name}" with ${skill.tools.length} tool(s) at runtime.`
  );
}

export const toolRegistry = {
  getDeclarations,
  execute,
  initRegistry,
  initSelfModificationTools,
  registerSkill,
};
