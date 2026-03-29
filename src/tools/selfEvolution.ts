import fs from "node:fs";
import path from "node:path";

/**
 * Ferramenta de Auto-Evolução.
 * Permite que o agente instale novos servidores MCP e atualize sua própria configuração.
 */
export const selfEvolutionTool = {
  name: "evolve_agent",
  description:
    "Instala um novo servidor MCP ou CLI para expandir as habilidades do agente. Use quando o usuário pedir algo que exija uma ferramenta que você ainda não tem.",
  parameters: {
    type: "OBJECT",
    properties: {
      serverName: {
        type: "STRING",
        description: "Nome único para o novo servidor (ex: 'gmail-server', 'weather-server')",
      },
      npmPackage: {
        type: "STRING",
        description:
          "O pacote NPM ou comando npx para rodar o servidor (ex: '@modelcontextprotocol/server-gmail')",
      },
      command: {
        type: "STRING",
        description: "O comando para executar (geralmente 'npx')",
      },
      args: {
        type: "ARRAY",
        items: { type: "STRING" },
        description: "Argumentos necessários (ex: ['-y', '@modelcontextprotocol/server-gmail'])",
      },
    },
    required: ["serverName", "npmPackage", "command", "args"],
  },

  execute: async (args: Record<string, unknown>) => {
    try {
      console.log(`[Auto-Evolução]: Instalando nova habilidade: ${args.serverName}...`);

      // 1. Instala o pacote se necessário (opcional se usar npx direto)
      // execSync(`npm install ${args.npmPackage}`, { stdio: 'inherit' });

      // 2. Lê a configuração atual
      const configPath = path.resolve("src/mcp/config.ts");
      let configContent = fs.readFileSync(configPath, "utf-8");

      // 3. Injeta o novo servidor no objeto mcpServers (lógica simples de string replacement para o boilerplate)
      const newServerEntry = `
    "${args.serverName}": {
      command: "${args.command}",
      args: ${JSON.stringify(args.args)}
    },`;

      // Insere antes do fechamento do objeto mcpServers
      configContent = configContent.replace("  mcpServers: {", `  mcpServers: {${newServerEntry}`);

      fs.writeFileSync(configPath, configContent);

      console.log(`[Auto-Evolução]: Configuração atualizada com ${args.serverName}.`);

      return `Sucesso! Instalei a ferramenta '${args.serverName}'. Agora vou reiniciar para ativar minha nova habilidade.`;
    } catch (error: unknown) {
      console.error("[Auto-Evolução] Erro:", error);
      return `Falha ao evoluir: ${error instanceof Error ? error.message : String(error)}`;
    }
  },
};
