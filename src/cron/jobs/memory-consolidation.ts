import { memoryService } from "../../agent/memory.js";
import { createAIProvider } from "../../agent/providers/index.js";
import { conversationsQueries } from "../../db/queries/conversations.js";

export const memoryConsolidationJob = {
  name: "memory_consolidation",
  schedule: "0 3 * * 0", // Sunday 3 AM

  async run(): Promise<string> {
    try {
      // Fetch last 7 days of conversations
      const allConvs = conversationsQueries.getRecent(200);
      if (allConvs.length === 0) return "Sem conversas para consolidar.";

      const conversationText = allConvs
        .map((c) => `${c.role === "user" ? "Usuário" : "Agente"}: ${c.content}`)
        .join("\n");

      const provider = createAIProvider();
      const chat = provider.startChat({
        systemPrompt: "Você é um sistema de consolidação de memórias. Retorne APENAS JSON válido.",
        history: [],
        tools: [],
      });

      const consolidationPrompt = `Analise as últimas conversas e:
1. Identifique padrões de comportamento e preferências recorrentes do usuário
2. Identifique memórias desatualizadas ou contraditórias
3. Sugira novas memórias para salvar

Retorne JSON com esta estrutura:
{
  "to_save": [{"key": "...", "value": "...", "category": "..."}],
  "to_delete": ["key1", "key2"],
  "summary": "resumo breve da consolidação"
}

Conversas:
${conversationText.slice(0, 8000)}`; // Limit context size

      const result = await chat.send(consolidationPrompt);
      if (!result.text) return "Consolidação sem resultado.";

      const jsonMatch = result.text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return "Consolidação: resposta sem JSON válido.";

      const parsed = JSON.parse(jsonMatch[0]) as {
        to_save?: Array<{ key: string; value: string; category: string }>;
        to_delete?: string[];
        summary?: string;
      };

      let saved = 0;
      let deleted = 0;

      for (const fact of parsed.to_save ?? []) {
        if (fact.key && fact.value) {
          memoryService.set(fact.key, fact.value, fact.category);
          saved++;
        }
      }

      for (const key of parsed.to_delete ?? []) {
        memoryService.delete(key);
        deleted++;
      }

      return `Consolidação concluída: ${saved} memórias salvas, ${deleted} removidas. ${parsed.summary ?? ""}`;
    } catch (err) {
      console.error("[MemoryConsolidation] Error:", err);
      return `Consolidação falhou: ${err instanceof Error ? err.message : String(err)}`;
    }
  },
};
