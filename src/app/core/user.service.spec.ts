import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import type { User } from 'firebase/auth';
import { UserService, profileDisplayName } from './user.service';
import { AuthService } from '../auth/auth.service';
import { UserProfileRepositoryFactory } from '../shared/repository/user-profile.repository';

describe('UserService.ensureProfile', () => {
  const repo = { fetch: vi.fn(), update: vi.fn(), patch: vi.fn() };
  let service: UserService;

  beforeEach(() => {
    vi.clearAllMocks();
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: { currentUser: signal(null) } },
        { provide: UserProfileRepositoryFactory, useValue: { create: () => repo } },
      ],
    });
    service = TestBed.inject(UserService);
  });

  const emailUser = { uid: 'u1', email: 'Jan.Jansen@Example.com', displayName: null, photoURL: null } as unknown as User;

  it('creates a profile for an e-mail user without displayName/photoURL', async () => {
    repo.fetch.mockResolvedValue(null);

    const profile = await service.ensureProfile(emailUser);

    const written = repo.update.mock.calls[0][0];
    expect(written).toMatchObject({ uid: 'u1', email: 'jan.jansen@example.com', displayName: 'Jan.Jansen', campaigns: [] });
    expect('photoURL' in written).toBe(false);
    expect(Object.values(written)).not.toContain(undefined);
    expect(profile.displayName).toBe('Jan.Jansen');
  });

  it('backfills a missing displayName on an existing profile', async () => {
    repo.fetch.mockResolvedValue({ uid: 'u1', email: 'jan.jansen@example.com', campaigns: ['c1'] });

    const profile = await service.ensureProfile(emailUser);

    expect(repo.patch).toHaveBeenCalledWith(expect.objectContaining({ displayName: 'Jan.Jansen' }));
    expect(profile.campaigns).toEqual(['c1']);
  });

  it('leaves a complete existing profile untouched', async () => {
    repo.fetch.mockResolvedValue({ uid: 'u1', email: 'jan.jansen@example.com', displayName: 'Jan', campaigns: [] });

    await service.ensureProfile(emailUser);

    expect(repo.patch).not.toHaveBeenCalled();
    expect(repo.update).not.toHaveBeenCalled();
  });
});

describe('profileDisplayName', () => {
  it('prefers the auth display name and falls back to the e-mail local part', () => {
    expect(profileDisplayName({ displayName: 'Jan Jansen', email: 'jan@example.com' })).toBe('Jan Jansen');
    expect(profileDisplayName({ displayName: null, email: 'jan@example.com' })).toBe('jan');
    expect(profileDisplayName({ displayName: null, email: null })).toBeNull();
  });
});
