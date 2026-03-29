# Plano de Implementação: Zagz → Agente Autônomo (Nível OpenClaw)

## Contexto

O Zagz é um assistente pessoal via WhatsApp com arquitetura sólida mas reativa. Para alcançar o nível de autonomia do OpenClaw, precisa de: loop de raciocínio mais profundo, abstração de provedores de IA, sistema de skills dinâmico, multi-canal, e melhor auto-evolução. Este plano está organizado em fases por impacto vs. risco de quebra.

---

## Fase 1 — Loop de Autonomia Profunda (Core Loop)

**Objetivo:** Dar ao agente capacidade real de executar tarefas complexas sem interrupções artificiais.

### 1.1 Aumentar `MAX_TOOL_ITERATIONS` + Parada Inteligente

**Arquivo:** `src/agent/core.ts` (linha 16)

Mudar de `5` para `20`. Adicionar lógica de parada inteligente:

```typescript
const MAX_TOOL_ITERATIONS = 20;

// Detectar loop: se a mesma ferramenta foi chamada com os mesmos args 3x → parar
type ToolCallKey = string;
const toolCallHistory = new Map<ToolCallKey, number>();

function detectLoop(name: string, args: Record<string, unknown>): boolean {
  const key = `${name}:${JSON.stringify(args)}`;
  const count = (toolCallHistory.get(key) ?? 0) + 1;
  toolCallHistory.set(key, count);
  return count >= 3;
}
```

### 1.2 Planning Step Explícito

**Arquivo:** `src/agent/core.ts`

Antes de enviar a mensagem do usuário, fazer uma chamada preliminar de planejamento (apenas texto, sem tools) para o modelo decompor o objetivo:

```typescript
async function generatePlan(userMessage: string, systemPrompt: string): Promise<string> {
  const planningModel = genAI.getGenerativeModel({
    model: geminiModel,
    systemInstruction: systemPrompt,
  });
  const planChat = planningModel.startChat({ history: [] });
  const planPrompt = `Dado o pedido: "${userMessage}"
Lista em até 5 passos numerados o que você precisa fazer (ferramentas, verificações, confirmações).
Seja específico sobre qual ferramenta usar em cada passo. Responda APENAS com o plano, sem executar nada.`;
  const result = await planChat.sendMessage(planPrompt);
  return result.response.text();
}
```

O plano gerado é injetado no contexto da primeira mensagem ao modelo principal (não na system prompt).

### 1.3 Error Recovery com Replanning

**Arquivo:** `src/agent/core.ts`

Quando uma ferramenta retorna string com `falhou:` ou `erro:`, injetar mensagem de recovery:

```typescript
const FAILURE_PATTERNS = /falhou:|failed:|error:/i;

if (FAILURE_PATTERNS.test(toolResult)) {
  const recoveryHint = `A ferramenta ${name} falhou com: "${toolResult}".
Considere: (1) tentar abordagem alternativa, (2) informar o usuário do problema, (3) usar outra ferramenta.`;
  functionResponses.push({
    functionResponse: { name, response: { content: recoveryHint } }
  });
}
```

### 1.4 Raciocínio Chain-of-Thought no System Prompt

**Arquivo:** `src/agent/prompt.ts`

Adicionar seção ao system prompt existente (após as instruções atuais):

```
## Raciocínio
Antes de responder, pense em voz alta nos seus passos usando este formato:
[PENSAMENTO]: O que o usuário quer?
[PLANO]: Quais ferramentas/etapas são necessárias?
[EXECUÇÃO]: Execute as ferramentas necessárias.
[RESPOSTA]: Formule a resposta final.

Remova as tags [PENSAMENTO] e [PLANO] da resposta final ao usuário.
```

---

## Fase 2 — Abstração Multi-Provider de IA

**Objetivo:** Desacoplar o core do Gemini para suportar outros provedores (Claude, OpenAI, DeepSeek).

### 2.1 Interface `AIProvider`

**Novo arquivo:** `src/agent/providers/types.ts`

```typescript
export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ToolDeclaration {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface ToolCall {
  name: string;
  args: Record<string, unknown>;
}

export interface AIResponse {
  text: string | null;
  toolCalls: ToolCall[];
}

export interface AIProvider {
  chat(params: {
    systemPrompt: string;
    history: ChatMessage[];
    message: string | ToolResult[];
    tools: ToolDeclaration[];
  }): Promise<AIResponse>;
}

export interface ToolResult {
  name: string;
  content: string;
}
```

