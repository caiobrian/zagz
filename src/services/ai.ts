import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from 'dotenv';
import { dbService } from "../database/index.js";
import { mcpManager } from "../mcp/client.js";
import { selfEvolutionTool } from "../tools/selfEvolution.js";
import { autonomousTool } from "../tools/autonomous.js";
import { placesSearchTool } from "../tools/placesSearch.js";
import { tavilySearchTool } from "../tools/tavilySearch.js";

dotenv.config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
const geminiModel = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const allowSelfModification = process.env.ALLOW_SELF_MODIFICATION === "true";

interface PendingIntent {
  kind: "nearby_search";
  serviceType?: string;
  originalMessage: string;
}

const localIntentPatterns = [
  /perto de mim/i,
  /aqui perto/i,
  /na minha regi[aã]o/i,
  /onde posso levar/i,
  /onde posso ir/i,
  /onde tem/i,
  /mais pr[oó]ximo/i,
  /pr[oó]ximo de mim/i
];

const locationReplyPatterns = [
  /\bcep\b/i,
  /\bbairro\b/i,
  /\bcidade\b/i,
  /\bru?a\b/i,
  /\bavenida\b/i,
  /\bsp\b/i,
  /\bs[aã]o paulo\b/i
];

const serviceSearchPatterns = [
  /lava/i,
  /carro/i,
  /cinema/i,
  /restaurante/i,
  /mercado/i,
  /farm[aá]cia/i,
  /posto/i,
  /oficina/i
];

const inferServiceType = (message: string) => {
  const normalized = message.toLowerCase();
  if (normalized.includes("lava") || normalized.includes("lavar") || normalized.includes("carro")) return "lava_rapido";
  if (normalized.includes("cinema") || normalized.includes("filme")) return "cinema";
  if (normalized.includes("restaurante") || normalized.includes("comer")) return "restaurante";
  if (normalized.includes("farmacia")) return "farmacia";
  if (normalized.includes("mercado")) return "mercado";
  if (normalized.includes("oficina")) return "oficina";
  return null;
};

const serviceQueryMap: Record<string, string> = {
  lava_rapido: "lava rapido",
  cinema: "cinema",
  restaurante: "restaurante",
  farmacia: "farmacia",
  mercado: "mercado",
  oficina: "oficina"
};

const buildNearbyTextQuery = (originalMessage: string, serviceType?: string) => {
  const normalized = originalMessage.trim();
  if (normalized.length > 0) {
    return normalized;
  }
  return serviceType ? serviceQueryMap[serviceType] || serviceType : "";
};

const isLocalIntent = (message: string) =>
  localIntentPatterns.some(pattern => pattern.test(message));

const looksLikeLocationReply = (message: string) =>
  locationReplyPatterns.some(pattern => pattern.test(message)) ||
  (!!message.trim() && message.trim().length >= 3 && message.trim().length <= 80 && !message.includes("?"));

const isServiceSearch = (message: string) =>
  serviceSearchPatterns.some(pattern => pattern.test(message));

const retryIntentPatterns = [
  /^ok$/i,
  /^sim$/i,
  /^continua$/i,
  /^segue$/i,
  /^vai$/i,
  /^ta bom$/i,
  /^t[aá] bom$/i,
  /^tenta de novo$/i,
  /^de novo$/i
];

const wantsRetry = (message: string) =>
  retryIntentPatterns.some(pattern => pattern.test(message.trim()));

const normalizeCep = (message: string) => {
  const digits = message.replace(/\D/g, "");
  if (digits.length !== 8) return null;
  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
};

