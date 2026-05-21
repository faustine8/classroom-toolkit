import { describe, expect, it } from 'vitest';
import {
  addStudentToSession,
  createRecitationSession,
  finishAndNextStudent,
  normalizeStudentNo,
  removeStudentFromQueue,
  resetRecitationSession,
  skipAndNextStudent
} from './sessionLogic';

describe('recitation session logic', () => {
  it('normalizes display numbers for de-duplication while preserving display text', () => {
    expect(normalizeStudentNo('07')).toBe('7');
    expect(normalizeStudentNo('000')).toBe('0');
    expect(normalizeStudentNo('')).toBeNull();
    expect(normalizeStudentNo('abc')).toBeNull();
  });

  it('adds students only to the waiting queue and blocks duplicates in current plus queue', () => {
    const session = createRecitationSession('三年级一班 古诗背诵', 'session-1', '2026-05-21T00:00:00.000Z');
    const first = addStudentToSession(session, '07', '2026-05-21T00:01:00.000Z');

    expect(first.ok).toBe(true);
    expect(first.session.currentStudent).toBeNull();
    expect(first.session.queue).toHaveLength(1);
    expect(first.session.queue[0]).toMatchObject({ studentNo: '7', displayNo: '07' });

    const duplicate = addStudentToSession(first.session, '7', '2026-05-21T00:02:00.000Z');
    expect(duplicate.ok).toBe(false);
    expect(duplicate.session.queue).toHaveLength(1);
  });

  it('finish calls the first waiting student when nobody is current', () => {
    const session = createRecitationSession('课堂', 'session-1', '2026-05-21T00:00:00.000Z');
    const withQueue = addStudentToSession(session, '23', '2026-05-21T00:01:00.000Z').session;

    const result = finishAndNextStudent(withQueue);

    expect(result.ok).toBe(true);
    expect(result.session.currentStudent?.displayNo).toBe('23');
    expect(result.session.finishedStudents).toHaveLength(0);
    expect(result.session.queue).toHaveLength(0);
  });

  it('finish records the current student and advances to the next waiting student', () => {
    const session = createRecitationSession('课堂', 'session-1', '2026-05-21T00:00:00.000Z');
    const queued = addStudentToSession(session, '12', '2026-05-21T00:01:00.000Z').session;
    const current = finishAndNextStudent(queued).session;
    const withNext = addStudentToSession(current, '13', '2026-05-21T00:02:00.000Z').session;

    const result = finishAndNextStudent(withNext);

    expect(result.session.finishedStudents.map((student) => student.displayNo)).toEqual(['12']);
    expect(result.session.currentStudent?.displayNo).toBe('13');
    expect(result.session.queue).toHaveLength(0);
  });

  it('skip records the current student and allows that student to join again later', () => {
    const session = createRecitationSession('课堂', 'session-1', '2026-05-21T00:00:00.000Z');
    const queued = addStudentToSession(session, '8', '2026-05-21T00:01:00.000Z').session;
    const current = finishAndNextStudent(queued).session;
    const skipped = skipAndNextStudent(current).session;
    const rejoined = addStudentToSession(skipped, '08', '2026-05-21T00:02:00.000Z');

    expect(skipped.skippedStudents.map((student) => student.displayNo)).toEqual(['8']);
    expect(rejoined.ok).toBe(true);
    expect(rejoined.session.queue[0]).toMatchObject({ studentNo: '8', displayNo: '08' });
  });

  it('removes waiting students and resets active classroom data', () => {
    const session = createRecitationSession('课堂', 'session-1', '2026-05-21T00:00:00.000Z');
    const withQueue = addStudentToSession(session, '1', '2026-05-21T00:01:00.000Z').session;
    const removed = removeStudentFromQueue(withQueue, '1');

    expect(removed.ok).toBe(true);
    expect(removed.session.queue).toHaveLength(0);

    const reset = resetRecitationSession(finishAndNextStudent(addStudentToSession(removed.session, '2', '2026-05-21T00:02:00.000Z').session).session);
    expect(reset.currentStudent).toBeNull();
    expect(reset.queue).toEqual([]);
    expect(reset.finishedStudents).toEqual([]);
    expect(reset.skippedStudents).toEqual([]);
  });
});
