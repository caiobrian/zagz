# Zagz - WhatsApp AI Agent Project

## Stack
- **Linguagem:** TypeScript (Node.js)
- **WhatsApp API:** Baileys (@whiskeysockets/baileys)
- **AI Model:** Gemini (`@google/generative-ai`)
- **Database:** SQLite (Better-SQLite3)
- **MCP:** Model Context Protocol SDK (`@modelcontextprotocol/sdk`)
- **HTTP:** Axios
- **Agendamento:** node-cron
- **Web Scraping:** cheerio
- **Env:** dotenv

## Estrutura de Pastas

```
src/
├── agent/          # Núcleo do agente: core, memory, prompt, session
├── channels/       # Integrações de canal (whatsapp.ts)
├── config/         # Configurações centralizadas
├── cron/           # Jobs agendados (morning-briefing, finance-summary, weekly-review)
├── db/             # Camada de dados: client + queries (conversations, cron, memories, sessions, tools)
├── database/       # Inicialização do banco
├── handlers/       # Handlers de mensagens recebidas
├── mcp/            # Cliente e configuração MCP
├── services/       # Serviços de negócio (ai, whatsapp)
├── tools/          # Ferramentas do agente (registry, autonomous, memory-tool, tavilySearch, placesSearch, emailChecker, selfEvolution)
└── index.ts        # Entrypoint
```

## Decisões Técnicas
- **Logging:** `pino` para logs eficientes (requerido pelo Baileys).
- **Gerenciamento de Estado:** Baileys armazena credenciais no sistema de arquivos para manter a sessão.
- **Contexto de Conversa:** SQLite armazena histórico para que a IA tenha memória persistente.
- **Ferramentas:** Registry centralizado em `src/tools/registry.ts`; ferramentas autônomas em `autonomous.ts`.
- **MCP:** Cliente MCP em `src/mcp/` para integração com servidores externos.
- **Cron Jobs:** Agendados via `node-cron` em `src/cron/scheduler.ts`.

## Padrões de Código
- Usar `async/await` para operações assíncronas.
- Separar lógica de negócio em `services/`.
- Handlers de mensagens em `handlers/`.
- Queries de banco isoladas em `db/queries/`.

## Comandos Principais
- **Dev (watch):** `npm run dev` → `tsx --watch src/index.ts`
- **Build:** `npm run build` → `npx tsc`
- **Start:** `npm start` → `node dist/index.js`
