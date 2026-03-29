import { db } from "../client.js";

export type AppointmentStatus = "scheduled" | "confirmed" | "cancelled" | "completed";

export interface Appointment {
  id: number;
  session_id: string | null;
  service_type: string;
  provider_name: string;
  provider_phone: string | null;
  provider_address: string | null;
  scheduled_at: string; // Local datetime: YYYY-MM-DDTHH:mm:ss
  status: AppointmentStatus;
  notes: string | null;
  reminder_24h_sent: number;
  reminder_1h_sent: number;
  created_at: string;
  updated_at: string;
}

/** Returns YYYY-MM-DDTHH:mm:ss in the configured local timezone */
function localISO(d: Date): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: process.env.TZ || "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
    .format(d)
    .replace(" ", "T");
}

export const appointmentsQueries = {
  create(data: {
    session_id?: string;
    service_type: string;
    provider_name: string;
    scheduled_at: string;
    provider_phone?: string;
    provider_address?: string;
    notes?: string;
  }): number {
    const result = db
      .prepare(`
      INSERT INTO appointments (session_id, service_type, provider_name, scheduled_at, provider_phone, provider_address, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `)
      .run(
        data.session_id ?? null,
        data.service_type,
        data.provider_name,
        data.scheduled_at,
        data.provider_phone ?? null,
        data.provider_address ?? null,
        data.notes ?? null
      );
    return result.lastInsertRowid as number;
  },

  update(
    id: number,
    fields: Partial<
      Pick<Appointment, "status" | "scheduled_at" | "notes" | "provider_phone" | "provider_address">
    >
  ): void {
    const updates: string[] = ["updated_at = CURRENT_TIMESTAMP"];
    const values: unknown[] = [];
    for (const [key, val] of Object.entries(fields)) {
      updates.push(`${key} = ?`);
      values.push(val);
    }
    values.push(id);
    db.prepare(`UPDATE appointments SET ${updates.join(", ")} WHERE id = ?`).run(...values);
  },

  cancel(id: number): void {
    db.prepare(
      `UPDATE appointments SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE id = ?`
    ).run(id);
  },

  getById(id: number): Appointment | undefined {
    return db.prepare(`SELECT * FROM appointments WHERE id = ?`).get(id) as Appointment | undefined;
  },

  list(status?: AppointmentStatus, limit = 10): Appointment[] {
    if (status) {
      return db
        .prepare(`
        SELECT * FROM appointments WHERE status = ? ORDER BY scheduled_at ASC LIMIT ?
      `)
        .all(status, limit) as Appointment[];
    }
    return db
      .prepare(`
      SELECT * FROM appointments
      WHERE status NOT IN ('cancelled', 'completed')
      ORDER BY scheduled_at ASC LIMIT ?
    `)
      .all(limit) as Appointment[];
  },

  /** Appointments needing a 24h-before reminder (window: 23h–25h from now) */
  getDue24hReminders(): Appointment[] {
    const now = new Date();
    const from = localISO(new Date(now.getTime() + 23 * 60 * 60 * 1000));
    const to = localISO(new Date(now.getTime() + 25 * 60 * 60 * 1000));
    return db
      .prepare(`
      SELECT * FROM appointments
      WHERE status IN ('scheduled', 'confirmed')
        AND reminder_24h_sent = 0
        AND scheduled_at BETWEEN ? AND ?
    `)
      .all(from, to) as Appointment[];
  },

  /** Appointments needing a 1h-before reminder (window: 30min–90min from now) */
  getDue1hReminders(): Appointment[] {
    const now = new Date();
    const from = localISO(new Date(now.getTime() + 30 * 60 * 1000));
    const to = localISO(new Date(now.getTime() + 90 * 60 * 1000));
    return db
      .prepare(`
      SELECT * FROM appointments
      WHERE status IN ('scheduled', 'confirmed')
        AND reminder_1h_sent = 0
        AND scheduled_at BETWEEN ? AND ?
    `)
      .all(from, to) as Appointment[];
  },

  markReminder24hSent(id: number): void {
    db.prepare(
      `UPDATE appointments SET reminder_24h_sent = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
    ).run(id);
  },

  markReminder1hSent(id: number): void {
    db.prepare(
      `UPDATE appointments SET reminder_1h_sent = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
    ).run(id);
  },
};
