import { appointmentsQueries } from '../../db/queries/appointments.js';

function formatTime(isoString: string): string {
  try {
    const d = new Date(isoString.includes('T') ? isoString : isoString.replace(' ', 'T'));
    return d.toLocaleString('pt-BR', {
      timeZone: process.env.TZ || 'America/Sao_Paulo',
      weekday: 'long',
      day: '2-digit',
      month: 'long',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return isoString;
  }
}

export async function checkAndSendAppointmentReminders(
  sender: (msg: string) => Promise<void>
): Promise<void> {
  // 24h reminders
  const due24h = appointmentsQueries.getDue24hReminders();
  for (const appt of due24h) {
    const dateStr = formatTime(appt.scheduled_at);
    let msg = `⏰ Lembrete: amanhã você tem *${appt.service_type}* em *${appt.provider_name}*\n📅 ${dateStr}`;
    if (appt.provider_address) msg += `\n📍 ${appt.provider_address}`;
    if (appt.provider_phone) msg += `\n📞 ${appt.provider_phone}`;
    if (appt.notes) msg += `\n📝 ${appt.notes}`;
    await sender(msg);
    appointmentsQueries.markReminder24hSent(appt.id);
  }

  // 1h reminders
  const due1h = appointmentsQueries.getDue1hReminders();
  for (const appt of due1h) {
    const dateStr = formatTime(appt.scheduled_at);
    let msg = `🔔 Daqui a pouco! Seu *${appt.service_type}* em *${appt.provider_name}* é ${dateStr}`;
    if (appt.provider_address) msg += `\n📍 ${appt.provider_address}`;
    if (appt.notes) msg += `\n📝 ${appt.notes}`;
    await sender(msg);
    appointmentsQueries.markReminder1hSent(appt.id);
  }
}
