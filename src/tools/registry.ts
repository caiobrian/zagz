import { placesSearchTool } from './placesSearch.js';
import { tavilySearchTool } from './tavilySearch.js';
import { memoryReadTool, memoryWriteTool, cronManageTool } from './memory-tool.js';
import { mcpManager } from '../mcp/client.js';
import { toolsLogQueries } from '../db/queries/tools.js';

const allowSelfModification = process.env.ALLOW_SELF_MODIFICATION === 'true';

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
        result = cronManageTool.execute(args as Parameters<typeof cronManageTool.execute>[0]);
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

    toolsLogQueries.log(name, args, result, Date.now() - start, sessionId);
    return result;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    toolsLogQueries.log(name, args, { error: errorMsg }, Date.now() - start, sessionId);
    console.error(`[Registry] Tool "${name}" failed:`, error);
    return `Ferramenta "${name}" falhou: ${errorMsg}`;
  }
}

export const toolRegistry = { getDeclarations, execute, initSelfModificationTools };
