export type ToolType = 'recitation-queue';

export interface Student {
  studentNo: string;
  displayNo: string;
  joinedAt: string;
}

export interface RecitationSession {
  id: string;
  toolType: ToolType;
  title: string;
  createdAt: string;
  currentStudent: Student | null;
  queue: Student[];
  finishedStudents: Student[];
  skippedStudents: Student[];
}

export type NoticeKind = 'success' | 'warning' | 'info';

export interface SessionOperationResult {
  ok: boolean;
  kind: NoticeKind;
  message: string;
  session: RecitationSession;
}

function cloneSession(session: RecitationSession): RecitationSession {
  return {
    ...session,
    currentStudent: session.currentStudent ? { ...session.currentStudent } : null,
    queue: session.queue.map((student) => ({ ...student })),
    finishedStudents: session.finishedStudents.map((student) => ({ ...student })),
    skippedStudents: session.skippedStudents.map((student) => ({ ...student }))
  };
}

function createSessionId(): string {
  return `recitation-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function normalizeStudentNo(displayNo: string): string | null {
  const trimmed = displayNo.trim();

  if (!/^\d+$/.test(trimmed)) {
    return null;
  }

  const numericValue = Number(trimmed);

  if (!Number.isFinite(numericValue)) {
    return null;
  }

  return String(numericValue);
}

export function createStudent(displayNo: string, joinedAt = new Date().toISOString()): Student | null {
  const trimmed = displayNo.trim();
  const studentNo = normalizeStudentNo(trimmed);

  if (studentNo === null) {
    return null;
  }

  return {
    studentNo,
    displayNo: trimmed,
    joinedAt
  };
}

export function createRecitationSession(
  title: string,
  id = createSessionId(),
  createdAt = new Date().toISOString()
): RecitationSession {
  return {
    id,
    toolType: 'recitation-queue',
    title: title.trim(),
    createdAt,
    currentStudent: null,
    queue: [],
    finishedStudents: [],
    skippedStudents: []
  };
}

export function addStudentToSession(
  session: RecitationSession,
  displayNo: string,
  joinedAt = new Date().toISOString()
): SessionOperationResult {
  const nextStudent = createStudent(displayNo, joinedAt);
  const unchanged = cloneSession(session);

  if (!nextStudent) {
    return {
      ok: false,
      kind: 'warning',
      message: '请输入有效的数字学号',
      session: unchanged
    };
  }

  const isCurrent = session.currentStudent?.studentNo === nextStudent.studentNo;
  const isWaiting = session.queue.some((student) => student.studentNo === nextStudent.studentNo);

  if (isCurrent || isWaiting) {
    return {
      ok: false,
      kind: 'warning',
      message: `${nextStudent.displayNo} 号已经在当前学生或等待队列中`,
      session: unchanged
    };
  }

  return {
    ok: true,
    kind: 'success',
    message: `${nextStudent.displayNo} 号已加入等待队列`,
    session: {
      ...unchanged,
      queue: [...unchanged.queue, nextStudent]
    }
  };
}

export function finishAndNextStudent(session: RecitationSession): SessionOperationResult {
  const unchanged = cloneSession(session);
  const [nextStudent, ...remainingQueue] = unchanged.queue;

  if (!unchanged.currentStudent) {
    if (!nextStudent) {
      return {
        ok: false,
        kind: 'warning',
        message: '等待队列为空，暂无可叫号学生',
        session: unchanged
      };
    }

    return {
      ok: true,
      kind: 'info',
      message: `请 ${nextStudent.displayNo} 号开始背书`,
      session: {
        ...unchanged,
        currentStudent: nextStudent,
        queue: remainingQueue
      }
    };
  }

  const finishedStudent = unchanged.currentStudent;

  return {
    ok: true,
    kind: 'success',
    message: nextStudent
      ? `${finishedStudent.displayNo} 号已完成，请 ${nextStudent.displayNo} 号开始背书`
      : `${finishedStudent.displayNo} 号已完成，等待队列为空`,
    session: {
      ...unchanged,
      currentStudent: nextStudent ?? null,
      queue: remainingQueue,
      finishedStudents: [...unchanged.finishedStudents, finishedStudent]
    }
  };
}

export function skipAndNextStudent(session: RecitationSession): SessionOperationResult {
  const unchanged = cloneSession(session);
  const [nextStudent, ...remainingQueue] = unchanged.queue;

  if (!unchanged.currentStudent) {
    if (!nextStudent) {
      return {
        ok: false,
        kind: 'warning',
        message: '等待队列为空，暂无可跳过或叫号学生',
        session: unchanged
      };
    }

    return {
      ok: true,
      kind: 'info',
      message: `请 ${nextStudent.displayNo} 号开始背书`,
      session: {
        ...unchanged,
        currentStudent: nextStudent,
        queue: remainingQueue
      }
    };
  }

  const skippedStudent = unchanged.currentStudent;

  return {
    ok: true,
    kind: 'warning',
    message: nextStudent
      ? `${skippedStudent.displayNo} 号已跳过，请 ${nextStudent.displayNo} 号开始背书`
      : `${skippedStudent.displayNo} 号已跳过，等待队列为空`,
    session: {
      ...unchanged,
      currentStudent: nextStudent ?? null,
      queue: remainingQueue,
      skippedStudents: [...unchanged.skippedStudents, skippedStudent]
    }
  };
}

export function removeStudentFromQueue(session: RecitationSession, studentNo: string): SessionOperationResult {
  const unchanged = cloneSession(session);
  const normalizedStudentNo = normalizeStudentNo(studentNo) ?? studentNo;
  const removedStudent = unchanged.queue.find((student) => student.studentNo === normalizedStudentNo);

  if (!removedStudent) {
    return {
      ok: false,
      kind: 'warning',
      message: '未在等待队列中找到该学生',
      session: unchanged
    };
  }

  return {
    ok: true,
    kind: 'info',
    message: `${removedStudent.displayNo} 号已从等待队列移除`,
    session: {
      ...unchanged,
      queue: unchanged.queue.filter((student) => student.studentNo !== normalizedStudentNo)
    }
  };
}

export function resetRecitationSession(session: RecitationSession): RecitationSession {
  const unchanged = cloneSession(session);

  return {
    ...unchanged,
    currentStudent: null,
    queue: [],
    finishedStudents: [],
    skippedStudents: []
  };
}
