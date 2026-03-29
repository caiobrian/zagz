import { db } from "../client.js";

export type SessionState =
  | "idle"
  | "in_progress"
  | "awaiting_confirmation"
  | "completed"
  | "failed";
export type SessionFlow = "cinema" | "purchase" | "search" | "cron_result" | "appointment" | null;

export interface Session {
  id: string;
  state: SessionState;
  flow: SessionFlow;
  context: string | null;
  created_at: string;
  updated_at: string;
}

export const sessionsQueries = {
  create(flow?: SessionFlow, context?: object): Session {
    const id = db
      .prepare(`
      INSERT INTO sessions (flow, context)
      VALUES (?, ?)
      RETURNING *
    `)
      .get(flow ?? null, context ? JSON.stringify(context) : null) as Session;
    return id;
  },

  getById(id: string): Session | undefined {
    return db.prepare("SELECT * FROM sessions WHERE id = ?").get(id) as Session | undefined;
  },

  getActive(): Session | undefined {
    return db
      .prepare(`
      SELECT * FROM sessions
      WHERE state IN ('in_progress', 'awaiting_confirmation')
      ORDER BY updated_at DESC
      LIMIT 1
    `)
      .get() as Session | undefined;
  },

  update(
    id: string,
    fields: Partial<Pick<Session, "state" | "flow"> & { context: object | null }>
  ): void {
    const updates: string[] = ["updated_at = CURRENT_TIMESTAMP"];
    const values: unknown[] = [];

    if (fields.state !== undefined) {
      updates.push("state = ?");
      values.push(fields.state);
    }
    if (fields.flow !== undefined) {
      updates.push("flow = ?");
      values.push(fields.flow);
    }
    if ("context" in fields) {
      updates.push("context = ?");
      values.push(fields.context ? JSON.stringify(fields.context) : null);
    }

    values.push(id);
    db.prepare(`UPDATE sessions SET ${updates.join(", ")} WHERE id = ?`).run(...values);
  },

  complete(id: string): void {
    db.prepare(
      `UPDATE sessions SET state = 'completed', updated_at = CURRENT_TIMESTAMP WHERE id = ?`
    ).run(id);
  },

  fail(id: string): void {
    db.prepare(
      `UPDATE sessions SET state = 'failed', updated_at = CURRENT_TIMESTAMP WHERE id = ?`
    ).run(id);
  },
};
