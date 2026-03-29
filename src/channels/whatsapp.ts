import fs from "node:fs";
import type { Boom } from "@hapi/boom";
import makeWASocket, {
  areJidsSameUser,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  useMultiFileAuthState,
  type WAMessage,
  type WASocket,
} from "@whiskeysockets/baileys";
import pino from "pino";
import qrcode from "qrcode-terminal";
import { agentCore } from "../agent/core.js";
import type { MessageChannel } from "./types.js";

const logger = pino({ level: "silent" });

// Holds the active socket so cron jobs can send proactive messages
let activeSock: WASocket | null = null;
// The JID we listen to and respond on (set on first incoming message)
let activeJid: string | null = null;
// Handler registered via WhatsAppChannel.onMessage() — falls back to agentCore
let activeMessageHandler: ((text: string) => Promise<string>) | null = null;

/**
 * Send a proactive WhatsApp message (used by cron jobs).
 */
export async function sendWhatsAppMessage(message: string): Promise<void> {
  if (!activeSock || !activeJid) {
    console.warn("[WA] Cannot send proactive message: no active socket or JID");
    return;
  }
  await activeSock.sendMessage(activeJid, { text: message });
}

/**
 * Extracts the text content from an incoming message.
 */
function extractText(msg: WAMessage): string {
  return (
    msg.message?.conversation ||
    msg.message?.extendedTextMessage?.text ||
    msg.message?.imageMessage?.caption ||
    ""
  );
}

export async function startWhatsApp(): Promise<WASocket> {
  const { state, saveCreds } = await useMultiFileAuthState("auth_info_baileys");
  const { version, isLatest } = await fetchLatestBaileysVersion();

  console.log(`[WA] Baileys v${version.join(".")}, latest: ${isLatest}`);

  const sock: WASocket = makeWASocket({
    version,
    logger,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger),
    },
    generateHighQualityLinkPreview: true,
  });

  activeSock = sock;

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log("[WA] Scan this QR code in WhatsApp:");
      qrcode.generate(qr, { small: true });
    }

    if (connection === "close") {
      activeSock = null;
      const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
      const isLoggedOut = statusCode === DisconnectReason.loggedOut;
      const isAuthError = statusCode === 401 || statusCode === 403 || statusCode === 440;

      console.log(`[WA] Connection closed. Status: ${statusCode}`);

      if (isLoggedOut || isAuthError) {
        console.log("[WA] Auth error — clearing session and restarting...");
        try {
          if (fs.existsSync("auth_info_baileys")) {
            fs.rmSync("auth_info_baileys", { recursive: true, force: true });
          }
        } catch (err) {
          console.error("[WA] Failed to remove auth folder:", err);
        }
        setTimeout(() => {
          void startWhatsApp();
        }, 5000);
      } else {
        console.log("[WA] Reconnecting in 5s...");
        setTimeout(() => {
          void startWhatsApp();
        }, 5000);
      }
    } else if (connection === "open") {
      activeSock = sock;
      console.log("[WA] Connected. Agent is online.", {
        id: sock.user?.id,
        phoneNumber: sock.user?.phoneNumber,
      });
    }
  });

  sock.ev.on("messages.upsert", async (m) => {
    if (m.type !== "notify" && m.type !== "append") return;

    for (const msg of m.messages) {
      const remoteJid = msg.key.remoteJid;
      if (!remoteJid || !msg.message) continue;

      // Single-user: only handle messages sent by ourselves in our own chat
      const candidateJids = [
        remoteJid,
        msg.key.remoteJidAlt,
        msg.key.participant,
        msg.key.participantAlt,
      ].filter((j): j is string => !!j);
      const myJids = [sock.user?.id, sock.user?.lid, sock.user?.phoneNumber].filter(
        (j): j is string => !!j
      );
      const isSelfChat = candidateJids.some((j) => myJids.some((mj) => areJidsSameUser(j, mj)));
      const hasQuotedContext = !!(
        msg.message.extendedTextMessage?.contextInfo?.quotedMessage ||
        msg.message.imageMessage?.contextInfo?.quotedMessage
      );

      if (!msg.key.fromMe || !isSelfChat || hasQuotedContext) continue;

      const userMessage = extractText(msg as WAMessage);
      if (!userMessage) continue;

      // Remember the JID for proactive messaging
      activeJid = remoteJid;

      console.log("[WA] Incoming message:", { remoteJid, userMessage });

      await sock.presenceSubscribe(remoteJid);
      await sock.sendPresenceUpdate("composing", remoteJid);

      try {
        const handler = activeMessageHandler ?? ((t: string) => agentCore.handleMessage(t));
        const response = await handler(userMessage);
        await sock.sendMessage(remoteJid, { text: response }, { quoted: msg as WAMessage });
      } catch (error) {
        console.error("[WA] Error handling message:", error);
      } finally {
        await sock.sendPresenceUpdate("paused", remoteJid);
      }
    }
  });

  return sock;
}

/**
 * WhatsApp channel implementing the MessageChannel interface.
 */
export class WhatsAppChannel implements MessageChannel {
  name = "whatsapp";

  onMessage(handler: (text: string) => Promise<string>): void {
    activeMessageHandler = handler;
  }

  async sendMessage(text: string): Promise<void> {
    await sendWhatsAppMessage(text);
  }

  async start(): Promise<void> {
    await startWhatsApp();
  }
}
