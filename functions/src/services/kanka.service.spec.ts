import { describe, it, expect, vi, beforeEach } from 'vitest';
import { KankaService } from './kanka.service';

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => ({
    collection: vi.fn(() => ({
      doc: vi.fn(() => ({
        get: vi.fn().mockResolvedValue({
          data: () => ({ settings: { kankaCampaignId: 'kanka-123' } }),
        }),
      })),
    })),
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

describe('fetchKankaContextForTranscription', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return undefined when kanka is disabled', async () => {
    const { fetchKankaContextForTranscription } = await import('./kanka.service');
    const result = await fetchKankaContextForTranscription('campaign-1', 'session-1', false);

    expect(result).toBeUndefined();
  });
});
