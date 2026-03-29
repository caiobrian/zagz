import { placesSearchTool } from './placesSearch.js';
import { tavilySearchTool } from './tavilySearch.js';
import { memoryReadTool, memoryWriteTool, cronManageTool } from './memory-tool.js';
import {
  getPaymentCredentialsTool,
  initiatePurchaseTool,
  confirmPurchaseTool,
  completePurchaseTool,
  cancelPurchaseTool,
} from './paymentTool.js';
import {
  createAppointmentTool,
  listAppointmentsTool,
  updateAppointmentTool,
  cancelAppointmentTool,
} from './schedulingTool.js';
import { mcpManager } from '../mcp/client.js';
import { toolsLogQueries } from '../db/queries/tools.js';

const allowSelfModification = process.env.ALLOW_SELF_MODIFICATION === 'true';

// Tools whose args/result nunca devem aparecer em logs (dados financeiros sensíveis)
const LOG_BLOCKLIST = new Set(['get_payment_credentials']);

// Rate limiter in-memory: evita custo acidental por loop do agente
const RATE_LIMITS: Record<string, number> = {
  [tavilySearchTool.name]: 30,
  [placesSearchTool.name]: 30,
};
const _rateCounts = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(name: string): string | null {
  const limit = RATE_LIMITS[name];
  if (!limit) return null;
  const now = Date.now();
  const entry = _rateCounts.get(name);
  if (!entry || now >= entry.resetAt) {
    _rateCounts.set(name, { count: 1, resetAt: now + 3600_000 });
    return null;
  }
  if (entry.count >= limit) {
    return `Limite de ${limit} chamadas/hora atingido para "${name}". Tente novamente mais tarde.`;
  }
  entry.count++;
  return null;
}

// Mascara padrões sensíveis antes de persistir em logs
function sanitizeForLog(value: unknown): unknown {
  if (typeof value === 'string') {
    return value
      .replace(/\b\d{13,19}\b/g, '****') // números de cartão
      .replace(/\b\d{3,4}\b(?=.*cvv|.*cvc)/gi, '***') // CVV próximo de label
      .replace(/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g, '***.***.***-**'); // CPF BR
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, sanitizeForLog(v)])
    );
  }
  return value;
}

type ToolDeclaration = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
};

/**
 * Returns all Gemini function declarations (built-in + MCP).
 */
function getDeclarations(): ToolDeclaration[] {
  const declarations: ToolDeclaration[] = [
    { name: placesSearchTool.name, description: placesSearchTool.description, parameters: placesSearchTool.parameters as Record<string, unknown> },
    { name: tavilySearchTool.name, description: tavilySearchTool.description, parameters: tavilySearchTool.parameters as Record<string, unknown> },
    { name: memoryReadTool.name, description: memoryReadTool.description, parameters: memoryReadTool.parameters as Record<string, unknown> },
    { name: memoryWriteTool.name, description: memoryWriteTool.description, parameters: memoryWriteTool.parameters as Record<string, unknown> },
    { name: cronManageTool.name, description: cronManageTool.description, parameters: cronManageTool.parameters as Record<string, unknown> },
    { name: getPaymentCredentialsTool.name, description: getPaymentCredentialsTool.description, parameters: getPaymentCredentialsTool.parameters as Record<string, unknown> },
    { name: initiatePurchaseTool.name, description: initiatePurchaseTool.description, parameters: initiatePurchaseTool.parameters as Record<string, unknown> },
    { name: confirmPurchaseTool.name, description: confirmPurchaseTool.description, parameters: confirmPurchaseTool.parameters as Record<string, unknown> },
    { name: completePurchaseTool.name, description: completePurchaseTool.description, parameters: completePurchaseTool.parameters as Record<string, unknown> },
    { name: cancelPurchaseTool.name, description: cancelPurchaseTool.description, parameters: cancelPurchaseTool.parameters as Record<string, unknown> },
    { name: createAppointmentTool.name, description: createAppointmentTool.description, parameters: createAppointmentTool.parameters as Record<string, unknown> },
    { name: listAppointmentsTool.name, description: listAppointmentsTool.description, parameters: listAppointmentsTool.parameters as Record<string, unknown> },
    { name: updateAppointmentTool.name, description: updateAppointmentTool.description, parameters: updateAppointmentTool.parameters as Record<string, unknown> },
    { name: cancelAppointmentTool.name, description: cancelAppointmentTool.description, parameters: cancelAppointmentTool.parameters as Record<string, unknown> },
  ];

  if (allowSelfModification) {
    // Lazy imports to avoid loading when not needed
    const { selfEvolutionTool } = await_import_selfEvolution();
    const { autonomousTool } = await_import_autonomous();
    if (selfEvolutionTool) declarations.push({ name: selfEvolutionTool.name, description: selfEvolutionTool.description, parameters: selfEvolutionTool.parameters as Record<string, unknown> });
    if (autonomousTool) declarations.push({ name: autonomousTool.name, description: autonomousTool.description, parameters: autonomousTool.parameters as Record<string, unknown> });
  }

  const mcpTools = mcpManager.getToolsForGemini();
  for (const t of mcpTools) {
    declarations.push({ name: t.name, description: t.description ?? '', parameters: t.parameters as Record<string, unknown> });
  }

  return declarations;
}

