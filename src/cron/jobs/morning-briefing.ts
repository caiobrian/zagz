export const morningBriefingJob = {
  name: 'morning_briefing',
  schedule: '0 8 * * *',
  buildPrompt(): string {
    const today = new Date().toLocaleDateString('pt-BR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    return `Hoje é ${today}. Gere um briefing matinal completo para o usuário incluindo:
1. Saudação personalizada baseada nas memórias do usuário
2. Resumo de projetos ativos (consulte a memória categoria "projects")
3. Rotinas e compromissos do dia (consulte a memória categoria "routine")
4. Agendamentos de hoje e dos próximos dias (use list_appointments para verificar)
5. Se tiver dados financeiros relevantes (categoria "finance"), um lembrete breve
6. Qualquer tarefa pendente que o usuário tenha mencionado recentemente

Seja conciso e direto — o formato é para WhatsApp. Use emojis com moderação.`;
  },
};
