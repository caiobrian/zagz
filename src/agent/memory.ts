import { type Memory, memoriesQueries } from "../db/queries/memories.js";

export type MemoryCategory = "finance" | "projects" | "preferences" | "routine" | string;

export const memoryService = {
  set(key: string, value: unknown, category?: MemoryCategory): void {
    const serialized = typeof value === "string" ? value : JSON.stringify(value);
    memoriesQueries.upsert(key, serialized, category);
  },

  get(key: string): unknown {
    const mem = memoriesQueries.get(key);
    if (!mem) return undefined;
    try {
      return JSON.parse(mem.value);
    } catch {
      return mem.value;
    }
  },

  getAll(): Memory[] {
    return memoriesQueries.getAll();
  },

  getByCategory(category: MemoryCategory): Memory[] {
    return memoriesQueries.getByCategory(category);
  },

  delete(key: string): void {
    memoriesQueries.delete(key);
  },

  /**
   * Format all memories into a human-readable block for system prompt injection.
   * Values are sanitized to prevent prompt injection via stored memories.
   */
  formatForPrompt(): string {
    const memories = memoriesQueries.getAll();
    if (memories.length === 0) return "(nenhuma memória registrada ainda)";

    const byCategory: Record<string, string[]> = {};
    for (const mem of memories) {
      const cat = mem.category ?? "geral";
      if (!byCategory[cat]) byCategory[cat] = [];
      // Sanitiza valores para prevenir prompt injection: remove sequências que podem
      // escapar delimitadores XML ou injetar instruções no sistema
      const safeValue = mem.value
        .replace(/<\|/g, "< |")
        .replace(/\]\]\s*>/g, "]] >")
        .replace(/---+/g, "--")
        .replace(/#+\s*(SYSTEM|INSTRUÇÃO|INSTRUCTION|IGNORE)/gi, "# [redacted]");
      byCategory[cat].push(`- ${mem.key}: ${safeValue}`);
    }

    return Object.entries(byCategory)
      .map(([cat, lines]) => `### ${cat}\n${lines.join("\n")}`)
      .join("\n\n");
  },
};
