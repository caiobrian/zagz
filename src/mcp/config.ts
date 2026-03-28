export interface MCPServerConfig {
  command: string;
  args: string[];
  env?: Record<string, string>;
}

export const mcpServersConfig: { mcpServers: Record<string, MCPServerConfig> } = {
  mcpServers: {
    "filesystem": {
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-filesystem", process.cwd()]
    }
  }
};
