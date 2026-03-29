import db from "../client.js";

export interface EvolutionLogEntry {
  id: number;
  timestamp: string;
  action: string;
  description: string;
  author: string;
  snapshot_before: string | null;
  snapshot_after: string | null;
}

export const evolutionQueries = {
  log(entry: {
    action: string;
    description: string;
    author: string;
    snapshotBefore?: string;
    snapshotAfter?: string;
  }): number {
    const stmt = db.prepare(`
      INSERT INTO agent_evolution_log (action, description, author, snapshot_before, snapshot_after)
      VALUES (?, ?, ?, ?, ?)
    `);
    const result = stmt.run(
      entry.action,
      entry.description,
      entry.author,
      entry.snapshotBefore ?? null,
      entry.snapshotAfter ?? null
    );
    return result.lastInsertRowid as number;
  },

  getAll(limit = 50): EvolutionLogEntry[] {
    return db
      .prepare("SELECT * FROM agent_evolution_log ORDER BY timestamp DESC LIMIT ?")
      .all(limit) as EvolutionLogEntry[];
  },

  getById(id: number): EvolutionLogEntry | undefined {
    return db.prepare("SELECT * FROM agent_evolution_log WHERE id = ?").get(id) as
      | EvolutionLogEntry
      | undefined;
  },
};
