import { describe, expect, it } from 'vitest';
import { getBufferAfterSubmit } from './inputBuffer';
import { DUPLICATE_STUDENT_NO_MESSAGE, type SessionOperationResult } from './sessionLogic';

const failedDuplicateResult: SessionOperationResult = {
  ok: false,
  kind: 'warning',
  message: DUPLICATE_STUDENT_NO_MESSAGE,
  session: {
    id: 'session-1',
    toolType: 'recitation-queue',
    title: '课堂',
    createdAt: '2026-05-21T00:00:00.000Z',
    currentStudent: null,
    queue: [],
    finishedStudents: [],
    skippedStudents: []
  }
};

describe('input buffer submission behavior', () => {
  it('clears a non-empty buffer after a handled duplicate submission', () => {
    expect(getBufferAfterSubmit('7', failedDuplicateResult)).toBe('');
  });

  it('keeps the buffer when no session operation handled the submit', () => {
    expect(getBufferAfterSubmit('7', null)).toBe('7');
  });
});
