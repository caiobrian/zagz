import { db } from '../client.js';

export interface CronJob {
  id: number;
  name: string;
  schedule: string;
  enabled: number;
  last_run_at: string | null;
  last_status: string | null;
  last_output: string | null;
  created_at: string;
}

export const cronQueries = {
  upsert(name: string, schedule: string): void {
    db.prepare(`
      INSERT INTO cron_jobs (name, schedule)
      VALUES (?, ?)
      ON CONFLICT(name) DO UPDATE SET schedule = excluded.schedule
    `).run(name, schedule);
  },

  getAll(): CronJob[] {
    return db.prepare('SELECT * FROM cron_jobs ORDER BY name').all() as CronJob[];
  },

  getEnabled(): CronJob[] {
    return db.prepare('SELECT * FROM cron_jobs WHERE enabled = 1').all() as CronJob[];
  },

  getByName(name: string): CronJob | undefined {
    return db.prepare('SELECT * FROM cron_jobs WHERE name = ?').get(name) as CronJob | undefined;
  },

  setEnabled(name: string, enabled: boolean): void {
    db.prepare('UPDATE cron_jobs SET enabled = ? WHERE name = ?').run(enabled ? 1 : 0, name);
  },

  logRun(name: string, status: 'success' | 'failed', output?: object): void {
    db.prepare(`
      UPDATE cron_jobs
      SET last_run_at = CURRENT_TIMESTAMP,
          last_status = ?,
          last_output = ?
      WHERE name = ?
    `).run(status, output ? JSON.stringify(output) : null, name);
  },

  delete(name: string): void {
    db.prepare('DELETE FROM cron_jobs WHERE name = ?').run(name);
  },
};
