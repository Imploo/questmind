import { describe, expect, it } from 'vitest';
import { HttpsError } from 'firebase-functions/v2/https';
import {
  chatErrorCode,
  contextPreamble,
  imagePromptFrom,
  isClientId,
  makeAutoTitle,
  makePreview,
  sanitizeTitle,
  toHistory,
  truncate,
} from './chat-helpers';
import type { DndCharacter } from '../schemas/dnd-character.schema';

const message = (
  sender: 'user' | 'ai' | 'system',
  text: string,
  overrides: Record<string, unknown> = {}
) => ({ sender, kind: 'text' as const, status: 'done' as const, text, ...overrides });

describe('isClientId', () => {
  it('accepts a UUID and rejects anything that could leave its folder', () => {
    expect(isClientId('3f2b8c1e-9d4a-4e6f-8a71-5c0d2e9b7f13')).toBe(true);
    expect(isClientId('short')).toBe(false);
    expect(isClientId('chats/other-chat-id')).toBe(false);
    expect(isClientId('../../etc/passwd')).toBe(false);
    expect(isClientId(undefined)).toBe(false);
  });
});

describe('truncate', () => {
  it('leaves a short line alone and collapses whitespace', () => {
    expect(truncate('  Welke   spells\nheb ik? ', 40)).toBe('Welke spells heb ik?');
  });

  it('cuts a long line at a word boundary', () => {
    const cut = truncate('Ik ben net level 5 geworden en zoek goede spells voor een bard', 30);
    expect(cut).toBe('Ik ben net level 5 geworden…');
    expect(cut.length).toBeLessThanOrEqual(30);
  });
});

describe('makeAutoTitle', () => {
  it('uses the first question', () => {
    expect(makeAutoTitle('Welke spells raad je aan?', 'text')).toBe('Welke spells raad je aan?');
  });

  it('names an image request after the scene', () => {
    expect(makeAutoTitle('maak afbeelding Mira bij een kampvuur', 'image')).toBe('Afbeelding: Mira bij een kampvuur');
  });

  it('names an import after the file', () => {
    expect(makeAutoTitle('Import this character', 'text', 'mira-lvl3.pdf')).toBe('Import: mira-lvl3.pdf');
  });
});

describe('sanitizeTitle', () => {
  it('strips quotes and a closing period', () => {
    expect(sanitizeTitle(' "Spells voor level 5." ')).toBe('Spells voor level 5');
  });

  it('rejects an empty or non-text title', () => {
    expect(sanitizeTitle('  ')).toBeNull();
    expect(sanitizeTitle(undefined)).toBeNull();
    expect(sanitizeTitle(42)).toBeNull();
  });
});

describe('makePreview', () => {
  it('drops markdown markers', () => {
    expect(makePreview('Ik voeg **Hypnotic Pattern** toe.')).toBe('Ik voeg Hypnotic Pattern toe.');
  });
});

describe('imagePromptFrom', () => {
  it('returns what follows the trigger, or the whole text without one', () => {
    expect(imagePromptFrom('Maak  afbeelding  in een herfstbos')).toBe('in een herfstbos');
    expect(imagePromptFrom('maak afbeelding')).toBe('maak afbeelding');
    expect(imagePromptFrom('een portret')).toBe('een portret');
  });
});

describe('toHistory', () => {
  it('keeps finished questions and answers in order', () => {
    expect(toHistory([message('user', 'Vraag 1'), message('ai', 'Antwoord 1'), message('user', 'Vraag 2')])).toEqual([
      { role: 'user', content: 'Vraag 1' },
      { role: 'assistant', content: 'Antwoord 1' },
      { role: 'user', content: 'Vraag 2' },
    ]);
  });

  it('leaves out image turns, character updates and unfinished or failed answers', () => {
    const history = toHistory([
      message('user', 'maak afbeelding in het bos', { kind: 'image' }),
      message('ai', '', { kind: 'image' }),
      message('user', 'Vraag'),
      message('ai', 'half antw', { status: 'streaming' }),
      message('ai', '', { status: 'error' }),
      message('system', '', { kind: 'characterUpdate' }),
    ]);
    expect(history).toEqual([{ role: 'user', content: 'Vraag' }]);
  });

  it('joins turns of the same role that end up next to each other', () => {
    const history = toHistory([message('user', 'Eerste poging'), message('ai', '', { status: 'error' }), message('user', 'Tweede poging')]);
    expect(history).toEqual([{ role: 'user', content: 'Eerste poging\n\nTweede poging' }]);
  });

  it('keeps the most recent turns and starts with the user', () => {
    const turns = Array.from({ length: 6 }, (_, i) => message(i % 2 === 0 ? 'user' : 'ai', `m${i}`));
    expect(toHistory(turns, 3).map(turn => turn.content)).toEqual(['m4', 'm5']);
    expect(toHistory(turns, 4).map(turn => turn.content)).toEqual(['m2', 'm3', 'm4', 'm5']);
  });
});

describe('contextPreamble', () => {
  const character = { name: 'Mira' } as DndCharacter;

  it('starts with the character', () => {
    const preamble = contextPreamble(character);
    expect(preamble).toHaveLength(2);
    expect(preamble[0]).toEqual({ role: 'user', content: 'Huidig karakter:\n{"name":"Mira"}' });
  });

  it('adds the summary of the earlier conversation when there is one', () => {
    const preamble = contextPreamble(character, 'Mira koos Hypnotic Pattern.');
    expect(preamble).toHaveLength(4);
    expect(preamble[2].content).toContain('Mira koos Hypnotic Pattern.');
    expect(preamble[3].role).toBe('assistant');
  });
});

describe('chatErrorCode', () => {
  it('recognises a rate limit', () => {
    expect(chatErrorCode(new HttpsError('resource-exhausted', 'slow down'))).toBe('resource-exhausted');
    expect(chatErrorCode(new Error('got status: 429 Too Many Requests'))).toBe('resource-exhausted');
  });

  it('calls everything else internal', () => {
    expect(chatErrorCode(new Error('boom'))).toBe('internal');
    expect(chatErrorCode('boom')).toBe('internal');
  });
});
