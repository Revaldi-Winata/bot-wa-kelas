export type BotState =
  | 'IDLE'
  | 'AWAIT_MAIN_MENU'
  | 'AWAIT_SCHEDULE_DAY'
  | 'AWAIT_CONTACT_SUBJECT';

export interface UserSession {
  state: BotState;
  selectedSubjectId?: string;
  selectedSubjectName?: string;
  availableOptions: number[];
  retryCount: number;
  lastActivityAt: number;
  isGroup: boolean;
}

class SessionManager {
  private sessions = new Map<string, UserSession>();
  private readonly GROUP_TTL_MS = 60 * 1000; // 1 minute (60s)
  private readonly DM_TTL_MS = 60 * 1000;    // 1 minute (60s)
  private readonly MAX_RETRIES = 3;

  public getSessionKey(remoteJid: string, senderJid: string): string {
    return `${remoteJid}:${senderJid}`;
  }

  public getSession(remoteJid: string, senderJid: string): UserSession | null {
    const key = this.getSessionKey(remoteJid, senderJid);
    const session = this.sessions.get(key);
    if (!session) return null;

    const ttl = session.isGroup ? this.GROUP_TTL_MS : this.DM_TTL_MS;
    if (Date.now() - session.lastActivityAt > ttl) {
      this.sessions.delete(key);
      return null;
    }

    return session;
  }

  public setSession(remoteJid: string, senderJid: string, sessionData: Partial<UserSession>): UserSession {
    const key = this.getSessionKey(remoteJid, senderJid);
    const existing = this.sessions.get(key);
    const isGroup = remoteJid.endsWith('@g.us');

    const updated: UserSession = {
      state: sessionData.state || existing?.state || 'IDLE',
      selectedSubjectId: sessionData.selectedSubjectId !== undefined ? sessionData.selectedSubjectId : existing?.selectedSubjectId,
      selectedSubjectName: sessionData.selectedSubjectName !== undefined ? sessionData.selectedSubjectName : existing?.selectedSubjectName,
      availableOptions: sessionData.availableOptions || existing?.availableOptions || [],
      retryCount: sessionData.retryCount !== undefined ? sessionData.retryCount : existing?.retryCount || 0,
      lastActivityAt: Date.now(),
      isGroup,
    };

    this.sessions.set(key, updated);
    return updated;
  }

  public recordInvalidAttempt(remoteJid: string, senderJid: string): { session: UserSession | null; isTerminated: boolean } {
    const key = this.getSessionKey(remoteJid, senderJid);
    const session = this.getSession(remoteJid, senderJid);
    if (!session) return { session: null, isTerminated: true };

    session.retryCount += 1;
    session.lastActivityAt = Date.now();

    if (session.retryCount >= this.MAX_RETRIES) {
      this.sessions.delete(key);
      return { session: null, isTerminated: true };
    }

    this.sessions.set(key, session);
    return { session, isTerminated: false };
  }

  public clearSession(remoteJid: string, senderJid: string): void {
    const key = this.getSessionKey(remoteJid, senderJid);
    this.sessions.delete(key);
  }
}

export const sessionManager = new SessionManager();
