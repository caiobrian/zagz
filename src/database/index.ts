import Database from 'better-sqlite3';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const dbPath = path.resolve(process.env.DATABASE_FILE || 'database.db');
const db = new Database(dbPath);

// Criação da tabela de mensagens para histórico da IA
db.exec(`
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    remoteJid TEXT NOT NULL,
    fromMe INTEGER NOT NULL,
    content TEXT NOT NULL,
    timestamp INTEGER NOT NULL
  )
`);

// Tabela para memória de longo prazo (fatos e aprendizados)
db.exec(`
  CREATE TABLE IF NOT EXISTS user_memory (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    remoteJid TEXT NOT NULL,
    category TEXT NOT NULL, -- 'preference', 'fact', 'location', 'style'
    content TEXT NOT NULL,
    importance INTEGER DEFAULT 1,
    timestamp INTEGER NOT NULL
  )
`);

export interface MessageRecord {
  id?: number;
  remoteJid: string;
  fromMe: boolean;
  content: string;
  timestamp: number;
}

export const dbService = {
  addMessage: (msg: MessageRecord) => {
    const stmt = db.prepare(`
      INSERT INTO messages (remoteJid, fromMe, content, timestamp)
      VALUES (?, ?, ?, ?)
    `);
    return stmt.run(msg.remoteJid, msg.fromMe ? 1 : 0, msg.content, msg.timestamp);
  },

  getHistory: (remoteJid: string, limit: number = 20): MessageRecord[] => {
    const stmt = db.prepare(`
      SELECT * FROM messages 
      WHERE remoteJid = ? 
      ORDER BY timestamp DESC 
      LIMIT ?
    `);
    const rows = stmt.all(remoteJid, limit) as any[];
    return rows.reverse().map(row => ({
      ...row,
      fromMe: row.fromMe === 1
    }));
  },

  addUserFact: (remoteJid: string, category: string, content: string) => {
    const stmt = db.prepare(`
      INSERT INTO user_memory (remoteJid, category, content, timestamp)
      VALUES (?, ?, ?, ?)
    `);
    return stmt.run(remoteJid, category, content, Date.now());
  },

  setUserMemory: (remoteJid: string, category: string, content: string) => {
    const deleteStmt = db.prepare(`
      DELETE FROM user_memory
      WHERE remoteJid = ? AND category = ?
    `);
    deleteStmt.run(remoteJid, category);

    const insertStmt = db.prepare(`
      INSERT INTO user_memory (remoteJid, category, content, timestamp)
      VALUES (?, ?, ?, ?)
    `);
    return insertStmt.run(remoteJid, category, content, Date.now());
  },

  clearUserMemory: (remoteJid: string, category: string) => {
    const stmt = db.prepare(`
      DELETE FROM user_memory
      WHERE remoteJid = ? AND category = ?
    `);
    return stmt.run(remoteJid, category);
  },

  getUserMemories: (remoteJid: string): any[] => {
    const stmt = db.prepare(`
      SELECT category, content FROM user_memory 
      WHERE remoteJid = ? 
      ORDER BY timestamp DESC
    `);
    return stmt.all(remoteJid);
  },

  getLatestUserMemory: (remoteJid: string, category: string): { category: string; content: string } | null => {
    const stmt = db.prepare(`
      SELECT category, content FROM user_memory
      WHERE remoteJid = ? AND category = ?
      ORDER BY timestamp DESC
      LIMIT 1
    `);
    return (stmt.get(remoteJid, category) as { category: string; content: string } | undefined) || null;
  }
};

export default db;
