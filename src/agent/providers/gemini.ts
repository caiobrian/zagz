import {
  type FunctionDeclaration,
  type FunctionResponsePart,
  GoogleGenerativeAI,
} from "@google/generative-ai";
import type {
  AIChat,
  AIProvider,
  AIResponse,
  ChatMessage,
  ToolDeclaration,
  ToolResult,
} from "./types.js";

class GeminiChat implements AIChat {
  private readonly chat: ReturnType<
    ReturnType<GoogleGenerativeAI["getGenerativeModel"]>["startChat"]
  >;

  constructor(chat: ReturnType<ReturnType<GoogleGenerativeAI["getGenerativeModel"]>["startChat"]>) {
    this.chat = chat;
  }

  async send(message: string | ToolResult[]): Promise<AIResponse> {
    let geminiMessage: string | FunctionResponsePart[];
    if (typeof message === "string") {
      geminiMessage = message;
    } else {
      geminiMessage = message.map(
        (r): FunctionResponsePart => ({
          functionResponse: { name: r.name, response: { content: r.content } },
        })
      );
    }

    const result = await this.chat.sendMessage(geminiMessage);
    const response = result.response;

    const toolCallParts =
      response.candidates?.[0]?.content?.parts?.filter((p) => p.functionCall) ?? [];

    const toolCalls = toolCallParts
      .filter((p) => p.functionCall?.name)
      .map((p) => ({
        name: p.functionCall?.name ?? "",
        args: (p.functionCall?.args ?? {}) as Record<string, unknown>,
      }));

    return {
      text: toolCalls.length === 0 ? (response.text() ?? null) : null,
      toolCalls,
    };
  }
}

export class GeminiProvider implements AIProvider {
  private readonly genAI: GoogleGenerativeAI;
  private readonly model: string;

  constructor() {
    this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
    this.model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  }

  startChat(params: {
    systemPrompt: string;
    history: ChatMessage[];
    tools: ToolDeclaration[];
  }): AIChat {
    const geminiModel = this.genAI.getGenerativeModel({
      model: this.model,
      systemInstruction: params.systemPrompt,
      tools: [{ functionDeclarations: params.tools as unknown as FunctionDeclaration[] }],
    });

    const chatHistory = params.history.map((m) => ({
      role: m.role === "user" ? ("user" as const) : ("model" as const),
      parts: [{ text: m.content }],
    }));

    const chat = geminiModel.startChat({ history: chatHistory });
    return new GeminiChat(chat);
  }
}
