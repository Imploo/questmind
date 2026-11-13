import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { OverlayContainer } from '@angular/cdk/overlay';
import { CharacterActionsMenuComponent } from './character-actions-menu.component';

describe('CharacterActionsMenuComponent', () => {
  let fixture: ComponentFixture<CharacterActionsMenuComponent>;
  let overlay: HTMLElement;

  beforeEach(() => {
    fixture = TestBed.createComponent(CharacterActionsMenuComponent);
    overlay = TestBed.inject(OverlayContainer).getContainerElement();
    fixture.detectChanges();
  });

  afterEach(() => TestBed.inject(OverlayContainer).ngOnDestroy());

  function trigger(): HTMLButtonElement {
    return (fixture.nativeElement as HTMLElement).querySelector('button.trigger')!;
  }

  function open(): void {
    trigger().click();
    fixture.detectChanges();
  }

  function items(): HTMLButtonElement[] {
    return Array.from(overlay.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'));
  }

  function labels(): string[] {
    return items().map(item => item.textContent!.trim());
  }

  function item(label: string): HTMLButtonElement {
    return items().find(candidate => candidate.textContent!.trim() === label)!;
  }

  it('keeps the actions out of sight until the button is clicked', () => {
    expect(items()).toHaveLength(0);

    open();

    expect(trigger().getAttribute('aria-expanded')).toBe('true');
    expect(items().length).toBeGreaterThan(0);
  });

  it('offers a visitor without an account the PDF and the share link only', () => {
    open();

    expect(labels()).toEqual(['Download PDF', 'Share']);
  });

  it('offers a signed-in visitor to clone the character', () => {
    fixture.componentRef.setInput('canClone', true);
    open();

    expect(labels()).toEqual(['Download PDF', 'Clone', 'Share']);
  });

  it('offers the owner the history and the archive, each with an icon', () => {
    fixture.componentRef.setInput('canViewHistory', true);
    fixture.componentRef.setInput('canArchive', true);
    open();

    expect(labels()).toEqual(['Download PDF', 'History', 'Share', 'Archive']);
    expect(items().every(candidate => candidate.querySelector('svg') !== null)).toBe(true);
  });

  it('emits the chosen action and closes', () => {
    const exportPdf = vi.fn();
    const viewHistory = vi.fn();
    const share = vi.fn();
    fixture.componentRef.setInput('canViewHistory', true);
    fixture.componentInstance.exportPdf.subscribe(exportPdf);
    fixture.componentInstance.viewHistory.subscribe(viewHistory);
    fixture.componentInstance.share.subscribe(share);

    open();
    item('History').click();
    fixture.detectChanges();

    expect(viewHistory).toHaveBeenCalledTimes(1);
    expect(exportPdf).not.toHaveBeenCalled();
    expect(share).not.toHaveBeenCalled();
    expect(items()).toHaveLength(0);
  });

  it('asks to archive a character that is in the list', () => {
    const archivedChange = vi.fn();
    fixture.componentRef.setInput('canArchive', true);
    fixture.componentInstance.archivedChange.subscribe(archivedChange);

    open();
    item('Archive').click();

    expect(archivedChange).toHaveBeenCalledWith(true);
  });

  it('asks to bring an archived character back', () => {
    const archivedChange = vi.fn();
    fixture.componentRef.setInput('canArchive', true);
    fixture.componentRef.setInput('archived', true);
    fixture.componentInstance.archivedChange.subscribe(archivedChange);

    open();
    expect(labels()).toContain('Unarchive');
    expect(labels()).not.toContain('Archive');
    item('Unarchive').click();

    expect(archivedChange).toHaveBeenCalledWith(false);
  });

  it('shows on the button that the PDF is being made and blocks a second export', () => {
    const exportPdf = vi.fn();
    fixture.componentInstance.exportPdf.subscribe(exportPdf);
    fixture.componentRef.setInput('exportingPdf', true);
    fixture.detectChanges();

    expect(trigger().getAttribute('aria-busy')).toBe('true');
    expect(trigger().querySelector('.spinner')).not.toBeNull();

    open();
    item('Preparing PDF…').click();

    expect(exportPdf).not.toHaveBeenCalled();
  });
});
