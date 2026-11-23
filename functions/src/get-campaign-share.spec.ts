import { describe, it, expect, vi, beforeEach } from 'vitest';

// eslint-friendly stand-in for `Function` in handler mocks
type CallableFn = (...args: unknown[]) => Promise<unknown>;

const loadCampaignShare = vi.fn();
const loadSharedCampaign = vi.fn();
vi.mock('./campaign-share/load-shared-campaign', () => ({
  loadCampaignShare: (...args: unknown[]) => loadCampaignShare(...args),
  loadSharedCampaign: (...args: unknown[]) => loadSharedCampaign(...args),
}));
vi.mock('firebase-admin/firestore', () => ({ getFirestore: () => ({}) }));
vi.mock('./utils/sentry-error-handler', () => ({ wrapCallable: (_name: string, fn: CallableFn) => fn }));

let handler: CallableFn;
vi.mock('firebase-functions/v2/https', async () => {
  const actual = await vi.importActual<typeof import('firebase-functions/v2/https')>('firebase-functions/v2/https');
  return {
    ...actual,
    onCall: (_config: unknown, fn: CallableFn) => {
      handler = fn;
      return fn;
    },
  };
});

describe('getCampaignShare', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await import('./get-campaign-share');
  });

  it('returns the shared campaign to anyone with the link, signed in or not', async () => {
    loadCampaignShare.mockResolvedValue({ campaignId: 'c1' });
    loadSharedCampaign.mockResolvedValue({ name: 'Ansalon' });

    const result = await handler({ auth: null, data: { shareId: 'AbCdEfGhIjKlMnOpQrStUv' } });

    expect(loadCampaignShare).toHaveBeenCalledWith({}, 'AbCdEfGhIjKlMnOpQrStUv');
    expect(loadSharedCampaign).toHaveBeenCalledWith({}, 'c1');
    expect(result).toEqual({ name: 'Ansalon' });
  });

  it('says not found for an unknown share', async () => {
    loadCampaignShare.mockResolvedValue(null);
    await expect(handler({ auth: null, data: { shareId: 'nope' } })).rejects.toMatchObject({ code: 'not-found' });
    expect(loadSharedCampaign).not.toHaveBeenCalled();
  });

  it('says not found when the campaign is gone', async () => {
    loadCampaignShare.mockResolvedValue({ campaignId: 'c1' });
    loadSharedCampaign.mockResolvedValue(null);
    await expect(handler({ auth: null, data: {} })).rejects.toMatchObject({ code: 'not-found' });
  });
});
