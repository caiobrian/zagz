import { startWhatsApp } from "./services/whatsapp.js";
import { mcpManager } from "./mcp/client.js";
import dotenv from 'dotenv';

dotenv.config();

console.log("Iniciando Agente de IA para WhatsApp com MCP...");

async function main() {
  try {
    // 1. Inicializa o Model Context Protocol (MCP) para dar ferramentas ao bot
    await mcpManager.init();
    
    // 2. Inicia o WhatsApp
    await startWhatsApp();
  } catch (err) {
    console.error("Erro ao iniciar o bot:", err);
    process.exit(1);
  }
}

main();
