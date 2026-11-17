import { describe, it, expect, beforeEach } from 'vitest';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { CampaignStoryVersionsDrawerComponent } from './campaign-story-versions-drawer.component';
import { CampaignStoryVersion } from './campaign-story.models';
import { provideTestLanguage } from '../core/i18n/testing';
import { en } from '../core/i18n/en';

const version = (n: number, status: CampaignStoryVersion['status'] = 'completed'): CampaignStoryVersion => ({
  id: `v${n}`,
  version: n,
  status,
  title: `Titel ${n}`,
  sourceSessions: [],
  skippedSessions: [],
  createdBy: 'owner',
  createdAt: new Date('2026-10-22T10:00:00Z'),
});

describe('CampaignStoryVersionsDrawerComponent', () => {
  let fixture: ComponentFixture<CampaignStoryVersionsDrawerComponent>;
  let element: HTMLElement;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideTestLanguage('en')] });
    fixture = TestBed.createComponent(CampaignStoryVersionsDrawerComponent);
    element = fixture.nativeElement as HTMLElement;
    fixture.componentRef.setInput('versions', [version(2, 'generating'), version(1)]);
  });

  const versionButtons = () =>
    Array.from(element.querySelectorAll('li button')) as HTMLButtonElement[];

  it('renders nothing while closed', () => {
    fixture.detectChanges();
    expect(element.querySelector('aside')).toBeNull();
  });

  it('lists all versions and only lets completed ones be selected', () => {
    fixture.componentRef.setInput('open', true);
    fixture.detectChanges();
    const emitted: number[] = [];
    fixture.componentInstance.selected.subscribe(v => emitted.push(v));

    expect(versionButtons()).toHaveLength(2);
    expect(versionButtons()[0].disabled).toBe(true);
    versionButtons()[1].click();
    expect(emitted).toEqual([1]);
  });

  it('closes on Escape', () => {
    fixture.componentRef.setInput('open', true);
    fixture.detectChanges();
    let closed = 0;
    fixture.componentInstance.closed.subscribe(() => closed++);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(closed).toBe(1);
  });

  it('labels each version with its number, status and session count', () => {
    fixture.componentRef.setInput('open', true);
    fixture.detectChanges();

    expect(element.querySelector('aside')?.getAttribute('aria-label')).toBe(en.campaignStory.drawer.label);
    expect(versionButtons()[0].textContent).toContain(en.common.version(2));
    expect(versionButtons()[0].textContent).toContain(en.common.busy);
    expect(versionButtons()[1].textContent).toContain(en.campaignStory.sessionCount(0));
  });

  it('shows a translated message for a failed version, with the raw error collapsed below it', () => {
    fixture.componentRef.setInput('versions', [{ ...version(3, 'failed'), error: 'Vertex AI: quota exceeded' }]);
    fixture.componentRef.setInput('open', true);
    fixture.detectChanges();

    const button = versionButtons()[0];
    expect(button.textContent).toContain(en.common.failed);
    expect(button.textContent).toContain(en.campaignStory.generationFailed);
    expect(button.textContent).not.toContain('quota exceeded');

    // Next to the disabled button, not inside it, so it can still be opened.
    const details = element.querySelector('li > details') as HTMLDetailsElement;
    expect(details.open).toBe(false);
    expect(details.querySelector('summary')?.textContent).toContain(en.errors.technicalDetails);
    expect(details.textContent).toContain('Vertex AI: quota exceeded');
  });

  it('shows no technical details when a failed version stored no error', () => {
    fixture.componentRef.setInput('versions', [version(3, 'failed')]);
    fixture.componentRef.setInput('open', true);
    fixture.detectChanges();

    expect(versionButtons()[0].textContent).toContain(en.campaignStory.generationFailed);
    expect(element.querySelector('details')).toBeNull();
  });
});
