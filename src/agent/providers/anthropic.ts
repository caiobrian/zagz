import Anthropic from "@anthropic-ai/sdk";
import type {
  AIChat,
  AIProvider,
  AIResponse,
  ChatMessage,
  ToolDeclaration,
  ToolResult,
} from "./types.js";

class AnthropicChat implements AIChat {
  private readonly client: Anthropic;
  private readonly model: string;
  private readonly systemPrompt: string;
  private readonly tools: Anthropic.Tool[];
  private readonly messages: Anthropic.MessageParam[];

  constructor(
    client: Anthropic,
    model: string,
    systemPrompt: string,
    history: ChatMessage[],
    tools: ToolDeclaration[]
  ) {
    this.client = client;
    this.model = model;
    this.systemPrompt = systemPrompt;
    this.tools = tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.parameters as Anthropic.Tool["input_schema"],
    }));
    this.messages = history.map((m) => ({
      role: m.role === "user" ? ("user" as const) : ("assistant" as const),
      content: m.content,
    }));
  }

  async send(message: string | ToolResult[]): Promise<AIResponse> {
    if (typeof message === "string") {
      this.messages.push({ role: "user", content: message });
    } else {
      this.messages.push({
        role: "user",
        content: message.map((r) => ({
          type: "tool_result" as const,
          tool_use_id: r.name,
          content: r.content,
        })),
      });
    }

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 4096,
      system: this.systemPrompt,
      messages: this.messages,
      tools: this.tools.length > 0 ? this.tools : undefined,
    });

    // Accumulate the assistant response into history
    this.messages.push({ role: "assistant", content: response.content });

    const toolCalls = response.content
      .filter((block): block is Anthropic.ToolUseBlock => block.type === "tool_use")
      .map((block) => ({
        name: block.name,
        args: block.input as Record<string, unknown>,
      }));

    const textBlock = response.content.find(
      (block): block is Anthropic.TextBlock => block.type === "text"
    );

    return {
      text: textBlock?.text ?? null,
      toolCalls,
    };
  }
}

export class AnthropicProvider implements AIProvider {
  private readonly client: Anthropic;
  private readonly model: string;

  constructor() {
    this.client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    this.model = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";
  }

  startChat(params: {
    systemPrompt: string;
    history: ChatMessage[];
    tools: ToolDeclaration[];
  }): AIChat {
    return new AnthropicChat(
      this.client,
      this.model,
      params.systemPrompt,
      params.history,
      params.tools
    );
  }
}
