import axios from "axios";
import * as cheerio from "cheerio";
import cron from "node-cron";
import { db } from "../../db/client.js";
import type { Skill, SkillTool } from "../types.js";

// Ensure rss_feeds table exists
db.exec(`
  CREATE TABLE IF NOT EXISTS rss_feeds (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    url         TEXT NOT NULL UNIQUE,
    keywords    TEXT NOT NULL DEFAULT '[]',
    last_item   TEXT,
    enabled     INTEGER NOT NULL DEFAULT 1,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

let rssSender: ((message: string) => Promise<void>) | null = null;

export function setRssAlertSender(sender: (message: string) => Promise<void>): void {
  rssSender = sender;
}

interface RssItem {
  title: string;
  link: string;
  pubDate?: string;
}

async function fetchRssItems(url: string): Promise<RssItem[]> {
  try {
    const { data } = await axios.get<string>(url, {
      timeout: 15000,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; ZagzBot/1.0)" },
    });
    const $ = cheerio.load(data, { xmlMode: true });
    const items: RssItem[] = [];

    $("item").each((_, el) => {
      const title = $(el).find("title").text().trim();
      const link = $(el).find("link").text().trim() || $(el).find("link").attr("href") || "";
      const pubDate = $(el).find("pubDate").text().trim();
      if (title) items.push({ title, link, pubDate });
    });

    return items.slice(0, 20);
  } catch {
    return [];
  }
}

async function checkFeeds(): Promise<void> {
  const feeds = db.prepare("SELECT * FROM rss_feeds WHERE enabled = 1").all() as Array<{
    id: number;
    url: string;
    keywords: string;
    last_item: string | null;
  }>;

  for (const feed of feeds) {
    const keywords: string[] = JSON.parse(feed.keywords);
    const items = await fetchRssItems(feed.url);
    if (items.length === 0) continue;

    const latestTitle = items[0]?.title ?? "";

    // Skip if same as last seen item
    if (feed.last_item === latestTitle) continue;

    // Filter by keywords if any
    const matches =
      keywords.length === 0
        ? items.slice(0, 3)
        : items.filter((item) =>
            keywords.some((kw) => item.title.toLowerCase().includes(kw.toLowerCase()))
          );

    if (matches.length > 0 && rssSender) {
      const lines = [`📰 *Novidades no feed:* ${feed.url}`];
      for (const item of matches.slice(0, 3)) {
        lines.push(`- ${item.title}${item.link ? `\n  ${item.link}` : ""}`);
      }
      await rssSender(lines.join("\n"));
    }

    // Update last seen item
    db.prepare("UPDATE rss_feeds SET last_item = ? WHERE id = ?").run(latestTitle, feed.id);
  }
}

// Check feeds every 30 minutes
cron.schedule("*/30 * * * *", async () => {
  try {
    await checkFeeds();
  } catch (err) {
    console.error("[RSSMonitor] Check failed:", err);
  }
});

const subscribeFeedTool: SkillTool = {
  name: "subscribe_feed",
  description:
    "Monitora um feed RSS e envia notificações para itens que contenham as palavras-chave.",
  parameters: {
    type: "OBJECT",
    properties: {
      url: { type: "STRING", description: "URL do feed RSS" },
      keywords: {
        type: "ARRAY",
        items: { type: "STRING" },
        description: "Palavras-chave para filtrar (vazio = todos os itens)",
      },
    },
    required: ["url"],
  },
  execute(args) {
    const url = String(args.url);
    const keywords = Array.isArray(args.keywords) ? (args.keywords as string[]) : [];

    if (!url) return "URL é obrigatória.";

    try {
      db.prepare("INSERT OR REPLACE INTO rss_feeds (url, keywords) VALUES (?, ?)").run(
        url,
        JSON.stringify(keywords)
      );
      const kwMsg = keywords.length > 0 ? ` filtrando por: ${keywords.join(", ")}` : "";
      return `Feed registrado!${kwMsg} Verificarei a cada 30 minutos.`;
    } catch (err) {
      return `Erro ao registrar feed: ${err instanceof Error ? err.message : String(err)}`;
    }
  },
};

const listSubscriptionsTool: SkillTool = {
  name: "list_subscriptions",
  description: "Lista todos os feeds RSS monitorados.",
  parameters: { type: "OBJECT", properties: {}, required: [] },
  execute() {
    const feeds = db.prepare("SELECT * FROM rss_feeds ORDER BY created_at DESC").all() as Array<{
      id: number;
      url: string;
      keywords: string;
      enabled: number;
      last_item: string | null;
    }>;
    if (feeds.length === 0) return "Nenhum feed RSS cadastrado.";
    return feeds
      .map((f) => {
        const kws: string[] = JSON.parse(f.keywords);
        return `#${f.id} ${f.url}${kws.length > 0 ? ` [${kws.join(", ")}]` : ""} | ${f.enabled ? "ativo" : "inativo"}`;
      })
      .join("\n");
  },
};

const unsubscribeFeedTool: SkillTool = {
  name: "unsubscribe_feed",
  description: "Remove um feed RSS monitorado pelo ID.",
  parameters: {
    type: "OBJECT",
    properties: {
      id: { type: "NUMBER", description: "ID do feed a remover" },
    },
    required: ["id"],
  },
  execute(args) {
    const id = Number(args.id);
    const existing = db.prepare("SELECT id FROM rss_feeds WHERE id = ?").get(id);
    if (!existing) return `Feed #${id} não encontrado.`;
    db.prepare("DELETE FROM rss_feeds WHERE id = ?").run(id);
    return `Feed #${id} removido.`;
  },
};

const skill: Skill = {
  name: "rss-monitor",
  version: "1.0.0",
  description:
    "Monitora feeds RSS e envia notificações quando novos itens correspondem a palavras-chave",
  tools: [subscribeFeedTool, listSubscriptionsTool, unsubscribeFeedTool],
};

export default skill;
