import OpenAI from "openai";
import type {
  AIChat,
  AIProvider,
  AIResponse,
  ChatMessage,
  ToolDeclaration,
  ToolResult,
} from "./types.js";

class OpenAIChat implements AIChat {
  private readonly client: OpenAI;
  private readonly model: string;
  private readonly tools: OpenAI.ChatCompletionTool[];
  private readonly messages: OpenAI.ChatCompletionMessageParam[];

  constructor(
    client: OpenAI,
    model: string,
    systemPrompt: string,
    history: ChatMessage[],
    tools: ToolDeclaration[]
  ) {
    this.client = client;
    this.model = model;
    // systemPrompt is injected as the first message in the history
    this.tools = tools.map(
      (t): OpenAI.ChatCompletionTool => ({
        type: "function",
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters as OpenAI.FunctionParameters,
        },
      })
    );
    this.messages = [
      { role: "system", content: systemPrompt },
      ...history.map(
        (m): OpenAI.ChatCompletionMessageParam => ({
          role: m.role === "user" ? "user" : "assistant",
          content: m.content,
        })
      ),
    ];
  }

  async send(message: string | ToolResult[]): Promise<AIResponse> {
    if (typeof message === "string") {
      this.messages.push({ role: "user", content: message });
    } else {
      // Tool results: push a user message with tool_result content
      for (const r of message) {
        this.messages.push({
          role: "tool",
          tool_call_id: r.name,
          content: r.content,
        });
      }
    }

    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: this.messages,
      tools: this.tools.length > 0 ? this.tools : undefined,
    });

    const choice = response.choices[0];
    const assistantMessage = choice.message;

    // Accumulate into history
    this.messages.push(assistantMessage);

    const toolCalls =
      assistantMessage.tool_calls
        ?.filter((tc): tc is OpenAI.ChatCompletionMessageFunctionToolCall => tc.type === "function")
        .map((tc) => ({
          name: tc.function.name,
          args: JSON.parse(tc.function.arguments) as Record<string, unknown>,
        })) ?? [];

    return {
      text: assistantMessage.content ?? null,
      toolCalls,
    };
  }
}

export class OpenAIProvider implements AIProvider {
  private readonly client: OpenAI;
  private readonly model: string;

  constructor() {
    this.client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    this.model = process.env.OPENAI_MODEL ?? "gpt-4o";
  }

  startChat(params: {
    systemPrompt: string;
    history: ChatMessage[];
    tools: ToolDeclaration[];
  }): AIChat {
    return new OpenAIChat(
      this.client,
      this.model,
      params.systemPrompt,
      params.history,
      params.tools
    );
  }
}
