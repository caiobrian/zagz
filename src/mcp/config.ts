import fs from "node:fs";
import path from "node:path";

export interface MCPServerConfig {
  command: string;
  args: string[];
  env?: Record<string, string>;
}

// Diretório isolado para o agente ler/escrever arquivos sem acesso às credenciais do projeto
const workspaceDir = path.join(process.cwd(), "workspace");
if (!fs.existsSync(workspaceDir)) {
  fs.mkdirSync(workspaceDir, { recursive: true });
}

export const mcpServersConfig: { mcpServers: Record<string, MCPServerConfig> } = {
  mcpServers: {
    filesystem: {
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-filesystem", workspaceDir],
    },
    playwright: {
      command: "npx",
      args: ["-y", "@playwright/mcp@latest", "--headless"],
    },
  },
};
