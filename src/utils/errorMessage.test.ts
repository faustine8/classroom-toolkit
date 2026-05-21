import { describe, expect, it } from 'vitest';
import { getErrorMessage } from './errorMessage';

describe('getErrorMessage', () => {
  it('uses standard Error messages', () => {
    expect(getErrorMessage(new Error('CloudBase 匿名登录失败'))).toBe('CloudBase 匿名登录失败');
  });

  it('uses message fields from SDK error objects', () => {
    expect(getErrorMessage({ message: 'Failed to fetch' })).toBe('Failed to fetch');
    expect(getErrorMessage({ error: { message: '登录方式未开启' } })).toBe('登录方式未开启');
  });

  it('falls back for unknown thrown values', () => {
    expect(getErrorMessage(null)).toBe('操作失败，请稍后重试');
  });
});
