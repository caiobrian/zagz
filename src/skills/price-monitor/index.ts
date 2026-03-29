import axios from "axios";
import * as cheerio from "cheerio";
import cron from "node-cron";
import { db } from "../../db/client.js";
import type { Skill, SkillTool } from "../types.js";

// Ensure price_monitors table exists
db.exec(`
  CREATE TABLE IF NOT EXISTS price_monitors (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    url         TEXT NOT NULL,
    target_price REAL NOT NULL,
    label       TEXT,
    last_price  REAL,
    alerted     INTEGER NOT NULL DEFAULT 0,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

let alertSender: ((message: string) => Promise<void>) | null = null;

export function setPriceAlertSender(sender: (message: string) => Promise<void>): void {
  alertSender = sender;
}

async function scrapePrice(url: string): Promise<number | null> {
  try {
    const { data } = await axios.get<string>(url, {
      timeout: 15000,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; ZagzBot/1.0)" },
    });
    const $ = cheerio.load(data);

    // Common price selectors
    const selectors = [
      '[itemprop="price"]',
      ".price",
      "#price",
      ".product-price",
      ".offer-price",
      '[class*="price"]',
    ];

    for (const sel of selectors) {
      const text = $(sel).first().attr("content") || $(sel).first().text();
      if (!text) continue;
      const match = text.replace(/[^\d,.]/g, "").replace(",", ".");
      const value = parseFloat(match);
      if (!Number.isNaN(value) && value > 0) return value;
    }
  } catch {
    // ignore scraping errors
  }
  return null;
}

async function checkPrices(): Promise<void> {
  const monitors = db.prepare("SELECT * FROM price_monitors WHERE alerted = 0").all() as Array<{
    id: number;
    url: string;
    target_price: number;
    label: string | null;
    last_price: number | null;
  }>;

  for (const monitor of monitors) {
    const price = await scrapePrice(monitor.url);
    if (price === null) continue;

    db.prepare("UPDATE price_monitors SET last_price = ? WHERE id = ?").run(price, monitor.id);

    if (price <= monitor.target_price) {
      const label = monitor.label ?? monitor.url;
      const msg = `🔔 Alerta de preço! "${label}" está por R$ ${price.toFixed(2)} (meta: R$ ${monitor.target_price.toFixed(2)})\n${monitor.url}`;

      if (alertSender) {
        await alertSender(msg);
        db.prepare("UPDATE price_monitors SET alerted = 1 WHERE id = ?").run(monitor.id);
        console.log(`[PriceMonitor] Alert sent for monitor #${monitor.id}`);
      }
    }
  }
}

// Schedule price checks every 30 minutes
cron.schedule("*/30 * * * *", async () => {
  try {
    await checkPrices();
  } catch (err) {
    console.error("[PriceMonitor] Check failed:", err);
  }
});

const watchPriceTool: SkillTool = {
  name: "watch_price",
  description:
    "Registra uma URL para monitorar o preço de um produto e envia alerta quando o preço-alvo for atingido.",
  parameters: {
    type: "OBJECT",
    properties: {
      url: { type: "STRING", description: "URL da página do produto" },
      target_price: { type: "NUMBER", description: "Preço alvo em reais (ex: 99.90)" },
      label: { type: "STRING", description: "Nome amigável do produto (opcional)" },
    },
    required: ["url", "target_price"],
  },
  execute(args) {
    const url = String(args.url);
    const targetPrice = Number(args.target_price);
    const label = args.label ? String(args.label) : null;

    if (!url || Number.isNaN(targetPrice)) return "URL e target_price são obrigatórios.";

    const result = db
      .prepare("INSERT INTO price_monitors (url, target_price, label) VALUES (?, ?, ?)")
      .run(url, targetPrice, label);

    return `Monitor de preço criado! ID #${result.lastInsertRowid}. Verificarei a cada 30 minutos e te aviso quando o preço atingir R$ ${targetPrice.toFixed(2)}.`;
  },
};

const unwatchPriceTool: SkillTool = {
  name: "unwatch_price",
  description: "Remove um monitoramento de preço pelo ID.",
  parameters: {
    type: "OBJECT",
    properties: {
      id: { type: "NUMBER", description: "ID do monitor a remover" },
    },
    required: ["id"],
  },
  execute(args) {
    const id = Number(args.id);
    const existing = db.prepare("SELECT id FROM price_monitors WHERE id = ?").get(id);
    if (!existing) return `Monitor #${id} não encontrado.`;
    db.prepare("DELETE FROM price_monitors WHERE id = ?").run(id);
    return `Monitor de preço #${id} removido.`;
  },
};

const listPriceMonitorsTool: SkillTool = {
  name: "list_price_monitors",
  description: "Lista todos os monitoramentos de preço ativos.",
  parameters: { type: "OBJECT", properties: {}, required: [] },
  execute() {
    const monitors = db
      .prepare("SELECT * FROM price_monitors ORDER BY created_at DESC")
      .all() as Array<{
      id: number;
      url: string;
      target_price: number;
      label: string | null;
      last_price: number | null;
      alerted: number;
    }>;
    if (monitors.length === 0) return "Nenhum monitor de preço cadastrado.";
    return monitors
      .map(
        (m) =>
          `#${m.id} ${m.label ?? m.url} | meta: R$${m.target_price.toFixed(2)} | último: ${m.last_price != null ? `R$${m.last_price.toFixed(2)}` : "não verificado"} | alerta: ${m.alerted ? "enviado" : "pendente"}`
      )
      .join("\n");
  },
};

const skill: Skill = {
  name: "price-monitor",
  version: "1.0.0",
  description: "Monitor preços de produtos e envia alertas quando o preço-alvo é atingido",
  tools: [watchPriceTool, unwatchPriceTool, listPriceMonitorsTool],
};

export default skill;
