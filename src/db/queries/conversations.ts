import { db } from '../client.js';

export interface Conversation {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  session_id: string | null;
  created_at: string;
}

export const conversationsQueries = {
  add(role: 'user' | 'assistant', content: string, sessionId?: string): void {
    db.prepare(`
      INSERT INTO conversations (role, content, session_id) VALUES (?, ?, ?)
    `).run(role, content, sessionId ?? null);
  },

  getRecent(limit = 20): Conversation[] {
    return db.prepare(`
      SELECT * FROM (
        SELECT * FROM conversations ORDER BY created_at DESC LIMIT ?
      ) ORDER BY created_at ASC
    `).all(limit) as Conversation[];
  },

  getBySession(sessionId: string): Conversation[] {
    return db.prepare(`
      SELECT * FROM conversations WHERE session_id = ? ORDER BY created_at ASC
    `).all(sessionId) as Conversation[];
  },
};
