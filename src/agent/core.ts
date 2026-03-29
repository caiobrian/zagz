import dotenv from "dotenv";
import { conversationsQueries } from "../db/queries/conversations.js";
import { toolRegistry } from "../tools/registry.js";
import { extractMemories } from "./memory-extractor.js";
import { buildSystemPrompt } from "./prompt.js";
import { createAIProvider } from "./providers/index.js";
import type { AIProvider, ToolResult } from "./providers/types.js";
import { sessionService } from "./session.js";

dotenv.config();

const MAX_TOOL_ITERATIONS = 20;

// Lazy-init provider (one per process)
let _provider: AIProvider | null = null;
function getProvider(): AIProvider {
  if (!_provider) _provider = createAIProvider();
  return _provider;
}

// Loop detection: if the same tool is called with the same args 3x → stop
type ToolCallKey = string;
const toolCallHistory = new Map<ToolCallKey, number>();

function detectLoop(name: string, args: Record<string, unknown>): boolean {
  const key = `${name}:${JSON.stringify(args)}`;
  const count = (toolCallHistory.get(key) ?? 0) + 1;
  toolCallHistory.set(key, count);
  return count >= 3;
}

function clearLoopHistory(): void {
  toolCallHistory.clear();
}

const FAILURE_PATTERNS = /falhou:|failed:|error:/i;

/**
 * Converts Markdown-heavy text to WhatsApp-friendly plain text.
 */
function formatForWhatsApp(text: string): string {
  const lines = text
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, "$1\n$2")
    .replace(/\*\*(.*?)\*\*/g, "*$1*")
    // Remove chain-of-thought tags from final response
    .replace(/\[PENSAMENTO\]:.*?(?=\[PLANO\]|\[EXECUÇÃO\]|\[RESPOSTA\]|$)/gs, "")
    .replace(/\[PLANO\]:.*?(?=\[EXECUÇÃO\]|\[RESPOSTA\]|$)/gs, "")
    .replace(/\[EXECUÇÃO\]:.*?(?=\[RESPOSTA\]|$)/gs, "")
    .replace(/\[RESPOSTA\]:\s*/g, "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const formatted: string[] = [];
  for (const line of lines) {
    if (line.startsWith("* ") || line.startsWith("*   ")) {
      formatted.push(`- ${line.replace(/^\*\s+/, "")}`);
    } else {
      formatted.push(line);
    }
  }

  // Deduplicate consecutive identical lines
  const deduped: string[] = [];
  for (const line of formatted) {
    if (line !== deduped[deduped.length - 1]) deduped.push(line);
  }

  // Add blank lines after numbered list items and map links
  const result: string[] = [];
  for (let i = 0; i < deduped.length; i++) {
    result.push(deduped[i]);
    const next = deduped[i + 1];
    if (
      next &&
      (/^\d+\.\s/.test(deduped[i]) ||
        deduped[i].startsWith("Mapa") ||
        deduped[i].startsWith("Links:"))
    ) {
      result.push("");
    }
  }

  return result.join("\n").trim();
}

/**
 * Generates an explicit plan before executing the main message.
 */
async function generatePlan(userMessage: string, systemPrompt: string): Promise<string> {
  try {
    const planChat = getProvider().startChat({
      systemPrompt,
      history: [],
      tools: [],
    });
    const planPrompt = `Dado o pedido: "${userMessage}"
Lista em até 5 passos numerados o que você precisa fazer (ferramentas, verificações, confirmações).
Seja específico sobre qual ferramenta usar em cada passo. Responda APENAS com o plano, sem executar nada.`;
    const result = await planChat.send(planPrompt);
    return result.text ?? "";
  } catch {
    return "";
  }
}

