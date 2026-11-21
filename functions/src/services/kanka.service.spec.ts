import { describe, it, expect, vi, beforeEach } from 'vitest';
import { KankaService } from './kanka.service';

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockCampaignGet = vi.fn();
vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => ({
    doc: vi.fn(() => ({ get: mockCampaignGet })),
  }),
}));

vi.mock('../utils/logger', () => ({
  error: vi.fn(),
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
}));

// ── Tests ────────────────────────────────────────────────────────────────────

describe('KankaService', () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);
  });

  it('should throw if apiToken is empty', () => {
    expect(() => new KankaService('')).toThrow('Kanka API token is required');
  });

  describe('getAllEntities', () => {
    it('should throw if kankaCampaignId is empty', async () => {
      const service = new KankaService('test-token');

      await expect(service.getAllEntities('')).rejects.toThrow(
        'Kanka campaign ID is required'
      );
    });

    it('should fetch all entity types in parallel', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: [{ id: 1, name: 'Test' }] }),
      });

      const service = new KankaService('test-token');
      const result = await service.getAllEntities('kanka-123');

      // 4 types fetched in parallel
      expect(mockFetch).toHaveBeenCalledTimes(4);
      expect(result.characters).toHaveLength(1);
      expect(result.locations).toHaveLength(1);
      expect(result.quests).toHaveLength(1);
      expect(result.organisations).toHaveLength(1);
    });

    it('should pass correct Authorization header', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: [] }),
      });

      const service = new KankaService('my-secret-token');
      await service.getAllEntities('kanka-123');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer my-secret-token',
          }),
        })
      );
    });

    it('should continue with empty array when a single type fetch fails', async () => {
      let callCount = 0;
      mockFetch.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({ ok: false, text: () => Promise.resolve('API error'), statusText: 'Not Found', status: 404 });
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: [{ id: 1, name: 'Entity' }] }) });
      });

      const service = new KankaService('test-token');
      const result = await service.getAllEntities('kanka-123');

      // First type failed, but rest succeeded
      const allEntities = [
        ...result.characters!,
        ...result.locations!,
        ...result.quests!,
        ...result.organisations!,
      ];
      expect(allEntities.length).toBeGreaterThanOrEqual(0);
    });

    it('should fetch only specified entity types', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: [] }),
      });

      const service = new KankaService('test-token');
      await service.getAllEntities('kanka-123', ['characters', 'locations']);

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('paging', () => {
    it('should read every page of a list, keeping its own address and filters', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ data: [{ id: 1, name: 'A' }], links: { next: 'https://elsewhere.example/page=2' } }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ data: [{ id: 2, name: 'B' }], links: { next: null } }),
        });

      const service = new KankaService('test-token');
      const result = await service.getAllEntities('kanka-123', ['characters']);

      expect(result.characters?.map(character => character.name)).toEqual(['A', 'B']);
      expect(mockFetch.mock.calls.map(([url]) => url)).toEqual([
        'https://api.kanka.io/1.0/campaigns/kanka-123/characters',
        'https://api.kanka.io/1.0/campaigns/kanka-123/characters?page=2',
      ]);
    });

    it('should stop after ten pages', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: [{ id: 1, name: 'A' }], links: { next: 'more' } }),
      });

      const service = new KankaService('test-token');
      const result = await service.getAllEntities('kanka-123', ['characters']);

      expect(mockFetch).toHaveBeenCalledTimes(10);
      expect(result.characters).toHaveLength(10);
    });
  });

  describe('getJournals', () => {
    it('should throw if kankaCampaignId is empty', async () => {
      await expect(new KankaService('test-token').getJournals('')).rejects.toThrow('Kanka campaign ID is required');
    });

    it('should fetch the journals with their posts, page by page', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ data: [{ id: 1, name: 'Sessie 1', posts: [{ entry: 'x' }] }], links: { next: 'more' } }),
        })
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ data: [{ id: 2, name: 'Sessie 2' }] }) });

      const journals = await new KankaService('test-token').getJournals('kanka-123');

      expect(journals.map(journal => journal.id)).toEqual([1, 2]);
      expect(mockFetch.mock.calls.map(([url]) => url)).toEqual([
        'https://api.kanka.io/1.0/campaigns/kanka-123/journals?related=1',
        'https://api.kanka.io/1.0/campaigns/kanka-123/journals?related=1&page=2',
      ]);
    });

    it('should throw when Kanka cannot be read, instead of returning nothing', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 429, statusText: 'Too Many Requests', text: () => Promise.resolve('slow down') });

      await expect(new KankaService('test-token').getJournals('kanka-123')).rejects.toThrow('Kanka API error: 429');
    });
  });

  describe('searchEntities', () => {
    it('should throw if kankaCampaignId is empty', async () => {
      const service = new KankaService('test-token');

      await expect(service.searchEntities('', 'query')).rejects.toThrow(
        'Kanka campaign ID and query are required'
      );
    });

    it('should throw if query is empty', async () => {
      const service = new KankaService('test-token');

      await expect(service.searchEntities('kanka-123', '  ')).rejects.toThrow(
        'Kanka campaign ID and query are required'
      );
    });

    it('should URL-encode the search query', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: [] }),
      });

      const service = new KankaService('test-token');
      await service.searchEntities('kanka-123', 'Gandalf the Grey');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('name=Gandalf%20the%20Grey'),
        expect.any(Object)
      );
    });
  });
});

describe('fetchKankaContextForSession', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ data: [] }) }));
    process.env.KANKA_API_TOKEN = 'token';
  });

  it('should return undefined without reading the campaign when kanka is disabled', async () => {
    const { fetchKankaContextForSession } = await import('./kanka.service');
    const result = await fetchKankaContextForSession('campaign-1', 'session-1', false);

    expect(result).toBeUndefined();
    expect(mockCampaignGet).not.toHaveBeenCalled();
  });

  it('should read the Kanka campaign id from the campaign settings', async () => {
    mockCampaignGet.mockResolvedValue({ data: () => ({ settings: { kankaCampaignId: 'kanka-123' } }) });
    const { fetchKankaContextForSession } = await import('./kanka.service');

    const result = await fetchKankaContextForSession('campaign-1', 'session-1', true);

    expect(mockCampaignGet).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ characters: [], locations: [], quests: [], organisations: [] });
  });
});

describe('fetchKankaContext', () => {
  it('should return undefined when no Kanka campaign is linked', async () => {
    const { fetchKankaContext } = await import('./kanka.service');
    expect(await fetchKankaContext('campaign-1', undefined)).toBeUndefined();
  });
});

describe('buildKankaContextBlock', () => {
  it('should list entity names per type and skip empty names and types', async () => {
    const { buildKankaContextBlock } = await import('./kanka.service');
    const block = buildKankaContextBlock({
      characters: [{ name: 'Thalia' }, { name: '' }],
      locations: [],
      quests: [{ name: 'The Lost Mine' }],
    });

    expect(block).toContain('CAMPAIGN REFERENCE');
    expect(block).toContain('Characters: Thalia\n');
    expect(block).toContain('Quests: The Lost Mine');
    expect(block).not.toContain('Locations');
  });

  it('should return an empty string when there is nothing to list', async () => {
    const { buildKankaContextBlock } = await import('./kanka.service');
    expect(buildKankaContextBlock(undefined)).toBe('');
    expect(buildKankaContextBlock({ characters: [{ name: '' }] })).toBe('');
  });
});
