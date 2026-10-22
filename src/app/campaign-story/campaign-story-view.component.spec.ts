import { describe, it, expect, beforeEach } from 'vitest';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { CampaignStoryViewComponent } from './campaign-story-view.component';
import { CampaignStoryVersion } from './campaign-story.models';

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
    fixture = TestBed.createComponent(CampaignStoryViewComponent);
    element = fixture.nativeElement as HTMLElement;
    fixture.componentRef.setInput('version', story);
  });

  it('renders title, meta and markdown content', () => {
    fixture.detectChanges();
    expect(element.querySelector('h2')?.textContent).toContain('De val van Grauwhaven');
    expect(element.textContent).toContain('Versie 2');
    expect(element.textContent).toContain('2 sessies');
    expect(element.querySelector('.prose h2')?.textContent).toBe('Het begin');
  });

  it('shows the older-version badge and emits backToLatest', () => {
    fixture.componentRef.setInput('isLatest', false);
    fixture.detectChanges();
    let emitted = 0;
    fixture.componentInstance.backToLatest.subscribe(() => emitted++);

    expect(element.textContent).toContain('Oudere versie');
    (Array.from(element.querySelectorAll('button')).find(b => b.textContent?.includes('Terug naar nieuwste')) as HTMLButtonElement).click();
    expect(emitted).toBe(1);
  });
});
