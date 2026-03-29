import { evolutionQueries } from "../db/queries/evolution.js";
import { mcpManager } from "../mcp/client.js";
import { addMcpServer, loadExternalConfig } from "../skills/external/loader.js";

/**
 * Ferramenta de Auto-Evolução.
 * Adiciona novos servidores MCP ao skills.json e os registra em runtime sem restart.
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
      const serverName = String(args.serverName);
      const command = String(args.command);
      const argsArray = Array.isArray(args.args) ? (args.args as string[]) : [];

      console.log(`[Auto-Evolução]: Adicionando nova habilidade: ${serverName}...`);

      // 1. Read snapshot before
      const snapshotBefore = JSON.stringify(loadExternalConfig(), null, 2);

      // 2. Add MCP server to skills.json (JSON-based, no TypeScript file modification)
      addMcpServer(serverName, { command, args: argsArray });

      // 3. Read snapshot after
      const snapshotAfter = JSON.stringify(loadExternalConfig(), null, 2);

      // 4. Audit log
      evolutionQueries.log({
        action: "add_mcp_server",
        description: `Added MCP server "${serverName}" (${command} ${argsArray.join(" ")})`,
        author: "evolve_agent",
        snapshotBefore,
        snapshotAfter,
      });

      // 5. Connect the new MCP server at runtime and register its tools
      try {
        await mcpManager.addServer(serverName, { command, args: argsArray });
        const newTools = mcpManager
          .getToolsForGemini()
          .filter((t) => t.name.startsWith(`${serverName}__`));
        console.log(
          `[Auto-Evolução]: ${newTools.length} nova(s) ferramenta(s) registrada(s) de "${serverName}".`
        );
      } catch (connErr) {
        console.warn(
          `[Auto-Evolução]: Configuração salva, mas não foi possível conectar ao servidor agora: ${connErr}`
        );
        return `Configuração do servidor '${serverName}' salva em skills.json. Será ativado no próximo restart.`;
      }

      return `Sucesso! Ferramenta '${serverName}' adicionada e ativada em tempo real.`;
    } catch (error: unknown) {
      console.error("[Auto-Evolução] Erro:", error);
      return `Falha ao evoluir: ${error instanceof Error ? error.message : String(error)}`;
    }
  },
};

/**
 * Ferramenta de Rollback de Evolução.
 * Restaura o estado anterior de uma modificação registrada no audit log.
 */
export const rollbackEvolutionTool = {
  name: "rollback_evolution",
  description:
    "Lista as últimas modificações de evolução do agente ou restaura o estado anterior de uma modificação específica.",
  parameters: {
    type: "OBJECT",
    properties: {
      action: {
        type: "STRING",
        enum: ["list", "rollback"],
        description: '"list" para listar modificações, "rollback" para restaurar uma entrada.',
      },
      entry_id: {
        type: "NUMBER",
        description: "ID da entrada no audit log para restaurar (necessário para action=rollback).",
      },
    },
    required: ["action"],
  },

  execute: async (args: Record<string, unknown>) => {
    const action = String(args.action);

    if (action === "list") {
      const entries = evolutionQueries.getAll(20);
      if (entries.length === 0) return "Nenhuma evolução registrada.";
      return entries
        .map((e) => `#${e.id} [${e.timestamp}] ${e.action}: ${e.description} (autor: ${e.author})`)
        .join("\n");
    }

    if (action === "rollback") {
      const id = Number(args.entry_id);
      if (!id) return "Informe o entry_id para rollback.";
      const entry = evolutionQueries.getById(id);
      if (!entry) return `Entrada #${id} não encontrada.`;
      if (!entry.snapshot_before)
        return `Entrada #${id} não possui snapshot anterior para rollback.`;

      try {
        const { saveExternalConfig } = await import("../skills/external/loader.js");
        const config = JSON.parse(entry.snapshot_before);
        saveExternalConfig(config);

        evolutionQueries.log({
          action: "rollback",
          description: `Rolled back to snapshot before entry #${id}`,
          author: "rollback_evolution",
          snapshotBefore: entry.snapshot_after ?? undefined,
          snapshotAfter: entry.snapshot_before,
        });

        // Re-init registry with restored config would require restart
        return `Rollback realizado para o estado antes da entrada #${id}. Reinicie o agente para aplicar as mudanças.`;
      } catch (err) {
        return `Falha no rollback: ${err instanceof Error ? err.message : String(err)}`;
      }
    }

    return `Ação desconhecida: "${action}". Use list ou rollback.`;
  },
};
