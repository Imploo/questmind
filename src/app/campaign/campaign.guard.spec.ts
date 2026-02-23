import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot, UrlTree } from '@angular/router';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { campaignGuard } from './campaign.guard';
import { AuthService } from '../auth/auth.service';
import { CampaignService } from './campaign.service';
import { CampaignContextService } from './campaign-context.service';
import { firstValueFrom, Observable } from 'rxjs';

describe('campaignGuard', () => {
  const mockIsLoading = signal(false);
  const mockCurrentUser = signal<{ uid: string } | null>(null);

  const mockAuthService = {
    isLoading: mockIsLoading.asReadonly(),
    currentUser: mockCurrentUser.asReadonly(),
  };

  const mockCampaignService = {
    getCampaign: vi.fn(),
  };

  const mockCampaignContext = {
    selectCampaign: vi.fn(),
  };

  const mockRouter = {
    createUrlTree: vi.fn((commands: string[]) => {
      return { toString: () => commands.join('/') } as unknown as UrlTree;
    }),
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        { provide: AuthService, useValue: mockAuthService },
        { provide: Router, useValue: mockRouter },
        { provide: CampaignService, useValue: mockCampaignService },
        { provide: CampaignContextService, useValue: mockCampaignContext },
      ],
    });
    vi.clearAllMocks();
    mockIsLoading.set(false);
    mockCurrentUser.set(null);
  });

  it('should redirect to sign-in when user is not authenticated', async () => {
    mockCurrentUser.set(null);

    const result = await TestBed.runInInjectionContext(() => {
      const guardResult = campaignGuard(
        { paramMap: { get: () => 'campaign-1' } } as unknown as ActivatedRouteSnapshot,
        {} as RouterStateSnapshot
      );
      return firstValueFrom(guardResult as Observable<boolean | UrlTree>);
    });

    expect(result).not.toBe(true);
    expect(mockRouter.createUrlTree).toHaveBeenCalledWith(['/sign-in']);
  });

  it('should allow access when no campaignId in route', async () => {
    mockCurrentUser.set({ uid: 'user-123' });

    const result = await TestBed.runInInjectionContext(() => {
      const guardResult = campaignGuard(
        { paramMap: { get: () => null } } as unknown as ActivatedRouteSnapshot,
        {} as RouterStateSnapshot
      );
      return firstValueFrom(guardResult as Observable<boolean | UrlTree>);
    });

    expect(result).toBe(true);
  });

  it('should redirect to home when user is not a campaign member', async () => {
    mockCurrentUser.set({ uid: 'user-123' });
    mockCampaignService.getCampaign.mockResolvedValue({
      id: 'campaign-1',
      members: { 'other-user': { role: 'owner' } },
    });

    const result = await TestBed.runInInjectionContext(() => {
      const guardResult = campaignGuard(
        { paramMap: { get: () => 'campaign-1' } } as unknown as ActivatedRouteSnapshot,
        {} as RouterStateSnapshot
      );
      return firstValueFrom(guardResult as Observable<boolean | UrlTree>);
    });

    expect(result).not.toBe(true);
    expect(mockRouter.createUrlTree).toHaveBeenCalledWith(['/']);
  });

  it('should allow access and set campaign context for members', async () => {
    mockCurrentUser.set({ uid: 'user-123' });
    mockCampaignService.getCampaign.mockResolvedValue({
      id: 'campaign-1',
      members: { 'user-123': { role: 'member' } },
    });

    const result = await TestBed.runInInjectionContext(() => {
      const guardResult = campaignGuard(
        { paramMap: { get: () => 'campaign-1' } } as unknown as ActivatedRouteSnapshot,
        {} as RouterStateSnapshot
      );
      return firstValueFrom(guardResult as Observable<boolean | UrlTree>);
    });

    expect(result).toBe(true);
    expect(mockCampaignContext.selectCampaign).toHaveBeenCalledWith('campaign-1');
  });

  it('should redirect when campaign does not exist', async () => {
    mockCurrentUser.set({ uid: 'user-123' });
    mockCampaignService.getCampaign.mockResolvedValue(null);

    const result = await TestBed.runInInjectionContext(() => {
      const guardResult = campaignGuard(
        { paramMap: { get: () => 'nonexistent-campaign' } } as unknown as ActivatedRouteSnapshot,
        {} as RouterStateSnapshot
      );
      return firstValueFrom(guardResult as Observable<boolean | UrlTree>);
    });

    expect(result).not.toBe(true);
    expect(mockRouter.createUrlTree).toHaveBeenCalledWith(['/']);
  });
});
