import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const styles = readFileSync(join(process.cwd(), 'src/assets/styles.css'), 'utf8');

function getDeclaration(selector: string, property: string): string {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = styles.match(new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`));
  const declarations = match?.[1] ?? '';
  const declaration = declarations.match(new RegExp(`${property}\\s*:\\s*([^;]+);`));

  return declaration?.[1].trim() ?? '';
}

describe('shared page layout styles', () => {
  it('uses one content width for the home, student, and teacher pages', () => {
    expect(getDeclaration('.queue-page', 'width')).toBe(getDeclaration('.page', 'width'));
  });
});
