import { describe, expect, it } from 'vitest';
import { buildCompletionMatrix, getCompletedStudentNumbers } from './completionMatrix';

describe('completion matrix', () => {
  it('normalizes completed student numbers from strings and numbers', () => {
    const completedNumbers = getCompletedStudentNumbers([
      { studentNo: '1' },
      { studentNo: 2 },
      { studentNo: ' 03 ' },
      { studentNo: 'abc' },
      { studentNo: null },
      { studentNo: '51' }
    ]);

    expect(completedNumbers).toEqual(new Set([1, 2, 3]));
  });

  it('builds a fixed 5 by 10 matrix for student numbers 1 through 50', () => {
    const matrix = buildCompletionMatrix(new Set([1, 10, 11, 50]));

    expect(matrix).toHaveLength(5);
    expect(matrix.every((row) => row.length === 10)).toBe(true);
    expect(matrix[0].map((student) => student.studentNo)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(matrix[1].map((student) => student.studentNo)).toEqual([11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
    expect(matrix[4].map((student) => student.studentNo)).toEqual([41, 42, 43, 44, 45, 46, 47, 48, 49, 50]);
  });

  it('marks only completed student numbers as completed', () => {
    const matrix = buildCompletionMatrix(new Set([7, 23]));
    const allStudents = matrix.flat();

    expect(allStudents.find((student) => student.studentNo === 7)?.isCompleted).toBe(true);
    expect(allStudents.find((student) => student.studentNo === 23)?.isCompleted).toBe(true);
    expect(allStudents.find((student) => student.studentNo === 8)?.isCompleted).toBe(false);
  });
});
