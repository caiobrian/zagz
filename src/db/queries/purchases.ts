import { db } from "../client.js";

export interface Purchase {
  id: number;
  session_id: string;
  product_name: string;
  product_url: string | null;
  estimated_price: string | null;
  actual_price: string | null;
  store: string | null;
  status: "pending" | "confirmed" | "completed" | "failed" | "cancelled";
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export const purchasesQueries = {
  create(data: {
    session_id: string;
    product_name: string;
    product_url?: string;
    estimated_price?: string;
    store?: string;
  }): number {
    const result = db
      .prepare(`
      INSERT INTO purchases (session_id, product_name, product_url, estimated_price, store)
      VALUES (?, ?, ?, ?, ?)
    `)
      .run(
        data.session_id,
        data.product_name,
        data.product_url ?? null,
        data.estimated_price ?? null,
        data.store ?? null
      );
    return result.lastInsertRowid as number;
  },

  updateStatus(
    id: number,
    status: Purchase["status"],
    extra?: { actual_price?: string; notes?: string }
  ): void {
    db.prepare(`
      UPDATE purchases
      SET status = ?, actual_price = COALESCE(?, actual_price), notes = COALESCE(?, notes), updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(status, extra?.actual_price ?? null, extra?.notes ?? null, id);
  },

  getPending(session_id: string): Purchase | undefined {
    return db
      .prepare(`
      SELECT * FROM purchases WHERE session_id = ? AND status IN ('pending', 'confirmed')
      ORDER BY created_at DESC LIMIT 1
    `)
      .get(session_id) as Purchase | undefined;
  },

  getById(id: number): Purchase | undefined {
    return db.prepare(`SELECT * FROM purchases WHERE id = ?`).get(id) as Purchase | undefined;
  },

  list(session_id: string, limit = 10): Purchase[] {
    return db
      .prepare(`
      SELECT * FROM purchases WHERE session_id = ? ORDER BY created_at DESC LIMIT ?
    `)
      .all(session_id, limit) as Purchase[];
  },
};
