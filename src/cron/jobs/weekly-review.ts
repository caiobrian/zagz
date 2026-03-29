export const weeklyReviewJob = {
  name: "weekly_review",
  schedule: "0 9 * * 1",
  buildPrompt(): string {
    const today = new Date().toLocaleDateString("pt-BR", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    return `Hoje é ${today} (início da semana). Gere uma revisão semanal para o usuário incluindo:
1. Resumo dos projetos ativos e progresso esperado (memória categoria "projects")
2. Metas financeiras da semana (memória categoria "finance")
3. Rotinas importantes para não esquecer (memória categoria "routine")
4. Sugestão de uma melhoria ou ajuste baseada nos padrões das memórias

Formato WhatsApp, direto e motivador. Máximo 8 linhas.`;
  },
};
