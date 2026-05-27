export const CLASS_STUDENT_TOTAL = 50;
export const COMPLETION_MATRIX_COLUMNS = 10;

export interface CompletionMatrixStudent {
  studentNo: number;
  label: string;
  isCompleted: boolean;
}

interface StudentNoSource {
  studentNo?: unknown;
}

function normalizeStudentNo(value: unknown): number | null {
  const numberValue = typeof value === 'number' ? value : Number(String(value ?? '').trim());

  if (!Number.isInteger(numberValue) || numberValue < 1 || numberValue > CLASS_STUDENT_TOTAL) {
    return null;
  }

  return numberValue;
}

export function getCompletedStudentNumbers(items: StudentNoSource[]): Set<number> {
  const completedNumbers = new Set<number>();

  for (const item of items) {
    const studentNo = normalizeStudentNo(item.studentNo);

    if (studentNo !== null) {
      completedNumbers.add(studentNo);
    }
  }

  return completedNumbers;
}

export function buildCompletionMatrix(completedNumbers: Set<number>): CompletionMatrixStudent[][] {
  const students = Array.from({ length: CLASS_STUDENT_TOTAL }, (_, index) => {
    const studentNo = index + 1;

    return {
      studentNo,
      label: `${studentNo}号`,
      isCompleted: completedNumbers.has(studentNo)
    };
  });

  return Array.from({ length: CLASS_STUDENT_TOTAL / COMPLETION_MATRIX_COLUMNS }, (_, rowIndex) =>
    students.slice(rowIndex * COMPLETION_MATRIX_COLUMNS, (rowIndex + 1) * COMPLETION_MATRIX_COLUMNS)
  );
}
