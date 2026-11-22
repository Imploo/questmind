import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../utils/logger', () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }));
vi.mock('firebase-admin/firestore', () => ({ getFirestore: vi.fn() }));

import { buildCampaignStoryKanka, loadCampaignStoryKanka, resolveMentions } from './campaign-story-kanka';
import { KankaJournal } from '../services/kanka.service';

const noEntities = { characters: [], locations: [], quests: [], organisations: [] };

const journal = (overrides: Partial<KankaJournal>): KankaJournal => ({
  id: 1,
  name: 'Sessie 1',
  entry: '<p>Wij kwamen aan.</p>',
  ...overrides,
});

describe('buildCampaignStoryKanka', () => {
  it('turns a journal into plain text with its date, type and writer', () => {
    const { journals } = buildCampaignStoryKanka(
      { ...noEntities, characters: [{ name: 'Mira', entity_id: 11 }] },
      [journal({
        id: 3,
        name: ' Sessie 2 - De afdaling ',
        entry: '<p>Ik zag [character:11] vallen.</p>',
        date: '2017-11-02',
        type: 'Session',
        author_id: 11,
        created_at: '2019-01-30T00:01:44.000000Z',
        updated_at: '2019-08-29T13:48:54.000000Z',
      })]
    );

    expect(journals).toEqual([{
      journalId: 3,
      title: 'Sessie 2 - De afdaling',
      date: '2017-11-02',
      createdAt: '2019-01-30',
      updatedAt: '2019-08-29T13:48:54.000000Z',
      type: 'Session',
      author: 'Mira',
      content: 'Ik zag Mira vallen.',
    }]);
  });

  it('prefers entry_parsed, where Kanka wrote the mentions out', () => {
    const { journals } = buildCampaignStoryKanka(noEntities, [
      journal({ entry: '<p>[character:11] viel.</p>', entry_parsed: '<p><a href="#">Mira</a> viel.</p>' }),
    ]);
    expect(journals[0].content).toBe('Mira viel.');
  });

  it('appends the posts everyone can read, in their order, and leaves out the DM-only ones', () => {
    const { journals } = buildCampaignStoryKanka(noEntities, [
      journal({
        entry: '<p>Begin.</p>',
        posts: [
          { name: 'Deel 2', entry: '<p>Het slot.</p>', visibility_id: 1, position: 2 },
          { name: 'Geheim', entry: '<p>De verrader is Tom.</p>', visibility_id: 3, position: 1 },
          { name: 'Deel 1', entry: '<p>De reis.</p>', visibility_id: 5, position: 1 },
          { name: 'Eigen notitie', entry: '<p>Alleen voor mij.</p>', visibility_id: 2 },
        ],
      }),
    ]);

    expect(journals[0].content).toBe('Begin.\n\nDeel 1\nDe reis.\n\nDeel 2\nHet slot.');
  });

  it('uses a journal whose text is only in its posts', () => {
    const { journals } = buildCampaignStoryKanka(noEntities, [
      journal({ entry: '', posts: [{ entry: '<p>Alles staat hier.</p>' }] }),
    ]);
    expect(journals[0].content).toBe('Alles staat hier.');
  });

  it('leaves out private and empty journals', () => {
    const { journals } = buildCampaignStoryKanka(noEntities, [
      journal({ id: 1, is_private: true, entry: '<p>DM-notities</p>' }),
      journal({ id: 2, entry: '<p><br></p>' }),
      journal({ id: 3, entry: '<p>Echt verslag</p>' }),
    ]);
    expect(journals.map(j => j.journalId)).toEqual([3]);
  });

  it('has no date for a journal without a valid one, and no writer when the character is unknown', () => {
    const { journals } = buildCampaignStoryKanka(noEntities, [
      journal({ date: 'onbekend', author_id: 99, created_at: undefined }),
    ]);
    expect(journals[0]).toMatchObject({ date: null, createdAt: null, updatedAt: null, author: null, type: null });
  });

  it('cuts off a very long journal', () => {
    const { journals } = buildCampaignStoryKanka(noEntities, [journal({ entry: `<p>${'a'.repeat(50_000)}</p>` })]);
    expect(journals[0].content).toHaveLength(40_000 + '\n[ingekort]'.length);
    expect(journals[0].content.endsWith('\n[ingekort]')).toBe(true);
  });

  it('stops adding journals once all of them together are too long', () => {
    const long = `<p>${'a'.repeat(39_000)}</p>`;
    const { journals } = buildCampaignStoryKanka(
      noEntities,
      Array.from({ length: 10 }, (_, index) => journal({ id: index + 1, entry: long }))
    );
    expect(journals).toHaveLength(7);
  });

  it('lists the public entities as reference, with type and a short description', () => {
    const { reference } = buildCampaignStoryKanka(
      {
        characters: [
          { name: 'Strahd', type: 'NPC', entry: `<p>Heer van [location:7].</p><p>${'Hij wacht. '.repeat(60)}</p>`, entity_id: 1 },
          { name: 'Geheime verrader', is_private: true, entry: '<p>Werkt voor Strahd.</p>' },
        ],
        locations: [{ name: 'Barovia', entity_id: 7 }],
        quests: undefined,
        organisations: [],
      },
      []
    );

    expect(reference.characters).toHaveLength(1);
    expect(reference.characters[0].name).toBe('Strahd');
    expect(reference.characters[0].type).toBe('NPC');
    expect(reference.characters[0].description).toMatch(/^Heer van Barovia\. Hij wacht\./);
    expect(reference.characters[0].description?.endsWith('…')).toBe(true);
    expect(reference.characters[0].description?.length).toBeLessThanOrEqual(241);
    expect(reference.locations).toEqual([{ name: 'Barovia' }]);
    expect(reference.quests).toEqual([]);
  });

  it('does not name a private character through a mention', () => {
    const { journals } = buildCampaignStoryKanka(
      { ...noEntities, characters: [{ name: 'Geheime verrader', entity_id: 5, is_private: true }] },
      [journal({ entry: '<p>Wij zagen [character:5] niet.</p>' })]
    );
    expect(journals[0].content).toBe('Wij zagen niet.');
  });
});

