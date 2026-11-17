import { describe, it, expect } from 'vitest';
import { CampaignError, campaignErrorMessage } from './campaign-error';
import { en } from '../core/i18n/en';
import { nl } from '../core/i18n/nl';

describe('campaignErrorMessage', () => {
  it('shows the message of a CampaignError as it is', () => {
    const error = new CampaignError(nl.campaign.errors.alreadyMember);

    expect(campaignErrorMessage(error, nl.errors, nl.campaign.errors.inviteFailed)).toBe(
      nl.campaign.errors.alreadyMember
    );
  });

  it('never shows the raw message of another error', () => {
    const error = new Error('Missing or insufficient permissions.');

    expect(campaignErrorMessage(error, en.errors, en.campaign.errors.saveFailed)).toBe(en.campaign.errors.saveFailed);
  });

  it('gives a Firestore or callable error code its own text', () => {
    const denied = Object.assign(new Error('Missing or insufficient permissions.'), { code: 'permission-denied' });
    const tooLong = Object.assign(new Error('Voice intro too long'), {
      code: 'functions/failed-precondition',
      details: { reason: 'voice-intro-too-long' },
    });

    expect(campaignErrorMessage(denied, en.errors, en.campaign.errors.saveFailed)).toBe(en.errors.permissionDenied);
    expect(campaignErrorMessage(tooLong, nl.errors, nl.campaign.voiceIntro.uploadFailed)).toBe(
      nl.errors.reasons.voiceIntroTooLong
    );
  });
});
