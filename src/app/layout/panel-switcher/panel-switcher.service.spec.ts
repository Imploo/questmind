import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PagePanel, PanelSwitcherService, panelAt } from './panel-switcher.service';

const progress = () => document.documentElement.style.getPropertyValue('--panel-progress');

describe('panelAt', () => {
  it('counts the sheet as on screen up to halfway', () => {
    expect(panelAt(0)).toBe('sheet');
    expect(panelAt(0.5)).toBe('sheet');
  });

  it('counts the chat as on screen past halfway', () => {
    expect(panelAt(0.51)).toBe('chat');
    expect(panelAt(1)).toBe('chat');
  });
});

describe('PanelSwitcherService', () => {
  let service: PanelSwitcherService;

  beforeEach(() => {
    service = TestBed.inject(PanelSwitcherService);
  });

  afterEach(() => service.reset());

  it('starts on the sheet, without panels', () => {
    expect(service.enabled()).toBe(false);
    expect(service.active()).toBe('sheet');
    expect(service.unread()).toBe(false);
  });

  it('follows the swipe: the progress for the thumb and the panel on screen', () => {
    service.setProgress(0.25);
    expect(progress()).toBe('0.2500');
    expect(service.active()).toBe('sheet');

    service.setProgress(0.8);
    expect(progress()).toBe('0.8000');
    expect(service.active()).toBe('chat');
  });

  it('keeps the progress between the two panels when a swipe overshoots', () => {
    service.setProgress(-0.2);
    expect(progress()).toBe('0.0000');

    service.setProgress(1.3);
    expect(progress()).toBe('1.0000');
  });

  it('marks an answer as read once the chat is on screen', () => {
    service.unread.set(true);

    service.setProgress(0.3);
    expect(service.unread()).toBe(true);

    service.setProgress(1);
    expect(service.unread()).toBe(false);
  });

  it('passes a tapped tab on to the page', () => {
    const asked: PagePanel[] = [];
    const subscription = service.requested.subscribe(panel => asked.push(panel));

    service.show('chat');
    service.show('sheet');

    expect(asked).toEqual(['chat', 'sheet']);
    subscription.unsubscribe();
  });

  it('forgets everything when the page stops showing panels', () => {
    service.enabled.set(true);
    service.unread.set(true);
    service.setProgress(1);
    service.unread.set(true);

    service.reset();

    expect(service.enabled()).toBe(false);
    expect(service.active()).toBe('sheet');
    expect(service.unread()).toBe(false);
    expect(progress()).toBe('');
  });
});
