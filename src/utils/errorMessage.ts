function getNestedMessage(error: unknown): string | null {
  if (!error || typeof error !== 'object') {
    return null;
  }

  if ('message' in error && typeof error.message === 'string' && error.message.trim()) {
    return error.message;
  }

  if ('error' in error) {
    return getNestedMessage(error.error);
  }

  return null;
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return getNestedMessage(error) ?? '操作失败，请稍后重试';
}
