import makeWASocket, { 
  areJidsSameUser,
  DisconnectReason, 
  useMultiFileAuthState, 
  fetchLatestBaileysVersion, 
  makeCacheableSignalKeyStore,
  type WASocket,
  type proto
} from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import pino from "pino";
import qrcode from "qrcode-terminal";
import path from "path";
import fs from "fs";
import { handleMessage } from "../handlers/message.js";

const logger = pino({ level: "silent" });

export const startWhatsApp = async () => {
  const { state, saveCreds } = await useMultiFileAuthState("auth_info_baileys");
  const { version, isLatest } = await fetchLatestBaileysVersion();

  console.log(`Utilizando v${version.join(".")}, mais recente: ${isLatest}`);

  const sock: WASocket = makeWASocket({
    version,
    logger,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger),
    },
    generateHighQualityLinkPreview: true,
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log("Escaneie este QR Code no WhatsApp:");
      qrcode.generate(qr, { small: true });
    }

    if (connection === "close") {
      const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      
      console.log(`Conexão fechada. Motivo: ${statusCode}. Tentando reconectar? ${shouldReconnect}`);
      
      // Se for erro de autenticação (401, 403) ou expirou (440) ou logout definitivo
      if (statusCode === DisconnectReason.loggedOut || statusCode === 401 || statusCode === 403 || statusCode === 440) {
        console.log("Erro de autenticação crítico ou LoggedOut. Limpando sessão...");
        try {
          if (fs.existsSync("auth_info_baileys")) {
            fs.rmSync("auth_info_baileys", { recursive: true, force: true });
            console.log("Pasta 'auth_info_baileys' removida.");
          }
        } catch (err) {
          console.error("Falha ao remover pasta de autenticação:", err);
        }
        
        console.log("Reiniciando em 5 segundos para gerar novo QR Code...");
        setTimeout(() => {
          startWhatsApp();
        }, 5000);
      } else if (shouldReconnect) {
        // Para outros erros (conexão perdida, timeout, restart required), apenas tenta reconectar
        console.log("Erro recuperável. Reconectando em 5 segundos...");
        setTimeout(() => {
          startWhatsApp();
        }, 5000);
      } else {
        console.log("Conexão encerrada permanentemente. O bot não irá reconectar automaticamente.");
      }
    } else if (connection === "open") {
      console.log("[WA] sessao autenticada", {
        id: sock.user?.id,
        lid: sock.user?.lid,
        phoneNumber: sock.user?.phoneNumber
      });
      console.log("Conexão estabelecida com sucesso! O agente de IA está online.");
    }
  });

  sock.ev.on("messages.upsert", async (m) => {
    console.log("[WA] messages.upsert", {
      type: m.type,
      count: m.messages.length
    });

    if (m.type === "notify" || m.type === "append") {
      for (const msg of m.messages) {
        const remoteJid = msg.key.remoteJid;
        const candidateChatJids = [
          msg.key.remoteJid,
          msg.key.remoteJidAlt,
          msg.key.participant,
          msg.key.participantAlt
        ].filter((jid): jid is string => !!jid);
        const myJids = [
          sock.user?.id,
          sock.user?.lid,
          sock.user?.phoneNumber
        ].filter((jid): jid is string => !!jid);
        const isSelfChat = candidateChatJids.some(chatJid =>
          myJids.some(myJid => areJidsSameUser(chatJid, myJid))
        );
        const hasQuotedContext = !!(
          msg.message?.extendedTextMessage?.contextInfo?.quotedMessage ||
          msg.message?.imageMessage?.contextInfo?.quotedMessage
        );
        const isSelfAuthoredUserInput = !!msg.key.fromMe && isSelfChat && !hasQuotedContext;
        const shouldHandle = !!msg.message && isSelfAuthoredUserInput;

        console.log("[WA] mensagem recebida", {
          remoteJid,
          remoteJidAlt: msg.key.remoteJidAlt,
          participant: msg.key.participant,
          participantAlt: msg.key.participantAlt,
          myJids,
          fromMe: msg.key.fromMe,
          isSelfChat,
          hasQuotedContext,
          isSelfAuthoredUserInput,
          shouldHandle,
          hasMessage: !!msg.message
        });

        if (shouldHandle) {
          await handleMessage(sock, msg);
        }
      }
    }
  });

  return sock;
};
