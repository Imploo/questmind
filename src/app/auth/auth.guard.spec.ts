import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { Router, UrlTree, type ActivatedRouteSnapshot, type RouterStateSnapshot } from '@angular/router';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { authGuard, noAuthGuard } from './auth.guard';
import { AuthService } from './auth.service';
import { firstValueFrom, Observable } from 'rxjs';

describe('authGuard', () => {
  const mockIsLoading = signal(false);
  const mockIsAuthenticated = signal(false);

  const mockAuthService = {
    isLoading: mockIsLoading.asReadonly(),
    isAuthenticated: mockIsAuthenticated.asReadonly(),
  };

  const mockRouter = {
    createUrlTree: vi.fn((commands: string[], extras?: { queryParams?: Record<string, string> }) => {
      return { toString: () => commands.join('/'), queryParams: extras?.queryParams } as unknown as UrlTree;
    }),
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        { provide: AuthService, useValue: mockAuthService },
        { provide: Router, useValue: mockRouter },
      ],
    });
    vi.clearAllMocks();
    mockIsLoading.set(false);
    mockIsAuthenticated.set(false);
  });

  it('should allow access when user is authenticated', async () => {
    mockIsAuthenticated.set(true);

    const result = await TestBed.runInInjectionContext(() => {
      const guardResult = authGuard(
        {} as ActivatedRouteSnapshot,
        { url: '/dashboard' } as RouterStateSnapshot
      );
      return firstValueFrom(guardResult as Observable<boolean | UrlTree>);
    });

    expect(result).toBe(true);
  });

  it('should redirect to sign-in when user is not authenticated', async () => {
    mockIsAuthenticated.set(false);

    const result = await TestBed.runInInjectionContext(() => {
      const guardResult = authGuard(
        {} as ActivatedRouteSnapshot,
        { url: '/dashboard' } as RouterStateSnapshot
      );
      return firstValueFrom(guardResult as Observable<boolean | UrlTree>);
    });

    expect(result).not.toBe(true);
    expect(mockRouter.createUrlTree).toHaveBeenCalledWith(
      ['/sign-in'],
      { queryParams: { returnUrl: '/dashboard' } }
    );
  });
});

describe('noAuthGuard', () => {
  const mockIsLoading = signal(false);
  const mockIsAuthenticated = signal(false);

  const mockAuthService = {
    isLoading: mockIsLoading.asReadonly(),
    isAuthenticated: mockIsAuthenticated.asReadonly(),
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
      ],
    });
    vi.clearAllMocks();
    mockIsLoading.set(false);
    mockIsAuthenticated.set(false);
  });

  it('should allow access when user is not authenticated', async () => {
    mockIsAuthenticated.set(false);

    const result = await TestBed.runInInjectionContext(() => {
      const guardResult = noAuthGuard(
        { queryParams: {} } as unknown as ActivatedRouteSnapshot,
        {} as RouterStateSnapshot
      );
      return firstValueFrom(guardResult as Observable<boolean | UrlTree>);
    });

    expect(result).toBe(true);
  });

  it('should redirect authenticated users to home', async () => {
    mockIsAuthenticated.set(true);

    const result = await TestBed.runInInjectionContext(() => {
      const guardResult = noAuthGuard(
        { queryParams: {} } as unknown as ActivatedRouteSnapshot,
        {} as RouterStateSnapshot
      );
      return firstValueFrom(guardResult as Observable<boolean | UrlTree>);
    });

    expect(result).not.toBe(true);
    expect(mockRouter.createUrlTree).toHaveBeenCalled();
  });

  it('should redirect to returnUrl when available', async () => {
    mockIsAuthenticated.set(true);

    const result = await TestBed.runInInjectionContext(() => {
      const guardResult = noAuthGuard(
        { queryParams: { returnUrl: '/dashboard' } } as unknown as ActivatedRouteSnapshot,
        {} as RouterStateSnapshot
      );
      return firstValueFrom(guardResult as Observable<boolean | UrlTree>);
    });

    expect(result).not.toBe(true);
    expect(mockRouter.createUrlTree).toHaveBeenCalledWith(['/dashboard']);
  });
});
