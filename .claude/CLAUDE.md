# Zagz - WhatsApp AI Agent Project

## Stack
- **Linguagem:** TypeScript (Node.js)
- **WhatsApp API:** Baileys (@whiskeysockets/baileys)
- **AI Model:** Gemini (Google Generative AI SDK)
- **Database:** SQLite (Better-SQLite3)

## Decisões Técnicas
- **Logging:** Usar `pino` para logs eficientes (requerido pelo Baileys).
- **Gerenciamento de Estado:** Baileys armazena credenciais no sistema de arquivos para manter a sessão.
- **Contexto de Conversa:** O SQLite armazenará o histórico para que a IA tenha memória.

## Padrões de Código
- Usar `async/await` para operações assíncronas.
- Separar lógica de negócio em `services/`.
- Handlers de mensagens em `handlers/`.

## Comandos Principais
- **Dev:** `npx tsx src/index.ts`
- **Build:** `npx tsc`
- **Start:** `node dist/index.js`
