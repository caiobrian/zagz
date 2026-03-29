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

export interface ToolResult {
  name: string;
  content: string;
}

export interface AIResponse {
  text: string | null;
  toolCalls: ToolCall[];
}

/**
 * A stateful chat session scoped to a single handleMessage call.
 * Implementations accumulate the conversation internally.
 */
export interface AIChat {
  send(message: string | ToolResult[]): Promise<AIResponse>;
}

/**
 * Provider-agnostic AI interface.
 * Each call to startChat creates a new isolated conversation session.
 */
export interface AIProvider {
  startChat(params: {
    systemPrompt: string;
    history: ChatMessage[];
    tools: ToolDeclaration[];
  }): AIChat;
}
