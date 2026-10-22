import { describe, it, expect, beforeEach } from 'vitest';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { CampaignStoryVersionsDrawerComponent } from './campaign-story-versions-drawer.component';
import { CampaignStoryVersion } from './campaign-story.models';

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
});
