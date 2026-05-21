import type { SessionOperationResult } from './sessionLogic';

export function getBufferAfterSubmit(buffer: string, result: SessionOperationResult | null): string {
  if (!result) {
    return buffer;
  }

  return buffer.length > 0 ? '' : buffer;
}