describe('resolveMentions', () => {
  const names = new Map([[42, 'Strahd']]);

  it('writes out a mention by its label, else by the name of the entity', () => {
    expect(resolveMentions('[character:42] en [character:42|de graaf] en [location:9]!', names))
      .toBe('Strahd en de graaf en !');
  });

  it('skips the options of a mention that are not its label', () => {
    expect(resolveMentions('[character:42|page:story] [character:42|anchor:x|de heer]', names))
      .toBe('Strahd de heer');
  });

  it('leaves other text in square brackets alone', () => {
    expect(resolveMentions('[OOC: pauze] [1] [a:b]', names)).toBe('[OOC: pauze] [1] [a:b]');
  });
});

describe('loadCampaignStoryKanka', () => {
  let mockFetch: ReturnType<typeof vi.fn>;
  const linked = { settings: { kankaEnabled: true, kankaCampaignId: '123' } };

  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);
    vi.stubEnv('KANKA_API_TOKEN', 'token');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('does nothing when Kanka is off or not linked', async () => {
    expect(await loadCampaignStoryKanka('c1', {})).toBeUndefined();
    expect(await loadCampaignStoryKanka('c1', { settings: { kankaEnabled: false, kankaCampaignId: '123' } })).toBeUndefined();
    expect(await loadCampaignStoryKanka('c1', { settings: { kankaEnabled: true } })).toBeUndefined();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('throws when Kanka is linked but no token is configured', async () => {
    vi.stubEnv('KANKA_API_TOKEN', '');
    await expect(loadCampaignStoryKanka('c1', linked)).rejects.toThrow('KANKA_API_TOKEN');
  });

  it('reads the entities and the journals with their posts', async () => {
    mockFetch.mockImplementation((url: string) => Promise.resolve({
      ok: true,
      json: () => Promise.resolve({
        data: url.includes('/journals')
          ? [{ id: 1, name: 'Sessie 1', entry: '<p>Wij kwamen aan.</p>' }]
          : [{ id: 2, name: 'Barovia' }],
      }),
    }));

    const result = await loadCampaignStoryKanka('c1', linked);

    expect(mockFetch).toHaveBeenCalledWith('https://api.kanka.io/1.0/campaigns/123/journals?related=1', expect.anything());
    expect(result?.journals.map(j => j.content)).toEqual(['Wij kwamen aan.']);
    expect(result?.reference.locations).toEqual([{ name: 'Barovia' }]);
  });

  it('throws when the journals cannot be read, even though the entities can', async () => {
    mockFetch.mockImplementation((url: string) => Promise.resolve(
      url.includes('/journals')
        ? { ok: false, status: 500, statusText: 'Server Error', text: () => Promise.resolve('boom') }
        : { ok: true, json: () => Promise.resolve({ data: [] }) }
    ));

    await expect(loadCampaignStoryKanka('c1', linked)).rejects.toThrow('Kanka API error: 500');
  });
});
