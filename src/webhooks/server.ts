import crypto from "node:crypto";
import express from "express";
import { agentCore } from "../agent/core.js";

let webhookSender: ((message: string) => Promise<void>) | null = null;

/**
 * Sets the sender function for proactive webhook-triggered messages.
 */
export function setWebhookSender(sender: (message: string) => Promise<void>): void {
  webhookSender = sender;
}

/**
 * Starts the HTTP webhook server.
 */
export function startWebhookServer(): void {
  const port = Number(process.env.WEBHOOK_PORT ?? 3000);
  const secret = process.env.WEBHOOK_SECRET ?? "";

  const app = express();
  app.use(express.json());

  // Health check
  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  // Generic webhook endpoint: POST /webhook with optional HMAC signature
  app.post("/webhook", async (req, res) => {
    if (secret) {
      const signature = req.headers["x-webhook-signature"];
      if (!signature) {
        res.status(401).json({ error: "Missing signature" });
        return;
      }
      const expected = crypto
        .createHmac("sha256", secret)
        .update(JSON.stringify(req.body))
        .digest("hex");
      if (signature !== `sha256=${expected}`) {
        res.status(401).json({ error: "Invalid signature" });
        return;
      }
    }

    const { event, data } = req.body as { event?: string; data?: unknown };
    if (!event) {
      res.status(400).json({ error: "Missing event field" });
      return;
    }

    console.log(`[Webhook] Received event: ${event}`);

    try {
      const prompt = `Evento recebido via webhook: ${event}\nDados: ${JSON.stringify(data)}\nInforme o usuário sobre este evento de forma concisa.`;
      const response = await agentCore.handleCronPrompt(prompt, `webhook:${event}`);
      if (webhookSender) await webhookSender(response);
      res.json({ ok: true });
    } catch (err) {
      console.error("[Webhook] Error handling event:", err);
      res.status(500).json({ error: "Internal error" });
    }
  });

  app.listen(port, () => {
    console.log(`[Webhook] Server listening on port ${port}`);
  });
}