const formatSearchToolFallback = (toolResult: string) => {
  const lines = toolResult
    .split("\n")
    .map(line => line.trim())
    .filter(Boolean);

  const summary = lines.find(line => line.startsWith("Resumo:"));
  const urls = lines
    .filter(line => line.startsWith("URL:"))
    .map(line => line.replace(/^URL:\s*/, ""))
    .slice(0, 3);

  const responseParts: string[] = [];

  if (summary) {
    responseParts.push(summary.replace(/^Resumo:\s*/, ""));
  } else {
    responseParts.push("Encontrei algumas informacoes que podem te ajudar.");
  }

  if (urls.length > 0) {
    responseParts.push("");
    responseParts.push("Links:");
    for (const url of urls) {
      responseParts.push(url);
    }
  }

  return responseParts.join("\n");
};

const formatPlacesToolFallback = (toolResult: string) => {
  const lines = toolResult
    .split("\n")
    .map(line => line.trim())
    .filter(Boolean);

  const responseLines: string[] = ["Achei estas opcoes perto de voce:"];
  let collected = 0;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!/^\d+\.\s/.test(line)) continue;

    if (collected > 0) {
      responseLines.push("");
    }

    responseLines.push(line);
    collected += 1;

    let nextIndex = index + 1;
    while (nextIndex < lines.length && !/^\d+\.\s/.test(lines[nextIndex])) {
      if (
        lines[nextIndex].startsWith("Nota:") ||
        lines[nextIndex].startsWith("Endereco:") ||
        lines[nextIndex].startsWith("Telefone:") ||
        lines[nextIndex].startsWith("Aberto agora:") ||
        lines[nextIndex].startsWith("Mapa:")
      ) {
        responseLines.push(lines[nextIndex]);
      }
      nextIndex += 1;
    }

    if (collected >= 3) break;
  }

  return responseLines.length > 0
    ? responseLines.join("\n")
    : "Nao encontrei opcoes proximas agora.";
};

const formatForWhatsApp = (text: string) => {
  const lines = text
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, "$1\n$2")
    .replace(/\*\*(.*?)\*\*/g, "*$1*")
    .split("\n")
    .map(line => line.trim())
    .filter(Boolean);

  const formatted: string[] = [];

  for (const line of lines) {
    if (line.startsWith("*   ")) {
      formatted.push(`- ${line.replace(/^\*\s+/, "")}`);
      continue;
    }

    if (line.startsWith("* ")) {
      formatted.push(`- ${line.replace(/^\*\s+/, "")}`);
      continue;
    }

    if (line.startsWith("Endereco:")) {
      formatted.push(line.replace("Endereco:", "Endereco"));
      continue;
    }

    if (line.startsWith("Telefone:")) {
      formatted.push(line.replace("Telefone:", "Telefone"));
      continue;
    }

    if (line.startsWith("Aberto agora:")) {
      formatted.push(line.replace("Aberto agora:", "Aberto agora"));
      continue;
    }

    if (line.startsWith("Mapa:")) {
      formatted.push(line.replace("Mapa:", "Mapa"));
      continue;
    }

    formatted.push(line);
  }

  const compacted: string[] = [];
  for (let index = 0; index < formatted.length; index += 1) {
    const current = formatted[index];
    const previous = compacted[compacted.length - 1];
    if (current === previous) continue;
    compacted.push(current);
  }

  const result: string[] = [];
  for (let index = 0; index < compacted.length; index += 1) {
    const line = compacted[index];
    result.push(line);

    const next = compacted[index + 1];
    const shouldBreak =
      (/^\d+\.\s/.test(line) && !!next && !next.startsWith("Nota")) ||
      line.startsWith("Mapa") ||
      line.startsWith("Links:");

    if (shouldBreak && next) {
      result.push("");
    }
  }

  return result.join("\n").trim();
};

const parsePendingIntent = (content: string | null | undefined): PendingIntent | null => {
  if (!content) return null;

  try {
    const parsed = JSON.parse(content) as PendingIntent;
    if (parsed?.kind === "nearby_search" && parsed.originalMessage) {
      return parsed;
    }
  } catch {
    return null;
  }

  return null;
};

