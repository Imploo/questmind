import { describe, it, expect } from 'vitest';
import { en } from './en';
import { nl } from './nl';

type Node = string | ((...args: unknown[]) => string) | { [key: string]: Node };

/** Every text under a node, as `[path, value]`. */
function texts(node: Node, path = ''): [string, string | ((...args: unknown[]) => string)][] {
  if (typeof node === 'string' || typeof node === 'function') return [[path, node]];
  return Object.entries(node).flatMap(([key, child]) => texts(child, path ? `${path}.${key}` : key));
}

describe.each([
  ['nl', nl],
  ['en', en],
])('the %s translations', (_language, translations) => {
  const all = texts(translations as unknown as Node);

  it('have no empty texts', () => {
    const empty = all.filter(([, value]) => typeof value === 'string' && value.trim() === '').map(([path]) => path);
    expect(empty).toEqual([]);
  });

  it('give a text for 0, 1 and 2 wherever a text takes values', () => {
    const broken: string[] = [];
    for (const [path, value] of all) {
      if (typeof value !== 'function') continue;
      for (const count of [0, 1, 2]) {
        // Called with the same value in every position: enough to prove no branch returns nothing.
        const args = Array.from({ length: Math.max(value.length, 1) }, () => count);
        const result = value(...args);
        if (typeof result !== 'string' || result.trim() === '') broken.push(`${path}(${count})`);
      }
    }
    expect(broken).toEqual([]);
  });
});

describe('the two languages', () => {
  it('have the same keys', () => {
    const keys = (node: Node) => texts(node).map(([path]) => path).sort();
    expect(keys(nl as unknown as Node)).toEqual(keys(en as unknown as Node));
  });
});
