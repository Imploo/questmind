import { describe, expect, it } from 'vitest';
import { Timestamp } from 'firebase/firestore';
import { en } from '../core/i18n/en';
import { nl } from '../core/i18n/nl';
import { ChatConversation, StoredChatMessage } from './chat.models';
import {
  conversationTime,
  dayLabel,
  filterConversations,
  formatTime,
  groupConversations,
  isImageRequest,
  isSameDay,
  toViewMessage,
} from './chat-view';

const NOW = new Date(2026, 10, 12, 20, 30); // Thursday 12 November 2026, 20:30
const NL = 'nl-NL';
const EN = 'en-GB';
const minutesAgo = (minutes: number) => new Date(NOW.getTime() - minutes * 60_000);
const daysAgo = (days: number, hour = 12) => new Date(2026, 10, 12 - days, hour, 0);

function stored(overrides: Partial<StoredChatMessage> = {}): StoredChatMessage {
  const at = Timestamp.fromDate(minutesAgo(1));
  return { id: 'm1', sender: 'ai', kind: 'text', status: 'done', text: 'Antwoord', createdAt: at, updatedAt: at, ...overrides };
}

function conversation(id: string, updatedAt: Date, overrides: Partial<ChatConversation> = {}): ChatConversation {
  return {
    id,
    title: `Gesprek ${id}`,
    titleSource: 'ai',
    lastMessagePreview: '',
    createdAt: Timestamp.fromDate(updatedAt),
    updatedAt: Timestamp.fromDate(updatedAt),
    ...overrides,
  };
}

describe('isImageRequest', () => {
  it('recognises "maak afbeelding" anywhere in the message', () => {
    expect(isImageRequest('Maak  afbeelding van Mira')).toBe(true);
    expect(isImageRequest('Kun je een afbeelding maken?')).toBe(false);
  });

  it('recognises the English way of asking for an image', () => {
    expect(isImageRequest('Generate image of Mira at the campfire')).toBe(true);
    expect(isImageRequest('Please create an  image of Mira')).toBe(true);
    expect(isImageRequest('make image with her new armor')).toBe(true);
    expect(isImageRequest('Can you imagine a better build?')).toBe(false);
    expect(isImageRequest('What does Minor Image do?')).toBe(false);
    expect(isImageRequest('Create a level 5 Rogue')).toBe(false);
  });

  it('takes the English words only as the opening of a message', () => {
    expect(isImageRequest("Don't generate an image yet, first add the Shield spell")).toBe(false);
    expect(isImageRequest('Can you make images of her later? First fix my AC')).toBe(false);
    expect(isImageRequest('Please create imagery-rich backstory')).toBe(false);
    expect(isImageRequest('  generate an image of Mira')).toBe(true);
  });

  it('recognises the words the action menu inserts, in both languages', () => {
    expect(isImageRequest(nl.chat.composer.imageTrigger)).toBe(true);
    expect(isImageRequest(en.chat.composer.imageTrigger)).toBe(true);
  });

  it('does not take the import message for an image request', () => {
    expect(isImageRequest(nl.chat.composer.importCharacterMessage)).toBe(false);
    expect(isImageRequest(en.chat.composer.importCharacterMessage)).toBe(false);
  });
});

