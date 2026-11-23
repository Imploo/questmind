import { describe, it, expect, vi, beforeEach } from 'vitest';

// eslint-friendly stand-in for `Function` in handler mocks
type CallableFn = (...args: unknown[]) => Promise<unknown>;

const existingGet = vi.fn();
const shareCreate = vi.fn();
const shareDoc = vi.fn<(id: string) => { create: typeof shareCreate }>(() => ({ create: shareCreate }));
const where = vi.fn(() => ({ limit: vi.fn(() => ({ get: existingGet })) }));
const mockDb = { collection: vi.fn(() => ({ where, doc: shareDoc })) };
const assertCampaignMember = vi.fn();

vi.mock('firebase-admin/firestore', () => ({ getFirestore: () => mockDb }));
vi.mock('./utils/emulator-helpers', () => ({ ensureAuthForTesting: vi.fn() }));
vi.mock('./utils/sentry-error-handler', () => ({ wrapCallable: (_name: string, fn: CallableFn) => fn }));
vi.mock('./utils/access', async () => {
  const actual = await vi.importActual<typeof import('./utils/access')>('./utils/access');
  return { ...actual, assertCampaignMember: (...args: unknown[]) => assertCampaignMember(...args) };
});

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

const request = (data: Record<string, unknown>, uid: string | null = 'member-1') =>
  ({ auth: uid ? { uid } : null, data });

describe('createCampaignShare', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await import('./create-campaign-share');
    existingGet.mockResolvedValue({ empty: true, docs: [] });
    assertCampaignMember.mockResolvedValue({ name: 'Ansalon' });
  });

  it('creates a share with a random id for a member', async () => {
    const result = (await handler(request({ campaignId: 'c1', language: 'en' }))) as { shareId: string };

    expect(assertCampaignMember).toHaveBeenCalledWith(mockDb, 'c1', 'member-1');
    expect(mockDb.collection).toHaveBeenCalledWith('campaignShares');
    expect(result.shareId).toMatch(/^[\w-]{22}$/);
    expect(shareDoc).toHaveBeenCalledWith(result.shareId);
    expect(shareCreate).toHaveBeenCalledWith(expect.objectContaining({
      campaignId: 'c1', createdBy: 'member-1', language: 'en',
    }));
  });

  it('returns the existing share of the campaign', async () => {
    existingGet.mockResolvedValue({ empty: false, docs: [{ id: 'existing-share-id' }] });

    const result = await handler(request({ campaignId: 'c1' }));

    expect(where).toHaveBeenCalledWith('campaignId', '==', 'c1');
    expect(result).toEqual({ shareId: 'existing-share-id' });
    expect(shareCreate).not.toHaveBeenCalled();
  });

  it('refuses someone who is not a member', async () => {
    assertCampaignMember.mockRejectedValue(new Error('User is not a campaign member.'));
    await expect(handler(request({ campaignId: 'c1' }, 'stranger'))).rejects.toThrow('not a campaign member');
    expect(shareCreate).not.toHaveBeenCalled();
  });

  it('refuses without sign-in or campaign', async () => {
    await expect(handler(request({ campaignId: 'c1' }, null))).rejects.toThrow('Authentication required');
    await expect(handler(request({}))).rejects.toThrow('campaignId');
  });
});