const isPlacesFailure = (toolResult: string) =>
  toolResult.startsWith("A busca de lugares proximos falhou") ||
  toolResult.startsWith("Nao consegui localizar") ||
  toolResult.startsWith("Nao encontrei lugares proximos");

export const aiService = {
  getAIResponse: async (remoteJid: string, userMessage: string): Promise<string> => {
    try {
      dbService.addMessage({ remoteJid, fromMe: false, content: userMessage, timestamp: Date.now() });

      const mcpTools = mcpManager.getToolsForGemini();
      const memories = dbService.getUserMemories(remoteJid);
      const latestLocationMemory = memories.find((memory: { category: string; content: string }) => memory.category === "location");
      const pendingIntent = parsePendingIntent(dbService.getLatestUserMemory(remoteJid, "pending_intent")?.content);
      const recentHistory = dbService.getHistory(remoteJid, 6);
      const lastAssistantMessage = [...recentHistory].reverse().find(msg => msg.fromMe)?.content || "";
      const cep = normalizeCep(userMessage);

      const executeNearbySearchWithRecovery = async (
        serviceType: string | undefined,
        locationQuery: string,
        originalMessage: string
      ) => {
        const textQuery = buildNearbyTextQuery(originalMessage, serviceType);
        const placesResult = await placesSearchTool.execute({
          serviceType,
          textQuery,
          locationQuery
        });

        if (!isPlacesFailure(placesResult)) {
          dbService.clearUserMemory(remoteJid, "pending_intent");
          dbService.clearUserMemory(remoteJid, "last_failure");
          return formatForWhatsApp(formatPlacesToolFallback(placesResult));
        }

        const fallbackQuery = `${textQuery || serviceQueryMap[serviceType || ""] || "lugares"} perto de ${locationQuery}`;
        const tavilyResult = await tavilySearchTool.execute({
          query: fallbackQuery,
          topic: "general"
        });

        if (!tavilyResult.startsWith("A busca web estruturada falhou")) {
          dbService.setUserMemory(remoteJid, "last_failure", JSON.stringify({
            kind: "nearby_search",
            serviceType,
            locationQuery,
            recovery: "tavily_fallback"
          }));
          return formatForWhatsApp(formatSearchToolFallback(tavilyResult));
        }

        dbService.setUserMemory(remoteJid, "last_failure", JSON.stringify({
          kind: "nearby_search",
            serviceType,
            locationQuery,
            recovery: "failed"
          }));
        return "Tive um contratempo para encontrar opcoes proximas agora. Se quiser, posso tentar de novo ou buscar de outro jeito.";
      };

      if (
        lastAssistantMessage.includes("Me fala seu bairro, CEP ou cidade") &&
        (looksLikeLocationReply(userMessage) || !!cep)
      ) {
        const locationValue = cep || userMessage.trim();
        dbService.setUserMemory(remoteJid, "location", locationValue);

        let reply = `Perfeito. Vou considerar "${locationValue}" como sua localizacao para buscas proximas. Agora pode repetir o que voce quer encontrar por ai.`;
        if (pendingIntent?.kind === "nearby_search") {
          reply = await executeNearbySearchWithRecovery(
            pendingIntent.serviceType,
            locationValue,
            pendingIntent.originalMessage
          );
        }

        dbService.addMessage({ remoteJid, fromMe: true, content: reply, timestamp: Date.now() });
        return reply;
      }

      if (isServiceSearch(userMessage) && isLocalIntent(userMessage) && !latestLocationMemory) {
        const serviceType = inferServiceType(userMessage);
        if (serviceType) {
          dbService.setUserMemory(remoteJid, "pending_intent", JSON.stringify({
            kind: "nearby_search",
            serviceType,
            originalMessage: userMessage
          } satisfies PendingIntent));
        }
        const reply = "Me fala seu bairro, CEP ou cidade e eu te passo opcoes proximas.";
        dbService.addMessage({ remoteJid, fromMe: true, content: reply, timestamp: Date.now() });
        return reply;
      }

      if (pendingIntent?.kind === "nearby_search" && latestLocationMemory && wantsRetry(userMessage)) {
        const reply = await executeNearbySearchWithRecovery(
          pendingIntent.serviceType,
          latestLocationMemory.content,
          pendingIntent.originalMessage
        );
        dbService.addMessage({ remoteJid, fromMe: true, content: reply, timestamp: Date.now() });
        return reply;
      }

      const inferredServiceType = inferServiceType(userMessage);
      if (inferredServiceType && latestLocationMemory) {
        dbService.setUserMemory(remoteJid, "pending_intent", JSON.stringify({
          kind: "nearby_search",
          serviceType: inferredServiceType,
          originalMessage: userMessage
        } satisfies PendingIntent));
        const reply = await executeNearbySearchWithRecovery(
          inferredServiceType,
          latestLocationMemory.content,
          userMessage
        );
        dbService.addMessage({ remoteJid, fromMe: true, content: reply, timestamp: Date.now() });
        return reply;
      }
      
      const model = genAI.getGenerativeModel({ 
        model: geminiModel,
        systemInstruction: `Você é um SOBERANO DE IA AUTO-EVOLUTIVO (WhatsApp).
        
        MISSÃO: Resolver QUALQUER tarefa do usuário (comprar ingressos, buscar lugares, profissionais, e-mails, arquivos, etc.).
        
        REGRAS DE OURO:
        1. RESULTADO EM PRIMEIRO LUGAR: O usuário não quer saber COMO você faz, ele quer a tarefa pronta.
        2. SILÊNCIO TÉCNICO: Nunca mencione "instalar servidores", "MCP", "código", "reiniciar" ou detalhes internos. 
        3. PEDIDOS ATUAIS: Para perguntas sobre hoje, horários, preços, disponibilidade, endereços, lugares, filmes em cartaz e resultados atuais, você DEVE usar ferramentas MCP/APIs antes de responder.
        4. SE PRECISAR DE TEMPO: Se uma ferramenta falhar, diga apenas que houve um contratempo e peça para tentar novamente.
        5. AUTONOMIA RESTRITA: Só use 'autonomous_action' ou 'evolve_agent' quando o usuário pedir explicitamente para alterar, instalar, criar ou evoluir ferramentas do agente.
        6. ADAPTAÇÃO: Mimetize o estilo do usuário sem ser técnico.
        7. PRIORIDADE DE FERRAMENTAS: Sempre prefira APIs estruturadas e ferramentas MCP. Para perguntas atuais da web, priorize 'search_web'.
        8. CONFIABILIDADE: Se uma ferramenta falhar, não invente resultados. Explique de forma curta que houve falha e peça para tentar novamente.
        9. FONTES: Quando usar 'search_web', cite de 1 a 3 links relevantes no texto final.
        10. PRECISAO EM CINEMA E HORARIOS: Nao afirme filmes, horarios, precos ou disponibilidade se isso nao estiver claramente sustentado pelos resultados da busca. Se faltar confirmacao, diga que a programacao precisa ser confirmada no link oficial.
        11. LOCALIZACAO: Para pedidos locais como "perto de mim", use a localizacao conhecida do usuario. Se nao houver localizacao, peca bairro, CEP ou cidade antes de buscar.
        12. LUGARES PROXIMOS: Para negocios locais como lava-rapido, restaurantes, farmacias, oficinas e cinemas proximos, prefira 'search_nearby_places' em vez de 'search_web'.`,
        tools: [{
          functionDeclarations: [
            ...(allowSelfModification ? [{
              name: selfEvolutionTool.name,
              description: selfEvolutionTool.description,
              parameters: selfEvolutionTool.parameters as any
            }, {
              name: autonomousTool.name,
              description: autonomousTool.description,
              parameters: autonomousTool.parameters as any
            }] : []),
            {
              name: placesSearchTool.name,
              description: placesSearchTool.description,
              parameters: placesSearchTool.parameters as any
            },
            {
              name: tavilySearchTool.name,
              description: tavilySearchTool.description,
              parameters: tavilySearchTool.parameters as any
            },
            ...mcpTools.map(t => ({
              name: t.name,
              description: t.description,
              parameters: t.parameters as any
            }))
          ]
        }]
      });

      const userProfile = memories.length > 0 
        ? "\n\nO que você já sabe sobre este usuário:\n" + memories.map(m => `- ${m.category}: ${m.content}`).join('\n')
        : "";

      const history = dbService.getHistory(remoteJid, 15);
      
      // Removemos a última mensagem do histórico (que é a que acabamos de adicionar)
      // pois ela será enviada via sendMessage.
      const chatContext = history.slice(0, -1).map(msg => ({
        role: msg.fromMe ? 'model' : 'user',
        parts: [{ text: msg.content }]
      }));

      const chat = model.startChat({ history: chatContext });
      const promptComContexto = `${userMessage}\n\n(Contexto do Usuário: ${userProfile})`;

      let result = await chat.sendMessage(promptComContexto);
      let response = result.response;
      let lastToolResult = "";
      
      const call = response.candidates?.[0]?.content?.parts?.find(p => p.functionCall);
      if (call?.functionCall) {
        const { name, args } = call.functionCall;
        console.log("[AI] ferramenta solicitada", { name, args });
        
        // 1. Lida com Auto-Evolução/Autonomia Silenciosamente
        if (name === selfEvolutionTool.name || name === autonomousTool.name) {
          const toolInstance = name === selfEvolutionTool.name ? selfEvolutionTool : autonomousTool;
          await toolInstance.execute(args);
          // Em vez de retornar log técnico, pede desculpas pelo tempo e sugere o resultado
          return "Estou terminando de preparar isso para você. Pode me enviar um 'ok' ou repetir o pedido em 10 segundos?";
        }

        if (name === placesSearchTool.name) {
          const toolResult = await placesSearchTool.execute({
            serviceType: (args as any).serviceType,
            textQuery: (args as any).textQuery,
            locationQuery: (args as any).locationQuery
          });
          lastToolResult = toolResult;
          result = await chat.sendMessage([{
            functionResponse: { name, response: { content: toolResult } }
          }]);
          response = result.response;
        }

        else if (name === tavilySearchTool.name) {
          const toolResult = await tavilySearchTool.execute({
            query: (args as any).query,
            topic: (args as any).topic
          });
          lastToolResult = toolResult;
          result = await chat.sendMessage([{
            functionResponse: { name, response: { content: toolResult } }
          }]);
          response = result.response;
        }

        // 2. Lida com MCP Tools (Execução real da tarefa)
        else if (name !== tavilySearchTool.name && name !== placesSearchTool.name) {
          try {
            const toolResult = await mcpManager.callTool(name, args);
            lastToolResult = toolResult;
            result = await chat.sendMessage([{
              functionResponse: { name: name, response: { content: toolResult } }
            }]);
            response = result.response;
          } catch (toolError) {
            console.error("Erro na ferramenta MCP:", toolError);
            return "Desculpe, tive um contratempo ao processar seu pedido. Pode tentar novamente?";
          }
        }
      }

      const responseText =
        response.text() ||
        (lastToolResult
          ? (lastToolResult.includes("BUSCA_LUGARES_PROXIMOS")
              ? formatPlacesToolFallback(lastToolResult)
              : formatSearchToolFallback(lastToolResult))
          : "");
      const whatsappResponse = formatForWhatsApp(responseText);
      dbService.addMessage({ remoteJid, fromMe: true, content: whatsappResponse, timestamp: Date.now() });

      return whatsappResponse;
    } catch (error) {
      console.error("Erro no AI Service:", error);
      return "Estou processando sua solicitação, por favor aguarde um momento.";
    }
  }
};
