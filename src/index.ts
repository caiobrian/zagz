import dotenv from 'dotenv';
dotenv.config();

import { mcpManager } from './mcp/client.js';
import { toolRegistry } from './tools/registry.js';
import { startWhatsApp, sendWhatsAppMessage } from './channels/whatsapp.js';
import { initScheduler } from './cron/scheduler.js';

// Ensure DB is initialized by importing the client
import './db/client.js';

console.log('[Zagz] Starting Personal AI Agent...');

async function main() {
  try {
    // 1. Initialize MCP tools
    await mcpManager.init();

    // 2. Initialize self-modification tools (if enabled)
    await toolRegistry.initSelfModificationTools();

    // 3. Start cron scheduler (seeds default jobs + schedules them)
    initScheduler(sendWhatsAppMessage);

    // 4. Start WhatsApp channel
    await startWhatsApp();

    console.log('[Zagz] Agent online.');
  } catch (err) {
    console.error('[Zagz] Startup error:', err);
    process.exit(1);
  }
}

main();
