import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { CampaignService } from './campaign.service';
import { CampaignError } from './campaign-error';
import { Campaign } from './campaign.models';
import { AuthService } from '../auth/auth.service';
import { UserService } from '../core/user.service';
import { FirebaseService } from '../core/firebase.service';
import { I18nService } from '../core/i18n/i18n.service';
import { provideTestLanguage } from '../core/i18n/testing';
import { en } from '../core/i18n/en';
import { nl } from '../core/i18n/nl';

describe('CampaignService', () => {
  const currentUser = signal<{ uid: string; email: string } | null>(null);
  const userService = { addCampaign: vi.fn(), removeCampaign: vi.fn(), setDefaultCampaign: vi.fn() };

  const campaign = {
    id: 'campaign-1',
    ownerId: 'owner',
    members: { owner: { role: 'owner', email: 'owner@example.com', joinedAt: '' } },
  } as unknown as Campaign;

  /** What the service finds in Firestore; the refusals under test are all decided before it writes. */
  let storedCampaign: Campaign | null;
  let userWithEmail: { uid: string; email: string } | null;
  let lookupFailure: Error | null;

  interface Lookup {
    findUserByEmail: (email: string) => Promise<{ uid: string; email: string } | null>;
  }

  // Firestore is stubbed at the service's own reads, not with `vi.mock`: spec files share
  // their modules (the test runner does not isolate them), so a module mock is not reliable.
  function setup(options: { firestore?: unknown; language?: 'nl' | 'en' } = {}): CampaignService {
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: { currentUser } },
        { provide: UserService, useValue: userService },
        { provide: FirebaseService, useValue: { firestore: 'firestore' in options ? options.firestore : {} } },
        provideTestLanguage(options.language ?? 'en'),
      ],
    });
    const service = TestBed.inject(CampaignService);
    vi.spyOn(service, 'getCampaign').mockImplementation(() =>
      lookupFailure ? Promise.reject(lookupFailure) : Promise.resolve(storedCampaign)
    );
    vi.spyOn(service as unknown as Lookup, 'findUserByEmail').mockImplementation(() =>
      Promise.resolve(userWithEmail)
    );
    return service;
  }

  /** The error a call is refused with. */
  async function refusal(call: Promise<unknown>): Promise<Error> {
    const error = await call.then(
      () => null,
      (e: unknown) => e
    );
    expect(error).toBeInstanceOf(CampaignError);
    return error as Error;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    currentUser.set({ uid: 'owner', email: 'owner@example.com' });
    storedCampaign = campaign;
    userWithEmail = null;
    lookupFailure = null;
  });

  it('refuses a visitor who is not signed in', async () => {
    currentUser.set(null);
    const service = setup();

    expect((await refusal(service.createCampaign('Name'))).message).toBe(en.errors.unauthenticated);
    expect((await refusal(service.inviteUserByEmail('campaign-1', 'a@b.nl'))).message).toBe(en.errors.unauthenticated);
    expect((await refusal(service.removeMember('campaign-1', 'member'))).message).toBe(en.errors.unauthenticated);
  });

  it('says so when Firestore is not configured', async () => {
    const service = setup({ firestore: null });

    expect((await refusal(service.createCampaign('Name'))).message).toBe(en.campaign.errors.notConfigured);
    expect((await refusal(service.updateVoiceIntro('campaign-1', null))).message).toBe(en.campaign.errors.notConfigured);
  });

  it('refuses an invitation for a campaign that does not exist', async () => {
    storedCampaign = null;

    const error = await refusal(setup().inviteUserByEmail('campaign-1', 'a@b.nl'));

    expect(error.message).toBe(en.campaign.errors.campaignNotFound);
  });

  it('lets only the owner invite', async () => {
    currentUser.set({ uid: 'someone-else', email: 'else@example.com' });

    const error = await refusal(setup().inviteUserByEmail('campaign-1', 'a@b.nl'));

    expect(error.message).toBe(en.campaign.errors.onlyOwnerCanInvite);
  });

  it('names the e-mail address nobody has an account for', async () => {
    const error = await refusal(setup().inviteUserByEmail('campaign-1', '  New@Example.com '));

    expect(error.message).toBe(en.campaign.errors.userNotFound('new@example.com'));
    expect(userService.addCampaign).not.toHaveBeenCalled();
  });

  it('refuses to invite someone who is already a member', async () => {
    userWithEmail = { uid: 'owner', email: 'owner@example.com' };

    const error = await refusal(setup().inviteUserByEmail('campaign-1', 'owner@example.com'));

    expect(error.message).toBe(en.campaign.errors.alreadyMember);
  });

  it('never removes the owner, and lets only the owner remove someone else', async () => {
    const service = setup();
    expect((await refusal(service.removeMember('campaign-1', 'owner'))).message).toBe(
      en.campaign.errors.cannotRemoveOwner
    );

    currentUser.set({ uid: 'member-1', email: 'member@example.com' });
    expect((await refusal(service.removeMember('campaign-1', 'member-2'))).message).toBe(
      en.campaign.errors.onlyOwnerCanRemove
    );
  });

  it('throws in Dutch for a Dutch user', async () => {
    const error = await refusal(setup({ language: 'nl' }).inviteUserByEmail('campaign-1', 'nieuw@voorbeeld.nl'));

    expect(error.message).toBe(nl.campaign.errors.userNotFound('nieuw@voorbeeld.nl'));
  });

  it('uses the language active at the moment it throws', async () => {
    const service = setup();
    TestBed.inject(I18nService).use('nl');

    expect((await refusal(service.removeMember('campaign-1', 'owner'))).message).toBe(
      nl.campaign.errors.cannotRemoveOwner
    );
  });

  it('passes a Firestore failure on untouched, so the raw text is never mistaken for a message to show', async () => {
    const failure = Object.assign(new Error('Missing or insufficient permissions.'), { code: 'permission-denied' });
    lookupFailure = failure;

    const error = await setup()
      .inviteUserByEmail('campaign-1', 'a@b.nl')
      .catch((e: unknown) => e);

    expect(error).toBe(failure);
    expect(error).not.toBeInstanceOf(CampaignError);
  });
});