### 2.2 Adapter Gemini

**Novo arquivo:** `src/agent/providers/gemini.ts`

Extrai a lógica atual de `core.ts` (linhas 75–136) para este módulo. Implementa `AIProvider`.

### 2.3 Adapter Anthropic (Claude)

**Novo arquivo:** `src/agent/providers/anthropic.ts`

Usa `@anthropic-ai/sdk`. Implementa `AIProvider`.

Dependência: `npm install @anthropic-ai/sdk`

Nova variável de ambiente:
```bash
AI_PROVIDER=gemini          # ou: anthropic, openai
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
```

### 2.4 Factory de Provider

**Novo arquivo:** `src/agent/providers/index.ts`

```typescript
export function createAIProvider(): AIProvider {
  const provider = process.env.AI_PROVIDER ?? "gemini";
  switch (provider) {
    case "anthropic": return new AnthropicProvider();
    case "openai": return new OpenAIProvider();
    default: return new GeminiProvider();
  }
}
```

### 2.5 Refatorar `core.ts`

Substituir toda a lógica do Gemini SDK por chamadas à interface `AIProvider`. O core fica provider-agnóstico.

**Arquivos modificados:**
- `src/agent/core.ts` — remover imports do `@google/generative-ai`, usar `createAIProvider()`
- `src/agent/providers/gemini.ts` — nova implementação (move código atual)
- `src/agent/providers/anthropic.ts` — nova implementação
- `src/agent/providers/index.ts` — factory

---

## Fase 3 — Sistema de Skills Dinâmico

**Objetivo:** Substituir o registry hardcoded por um sistema modular onde skills são carregadas dinamicamente de diretórios, similar ao OpenClaw.

### 3.1 Interface `Skill`

**Novo arquivo:** `src/skills/types.ts`

```typescript
export interface SkillTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute(args: Record<string, unknown>, sessionId?: string): Promise<string> | string;
  logBlocklist?: boolean;       // true = nunca logar args/result
  rateLimit?: number;           // chamadas por hora
}

export interface Skill {
  name: string;
  version: string;
  description: string;
  tools: SkillTool[];
  onInit?(): Promise<void>;     // setup opcional ao carregar
}
```

### 3.2 Loader de Skills

**Novo arquivo:** `src/skills/loader.ts`

```typescript
// Carrega todas as skills da pasta src/skills/
// Cada skill é um diretório com index.ts exportando um objeto Skill
export async function loadSkills(skillsDir: string): Promise<Skill[]>
```

### 3.3 Migrar Tools Existentes para Skills

Converter as tools atuais em skills:

```
src/skills/
├── types.ts
├── loader.ts
├── memory/index.ts       ← memory-tool.ts
├── scheduling/index.ts   ← schedulingTool.ts
├── payment/index.ts      ← paymentTool.ts
├── search/index.ts       ← tavilySearch.ts + placesSearch.ts
└── system/index.ts       ← autonomous.ts + selfEvolution.ts
```

### 3.4 Refatorar `registry.ts`

Substituir o `switch` hardcoded de 14 cases (linhas 212–306) por despacho dinâmico via mapa:

```typescript
// Mapa construído ao inicializar: toolName → SkillTool
const _toolMap = new Map<string, SkillTool>();

export async function initRegistry(skills: Skill[]) {
  for (const skill of skills) {
    for (const tool of skill.tools) {
      _toolMap.set(tool.name, tool);
    }
  }
}

async function execute(name: string, args: Record<string, unknown>, sessionId?: string) {
  const tool = _toolMap.get(name) ?? mcpFallback(name);
  return tool.execute(args, sessionId);
}
```

**Benefício:** Adicionar uma nova tool = criar um arquivo Skill. Sem tocar em `registry.ts`.

---

## Fase 4 — Multi-Canal (Telegram)

**Objetivo:** Permitir que o agente opere via Telegram além do WhatsApp.

### 4.1 Interface `MessageChannel`

**Novo arquivo:** `src/channels/types.ts`

```typescript
export interface MessageChannel {
  name: string;
  start(): Promise<void>;
  sendMessage(text: string): Promise<void>;
  onMessage(handler: (text: string) => Promise<string>): void;
}
```

### 4.2 Refatorar Canal WhatsApp

**Arquivo:** `src/channels/whatsapp.ts`

Implementar a interface `MessageChannel`. Extrair o `sendMessage` atual para o contrato.