// Synchronous placeholders — these tools are loaded at module init
let _selfEvolutionTool: typeof import('./selfEvolution.js').selfEvolutionTool | null = null;
let _autonomousTool: typeof import('./autonomous.js').autonomousTool | null = null;

function await_import_selfEvolution() {
  return { selfEvolutionTool: _selfEvolutionTool };
}
function await_import_autonomous() {
  return { autonomousTool: _autonomousTool };
}

async function initSelfModificationTools() {
  if (!allowSelfModification) return;
  const { selfEvolutionTool } = await import('./selfEvolution.js');
  const { autonomousTool } = await import('./autonomous.js');
  _selfEvolutionTool = selfEvolutionTool;
  _autonomousTool = autonomousTool;
}

/**
 * Executes a tool by name. Returns a string result.
 */
async function execute(name: string, args: Record<string, unknown>, sessionId?: string): Promise<string> {
  const start = Date.now();

  const rateLimitError = checkRateLimit(name);
  if (rateLimitError) return rateLimitError;

  try {
    let result: string;

    switch (name) {
      case placesSearchTool.name:
        result = await placesSearchTool.execute(args as Parameters<typeof placesSearchTool.execute>[0]);
        break;

      case tavilySearchTool.name:
        result = await tavilySearchTool.execute(args as Parameters<typeof tavilySearchTool.execute>[0]);
        break;

      case memoryReadTool.name:
        result = memoryReadTool.execute(args as Parameters<typeof memoryReadTool.execute>[0]);
        break;

      case memoryWriteTool.name:
        result = memoryWriteTool.execute(args as Parameters<typeof memoryWriteTool.execute>[0]);
        break;

      case cronManageTool.name:
        result = cronManageTool.execute({ ...(args as Parameters<typeof cronManageTool.execute>[0]), sessionId });
        break;

      case getPaymentCredentialsTool.name:
        result = getPaymentCredentialsTool.execute();
        break;

      case initiatePurchaseTool.name:
        result = initiatePurchaseTool.execute(args as Parameters<typeof initiatePurchaseTool.execute>[0]);
        break;

      case confirmPurchaseTool.name:
        result = confirmPurchaseTool.execute(args as Parameters<typeof confirmPurchaseTool.execute>[0]);
        break;

      case completePurchaseTool.name:
        result = completePurchaseTool.execute(args as Parameters<typeof completePurchaseTool.execute>[0]);
        break;

      case cancelPurchaseTool.name:
        result = cancelPurchaseTool.execute(args as Parameters<typeof cancelPurchaseTool.execute>[0]);
        break;

      case createAppointmentTool.name:
        result = createAppointmentTool.execute(args as Parameters<typeof createAppointmentTool.execute>[0]);
        break;

      case listAppointmentsTool.name:
        result = listAppointmentsTool.execute(args as Parameters<typeof listAppointmentsTool.execute>[0]);
        break;

      case updateAppointmentTool.name:
        result = updateAppointmentTool.execute(args as Parameters<typeof updateAppointmentTool.execute>[0]);
        break;

      case cancelAppointmentTool.name:
        result = cancelAppointmentTool.execute(args as Parameters<typeof cancelAppointmentTool.execute>[0]);
        break;

      default:
        if (allowSelfModification && _selfEvolutionTool && name === _selfEvolutionTool.name) {
          await _selfEvolutionTool.execute(args);
          result = 'Evolução iniciada.';
          break;
        }
        if (allowSelfModification && _autonomousTool && name === _autonomousTool.name) {
          result = await _autonomousTool.execute(args as Parameters<typeof _autonomousTool.execute>[0]);
          break;
        }
        // MCP fallthrough
        result = await mcpManager.callTool(name, args);
    }

    if (!LOG_BLOCKLIST.has(name)) {
      toolsLogQueries.log(name, sanitizeForLog(args), sanitizeForLog(result), Date.now() - start, sessionId);
    }
    return result;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    if (!LOG_BLOCKLIST.has(name)) {
      toolsLogQueries.log(name, sanitizeForLog(args), { error: errorMsg }, Date.now() - start, sessionId);
    }
    console.error(`[Registry] Tool "${name}" failed:`, error);
    return `Ferramenta "${name}" falhou: ${errorMsg}`;
  }
}

export const toolRegistry = { getDeclarations, execute, initSelfModificationTools };
