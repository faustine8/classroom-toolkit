const TEACHER_PIN_STORAGE_PREFIX = 'classroom-toolkit:teacher-pin:';

function canUseSessionStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.sessionStorage !== 'undefined';
}

function normalizeTeacherSessionCode(value: string): string {
  return value.trim().toUpperCase();
}

function getStorageKey(sessionCode: string): string {
  return `${TEACHER_PIN_STORAGE_PREFIX}${normalizeTeacherSessionCode(sessionCode)}`;
}

export function normalizeTeacherPin(value: string): string {
  return value.trim();
}

export function rememberTeacherPinAuthorization(sessionCode: string, teacherPin: string): void {
  if (!canUseSessionStorage()) {
    return;
  }

  window.sessionStorage.setItem(getStorageKey(sessionCode), normalizeTeacherPin(teacherPin));
}

export function getRememberedTeacherPin(sessionCode: string): string | null {
  if (!canUseSessionStorage()) {
    return null;
  }

  return window.sessionStorage.getItem(getStorageKey(sessionCode));
}
