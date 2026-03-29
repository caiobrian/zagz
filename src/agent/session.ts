import { sessionsQueries, type Session, type SessionState, type SessionFlow } from '../db/queries/sessions.js';

export { type Session, type SessionState, type SessionFlow };

export const sessionService = {
  getActive(): Session | undefined {
    return sessionsQueries.getActive();
  },

  create(flow?: SessionFlow, context?: object): Session {
    return sessionsQueries.create(flow, context);
  },

  update(id: string, fields: { state?: SessionState; flow?: SessionFlow; context?: object | null }): void {
    sessionsQueries.update(id, fields);
  },

  complete(id: string): void {
    sessionsQueries.complete(id);
  },

  fail(id: string): void {
    sessionsQueries.fail(id);
  },

  getContext<T = unknown>(session: Session): T | null {
    if (!session.context) return null;
    try {
      return JSON.parse(session.context) as T;
    } catch {
      return null;
    }
  },

  /**
   * Format session state for system prompt injection.
   */
  formatForPrompt(session: Session | undefined): string {
    if (!session || session.state === 'idle') {
      return 'Nenhum fluxo ativo no momento.';
    }
    const ctx = session.context ? session.context : '{}';
    return `Fluxo: ${session.flow ?? 'genérico'} | Estado: ${session.state}\nContexto: ${ctx}`;
  },
};
