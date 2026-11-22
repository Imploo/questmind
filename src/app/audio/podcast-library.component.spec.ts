import { describe, it, expect, beforeEach } from 'vitest';
import { signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { PodcastLibraryComponent } from './podcast-library.component';
import { AudioSessionStateService } from './services/audio-session-state.service';
import { PodcastShareService } from './services/podcast-share.service';
import { AuthService } from '../auth/auth.service';
import { CampaignContextService } from '../campaign/campaign-context.service';
import { provideTestLanguage } from '../core/i18n/testing';
import { nl } from '../core/i18n/nl';

describe('PodcastLibraryComponent', () => {
  let fixture: ComponentFixture<PodcastLibraryComponent>;
  let element: HTMLElement;

  const podcast = (version: number) => ({
    version,
    status: 'completed',
    audioUrl: `https://example.com/v${version}.mp3`,
    createdAt: new Date(),
    fileSize: 1000,
  });
  const sessions = signal<Record<string, unknown>[]>([]);

  const versionsShown = () =>
    Array.from(element.querySelectorAll('app-podcast-version-item')).map(item => item.textContent ?? '');
  const toggle = () => element.querySelector('[data-testid="version-toggle"]') as HTMLButtonElement | null;

  beforeEach(() => {
    sessions.set([]);
    TestBed.configureTestingModule({
      providers: [
        provideTestLanguage('nl'),
        { provide: AuthService, useValue: { currentUser: signal({ uid: 'u1' }) } },
        { provide: CampaignContextService, useValue: { selectedCampaignId: signal('c1') } },
        { provide: AudioSessionStateService, useValue: { sessions } },
        { provide: PodcastShareService, useValue: { createShareUrl: () => Promise.resolve('') } },
      ],
    });
  });

  function create(): void {
    fixture = TestBed.createComponent(PodcastLibraryComponent);
    element = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
  }

  it('shows only the newest version, and the others behind the pill', () => {
    sessions.set([{ id: 's1', title: 'De sluizen gaan open', sessionDate: '2026-10-20', podcasts: [podcast(1), podcast(3), podcast(2)] }]);
    create();

    expect(versionsShown()).toHaveLength(1);
    expect(versionsShown()[0]).toContain('v3');
    expect(toggle()?.textContent).toContain(nl.podcast.library.versionCount(3));
    expect(toggle()?.getAttribute('aria-expanded')).toBe('false');

    toggle()?.click();
    fixture.detectChanges();
    expect(versionsShown().map(text => /v(\d)/.exec(text)?.[1])).toEqual(['3', '2', '1']);
    expect(toggle()?.getAttribute('aria-expanded')).toBe('true');

    toggle()?.click();
    fixture.detectChanges();
    expect(versionsShown()).toHaveLength(1);
  });

  it('has no pill to open for a single version', () => {
    sessions.set([{ id: 's1', title: 'Eén avond', sessionDate: '2026-10-20', podcasts: [podcast(1)] }]);
    create();

    expect(versionsShown()).toHaveLength(1);
    expect(toggle()).toBeNull();
  });
});
