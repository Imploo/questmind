import { describe, it, expect, vi, beforeEach } from 'vitest';

import type { DndCharacter } from './schemas/dnd-character.schema';

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockUpdate = vi.fn().mockResolvedValue(undefined);
const mockSet = vi.fn().mockResolvedValue(undefined);
const mockDocRef = { id: 'new-doc-id' };
// What the transaction reads: the newest version so far, and the version the character is on.
const stored = { newestVersionNumber: null as number | null, activeVersionId: null as string | null };
const newestVersionQuery = { kind: 'newest-version' };
const mockVersionsCollection = vi.fn(() => ({
  orderBy: vi.fn(() => ({ limit: vi.fn(() => newestVersionQuery) })),
  doc: vi.fn(() => mockDocRef),
}));
const characterRef = { update: mockUpdate, collection: mockVersionsCollection };
const mockCollection = vi.fn(() => ({ doc: vi.fn(() => characterRef) }));
const mockTxUpdate = vi.fn();
const transaction = {
  get: vi.fn(async (ref: unknown) => ref === newestVersionQuery
    ? {
      empty: stored.newestVersionNumber === null,
      docs: stored.newestVersionNumber === null ? [] : [{ data: () => ({ versionNumber: stored.newestVersionNumber }) }],
    }
    : { get: (field: string) => (field === 'activeVersionId' ? stored.activeVersionId : undefined) }),
  set: (_ref: unknown, data: unknown) => mockSet(data),
  update: (_ref: unknown, data: unknown) => mockTxUpdate(data),
};

vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => ({
    collection: mockCollection,
    runTransaction: (run: (tx: typeof transaction) => Promise<unknown>) => run(transaction),
  }),
  FieldValue: { serverTimestamp: () => 'SERVER_TIMESTAMP' },
}));

const mockGenerateContent = vi.fn();
vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    models = { generateContent: mockGenerateContent };
  },
}));

vi.mock('./utils/ai-settings', () => ({
  getAiFeatureConfig: vi.fn(() => Promise.resolve({
    model: 'gemini-test',
    maxOutputTokens: 8192,
  })),
}));

const mockSchemaParse = vi.fn((x: unknown) => x);
vi.mock('./schemas/dnd-character.schema', () => ({
  DndCharacterSchema: { parse: mockSchemaParse },
  DndCharacter: {},
}));

vi.mock('./prompts/character-json-generator.prompt', () => ({
  characterJsonGeneratorPrompt: (rulesVersion: string) => `test system prompt ${rulesVersion}`,
}));

vi.mock('./utils/logger', () => ({
  error: vi.fn(),
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
}));

// ── Tests ────────────────────────────────────────────────────────────────────

