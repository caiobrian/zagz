import TelegramBot from "node-telegram-bot-api";
import { agentCore } from "../agent/core.js";
import type { MessageChannel } from "./types.js";

export class TelegramChannel implements MessageChannel {
  name = "telegram";
  private bot: TelegramBot | null = null;
  private messageHandler: ((text: string) => Promise<string>) | null = null;
  private chatId: number | null = null;

  onMessage(handler: (text: string) => Promise<string>): void {
    this.messageHandler = handler;
  }

  async sendMessage(text: string): Promise<void> {
    if (!this.bot || !this.chatId) {
      console.warn("[Telegram] Cannot send message: bot not initialized or no chatId");
      return;
    }
    await this.bot.sendMessage(this.chatId, text);
  }

  async start(): Promise<void> {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) {
      console.warn("[Telegram] TELEGRAM_BOT_TOKEN not set — skipping Telegram channel.");
      return;
    }

    this.bot = new TelegramBot(token, { polling: true });

    this.bot.on("message", async (msg) => {
      const text = msg.text;
      if (!text) return;

      this.chatId = msg.chat.id;
      console.log("[Telegram] Incoming message:", { chatId: this.chatId, text });

      try {
        const handler = this.messageHandler ?? ((t: string) => agentCore.handleMessage(t));
        const response = await handler(text);
        await this.bot?.sendMessage(this.chatId ?? 0, response);
      } catch (error) {
        console.error("[Telegram] Error handling message:", error);
      }
    });

    this.bot.on("polling_error", (error) => {
      console.error("[Telegram] Polling error:", error);
    });

    console.log("[Telegram] Bot started (polling).");
  }
}
