import dotenv from "dotenv";

dotenv.config();

import { TelegramChannel } from "./channels/telegram.js";
import type { MessageChannel } from "./channels/types.js";
import { sendWhatsAppMessage, WhatsAppChannel } from "./channels/whatsapp.js";
import { initScheduler } from "./cron/scheduler.js";
import { mcpManager } from "./mcp/client.js";
import { setPriceAlertSender } from "./skills/price-monitor/index.js";
import { setRssAlertSender } from "./skills/rss-monitor/index.js";
import { toolRegistry } from "./tools/registry.js";
import { setWebhookSender, startWebhookServer } from "./webhooks/server.js";

// Ensure DB is initialized by importing the client
import "./db/client.js";

console.log("[Zagz] Starting Personal AI Agent...");

function parseChannels(channelsEnv: string): MessageChannel[] {
  return channelsEnv
    .split(",")
    .map((c) => c.trim().toLowerCase())
    .filter(Boolean)
    .map((c) => {
      switch (c) {
        case "telegram":
          return new TelegramChannel();
        default:
          return new WhatsAppChannel();
      }
    });
}

async function main() {
  try {
    // 1. Initialize MCP tools
    await mcpManager.init();

    // 2. Initialize skill registry (loads all skills including system/self-modification)
    await toolRegistry.initRegistry();

    // 3. Start cron scheduler (seeds default jobs + schedules them)
    initScheduler(sendWhatsAppMessage);

    // 4. Wire up alert senders for price and RSS monitors
    setPriceAlertSender(sendWhatsAppMessage);
    setRssAlertSender(sendWhatsAppMessage);

    // 5. Start webhook HTTP server if port is configured
    if (process.env.WEBHOOK_PORT) {
      setWebhookSender(sendWhatsAppMessage);
      startWebhookServer();
    }

    // 6. Start all configured channels
    const channelsEnv = process.env.CHANNELS ?? "whatsapp";
    const channels = parseChannels(channelsEnv);

    for (const channel of channels) {
      channel.onMessage(async (text) => {
        const { agentCore } = await import("./agent/core.js");
        return agentCore.handleMessage(text);
      });
      await channel.start();
    }

    console.log(`[Zagz] Agent online. Channels: ${channels.map((c) => c.name).join(", ")}`);
  } catch (err) {
    console.error("[Zagz] Startup error:", err);
    process.exit(1);
  }
}

main();