describe('executeGenerateCharacterDraft', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GOOGLE_AI_API_KEY = 'test-api-key';
    stored.newestVersionNumber = null;
    stored.activeVersionId = null;
  });

  function makePayload(overrides: Record<string, unknown> = {}) {
    return {
      characterId: 'char-1',
      currentCharacter: { name: 'Gandalf', class: 'Wizard' } as DndCharacter,
      chatHistory: [
        { role: 'user' as const, content: 'Make me stronger' },
        { role: 'assistant' as const, content: 'Updating strength' },
      ],
      ai1Response: 'I will increase your strength score.',
      ...overrides,
    };
  }

  it('should refuse a payload with required fields missing, without calling the AI', async () => {
    const { executeGenerateCharacterDraft } = await import('./generate-character-draft');

    await expect(executeGenerateCharacterDraft({
      characterId: '',
      currentCharacter: null as unknown as DndCharacter,
      chatHistory: [],
      ai1Response: '',
    })).rejects.toThrow('missing required payload fields');

    expect(mockGenerateContent).not.toHaveBeenCalled();
  });

  it('should return the version it saved', async () => {
    mockGenerateContent.mockResolvedValueOnce({ text: JSON.stringify({ name: 'Gandalf' }) });

    const { executeGenerateCharacterDraft } = await import('./generate-character-draft');
    const saved = await executeGenerateCharacterDraft(makePayload());

    expect(saved).toEqual({ versionId: 'new-doc-id', versionNumber: 1, previousVersionId: null, abilityScoreWarnings: [] });
    expect(mockSet).toHaveBeenCalledOnce();
  });

  it('should save the next version, make it the active one and remember the one it replaces', async () => {
    // The owner went back to version 8 after version 9 was made: the change starts from 8.
    stored.newestVersionNumber = 9;
    stored.activeVersionId = 'version-8';
    mockGenerateContent.mockResolvedValueOnce({ text: JSON.stringify({ name: 'Gandalf' }) });

    const { executeGenerateCharacterDraft } = await import('./generate-character-draft');
    const saved = await executeGenerateCharacterDraft(makePayload());

    expect(saved).toMatchObject({ versionId: 'new-doc-id', versionNumber: 10, previousVersionId: 'version-8' });
    const version = mockSet.mock.calls[0][0] as Record<string, unknown>;
    expect(version).toMatchObject({ id: 'new-doc-id', versionNumber: 10, source: 'ai' });
    expect(version).not.toHaveProperty('isDraft');
    expect(mockTxUpdate).toHaveBeenCalledWith({ activeVersionId: 'new-doc-id', updatedAt: 'SERVER_TIMESTAMP' });
  });

  it('should store the summary of the generator as the line in the version history', async () => {
    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify({ summary: '  Level 5:\nExtra Attack erbij ', character: { name: 'Gandalf', level: 5 } }),
    });

    const { executeGenerateCharacterDraft } = await import('./generate-character-draft');
    await executeGenerateCharacterDraft(makePayload());

    const version = mockSet.mock.calls[0][0] as { commitMessage: string; character: Record<string, unknown> };
    expect(version.commitMessage).toBe('Level 5: Extra Attack erbij');
    expect(version.character).toMatchObject({ name: 'Gandalf', level: 5 });
    expect(version.character).not.toHaveProperty('summary');
  });

  it('should cut a summary that runs on', async () => {
    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify({ summary: 'spell '.repeat(60), character: { name: 'Gandalf' } }),
    });

    const { executeGenerateCharacterDraft } = await import('./generate-character-draft');
    await executeGenerateCharacterDraft(makePayload());

    const { commitMessage } = mockSet.mock.calls[0][0] as { commitMessage: string };
    expect(commitMessage.length).toBeLessThanOrEqual(160);
    expect(commitMessage.endsWith('…')).toBe(true);
  });

  it.each([
    ['is the bare character', { name: 'Gandalf' }],
    ['has an empty summary', { summary: '  ', character: { name: 'Gandalf' } }],
  ])('should fall back to a general line when the answer %s', async (_case, generated) => {
    mockGenerateContent.mockResolvedValueOnce({ text: JSON.stringify(generated) });

    const { executeGenerateCharacterDraft } = await import('./generate-character-draft');
    await executeGenerateCharacterDraft(makePayload());

    expect(mockSet.mock.calls[0][0]).toMatchObject({ commitMessage: 'Updated via AI chat', character: { name: 'Gandalf' } });
  });

  it.each([
    ['the 2014 rules for a character without the setting', {}, '2014'],
    ['the rules of the current character', { currentCharacter: { name: 'Gandalf', rulesVersion: '2024' } }, '2024'],
    ['the rules it is converted to', { currentCharacter: { name: 'Gandalf', rulesVersion: '2024' }, rulesVersion: '2014' }, '2014'],
  ])('should build the version under %s and mark it with them', async (_case, overrides, expected) => {
    // Whatever the generator says about the rules, the version gets the ones it was built under.
    mockGenerateContent.mockResolvedValueOnce({ text: JSON.stringify({ name: 'Gandalf', rulesVersion: '5e' }) });

    const { executeGenerateCharacterDraft } = await import('./generate-character-draft');
    await executeGenerateCharacterDraft(makePayload(overrides));

    const request = mockGenerateContent.mock.calls[0][0] as { config: { systemInstruction: string } };
    expect(request.config.systemInstruction).toBe(`test system prompt ${expected}`);
    expect(mockSet.mock.calls[0][0].character).toMatchObject({ name: 'Gandalf', rulesVersion: expected });
  });

  it('should drop the generated character when the update was cancelled in the meantime', async () => {
    mockGenerateContent.mockResolvedValueOnce({ text: JSON.stringify({ name: 'Gandalf' }) });
    const shouldSave = vi.fn().mockResolvedValue(false);

    const { executeGenerateCharacterDraft } = await import('./generate-character-draft');
    const saved = await executeGenerateCharacterDraft(makePayload(), { shouldSave });

    expect(saved).toBeNull();
    expect(shouldSave).toHaveBeenCalledOnce();
    expect(mockSet).not.toHaveBeenCalled();
    expect(mockTxUpdate).not.toHaveBeenCalled();
    // The loader on the character is cleared either way.
    expect(mockUpdate).toHaveBeenCalledWith({ isGenerating: false });
  });

  it('should call AI with conversation context and update Firestore', async () => {
    const character = { name: 'Gandalf', class: 'Wizard', strength: 18 };
    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify(character),
    });
    mockSchemaParse.mockReturnValueOnce(character);

    const { executeGenerateCharacterDraft } = await import('./generate-character-draft');
    await executeGenerateCharacterDraft(makePayload());

    // Should have called AI
    expect(mockGenerateContent).toHaveBeenCalledOnce();

    // Should have cleared isGenerating flag
    expect(mockUpdate).toHaveBeenCalledWith({ isGenerating: false });
  });

  it('should throw when AI returns empty response', async () => {
    mockGenerateContent.mockResolvedValueOnce({ text: '' });

    const { executeGenerateCharacterDraft } = await import('./generate-character-draft');

    await expect(executeGenerateCharacterDraft(makePayload())).rejects.toThrow(
      'No response from AI model'
    );
  });

  it('should throw when AI returns invalid JSON', async () => {
    mockGenerateContent.mockResolvedValueOnce({ text: 'not valid json' });

    const { executeGenerateCharacterDraft } = await import('./generate-character-draft');

    await expect(executeGenerateCharacterDraft(makePayload())).rejects.toThrow();
  });

  it('should throw when Zod validation fails', async () => {
    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify({ invalid: 'data' }),
    });
    mockSchemaParse.mockImplementationOnce(() => {
      throw new Error('Zod validation failed');
    });

    const { executeGenerateCharacterDraft } = await import('./generate-character-draft');

    await expect(executeGenerateCharacterDraft(makePayload())).rejects.toThrow(
      'Zod validation failed'
    );
  });
});

