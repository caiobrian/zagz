import { AnthropicProvider } from "./anthropic.js";
import { GeminiProvider } from "./gemini.js";
import { OpenAIProvider } from "./openai.js";
import type { AIProvider } from "./types.js";

export function createAIProvider(): AIProvider {
  const provider = process.env.AI_PROVIDER ?? "gemini";
  switch (provider) {
    case "anthropic":
      return new AnthropicProvider();
    case "openai":
      return new OpenAIProvider();
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
