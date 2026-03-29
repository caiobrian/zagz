import { db } from "../client.js";

export interface Memory {
  key: string;
  value: string;
  category: string | null;
  updated_at: string;
}

export const memoriesQueries = {
  upsert(key: string, value: string, category?: string): void {
    db.prepare(`
      INSERT INTO memories (key, value, category, updated_at)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET
        value = excluded.value,
        category = excluded.category,
        updated_at = CURRENT_TIMESTAMP
    `).run(key, value, category ?? null);
  },

  get(key: string): Memory | undefined {
    return db.prepare("SELECT * FROM memories WHERE key = ?").get(key) as Memory | undefined;
  },

  getAll(): Memory[] {
    return db.prepare("SELECT * FROM memories ORDER BY category, key").all() as Memory[];
  },

  getByCategory(category: string): Memory[] {
    return db.prepare("SELECT * FROM memories WHERE category = ?").all(category) as Memory[];
  },

  delete(key: string): void {
    db.prepare("DELETE FROM memories WHERE key = ?").run(key);
  },
};