### 4.3 Canal Telegram

**Novo arquivo:** `src/channels/telegram.ts`

Usa `node-telegram-bot-api`. Implementa `MessageChannel`.

Dependência: `npm install node-telegram-bot-api @types/node-telegram-bot-api`

Nova variável de ambiente:
```bash
TELEGRAM_BOT_TOKEN=
CHANNELS=whatsapp,telegram     # canais ativos (default: whatsapp)
```

### 4.4 Refatorar `index.ts`

Carregar canais configurados dinamicamente:

```typescript
const channels = parseChannels(process.env.CHANNELS ?? "whatsapp");
for (const channel of channels) {
  channel.onMessage((text) => agentCore.handleMessage(text));
  await channel.start();
}
```

---

## Fase 5 — Auto-Evolução Robusta

**Objetivo:** Substituir a abordagem frágil de string-replace por um sistema versionado e seguro.

### 5.1 Skills Externas via JSON (substituir `evolve_agent`)

Em vez de modificar `mcp/config.ts` via regex, usar um arquivo de configuração dinâmica:

**Novo arquivo:** `src/skills/external/skills.json`

```json
{
  "mcpServers": [],
  "customSkills": []
}
```

**Novo arquivo:** `src/skills/external/loader.ts`

Carrega `skills.json` em runtime, sem modificar código TypeScript.

### 5.2 Atualizar `selfEvolutionTool`

**Arquivo:** `src/tools/selfEvolution.ts`

Substituir lógica de `fs.readFileSync` + string replace em `config.ts` por:
1. Ler `src/skills/external/skills.json`
2. Adicionar entrada ao JSON
3. Gravar JSON
4. Recarregar skills sem restart (via `initRegistry()`)

### 5.3 Auditoria de Modificações

**Novo arquivo:** `src/db/queries/evolution.ts`

```typescript
// Tabela: agent_evolution_log
// Campos: id, timestamp, action, description, author (tool/user), snapshot_before, snapshot_after
```

**Migração de schema:** adicionar tabela `agent_evolution_log` em `src/db/client.ts`.

### 5.4 Rollback de Evolução

Nova tool `rollback_evolution`:
- Lista últimas modificações
- Restaura `snapshot_before` de uma entrada específica

---

## Fase 6 — Memória Episódica e Aprendizado

**Objetivo:** Extrair fatos automaticamente das conversas, em vez de só via `memory_write` explícito.

### 6.1 Extração Automática de Memórias

**Novo arquivo:** `src/agent/memory-extractor.ts`

Após cada resposta do agente, executar um mini-prompt de extração em background:

```typescript
async function extractMemories(conversation: string): Promise<void> {
  const extractPrompt = `Analise esta conversa e extraia APENAS fatos novos, duráveis e relevantes sobre o usuário.
Formato de saída JSON: [{"key": "...", "value": "...", "category": "..."}]
Se não houver nada relevante, retorne [].

Conversa:
${conversation}`;
  // Envia ao modelo (sem tools)
  // Para cada fato extraído: memoryService.set(key, value, category)
}
```

Chamar após `handleMessage` sem bloquear a resposta ao usuário.

### 6.2 Novo Cron: Consolidação de Memórias

**Novo arquivo:** `src/cron/jobs/memory-consolidation.ts`

- **Schedule:** `0 3 * * 0` (Domingo 3h)
- Busca conversas dos últimos 7 dias
- Extrai padrões de comportamento, preferências recorrentes
- Remove memórias desatualizadas ou contraditórias

### 6.3 Categorias de Memória Extendidas

**Arquivo:** `src/tools/memory-tool.ts`

Adicionar categorias:
- `episodic` — eventos datados ("foi ao cinema dia X")
- `context` — contexto temporário (expira em 24h)
- `preference` — preferências descobertas automaticamente

---

## Fase 7 — Proatividade via Eventos

**Objetivo:** Reagir a eventos do mundo real além de cron schedules.

### 7.1 Servidor HTTP para Webhooks

**Novo arquivo:** `src/webhooks/server.ts`

Variáveis de ambiente:
```bash
WEBHOOK_PORT=3000
WEBHOOK_SECRET=
```

### 7.2 Monitor de Preços

**Nova skill:** `src/skills/price-monitor/index.ts`

Ferramentas:
- `watch_price(url, target_price)` — registra URL para monitorar
- `unwatch_price(id)` — remove monitoramento

Cron a cada 30min: verifica preços, envia alerta se atingido.

