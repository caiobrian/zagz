import { AnthropicProvider } from "./anthropic.js";
import { GeminiProvider } from "./gemini.js";
import type { AIProvider } from "./types.js";

export function createAIProvider(): AIProvider {
  const provider = process.env.AI_PROVIDER ?? "gemini";
  switch (provider) {
    case "anthropic":
      return new AnthropicProvider();
    default:
      return new GeminiProvider();
  }
}

export type {
  AIChat,
  AIProvider,
  AIResponse,
  ChatMessage,
  ToolCall,
  ToolDeclaration,
  ToolResult,
} from "./types.js";
