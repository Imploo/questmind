import { describe, it, expect, beforeEach } from 'vitest';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { CampaignStoryViewComponent } from './campaign-story-view.component';
import { CampaignStoryVersion } from './campaign-story.models';
import { I18nService } from '../core/i18n/i18n.service';
import { provideTestLanguage } from '../core/i18n/testing';
import { en } from '../core/i18n/en';
import { nl } from '../core/i18n/nl';

const story: CampaignStoryVersion = {
  id: 'v2',
  version: 2,
  status: 'completed',
  title: 'De val van Grauwhaven',
  content: '## Het begin\nDe party vertrok.',
  sourceSessions: [
    { sessionId: 'a', title: 'A', sessionDate: '2026-01-01', storyVersion: 1 },
    { sessionId: 'b', title: 'B', sessionDate: '2026-02-01', storyVersion: 1 },
  ],
  skippedSessions: [],
  createdBy: 'owner',
  createdAt: new Date('2026-10-22T10:00:00Z'),
};

describe('CampaignStoryViewComponent', () => {
  let fixture: ComponentFixture<CampaignStoryViewComponent>;
  let element: HTMLElement;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideTestLanguage('en')] });
    fixture = TestBed.createComponent(CampaignStoryViewComponent);
    element = fixture.nativeElement as HTMLElement;
    fixture.componentRef.setInput('version', story);
  });

  it('renders title, meta and markdown content', () => {
    fixture.detectChanges();
    expect(element.querySelector('h2')?.textContent).toContain('De val van Grauwhaven');
    expect(element.textContent).toContain(en.common.version(2));
    expect(element.textContent).toContain(en.campaignStory.sessionCount(2));
    expect(element.querySelector('.prose h2')?.textContent).toBe('Het begin');
  });

  it('shows the older-version badge and emits backToLatest', () => {
    fixture.componentRef.setInput('isLatest', false);
    fixture.detectChanges();
    let emitted = 0;
    fixture.componentInstance.backToLatest.subscribe(() => emitted++);

    expect(element.textContent).toContain(en.campaignStory.olderVersion);
    expect(element.textContent).toContain(en.campaignStory.viewingVersion(2));
    (Array.from(element.querySelectorAll('button')).find(b => b.textContent?.includes(en.campaignStory.backToLatest)) as HTMLButtonElement).click();
    expect(emitted).toBe(1);
  });

  it('falls back on a translated title when the version has none', () => {
    fixture.componentRef.setInput('version', { ...story, title: undefined });
    fixture.detectChanges();

    expect(element.querySelector('h2')?.textContent).toContain(en.campaignStory.untitled);
  });

  it('switches to Dutch without a reload, and leaves the story itself alone', () => {
    fixture.componentRef.setInput('isLatest', false);
    fixture.detectChanges();
    const englishDate = element.querySelector('.qm-eyebrow')?.textContent;

    TestBed.inject(I18nService).use('nl');
    fixture.detectChanges();

    const meta = element.querySelector('.qm-eyebrow')?.textContent ?? '';
    expect(meta).toContain(nl.common.version(2));
    expect(meta).toContain(nl.campaignStory.sessionCount(2));
    // The date follows the locale too: "22 Oct 2026" becomes "22 okt 2026".
    expect(meta).not.toBe(englishDate);
    expect(meta).toContain('okt');
    expect(element.textContent).toContain(nl.campaignStory.olderVersion);
    expect(element.querySelector('h2')?.textContent).toContain('De val van Grauwhaven');
    expect(element.querySelector('.prose h2')?.textContent).toBe('Het begin');
  });
});