describe('executeGenerateCharacterDraft ability score feedback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GOOGLE_AI_API_KEY = 'test-api-key';
    stored.newestVersionNumber = null;
    stored.activeVersionId = null;
  });

  const entry = (base: number, raceBonus = 0) => {
    const score = base + raceBonus;
    return { base, bonuses: raceBonus ? [{ source: 'Race', amount: raceBonus }] : [], score, modifier: Math.floor((score - 10) / 2) };
  };
  // 27 points exactly
  const legal = () => ({
    name: 'Bruenor', class: 'Cleric', abilityScoreMethod: 'pointBuy',
    abilities: {
      strength: entry(14), dexterity: entry(8), constitution: entry(15, 2),
      intelligence: entry(8), wisdom: entry(15, 1), charisma: entry(10),
    },
  });
  // 36 points
  const overBudget = () => ({ ...legal(), abilities: { ...legal().abilities, strength: entry(15), charisma: entry(15) } });

  const reply = (character: unknown) => ({ text: JSON.stringify(character) });
  const payload = (currentCharacter: unknown = { name: 'Bruenor', class: 'Cleric' }) => ({
    characterId: 'char-1',
    currentCharacter: currentCharacter as DndCharacter,
    chatHistory: [{ role: 'user' as const, content: 'Use point buy' }],
    ai1Response: 'Point buy it is.',
  });
  const savedDraft = () => mockSet.mock.calls[0][0] as { character: ReturnType<typeof legal>; abilityScoreWarnings: string[] };

  it('sends the rule violations back to the AI and saves the corrected draft', async () => {
    mockGenerateContent.mockResolvedValueOnce(reply(overBudget())).mockResolvedValueOnce(reply(legal()));

    const { executeGenerateCharacterDraft } = await import('./generate-character-draft');
    await executeGenerateCharacterDraft(payload());

    expect(mockGenerateContent).toHaveBeenCalledTimes(2);
    const retryParts = mockGenerateContent.mock.calls[1][0].contents as { text?: string }[];
    const feedback = retryParts.map(p => p.text ?? '').join('\n');
    expect(feedback).toContain('Previous JSON:');
    expect(feedback).toContain('Point buy costs 36 points, the maximum is 27');

    expect(savedDraft().character.abilities.strength.base).toBe(14);
    expect(savedDraft().abilityScoreWarnings).toEqual([]);
    expect(mockUpdate).toHaveBeenCalledWith({ isGenerating: false });
  });

  it('stops after two corrections and saves the remaining issues as warnings', async () => {
    mockGenerateContent.mockResolvedValue(reply(overBudget()));

    const { executeGenerateCharacterDraft } = await import('./generate-character-draft');
    const saved = await executeGenerateCharacterDraft(payload());

    expect(mockGenerateContent).toHaveBeenCalledTimes(3);
    expect(savedDraft().abilityScoreWarnings).toEqual([expect.stringContaining('36 points')]);
    // They go back to the chat too, which shows them with the update.
    expect(saved?.abilityScoreWarnings).toEqual([expect.stringContaining('36 points')]);
    mockGenerateContent.mockReset();
  });

  it('fixes wrong modifiers itself, without another AI call', async () => {
    const wrongModifier = legal();
    wrongModifier.abilities.strength = { ...wrongModifier.abilities.strength, modifier: 4 };
    mockGenerateContent.mockResolvedValueOnce(reply(wrongModifier));

    const { executeGenerateCharacterDraft } = await import('./generate-character-draft');
    await executeGenerateCharacterDraft(payload());

    expect(mockGenerateContent).toHaveBeenCalledOnce();
    expect(savedDraft().character.abilities.strength.modifier).toBe(2);
  });

  it('recalculates derived values and records the corrections', async () => {
    const draft = {
      ...legal(),
      level: 1,
      savingThrows: {
        strength: { proficient: false, modifier: 0 }, dexterity: { proficient: false, modifier: -1 },
        constitution: { proficient: false, modifier: 3 }, intelligence: { proficient: false, modifier: -1 },
        wisdom: { proficient: true, modifier: 3 }, charisma: { proficient: true, modifier: 2 },
      },
      skills: [{ name: 'Insight', proficient: true, modifier: 3 }],
      initiative: 2,
      passiveWisdom: 13,
    };
    mockGenerateContent.mockResolvedValueOnce(reply(draft));

    const { executeGenerateCharacterDraft } = await import('./generate-character-draft');
    await executeGenerateCharacterDraft(payload());

    const saved = mockSet.mock.calls[0][0] as {
      character: typeof draft;
      derivedStatCorrections: string[];
    };
    expect(saved.character.savingThrows.strength.modifier).toBe(2); // STR 14 -> +2
    expect(saved.character.savingThrows.wisdom.modifier).toBe(5); // WIS 16 -> +3, +2 proficiency
    expect(saved.character.skills[0].modifier).toBe(5);
    expect(saved.character.initiative).toBe(-1);
    expect(saved.character.passiveWisdom).toBe(13);
    expect(saved.derivedStatCorrections).toEqual(expect.arrayContaining(['STR save +0 -> +2', 'Initiative +2 -> -1']));
  });

  it('does not retry when the draft left already-wrong ability scores untouched', async () => {
    mockGenerateContent.mockResolvedValueOnce(reply(overBudget()));

    const { executeGenerateCharacterDraft } = await import('./generate-character-draft');
    await executeGenerateCharacterDraft(payload(overBudget()));

    expect(mockGenerateContent).toHaveBeenCalledOnce();
    expect(savedDraft().abilityScoreWarnings).toHaveLength(1);
  });
});