describe('toViewMessage', () => {
  const view = (message: StoredChatMessage, texts = en.chat) => toViewMessage(message, NOW.getTime(), texts);

  it('shows a question with the name of its PDF', () => {
    const message = view(stored({ sender: 'user', text: 'Import this character', pdfFileName: 'mira.pdf' }));
    expect(message).toMatchObject({ sender: 'user', text: 'Import this character', pdfFileName: 'mira.pdf' });
    expect(message.timestamp).toEqual(minutesAgo(1));
  });

  it('shows a finished answer, with its images', () => {
    const images = [{ url: 'https://storage/p.png', mimeType: 'image/png' }];
    expect(view(stored({ kind: 'image', text: '', images }))).toMatchObject({ sender: 'ai', images });
    expect(view(stored()).inProgress).toBeUndefined();
  });

  it('marks an answer that is still being written', () => {
    expect(view(stored({ status: 'pending', text: '' }))).toMatchObject({ sender: 'ai', inProgress: true });
    expect(view(stored({ status: 'streaming', text: 'Kies Hyp' })))
      .toMatchObject({ sender: 'ai', text: 'Kies Hyp', inProgress: true });
  });

  it('turns a failed answer into an error the user can act on', () => {
    expect(view(stored({ status: 'error', errorCode: 'internal', text: '' })))
      .toMatchObject({ sender: 'error', text: en.chat.reply.failed });
    expect(view(stored({ status: 'error', errorCode: 'resource-exhausted', text: '' })).text)
      .toBe(en.chat.reply.tooManyRequests);
    // A failure stored without a code, or with one that is not known yet.
    expect(view(stored({ status: 'error', text: '' })).text).toBe(en.chat.reply.failed);
    expect(view(stored({ status: 'error', errorCode: 'something-new', text: '' })).text).toBe(en.chat.reply.failed);
  });

  it('words a failed answer in the language it is given', () => {
    expect(view(stored({ status: 'error', errorCode: 'internal', text: '' }), nl.chat).text)
      .toBe('Het antwoord is niet gelukt. Probeer het opnieuw.');
    expect(view(stored({ status: 'error', errorCode: 'resource-exhausted', text: '' }), nl.chat).text)
      .toContain('Te veel verzoeken');
    expect(view(stored({ status: 'error', errorCode: 'internal', text: '' }), en.chat).text)
      .not.toBe(nl.chat.reply.failed);
  });

  it('leaves what the user and The Sidekick wrote as it was stored', () => {
    const question = stored({ sender: 'user', text: 'Welke spells passen bij mij?' });
    const answer = stored({ text: 'Kies Hypnotic Pattern.' });

    expect(view(question, en.chat).text).toBe('Welke spells passen bij mij?');
    expect(view(answer, en.chat).text).toBe('Kies Hypnotic Pattern.');
    expect(view(answer, nl.chat).text).toBe('Kies Hypnotic Pattern.');
  });

  it('gives up on an answer the backend stopped working on', () => {
    const lost = stored({ status: 'streaming', text: 'Kies', updatedAt: Timestamp.fromDate(minutesAgo(11)) });
    expect(view(lost)).toMatchObject({ sender: 'error', text: en.chat.reply.stale });
    expect(view(lost, nl.chat)).toMatchObject({ sender: 'error', text: 'Er kwam geen antwoord. Probeer het opnieuw.' });

    const slow = stored({ status: 'streaming', text: 'Kies', updatedAt: Timestamp.fromDate(minutesAgo(9)) });
    expect(view(slow)).toMatchObject({ sender: 'ai', inProgress: true });
  });

  describe('for a character update', () => {
    const update = (overrides: Partial<StoredChatMessage>, texts = en.chat) =>
      view(stored({ sender: 'system', kind: 'characterUpdate', text: '', ...overrides }), texts);

    it('shows a running update that can be cancelled', () => {
      expect(update({ status: 'pending' })).toMatchObject({
        sender: 'system',
        text: en.chat.characterUpdate.running,
        isUpdatingCharacter: true,
      });
      expect(update({ status: 'streaming' }).text).toBe(en.chat.characterUpdate.running);
    });

    it('links a finished update to its version', () => {
      const message = update({ status: 'done', versionNumber: 7 });
      expect(message).toMatchObject({ sender: 'system', text: en.chat.characterUpdate.done, versionNumber: 7 });
      expect(message.isUpdatingCharacter).toBeUndefined();
    });

    it('carries what a finished update needs for its undo, and its warnings', () => {
      const message = update({
        status: 'done',
        versionNumber: 9,
        versionId: 'v9',
        previousVersionId: 'v8',
        abilityScoreWarnings: ['Point buy costs 36 points, the maximum is 27'],
      });
      expect(message).toMatchObject({
        versionId: 'v9',
        previousVersionId: 'v8',
        abilityScoreWarnings: ['Point buy costs 36 points, the maximum is 27'],
      });
    });

    it('offers no undo for an update that was not saved', () => {
      const message = update({ status: 'cancelled', versionId: 'v9', previousVersionId: 'v8' });
      expect(message.previousVersionId).toBeUndefined();
    });

    it('shows a cancelled and a failed update', () => {
      expect(update({ status: 'cancelled' })).toMatchObject({ sender: 'system', text: en.chat.characterUpdate.cancelled });
      expect(update({ status: 'error' })).toMatchObject({ sender: 'error', text: en.chat.characterUpdate.failed });
    });

    it('words every state of an update in Dutch too', () => {
      expect(update({ status: 'pending' }, nl.chat).text).toBe('Karakter wordt aangepast...');
      expect(update({ status: 'done', versionNumber: 7 }, nl.chat).text).toBe('Karakter is aangepast!');
      expect(update({ status: 'cancelled' }, nl.chat).text).toBe('Karakter aanpassen geannuleerd.');
      expect(update({ status: 'error' }, nl.chat).text).toBe('Karakter aanpassen mislukt.');
    });

    it('shows the warnings as they were stored, whatever the language', () => {
      const warnings = ['Point buy kost 36 punten, het maximum is 27'];
      expect(update({ status: 'done', versionId: 'v9', abilityScoreWarnings: warnings }, en.chat).abilityScoreWarnings)
        .toEqual(warnings);
    });

    it('gives a running update half an hour before calling it failed', () => {
      expect(update({ status: 'pending', updatedAt: Timestamp.fromDate(minutesAgo(29)) }).isUpdatingCharacter).toBe(true);
      expect(update({ status: 'pending', updatedAt: Timestamp.fromDate(minutesAgo(31)) }))
        .toMatchObject({ sender: 'error', text: en.chat.characterUpdate.failed });
    });
  });
});

