import { describe, it, expect, beforeEach, vi } from 'vitest';
import { signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { LucideAngularModule, BookOpen, LogOut, Menu, Mic, Music, Settings, Users, X } from 'lucide-angular';
import { importProvidersFrom } from '@angular/core';
import { AuthService } from '../../auth/auth.service';
import { CampaignContextService } from '../../campaign/campaign-context.service';
import { I18nService, LanguagePreferenceService } from '../../core/i18n';
import { provideTestLanguage } from '../../core/i18n/testing';
import { UserService } from '../../core/user.service';
import { NavRailComponent } from './nav-rail.component';

describe('NavRailComponent', () => {
  let fixture: ComponentFixture<NavRailComponent>;
  let element: HTMLElement;

  const currentUser = signal<{ displayName: string | null; email: string | null; photoURL: string | null } | null>({
    displayName: 'Bram Stoker',
    email: 'bram@example.com',
    photoURL: null,
  });
  const authService = {
    currentUser,
    isAuthenticated: () => currentUser() !== null,
    signOut: vi.fn().mockResolvedValue(undefined),
  };
  const preference = { choose: vi.fn() };

  const labels = () => Array.from(element.querySelectorAll('.nav-label')).map(label => label.textContent?.trim());
  const openProfile = () => {
    element.querySelector<HTMLButtonElement>('.user-row')?.click();
    fixture.detectChanges();
  };

  beforeEach(() => {
    vi.clearAllMocks();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideTestLanguage('nl'),
        importProvidersFrom(LucideAngularModule.pick({ BookOpen, LogOut, Menu, Mic, Music, Settings, Users, X })),
        { provide: AuthService, useValue: authService },
        { provide: UserService, useValue: { isAdmin: () => false } },
        { provide: CampaignContextService, useValue: { selectedCampaignId: () => 'c1' } },
        { provide: LanguagePreferenceService, useValue: preference },
      ],
    });
    fixture = TestBed.createComponent(NavRailComponent);
    element = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
  });

  it('names the pages in the active language', async () => {
    expect(labels()).toEqual(['Karakters', 'Audio', 'Verhaal', 'Podcasts']);

    TestBed.inject(I18nService).use('en');
    await fixture.whenStable();
    fixture.detectChanges();

    expect(labels()).toEqual(['Characters', 'Audio', 'Story', 'Podcasts']);
  });

  it('has no language choice and no sign-out button of its own', () => {
    const rail = element.querySelector('nav.nav-rail');
    expect(rail?.querySelector('app-language-switcher')).toBeNull();
    expect(rail?.textContent).not.toContain('Uitloggen');
    expect(element.querySelector('[role="dialog"]')).toBeNull();
  });

  it('opens the profile drawer from the avatar and closes the mobile menu', () => {
    fixture.componentInstance.toggleMenu();
    fixture.detectChanges();

    openProfile();

    expect(fixture.componentInstance.isMenuOpen()).toBe(false);
    const drawer = element.querySelector('[role="dialog"]');
    expect(drawer?.textContent).toContain('bram@example.com');
    expect(drawer?.querySelector('app-language-switcher')).not.toBeNull();
  });

  it('remembers a language picked in the drawer', () => {
    openProfile();
    element.querySelector<HTMLButtonElement>('app-language-switcher button[lang="en"]')?.click();
    expect(preference.choose).toHaveBeenCalledWith('en');
  });

  it('signs out from the drawer', async () => {
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    openProfile();

    element.querySelector<HTMLButtonElement>('[data-testid="profile-sign-out"]')?.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(authService.signOut).toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith(['/']);
    expect(element.querySelector('[role="dialog"]')).toBeNull();
  });
});
