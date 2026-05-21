import { defineStore } from 'pinia';
import {
  addStudentToSession,
  createRecitationSession,
  finishAndNextStudent,
  removeStudentFromQueue,
  resetRecitationSession,
  skipAndNextStudent,
  type NoticeKind,
  type RecitationSession,
  type SessionOperationResult
} from '@/features/recitation/sessionLogic';

export const SESSIONS_STORAGE_KEY = 'classroom-toolkit:sessions';
export const ACTIVE_SESSION_STORAGE_KEY = 'classroom-toolkit:active-session-id';

export interface AppNotice {
  kind: NoticeKind;
  text: string;
  at: number;
}

interface ClassroomState {
  sessions: RecitationSession[];
  activeSessionId: string | null;
  notice: AppNotice | null;
}

function canUseStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function parseSessions(rawValue: string | null): RecitationSession[] {
  if (!rawValue) {
    return [];
  }

  try {
    const parsed = JSON.parse(rawValue);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export const useClassroomStore = defineStore('classroom', {
  state: (): ClassroomState => ({
    sessions: [],
    activeSessionId: null,
    notice: null
  }),
  getters: {
    activeSession(state): RecitationSession | null {
      return state.sessions.find((session) => session.id === state.activeSessionId) ?? null;
    },
    getSession:
      (state) =>
      (sessionId: string): RecitationSession | null =>
        state.sessions.find((session) => session.id === sessionId) ?? null
  },
  actions: {
    hydrate() {
      if (!canUseStorage()) {
        return;
      }

      this.sessions = parseSessions(window.localStorage.getItem(SESSIONS_STORAGE_KEY));
      const savedActiveSessionId = window.localStorage.getItem(ACTIVE_SESSION_STORAGE_KEY);
      this.activeSessionId =
        savedActiveSessionId && this.sessions.some((session) => session.id === savedActiveSessionId)
          ? savedActiveSessionId
          : null;
    },

    persist() {
      if (!canUseStorage()) {
        return;
      }

      window.localStorage.setItem(SESSIONS_STORAGE_KEY, JSON.stringify(this.sessions));

      if (this.activeSessionId) {
        window.localStorage.setItem(ACTIVE_SESSION_STORAGE_KEY, this.activeSessionId);
      } else {
        window.localStorage.removeItem(ACTIVE_SESSION_STORAGE_KEY);
      }
    },

    showNotice(kind: NoticeKind, text: string) {
      this.notice = {
        kind,
        text,
        at: Date.now()
      };
    },

    applyOperation(result: SessionOperationResult): SessionOperationResult {
      const index = this.sessions.findIndex((session) => session.id === result.session.id);

      if (index >= 0) {
        this.sessions.splice(index, 1, result.session);
        this.persist();
      }

      this.showNotice(result.kind, result.message);
      return result;
    },

    createSession(title: string): string | null {
      const trimmedTitle = title.trim();

      if (!trimmedTitle) {
        this.showNotice('warning', '请输入课堂标题');
        return null;
      }

      const session = createRecitationSession(trimmedTitle);
      this.sessions.unshift(session);
      this.activeSessionId = session.id;
      this.persist();
      this.showNotice('success', '课堂已创建');
      return session.id;
    },

    setActiveSession(sessionId: string): boolean {
      const sessionExists = this.sessions.some((session) => session.id === sessionId);

      if (!sessionExists) {
        this.showNotice('warning', '未找到该课堂');
        return false;
      }

      this.activeSessionId = sessionId;
      this.persist();
      return true;
    },

    addStudent(displayNo: string): SessionOperationResult | null {
      const session = this.getActiveSession();

      if (!session) {
        this.showNotice('warning', '请先创建课堂');
        return null;
      }

      return this.applyOperation(addStudentToSession(session, displayNo));
    },

    finishAndNext(): SessionOperationResult | null {
      const session = this.getActiveSession();

      if (!session) {
        this.showNotice('warning', '请先创建课堂');
        return null;
      }

      return this.applyOperation(finishAndNextStudent(session));
    },

    skipAndNext(): SessionOperationResult | null {
      const session = this.getActiveSession();

      if (!session) {
        this.showNotice('warning', '请先创建课堂');
        return null;
      }

      return this.applyOperation(skipAndNextStudent(session));
    },

    removeFromQueue(studentNo: string): SessionOperationResult | null {
      const session = this.getActiveSession();

      if (!session) {
        this.showNotice('warning', '请先创建课堂');
        return null;
      }

      return this.applyOperation(removeStudentFromQueue(session, studentNo));
    },

    resetSession(sessionId: string): boolean {
      const session = this.getSession(sessionId);

      if (!session) {
        this.showNotice('warning', '未找到该课堂');
        return false;
      }

      const resetSession = resetRecitationSession(session);
      const index = this.sessions.findIndex((item) => item.id === sessionId);
      this.sessions.splice(index, 1, resetSession);
      this.activeSessionId = sessionId;
      this.persist();
      this.showNotice('info', '当前课堂数据已重置');
      return true;
    },

    getActiveSession(): RecitationSession | null {
      return this.activeSession;
    }
  }
});
