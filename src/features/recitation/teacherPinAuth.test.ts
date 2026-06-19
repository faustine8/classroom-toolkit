import { beforeEach, describe, expect, it } from 'vitest';
import {
  getRememberedTeacherPin,
  normalizeTeacherPin,
  rememberTeacherPinAuthorization
} from './teacherPinAuth';

describe('teacher pin auth helpers', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it('normalizes teacher pins for front-end checks', () => {
    expect(normalizeTeacherPin(' 1357 ')).toBe('1357');
  });

  it('remembers a verified teacher pin for the current browser session only', () => {
    rememberTeacherPinAuthorization(' a7k2 ', ' 1357 ');

    expect(getRememberedTeacherPin('A7K2')).toBe('1357');
    expect(window.localStorage?.length ?? 0).toBe(0);
  });
});
