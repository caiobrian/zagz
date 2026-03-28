import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { mcpServersConfig } from "./config.js";

class AgenteMCPManager {
  private clients: Map<string, Client> = new Map();
  private allTools: any[] = [];

  private sanitizeSchemaForGemini(schema: any): any {
    if (!schema || typeof schema !== "object") return schema;

    if (Array.isArray(schema)) {
      return schema.map(item => this.sanitizeSchemaForGemini(item));
    }

    const sanitized: Record<string, any> = {};

    for (const [key, value] of Object.entries(schema)) {
      if (
        key === "$schema" ||
        key === "additionalProperties" ||
        key === "title" ||
        key === "default" ||
        key === "examples"
      ) {
        continue;
      }

      sanitized[key] = this.sanitizeSchemaForGemini(value);
    }

    return sanitized;
  }

  async init() {
    console.log("[MCP]: Inicializando conexões com servidores...");
    
    for (const [name, config] of Object.entries(mcpServersConfig.mcpServers)) {
      try {
        const transport = new StdioClientTransport({
          command: config.command,
          args: config.args,
          env: { ...process.env, ...(config.env || {}) } as any
        });

        const client = new Client({
          name: "whatsapp-ai-agent",
          version: "1.0.0"
        }, {
          capabilities: {}
        });

        await client.connect(transport);
        this.clients.set(name, client);
        
        const response = await client.listTools();
        const serverTools = response.tools.map(t => ({
          server: name,
          ...t
        }));
        
        this.allTools.push(...serverTools);
        console.log(`[MCP]: Servidor '${name}' conectado com ${serverTools.length} ferramentas.`);
      } catch (error) {
        console.error(`[MCP]: Falha ao conectar ao servidor '${name}':`, error);
      }
    }
  }

  getToolsForGemini() {
    return this.allTools.map(t => ({
      name: `${t.server}__${t.name}`,
      description: t.description,
      parameters: this.sanitizeSchemaForGemini(t.inputSchema)
    }));
  }

  async callTool(geminiToolName: string, args: any) {
    const [serverName, toolName] = geminiToolName.split('__');
    const client = this.clients.get(serverName);
    
    if (!client) throw new Error(`Servidor MCP '${serverName}' não encontrado.`);
    
    console.log(`[MCP]: Executando ${serverName}.${toolName} com args:`, args);
    const result = await client.callTool({
      name: toolName,
      arguments: args
    });
    
    // Casting para lidar com a estrutura dinâmica da resposta do MCP
    const content = (result as any).content;
    if (Array.isArray(content) && content.length > 0) {
      return content[0].text || JSON.stringify(content[0]);
    }
    
    return JSON.stringify(result) || "Execução concluída sem retorno textual.";
  }
}

export const mcpManager = new AgenteMCPManager();
