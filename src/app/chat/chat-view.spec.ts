import { describe, expect, it } from 'vitest';
import { Timestamp } from 'firebase/firestore';
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
});

describe('toViewMessage', () => {
  it('shows a question with the name of its PDF', () => {
    const message = toViewMessage(stored({ sender: 'user', text: 'Import this character', pdfFileName: 'mira.pdf' }), NOW.getTime());
    expect(message).toMatchObject({ sender: 'user', text: 'Import this character', pdfFileName: 'mira.pdf' });
    expect(message.timestamp).toEqual(minutesAgo(1));
  });

  it('shows a finished answer, with its images', () => {
    const images = [{ url: 'https://storage/p.png', mimeType: 'image/png' }];
    expect(toViewMessage(stored({ kind: 'image', text: '', images }), NOW.getTime())).toMatchObject({ sender: 'ai', images });
    expect(toViewMessage(stored(), NOW.getTime()).inProgress).toBeUndefined();
  });

  it('marks an answer that is still being written', () => {
    expect(toViewMessage(stored({ status: 'pending', text: '' }), NOW.getTime())).toMatchObject({ sender: 'ai', inProgress: true });
    expect(toViewMessage(stored({ status: 'streaming', text: 'Kies Hyp' }), NOW.getTime()))
      .toMatchObject({ sender: 'ai', text: 'Kies Hyp', inProgress: true });
  });

  it('turns a failed answer into an error the user can act on', () => {
    expect(toViewMessage(stored({ status: 'error', errorCode: 'internal', text: '' }), NOW.getTime()))
      .toMatchObject({ sender: 'error', text: 'Het antwoord is niet gelukt. Probeer het opnieuw.' });
    expect(toViewMessage(stored({ status: 'error', errorCode: 'resource-exhausted', text: '' }), NOW.getTime()).text)
      .toContain('Te veel verzoeken');
  });

  it('gives up on an answer the backend stopped working on', () => {
    const lost = stored({ status: 'streaming', text: 'Kies', updatedAt: Timestamp.fromDate(minutesAgo(11)) });
    expect(toViewMessage(lost, NOW.getTime())).toMatchObject({ sender: 'error', text: 'Er kwam geen antwoord. Probeer het opnieuw.' });

    const slow = stored({ status: 'streaming', text: 'Kies', updatedAt: Timestamp.fromDate(minutesAgo(9)) });
    expect(toViewMessage(slow, NOW.getTime())).toMatchObject({ sender: 'ai', inProgress: true });
  });

  describe('for a character update', () => {
    const update = (overrides: Partial<StoredChatMessage>) =>
      toViewMessage(stored({ sender: 'system', kind: 'characterUpdate', text: '', ...overrides }), NOW.getTime());

    it('shows a running update that can be cancelled', () => {
      expect(update({ status: 'pending' })).toMatchObject({
        sender: 'system',
        text: 'Karakter wordt aangepast...',
        isUpdatingCharacter: true,
      });
    });

    it('links a finished update to its version', () => {
      const message = update({ status: 'done', versionNumber: 7 });
      expect(message).toMatchObject({ sender: 'system', text: 'Karakter is aangepast!', versionNumber: 7 });
      expect(message.isUpdatingCharacter).toBeUndefined();
    });

    it('shows a cancelled and a failed update', () => {
      expect(update({ status: 'cancelled' })).toMatchObject({ sender: 'system', text: 'Karakter aanpassen geannuleerd.' });
      expect(update({ status: 'error' })).toMatchObject({ sender: 'error', text: 'Karakter aanpassen mislukt.' });
    });

    it('gives a running update half an hour before calling it failed', () => {
      expect(update({ status: 'pending', updatedAt: Timestamp.fromDate(minutesAgo(29)) }).isUpdatingCharacter).toBe(true);
      expect(update({ status: 'pending', updatedAt: Timestamp.fromDate(minutesAgo(31)) }))
        .toMatchObject({ sender: 'error', text: 'Karakter aanpassen mislukt.' });
    });
  });
});

describe('dayLabel', () => {
  it('names today and yesterday, and writes other days out', () => {
    expect(dayLabel(daysAgo(0, 1), NOW)).toBe('Vandaag');
    expect(dayLabel(daysAgo(1, 23), NOW)).toBe('Gisteren');
    expect(dayLabel(daysAgo(2), NOW)).toBe('dinsdag 10 november');
  });

  it('adds the year for another year', () => {
    expect(dayLabel(new Date(2025, 11, 31, 12), NOW)).toBe('woensdag 31 december 2025');
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
    expect(formatTime(new Date(2026, 10, 12, 20, 14))).toBe('20:14');
  });
});

describe('conversationTime', () => {
  it('shows the time for today and a date for earlier days', () => {
    expect(conversationTime(conversation('a', new Date(2026, 10, 12, 20, 14)), NOW)).toBe('20:14');
    expect(conversationTime(conversation('b', daysAgo(3)), NOW)).toBe('ma 9 nov');
    expect(conversationTime(conversation('c', daysAgo(15)), NOW)).toBe('28 okt');
    expect(conversationTime(conversation('d', new Date(2025, 9, 28, 12)), NOW)).toBe('28 okt 2025');
  });
});

describe('groupConversations', () => {
  it('sorts conversations under the headings of the history list', () => {
    const groups = groupConversations(
      [
        conversation('today', daysAgo(0, 9)),
        conversation('yesterday', daysAgo(1)),
        conversation('week-a', daysAgo(2)),
        conversation('week-b', daysAgo(7)),
        conversation('older', daysAgo(8)),
      ],
      NOW
    );

    expect(groups.map(group => [group.label, group.conversations.map(c => c.id)])).toEqual([
      ['Vandaag', ['today']],
      ['Gisteren', ['yesterday']],
      ['Afgelopen 7 dagen', ['week-a', 'week-b']],
      ['Ouder', ['older']],
    ]);
  });

  it('leaves out headings without conversations', () => {
    expect(groupConversations([conversation('older', daysAgo(30))], NOW).map(group => group.label)).toEqual(['Ouder']);
    expect(groupConversations([], NOW)).toEqual([]);
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
