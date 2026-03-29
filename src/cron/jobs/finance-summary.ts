export const financeSummaryJob = {
  name: 'finance_summary',
  schedule: '0 20 * * *',
  buildPrompt(): string {
    const today = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
    return `Hoje é ${today}. Gere um resumo financeiro do dia para o usuário com base nas memórias de categoria "finance".
Inclua:
1. Lembrete do gasto médio mensal no cartão (se disponível)
2. Alerta se algum limite ou threshold foi configurado
3. Dica ou observação relevante sobre finanças pessoais

Mantenha o resumo curto e prático — máximo 5 linhas.`;
  },
};