### 7.3 Monitor RSS/Notícias

**Nova skill:** `src/skills/rss-monitor/index.ts`

Ferramentas:
- `subscribe_feed(url, keywords[])` — monitora feed filtrando por keywords
- `list_subscriptions()` — lista feeds ativos

---

## Arquivos Críticos Modificados / Criados

### Modificados

| Arquivo | Mudança Principal |
|---------|-------------------|
| `src/agent/core.ts` | +planning step, +smart loop stop, +error recovery, usar `AIProvider` |
| `src/agent/prompt.ts` | +chain-of-thought instructions |
| `src/tools/registry.ts` | Switch hardcoded → dynamic map via Skills |
| `src/tools/selfEvolution.ts` | String-replace → JSON-based external skills |
| `src/channels/whatsapp.ts` | Implementar interface `MessageChannel` |
| `src/db/client.ts` | +tabela `agent_evolution_log` |
| `src/index.ts` | Inicialização dinâmica de canais e skills |
| `.env.example` | +`AI_PROVIDER`, `ANTHROPIC_API_KEY`, `TELEGRAM_BOT_TOKEN`, `CHANNELS` |

### Criados

| Arquivo | Propósito |
|---------|-----------|
| `src/agent/providers/types.ts` | Interface `AIProvider` |
| `src/agent/providers/gemini.ts` | Adapter Gemini (extrai do core atual) |
| `src/agent/providers/anthropic.ts` | Adapter Claude |
| `src/agent/providers/index.ts` | Factory de provider |
| `src/agent/memory-extractor.ts` | Extração automática de memórias |
| `src/channels/types.ts` | Interface `MessageChannel` |
| `src/channels/telegram.ts` | Adapter Telegram |
| `src/skills/types.ts` | Interface `Skill` e `SkillTool` |
| `src/skills/loader.ts` | Dynamic skill loader |
| `src/skills/memory/index.ts` | Memory skill (migrado) |
| `src/skills/scheduling/index.ts` | Scheduling skill (migrado) |
| `src/skills/payment/index.ts` | Payment skill (migrado) |
| `src/skills/search/index.ts` | Search skill (migrado) |
| `src/skills/system/index.ts` | Autonomous + evolution skills (migrado) |
| `src/skills/external/skills.json` | Config dinâmica de skills/MCP externas |
| `src/skills/external/loader.ts` | Loader de skills externas |
| `src/skills/price-monitor/index.ts` | Monitor de preços (Fase 7) |
| `src/skills/rss-monitor/index.ts` | Monitor RSS (Fase 7) |
| `src/cron/jobs/memory-consolidation.ts` | Consolidação semanal de memórias |
| `src/db/queries/evolution.ts` | Queries para audit log de evolução |
| `src/webhooks/server.ts` | HTTP server para webhooks (Fase 7) |

---

## Ordem de Implementação Recomendada

```
Fase 1  →  Fase 3  →  Fase 2  →  Fase 4  →  Fase 5  →  Fase 6  →  Fase 7
(loop)    (skills)  (multi-AI) (canais)  (evolução)  (memória)  (eventos)
  ↑ mais impacto, menos risco              ↑ mais risco, mais estrutural
```

**Justificativa:** Fase 1 e 3 têm impacto imediato na autonomia e podem ser feitas sem quebrar nada. Fase 2 e 4 são refactorings estruturais que dependem da Fase 3 estar pronta. Fases 5–7 são incrementos após a base estar sólida.

---

## Verificação / Testes

1. **Fase 1:** Pedir ao agente uma tarefa que requer 6+ tools — verificar que não trava no limite de 5.
2. **Fase 2:** `AI_PROVIDER=anthropic` no `.env` — verificar que responde via Claude.
3. **Fase 3:** Criar `src/skills/calculator/index.ts` — verificar carga automática sem modificar `registry.ts`.
4. **Fase 4:** `CHANNELS=whatsapp,telegram` — verificar que mesmo `agentCore` responde em ambos.
5. **Fase 5:** Chamar `evolve_agent` — verificar que `skills.json` foi atualizado e `evolution_log` tem registro.
6. **Fase 6:** Conversa sobre preferências — verificar memória extraída automaticamente após 30s.
7. **Fase 7:** Registrar watch de preço — verificar alerta quando valor-alvo é atingido.

**Pre-commit obrigatório antes de cada commit:**
```bash
npm run check && npm run typecheck
```
