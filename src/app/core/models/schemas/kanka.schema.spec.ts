import { describe, it, expect } from 'vitest';
import {
  KankaEntityTypeSchema,
  KankaEntitySchema,
  KankaSearchResultSchema,
  validateKankaEntity,
  validateKankaSearchResult,
  safeValidateKankaEntity,
  safeValidateKankaSearchResult,
} from './kanka.schema';

describe('KankaEntityTypeSchema', () => {
  it.each(['characters', 'locations', 'quests', 'organisations'] as const)(
    'should accept "%s"',
    (type) => {
      expect(KankaEntityTypeSchema.safeParse(type).success).toBe(true);
    }
  );

  it('should reject invalid type', () => {
    expect(KankaEntityTypeSchema.safeParse('items').success).toBe(false);
  });
});

describe('KankaEntitySchema', () => {
  const validEntity = {
    id: 1,
    name: 'Gandalf',
    type: 'character',
  };

  it('should validate a minimal entity', () => {
    expect(KankaEntitySchema.safeParse(validEntity).success).toBe(true);
  });

  it('should validate an entity with optional fields', () => {
    const result = KankaEntitySchema.safeParse({
      ...validEntity,
      entry: 'A powerful wizard',
      entry_parsed: '<p>A powerful wizard</p>',
      tags: [{ id: 1, name: 'NPC' }],
      image: 'https://example.com/gandalf.png',
      is_private: false,
    });
    expect(result.success).toBe(true);
  });

  it('should reject missing id', () => {
    expect(KankaEntitySchema.safeParse({ name: 'Test', type: 'character' }).success).toBe(false);
  });

  it('should reject missing name', () => {
    expect(KankaEntitySchema.safeParse({ id: 1, type: 'character' }).success).toBe(false);
  });

  it('should reject non-numeric id', () => {
    expect(KankaEntitySchema.safeParse({ id: 'abc', name: 'Test', type: 'character' }).success).toBe(false);
  });
});

describe('KankaSearchResultSchema', () => {
  it('should validate a complete search result', () => {
    const result = KankaSearchResultSchema.safeParse({
      characters: [{ id: 1, name: 'Gandalf', type: 'character' }],
      locations: [{ id: 2, name: 'Shire', type: 'location' }],
      quests: [],
      organisations: [],
    });
    expect(result.success).toBe(true);
  });

  it('should validate empty arrays', () => {
    const result = KankaSearchResultSchema.safeParse({
      characters: [],
      locations: [],
      quests: [],
      organisations: [],
    });
    expect(result.success).toBe(true);
  });

  it('should reject missing entity type arrays', () => {
    const result = KankaSearchResultSchema.safeParse({
      characters: [],
    });
    expect(result.success).toBe(false);
  });
});

describe('validateKankaEntity', () => {
  it('should return parsed entity for valid input', () => {
    const entity = validateKankaEntity({ id: 1, name: 'Test', type: 'character' });
    expect(entity.name).toBe('Test');
  });

  it('should throw for invalid input', () => {
    expect(() => validateKankaEntity({ name: 'Test' })).toThrow();
  });
});

describe('validateKankaSearchResult', () => {
  it('should throw for incomplete result', () => {
    expect(() => validateKankaSearchResult({ characters: [] })).toThrow();
  });
});

describe('safeValidateKankaEntity', () => {
  it('should return undefined for invalid input', () => {
    expect(safeValidateKankaEntity({})).toBeUndefined();
  });

  it('should return entity for valid input', () => {
    const result = safeValidateKankaEntity({ id: 1, name: 'Test', type: 'char' });
    expect(result).toBeDefined();
  });
});

describe('safeValidateKankaSearchResult', () => {
  it('should return undefined for invalid input', () => {
    expect(safeValidateKankaSearchResult({})).toBeUndefined();
  });
});
