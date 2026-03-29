import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { MCPServerConfig } from "../../mcp/config.js";

export interface ExternalSkillsConfig {
  mcpServers: Array<{
    name: string;
    config: MCPServerConfig;
  }>;
  customSkills: string[]; // paths to skill directories
}

function getConfigPath(): string {
  const __dirname = fileURLToPath(new URL(".", import.meta.url));
  return join(__dirname, "skills.json");
}

export function loadExternalConfig(): ExternalSkillsConfig {
  try {
    const raw = readFileSync(getConfigPath(), "utf-8");
    return JSON.parse(raw) as ExternalSkillsConfig;
  } catch {
    return { mcpServers: [], customSkills: [] };
  }
}

export function saveExternalConfig(config: ExternalSkillsConfig): void {
  writeFileSync(getConfigPath(), JSON.stringify(config, null, 2), "utf-8");
}

export function addMcpServer(name: string, config: MCPServerConfig): void {
  const current = loadExternalConfig();
  // Remove existing entry with same name if present
  current.mcpServers = current.mcpServers.filter((s) => s.name !== name);
  current.mcpServers.push({ name, config });
  saveExternalConfig(current);
}
