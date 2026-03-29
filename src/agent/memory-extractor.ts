import { memoryService } from "./memory.js";
import { createAIProvider } from "./providers/index.js";

interface ExtractedFact {
  key: string;
  value: string;
  category: string;
}

/**
 * Analyzes a conversation snippet and extracts durable facts about the user.
 * Runs in the background after each response — does not block the user.
 */
export async function extractMemories(conversation: string): Promise<void> {
  if (!conversation || conversation.length < 50) return;

  try {
    const provider = createAIProvider();
    const chat = provider.startChat({
      systemPrompt: "Você é um extrator de fatos. Retorne APENAS JSON válido, sem texto adicional.",
      history: [],
      tools: [],
    });

    const extractPrompt = `Analise esta conversa e extraia APENAS fatos novos, duráveis e relevantes sobre o usuário.
Formato de saída JSON: [{"key": "...", "value": "...", "category": "..."}]
Categorias válidas: finance, projects, preferences, routine, location, episodic, context, preference
Se não houver nada relevante, retorne [].

Conversa:
${conversation}`;

    const result = await chat.send(extractPrompt);
    if (!result.text) return;

    // Parse and persist extracted facts
    const jsonMatch = result.text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return;

    const facts: ExtractedFact[] = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(facts) || facts.length === 0) return;

    for (const fact of facts) {
      if (fact.key && fact.value && fact.category) {
        memoryService.set(fact.key, fact.value, fact.category);
        console.log(`[MemoryExtractor] Saved: ${fact.key} = ${fact.value} (${fact.category})`);
      }
    }
  } catch (err) {
    // Non-critical — silently ignore extraction failures
    console.error("[MemoryExtractor] Error:", err);
  }
}