export const agentCore = {
  /**
   * Main entry point for processing a user message.
   */
  async handleMessage(userMessage: string): Promise<string> {
    try {
      clearLoopHistory();

      // 1. Load active session (if any)
      const session = sessionService.getActive();

      // 2. Build system prompt injecting memories + session context
      const systemPrompt = buildSystemPrompt(session);

      // 3. Generate explicit plan before executing
      const plan = await generatePlan(userMessage, systemPrompt);

      // 4. Build chat history from recent conversations
      const recentConvs = conversationsQueries.getRecent(20);
      const chatHistory = recentConvs.map((c) => ({
        role: c.role === "user" ? ("user" as const) : ("assistant" as const),
        content: c.content,
      }));

      // 5. Start chat session with tools
      const chat = getProvider().startChat({
        systemPrompt,
        history: chatHistory,
        tools: toolRegistry.getDeclarations(),
      });

      // 6. Send user message (with plan injected if available)
      const messageWithPlan = plan
        ? `${userMessage}\n\n[Plano de execução gerado automaticamente:\n${plan}]`
        : userMessage;
      let response = await chat.send(messageWithPlan);

      // 7. Tool call loop (max MAX_TOOL_ITERATIONS)
      let iterations = 0;
      while (iterations < MAX_TOOL_ITERATIONS && response.toolCalls.length > 0) {
        iterations++;
        const toolResults: ToolResult[] = [];

        for (const toolCall of response.toolCalls) {
          const { name, args } = toolCall;
          console.log("[Agent] tool call:", name, JSON.stringify(args));

          // Self-modification tools return a polite message instead of raw output
          if (
            process.env.ALLOW_SELF_MODIFICATION === "true" &&
            (name === "evolve_agent" || name === "autonomous_action")
          ) {
            await toolRegistry.execute(name, args, session?.id);
            const politeMsg =
              'Estou terminando de preparar isso para você. Pode me enviar um "ok" ou repetir o pedido em 10 segundos?';
            conversationsQueries.add("user", userMessage, session?.id);
            conversationsQueries.add("assistant", politeMsg, session?.id);
            return politeMsg;
          }

          // Loop detection
          if (detectLoop(name, args)) {
            console.warn(`[Agent] Loop detected for tool "${name}" — stopping iterations.`);
            toolResults.push({
              name,
              content: `Loop detectado: a ferramenta "${name}" foi chamada com os mesmos argumentos 3 vezes. Interrompendo para evitar loop infinito.`,
            });
            continue;
          }

          const toolResult = await toolRegistry.execute(name, args, session?.id);

          // Error recovery hint
          if (FAILURE_PATTERNS.test(toolResult)) {
            toolResults.push({
              name,
              content: `A ferramenta ${name} falhou com: "${toolResult}".
Considere: (1) tentar abordagem alternativa, (2) informar o usuário do problema, (3) usar outra ferramenta.`,
            });
          } else {
            toolResults.push({ name, content: toolResult });
          }
        }

        response = await chat.send(toolResults);
      }

      // 8. Extract final text
      const responseText = response.text || "Desculpe, não consegui processar sua solicitação.";
      const formatted = formatForWhatsApp(responseText);

      // 9. Persist conversation
      conversationsQueries.add("user", userMessage, session?.id);
      conversationsQueries.add("assistant", formatted, session?.id);

      // 10. Extract memories in background (non-blocking)
      const conversationSnippet = `Usuário: ${userMessage}\nAgente: ${formatted}`;
      void extractMemories(conversationSnippet);

      return formatted;
    } catch (error) {
      console.error("[Agent] Error handling message:", error);
      return "Estou processando sua solicitação, por favor aguarde um momento.";
    }
  },

  /**
   * Called by cron jobs — processes an internal prompt and returns the response
   * (caller is responsible for sending via WhatsApp).
   */
  async handleCronPrompt(prompt: string, jobName: string): Promise<string> {
    try {
      clearLoopHistory();

      const systemPrompt = buildSystemPrompt(undefined);
      const chat = getProvider().startChat({
        systemPrompt,
        history: [],
        tools: toolRegistry.getDeclarations(),
      });

      let response = await chat.send(prompt);

      let iterations = 0;
      while (iterations < MAX_TOOL_ITERATIONS && response.toolCalls.length > 0) {
        iterations++;
        const toolResults: ToolResult[] = [];

        for (const toolCall of response.toolCalls) {
          const { name, args } = toolCall;

          if (detectLoop(name, args)) {
            console.warn(`[Agent/Cron] Loop detected for tool "${name}" — stopping.`);
            toolResults.push({
              name,
              content: `Loop detectado: "${name}" chamado 3x com mesmos args. Interrompendo.`,
            });
            continue;
          }

          const toolResult = await toolRegistry.execute(name, args);

          if (FAILURE_PATTERNS.test(toolResult)) {
            toolResults.push({
              name,
              content: `A ferramenta ${name} falhou: "${toolResult}". Tente abordagem alternativa.`,
            });
          } else {
            toolResults.push({ name, content: toolResult });
          }
        }

        response = await chat.send(toolResults);
      }

      const responseText = response.text || `Cron job "${jobName}" executado sem resposta.`;
      return formatForWhatsApp(responseText);
    } catch (error) {
      console.error(`[Agent] Cron job "${jobName}" error:`, error);
      throw error;
    }
  },
};
