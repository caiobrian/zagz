import { memoryService } from "../agent/memory.js";
import { cronQueries } from "../db/queries/cron.js";

export const memoryReadTool = {
  name: "memory_read" as const,
  description:
    "Lê fatos específicos sobre o usuário da memória semântica. Use para consultar preferências, rotinas, dados financeiros ou outros fatos persistentes.",
  parameters: {
    type: "OBJECT",
    properties: {
      key: {
        type: "STRING",
        description:
          'Chave específica a buscar (ex: "finance.card_avg", "preferences.cinema"). Se omitida, retorna todas as memórias.',
      },
      category: {
        type: "STRING",
        description:
          'Categoria para filtrar (ex: "finance", "projects", "preferences", "routine"). Opcional.',
      },
    },
  },
  execute(args: { key?: string; category?: string }): string {
    if (args.key) {
      const value = memoryService.get(args.key);
      if (value === undefined) return `Nenhuma memória encontrada para a chave "${args.key}".`;
      return `${args.key}: ${typeof value === "string" ? value : JSON.stringify(value)}`;
    }

    if (args.category) {
      const mems = memoryService.getByCategory(args.category);
      if (mems.length === 0) return `Nenhuma memória na categoria "${args.category}".`;
      return mems.map((m) => `${m.key}: ${m.value}`).join("\n");
    }

    const all = memoryService.getAll();
    if (all.length === 0) return "Nenhuma memória registrada.";
    return all.map((m) => `[${m.category ?? "geral"}] ${m.key}: ${m.value}`).join("\n");
  },
};

export const memoryWriteTool = {
  name: "memory_write" as const,
  description:
    "Salva um fato sobre o usuário na memória semântica para uso futuro. Use para armazenar preferências, localização, dados financeiros, rotinas ou qualquer informação relevante.",
  parameters: {
    type: "OBJECT",
    properties: {
      key: {
        type: "STRING",
        description:
          'Chave única para o fato (ex: "finance.card_avg", "preferences.cinema", "routine.wake_up", "location.home").',
      },
      value: {
        type: "STRING",
        description: "Valor a armazenar. Pode ser texto simples ou JSON serializado.",
      },
      category: {
        type: "STRING",
        description:
          'Categoria do fato: "finance", "projects", "preferences", "routine", "location" ou outra.',
      },
    },
    required: ["key", "value"],
  },
  execute(args: { key: string; value: string; category?: string }): string {
    memoryService.set(args.key, args.value, args.category);
    return `Memória salva: ${args.key} = ${args.value}`;
  },
};

export const cronManageTool = {
  name: "cron_manage" as const,
  description:
    "Cria, edita, ativa/desativa ou remove rotinas agendadas. Use para gerenciar tarefas automáticas como briefings matinais, alertas financeiros e resumos semanais.",
  parameters: {
    type: "OBJECT",
    properties: {
      action: {
        type: "STRING",
        description:
          'Ação: "list" (listar jobs), "enable" (ativar), "disable" (desativar), "delete" (remover).',
      },
      name: {
        type: "STRING",
        description: 'Nome do job (ex: "morning_briefing", "finance_summary").',
      },
      sessionId: {
        type: "STRING",
        description: "ID da sessão do usuário (preenchido automaticamente pelo sistema).",
      },
    },
    required: ["action"],
  },
  execute(args: { action: string; name?: string; sessionId?: string }): string {
    // Protege ações destrutivas contra uso não autorizado.
    // Se AUTHORIZED_JID estiver configurado, apenas essa sessão pode modificar cron jobs.
    const authorizedJid = process.env.AUTHORIZED_JID;
    const isWriteAction = args.action !== "list";
    if (authorizedJid && isWriteAction) {
      const sessionId = args.sessionId ?? "";
      if (!sessionId.includes(authorizedJid.replace("@s.whatsapp.net", ""))) {
        return "Ação não autorizada: apenas o usuário principal pode gerenciar rotinas agendadas.";
      }
    }

    switch (args.action) {
      case "list": {
        const jobs = cronQueries.getAll();
        if (jobs.length === 0) return "Nenhum cron job cadastrado.";
        return jobs
          .map(
            (j) =>
              `${j.enabled ? "✅" : "❌"} ${j.name} | ${j.schedule} | último: ${j.last_run_at ?? "nunca"} | status: ${j.last_status ?? "-"}`
          )
          .join("\n");
      }
      case "enable": {
        if (!args.name) return "Informe o nome do job.";
        cronQueries.setEnabled(args.name, true);
        return `Job "${args.name}" ativado.`;
      }
      case "disable": {
        if (!args.name) return "Informe o nome do job.";
        cronQueries.setEnabled(args.name, false);
        return `Job "${args.name}" desativado.`;
      }
      case "delete": {
        if (!args.name) return "Informe o nome do job.";
        cronQueries.delete(args.name);
        return `Job "${args.name}" removido.`;
      }
      default:
        return `Ação desconhecida: "${args.action}". Use: list, enable, disable, delete.`;
    }
  },
};
