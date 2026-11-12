import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { decodeRestFields, fetchPublicDocument, listPublicDocuments } from './firestore-rest';

const NAME = 'projects/questmind-beta/databases/(default)/documents/characters/abc';

describe('decodeRestFields', () => {
  it('turns REST values into plain JSON', () => {
    expect(decodeRestFields({
      name: { stringValue: 'Vesper' },
      level: { integerValue: '5' },
      ratio: { doubleValue: 0.5 },
      inspired: { booleanValue: true },
      concentration: { nullValue: null },
      createdAt: { timestampValue: '2026-11-12T10:00:00Z' },
      hp: { mapValue: { fields: { current: { integerValue: '31' }, temp: { integerValue: '0' } } } },
      conditions: { arrayValue: { values: [{ stringValue: 'Poisoned' }] } },
      empty: { arrayValue: {} },
      nothing: { mapValue: {} },
    })).toEqual({
      name: 'Vesper',
      level: 5,
      ratio: 0.5,
      inspired: true,
      concentration: null,
      createdAt: '2026-11-12T10:00:00Z',
      hp: { current: 31, temp: 0 },
      conditions: ['Poisoned'],
      empty: [],
      nothing: {},
    });
    expect(decodeRestFields(undefined)).toEqual({});
  });
});

describe('public document reads', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('reads one document without credentials', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ name: NAME, fields: { name: { stringValue: 'Vesper' } } }) });

    expect(await fetchPublicDocument('questmind-beta', 'characters/abc')).toEqual({ id: 'abc', data: { name: 'Vesper' } });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://firestore.googleapis.com/v1/projects/questmind-beta/databases/(default)/documents/characters/abc');
    expect(init.headers).toBeUndefined();
  });

  it('returns null for a missing document and throws on other failures', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 404 });
    expect(await fetchPublicDocument('questmind-beta', 'characters/abc')).toBeNull();

    fetchMock.mockResolvedValueOnce({ ok: false, status: 403 });
    await expect(fetchPublicDocument('questmind-beta', 'characters/abc')).rejects.toThrow('HTTP 403');
  });

  it('lists a collection in the requested order', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ documents: [{ name: `${NAME}/images/i1`, fields: {} }] }) });

    expect(await listPublicDocuments('questmind-beta', 'characters/abc/images', { orderBy: 'createdAt desc', pageSize: 10 }))
      .toEqual([{ id: 'i1', data: {} }]);
    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://firestore.googleapis.com/v1/projects/questmind-beta/databases/(default)/documents/characters/abc/images?orderBy=createdAt+desc&pageSize=10'
    );
  });

  it('treats an empty collection as no documents', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
    expect(await listPublicDocuments('questmind-beta', 'characters/abc/images', { orderBy: 'createdAt desc', pageSize: 10 })).toEqual([]);
  });
});
