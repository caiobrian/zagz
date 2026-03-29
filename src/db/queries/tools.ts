import { db } from "../client.js";

export const toolsLogQueries = {
  log(
    toolName: string,
    input: unknown,
    output: unknown,
    durationMs: number,
    sessionId?: string
  ): void {
    db.prepare(`
      INSERT INTO tools_log (tool_name, input, output, duration_ms, session_id)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      toolName,
      input ? JSON.stringify(input) : null,
      output ? JSON.stringify(output) : null,
      durationMs,
      sessionId ?? null
    );
  },

  getRecent(limit = 50): unknown[] {
    return db
      .prepare(`
      SELECT * FROM tools_log ORDER BY created_at DESC LIMIT ?
    `)
      .all(limit);
  },
};
