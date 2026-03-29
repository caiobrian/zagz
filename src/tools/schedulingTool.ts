import { type AppointmentStatus, appointmentsQueries } from "../db/queries/appointments.js";

function formatDate(isoString: string): string {
  try {
    const d = new Date(isoString.includes("T") ? isoString : isoString.replace(" ", "T"));
    return d.toLocaleString("pt-BR", {
      timeZone: process.env.TZ || "America/Sao_Paulo",
      weekday: "long",
      day: "2-digit",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return isoString;
  }
}

export const createAppointmentTool = {
  name: "create_appointment",
  description:
    "Cria um novo agendamento de serviço (corte de cabelo, consulta médica, lava-jato, manicure, dentista, etc.).",
  parameters: {
    type: "OBJECT",
    properties: {
      service_type: {
        type: "STRING",
        description:
          "Tipo de serviço (ex: corte_cabelo, consulta_medica, lava_jato, manicure, dentista, consulta_veterinaria)",
      },
      provider_name: {
        type: "STRING",
        description: "Nome do estabelecimento ou profissional",
      },
      scheduled_at: {
        type: "STRING",
        description:
          "Data e hora do agendamento no formato ISO 8601 local (ex: 2025-06-15T14:00:00)",
      },
      provider_phone: { type: "STRING", description: "Telefone do prestador (opcional)" },
      provider_address: { type: "STRING", description: "Endereço do prestador (opcional)" },
      notes: { type: "STRING", description: "Observações adicionais (opcional)" },
      session_id: { type: "STRING", description: "ID da sessão atual (opcional)" },
    },
    required: ["service_type", "provider_name", "scheduled_at"],
  },
  execute(args: {
    service_type: string;
    provider_name: string;
    scheduled_at: string;
    provider_phone?: string;
    provider_address?: string;
    notes?: string;
    session_id?: string;
  }): string {
    const id = appointmentsQueries.create(args);
    const dateStr = formatDate(args.scheduled_at);
    let msg = `Agendamento criado com sucesso!\n- Serviço: ${args.service_type}\n- Local: ${args.provider_name}\n- Data: ${dateStr}`;
    if (args.provider_phone) msg += `\n- Telefone: ${args.provider_phone}`;
    if (args.provider_address) msg += `\n- Endereço: ${args.provider_address}`;
    if (args.notes) msg += `\n- Obs: ${args.notes}`;
    msg += `\n- ID: #${id}\nVou te lembrar 24h e 1h antes!`;
    return msg;
  },
};

export const listAppointmentsTool = {
  name: "list_appointments",
  description: "Lista agendamentos futuros ou por status.",
  parameters: {
    type: "OBJECT",
    properties: {
      status: {
        type: "STRING",
        enum: ["scheduled", "confirmed", "cancelled", "completed"],
        description:
          "Filtrar por status (opcional). Se omitido, lista apenas pendentes/confirmados.",
      },
      limit: { type: "NUMBER", description: "Máximo de resultados (padrão 10)" },
    },
    required: [],
  },
  execute(args: { status?: AppointmentStatus; limit?: number }): string {
    const items = appointmentsQueries.list(args.status, args.limit ?? 10);
    if (items.length === 0) return "Nenhum agendamento encontrado.";
    return items
      .map((a) => {
        const dateStr = formatDate(a.scheduled_at);
        let line = `#${a.id} • ${a.service_type} em *${a.provider_name}*\n  ${dateStr} [${a.status}]`;
        if (a.notes) line += `\n  Obs: ${a.notes}`;
        return line;
      })
      .join("\n\n");
  },
};

export const updateAppointmentTool = {
  name: "update_appointment",
  description: "Atualiza um agendamento existente: remarca data, confirma, adiciona notas, etc.",
  parameters: {
    type: "OBJECT",
    properties: {
      id: { type: "NUMBER", description: "ID do agendamento" },
      scheduled_at: { type: "STRING", description: "Nova data/hora ISO 8601 (opcional)" },
      status: {
        type: "STRING",
        enum: ["scheduled", "confirmed", "completed"],
        description: "Novo status (opcional)",
      },
      notes: { type: "STRING", description: "Observações (opcional)" },
      provider_phone: { type: "STRING", description: "Telefone do prestador (opcional)" },
      provider_address: { type: "STRING", description: "Endereço do prestador (opcional)" },
    },
    required: ["id"],
  },
  execute(args: {
    id: number;
    scheduled_at?: string;
    status?: AppointmentStatus;
    notes?: string;
    provider_phone?: string;
    provider_address?: string;
  }): string {
    const { id, ...fields } = args;
    const existing = appointmentsQueries.getById(id);
    if (!existing) return `Agendamento #${id} não encontrado.`;

    const toUpdate: Partial<typeof fields> = {};
    if (fields.scheduled_at) toUpdate.scheduled_at = fields.scheduled_at;
    if (fields.status) toUpdate.status = fields.status;
    if (fields.notes !== undefined) toUpdate.notes = fields.notes;
    if (fields.provider_phone) toUpdate.provider_phone = fields.provider_phone;
    if (fields.provider_address) toUpdate.provider_address = fields.provider_address;

    if (Object.keys(toUpdate).length === 0) return "Nenhum campo para atualizar.";

    appointmentsQueries.update(id, toUpdate);
    let msg = `Agendamento #${id} atualizado.`;
    if (toUpdate.scheduled_at) msg += ` Nova data: ${formatDate(toUpdate.scheduled_at)}.`;
    if (toUpdate.status) msg += ` Status: ${toUpdate.status}.`;
    return msg;
  },
};

export const cancelAppointmentTool = {
  name: "cancel_appointment",
  description: "Cancela um agendamento pelo ID.",
  parameters: {
    type: "OBJECT",
    properties: {
      id: { type: "NUMBER", description: "ID do agendamento a cancelar" },
    },
    required: ["id"],
  },
  execute(args: { id: number }): string {
    const existing = appointmentsQueries.getById(args.id);
    if (!existing) return `Agendamento #${args.id} não encontrado.`;
    if (existing.status === "cancelled") return `Agendamento #${args.id} já está cancelado.`;
    appointmentsQueries.cancel(args.id);
    return `Agendamento #${args.id} (${existing.service_type} em ${existing.provider_name}) cancelado.`;
  },
};
