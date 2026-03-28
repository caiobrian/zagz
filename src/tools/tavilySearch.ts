import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

interface TavilySearchResult {
  title?: string;
  url?: string;
  content?: string;
  score?: number;
}

interface TavilySearchResponse {
  answer?: string;
  query?: string;
  results?: TavilySearchResult[];
}

const shouldUseAdvancedSearch = (query: string) => {
  const normalized = query.toLowerCase();
  return [
    "cinema",
    "filme",
    "filmes",
    "em cartaz",
    "horario",
    "horários",
    "sessao",
    "sessão",
    "ingresso",
    "shopping"
  ].some(term => normalized.includes(term));
};

export const tavilySearchTool = {
  name: "search_web",
  description:
    "Busca informacoes atuais na web usando a API estruturada do Tavily. Use para horarios, precos, enderecos, disponibilidade, filmes em cartaz e outras consultas atuais.",
  parameters: {
    type: "OBJECT",
    properties: {
      query: {
        type: "STRING",
        description: "Consulta de busca atual na web."
      },
      topic: {
        type: "STRING",
        enum: ["general", "news"],
        description: "Use 'news' para noticias e 'general' para buscas gerais."
      }
    },
    required: ["query"]
  },

  execute: async (args: { query: string; topic?: "general" | "news" }) => {
    const apiKey = process.env.TAVILY_API_KEY;

    if (!apiKey) {
      return "A busca web estruturada nao esta configurada no momento.";
    }

    const topic = args.topic === "news" ? "news" : "general";
    const searchDepth = shouldUseAdvancedSearch(args.query) ? "advanced" : "basic";

    try {
      console.log("[Tavily] buscando", { query: args.query, topic, searchDepth });

      const { data } = await axios.post<TavilySearchResponse>(
        "https://api.tavily.com/search",
        {
          query: args.query,
          topic,
          search_depth: searchDepth,
          max_results: 5,
          include_answer: true,
          include_raw_content: false,
          ...(searchDepth === "advanced" ? { chunks_per_source: 3 } : {})
        },
        {
          timeout: 30000,
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`
          }
        }
      );

      const lines: string[] = [];
      lines.push("BUSCA_WEB_ESTRUTURADA");
      lines.push(`Consulta: ${data.query || args.query}`);
      lines.push(`Topico: ${topic}`);
      lines.push(`Profundidade: ${searchDepth}`);

      if (data.answer) {
        lines.push(`Resumo: ${data.answer}`);
      }

      if (Array.isArray(data.results) && data.results.length > 0) {
        lines.push("Resultados:");
        for (const [index, result] of data.results.slice(0, 5).entries()) {
          const title = result.title || "Sem titulo";
          const url = result.url || "Sem URL";
          const content = result.content?.trim();
          lines.push(`${index + 1}. ${title}`);
          lines.push(`URL: ${url}`);
          if (typeof result.score === "number") {
            lines.push(`Score: ${result.score.toFixed(3)}`);
          }
          if (content) {
            lines.push(`Trecho: ${content}`);
          }
        }
      }

      return lines.length > 0
        ? lines.join("\n")
        : "Nao encontrei resultados relevantes na busca estruturada.";
    } catch (error) {
      console.error("[Tavily] erro na busca:", error);
      return "A busca web estruturada falhou no momento. Tente novamente em instantes.";
    }
  }
};
