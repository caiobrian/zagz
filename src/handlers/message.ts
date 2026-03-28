import { type WASocket, type proto, type WAMessage } from "@whiskeysockets/baileys";
import { aiService } from "../services/ai.js";

export const handleMessage = async (sock: WASocket, m: proto.IWebMessageInfo) => {
  const remoteJid = m.key?.remoteJid;
  if (!remoteJid) return;

  // Extrair o conteúdo da mensagem (texto simples)
  const userMessage = m.message?.conversation || 
                      m.message?.extendedTextMessage?.text || 
                      m.message?.imageMessage?.caption || 
                      "";

  console.log("[Handler] mensagem extraida", {
    remoteJid,
    fromMe: m.key?.fromMe,
    userMessage
  });

  if (!userMessage) return;

  // Enviar feedback de "digitando..." no WhatsApp
  await sock.presenceSubscribe(remoteJid);
  await sock.sendPresenceUpdate("composing", remoteJid);

  try {
    // Buscar resposta da IA
    const response = await aiService.getAIResponse(remoteJid, userMessage);
    console.log("[Handler] resposta da IA gerada", { remoteJid, response });

    // Enviar resposta de volta
    // Forçamos o tipo WAMessage para o parâmetro quoted
    await sock.sendMessage(remoteJid, { text: response }, { quoted: m as WAMessage });
  } catch (error) {
    console.error("Erro ao processar mensagem no handler:", error);
  } finally {
    // Parar o status de "digitando..."
    await sock.sendPresenceUpdate("paused", remoteJid);
  }
};