describe('dayLabel', () => {
  it('names today and yesterday, and writes other days out', () => {
    expect(dayLabel(daysAgo(0, 1), NOW, nl.chat, NL)).toBe('Vandaag');
    expect(dayLabel(daysAgo(1, 23), NOW, nl.chat, NL)).toBe('Gisteren');
    expect(dayLabel(daysAgo(2), NOW, nl.chat, NL)).toBe('dinsdag 10 november');
  });

  it('adds the year for another year', () => {
    expect(dayLabel(new Date(2025, 11, 31, 12), NOW, nl.chat, NL)).toBe('woensdag 31 december 2025');
  });

  it('follows the language and the notation it is given', () => {
    expect(dayLabel(daysAgo(0, 1), NOW, en.chat, EN)).toBe('Today');
    expect(dayLabel(daysAgo(1, 23), NOW, en.chat, EN)).toBe('Yesterday');
    expect(dayLabel(daysAgo(2), NOW, en.chat, EN)).toBe('Tuesday 10 November');
    expect(dayLabel(new Date(2025, 11, 31, 12), NOW, en.chat, EN)).toContain('31 December 2025');
  });
});

describe('isSameDay', () => {
  it('compares calendar days, not 24 hours', () => {
    expect(isSameDay(new Date(2026, 10, 12, 0, 5), new Date(2026, 10, 12, 23, 55))).toBe(true);
    expect(isSameDay(new Date(2026, 10, 11, 23, 55), new Date(2026, 10, 12, 0, 5))).toBe(false);
  });
});

describe('formatTime', () => {
  it('uses the 24-hour clock', () => {
    expect(formatTime(new Date(2026, 10, 12, 20, 14), NL)).toBe('20:14');
    expect(formatTime(new Date(2026, 10, 12, 20, 14), EN)).toBe('20:14');
  });
});

describe('conversationTime', () => {
  it('shows the time for today and a date for earlier days', () => {
    expect(conversationTime(conversation('a', new Date(2026, 10, 12, 20, 14)), NOW, NL)).toBe('20:14');
    expect(conversationTime(conversation('b', daysAgo(3)), NOW, NL)).toBe('ma 9 nov');
    expect(conversationTime(conversation('c', daysAgo(15)), NOW, NL)).toBe('28 okt');
    expect(conversationTime(conversation('d', new Date(2025, 9, 28, 12)), NOW, NL)).toBe('28 okt 2025');
  });

  it('writes the date in the notation it is given', () => {
    expect(conversationTime(conversation('a', new Date(2026, 10, 12, 20, 14)), NOW, EN)).toBe('20:14');
    expect(conversationTime(conversation('b', daysAgo(3)), NOW, EN)).toBe('Mon 9 Nov');
    expect(conversationTime(conversation('c', daysAgo(15)), NOW, EN)).toBe('28 Oct');
    expect(conversationTime(conversation('d', new Date(2025, 9, 28, 12)), NOW, EN)).toBe('28 Oct 2025');
  });
});

describe('groupConversations', () => {
  const spread = [
    conversation('today', daysAgo(0, 9)),
    conversation('yesterday', daysAgo(1)),
    conversation('week-a', daysAgo(2)),
    conversation('week-b', daysAgo(7)),
    conversation('older', daysAgo(8)),
  ];

  it('sorts conversations under the headings of the history list', () => {
    const groups = groupConversations(spread, NOW, nl.chat);

    expect(groups.map(group => [group.label, group.conversations.map(c => c.id)])).toEqual([
      ['Vandaag', ['today']],
      ['Gisteren', ['yesterday']],
      ['Afgelopen 7 dagen', ['week-a', 'week-b']],
      ['Ouder', ['older']],
    ]);
  });

  it('names the headings in the language it is given', () => {
    expect(groupConversations(spread, NOW, en.chat).map(group => group.label)).toEqual([
      en.chat.today,
      en.chat.yesterday,
      en.chat.history.lastSevenDays,
      en.chat.history.older,
    ]);
  });

  it('leaves out headings without conversations', () => {
    expect(groupConversations([conversation('older', daysAgo(30))], NOW, nl.chat).map(group => group.label)).toEqual(['Ouder']);
    expect(groupConversations([], NOW, en.chat)).toEqual([]);
  });
});

describe('filterConversations', () => {
  const conversations = [
    conversation('a', NOW, { title: 'Spells voor level 5', lastMessagePreview: 'Ik voeg Hypnotic Pattern toe.' }),
    conversation('b', NOW, { title: 'Multiclass naar Warlock?', lastMessagePreview: 'Wacht tot na level 6.' }),
  ];

  it('searches titles and last messages, ignoring case', () => {
    expect(filterConversations(conversations, 'warlock').map(c => c.id)).toEqual(['b']);
    expect(filterConversations(conversations, 'HYPNOTIC').map(c => c.id)).toEqual(['a']);
    expect(filterConversations(conversations, 'level').map(c => c.id)).toEqual(['a', 'b']);
  });

  it('returns everything for an empty search', () => {
    expect(filterConversations(conversations, '  ')).toBe(conversations);
  });
});
