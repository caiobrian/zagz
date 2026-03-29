import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
import { buildSystemPrompt } from './prompt.js';
import { sessionService } from './session.js';
import { conversationsQueries } from '../db/queries/conversations.js';
import { toolRegistry } from '../tools/registry.js';

dotenv.config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
const geminiModel = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const MAX_TOOL_ITERATIONS = 5;

/**
 * Converts Markdown-heavy text to WhatsApp-friendly plain text.
 */
function formatForWhatsApp(text: string): string {
  const lines = text
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '$1\n$2')
    .replace(/\*\*(.*?)\*\*/g, '*$1*')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);

  const formatted: string[] = [];
  for (const line of lines) {
    if (line.startsWith('* ') || line.startsWith('*   ')) {
      formatted.push(`- ${line.replace(/^\*\s+/, '')}`);
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
    if (next && (/^\d+\.\s/.test(deduped[i]) || deduped[i].startsWith('Mapa') || deduped[i].startsWith('Links:'))) {
      result.push('');
    }
  }

  return result.join('\n').trim();
}

export const agentCore = {
  /**
   * Main entry point for processing a user message.
   */
  async handleMessage(userMessage: string): Promise<string> {
    try {
      // 1. Load active session (if any)
      const session = sessionService.getActive();

      // 2. Build system prompt injecting memories + session context
      const systemPrompt = buildSystemPrompt(session);

      // 3. Get Gemini model with all tools
      const model = genAI.getGenerativeModel({
        model: geminiModel,
        systemInstruction: systemPrompt,
        tools: [{ functionDeclarations: toolRegistry.getDeclarations() as any }],
      });

      // 4. Build chat history from recent conversations (excluding current message)
      const recentConvs = conversationsQueries.getRecent(20);
      const chatHistory = recentConvs.map(c => ({
        role: c.role === 'user' ? ('user' as const) : ('model' as const),
        parts: [{ text: c.content }],
      }));

      // 5. Start chat and send user message
      const chat = model.startChat({ history: chatHistory });
      let result = await chat.sendMessage(userMessage);
      let response = result.response;

      // 6. Tool call loop (max MAX_TOOL_ITERATIONS to prevent infinite loops)
      let iterations = 0;
      while (iterations < MAX_TOOL_ITERATIONS) {
        const toolCallParts = response.candidates?.[0]?.content?.parts?.filter(p => p.functionCall) ?? [];
        if (toolCallParts.length === 0) break;

        iterations++;
        const functionResponses = [];

        for (const part of toolCallParts) {
          if (!part.functionCall) continue;
          const { name, args } = part.functionCall;
          console.log('[Agent] tool call:', name, JSON.stringify(args));

          // Self-modification tools return a polite message instead of raw output
          if (
            process.env.ALLOW_SELF_MODIFICATION === 'true' &&
            (name === 'evolve_agent' || name === 'autonomous_action')
          ) {
            await toolRegistry.execute(name, (args ?? {}) as Record<string, unknown>, session?.id);
            const politeMsg = 'Estou terminando de preparar isso para você. Pode me enviar um "ok" ou repetir o pedido em 10 segundos?';
            conversationsQueries.add('user', userMessage, session?.id);
            conversationsQueries.add('assistant', politeMsg, session?.id);
            return politeMsg;
          }

          const toolResult = await toolRegistry.execute(name, (args ?? {}) as Record<string, unknown>, session?.id);
          functionResponses.push({ functionResponse: { name, response: { content: toolResult } } });
        }

        result = await chat.sendMessage(functionResponses as any);
        response = result.response;
      }

      // 7. Extract final text
      const responseText = response.text() || 'Desculpe, não consegui processar sua solicitação.';
      const formatted = formatForWhatsApp(responseText);

      // 8. Persist conversation
      conversationsQueries.add('user', userMessage, session?.id);
      conversationsQueries.add('assistant', formatted, session?.id);

      return formatted;
    } catch (error) {
      console.error('[Agent] Error handling message:', error);
      return 'Estou processando sua solicitação, por favor aguarde um momento.';
    }
  },

  /**
   * Called by cron jobs — processes an internal prompt and returns the response
   * (caller is responsible for sending via WhatsApp).
   */
  async handleCronPrompt(prompt: string, jobName: string): Promise<string> {
    try {
      const systemPrompt = buildSystemPrompt(undefined);
      const model = genAI.getGenerativeModel({
        model: geminiModel,
        systemInstruction: systemPrompt,
        tools: [{ functionDeclarations: toolRegistry.getDeclarations() as any }],
      });

      const chat = model.startChat({ history: [] });
      let result = await chat.sendMessage(prompt);
      let response = result.response;

      let iterations = 0;
      while (iterations < MAX_TOOL_ITERATIONS) {
        const toolCallParts = response.candidates?.[0]?.content?.parts?.filter(p => p.functionCall) ?? [];
        if (toolCallParts.length === 0) break;
        iterations++;

        const functionResponses = [];
        for (const part of toolCallParts) {
          if (!part.functionCall) continue;
          const { name, args } = part.functionCall;
          const toolResult = await toolRegistry.execute(name, (args ?? {}) as Record<string, unknown>);
          functionResponses.push({ functionResponse: { name, response: { content: toolResult } } });
        }

        result = await chat.sendMessage(functionResponses as any);
        response = result.response;
      }

      const responseText = response.text() || `Cron job "${jobName}" executado sem resposta.`;
      return formatForWhatsApp(responseText);
    } catch (error) {
      console.error(`[Agent] Cron job "${jobName}" error:`, error);
      throw error;
    }
  },
};
