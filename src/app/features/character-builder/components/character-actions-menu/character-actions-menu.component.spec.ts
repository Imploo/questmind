import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { OverlayContainer } from '@angular/cdk/overlay';
import { CharacterActionsMenuComponent } from './character-actions-menu.component';
import { I18nService } from '../../../../core/i18n/i18n.service';
import { en } from '../../../../core/i18n/en';
import { nl } from '../../../../core/i18n/nl';

const texts = en.characters.actions;
const share = en.common.share;
const { archive, unarchive } = en.characters;

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

    expect(labels()).toEqual([texts.downloadPdf, share]);
  });

  it('offers a signed-in visitor to clone the character', () => {
    fixture.componentRef.setInput('canClone', true);
    open();

    expect(labels()).toEqual([texts.downloadPdf, texts.clone, share]);
  });

  it('offers the owner the history and the archive, each with an icon', () => {
    fixture.componentRef.setInput('canViewHistory', true);
    fixture.componentRef.setInput('canArchive', true);
    open();

    expect(labels()).toEqual([texts.downloadPdf, texts.history, share, archive]);
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
    item(texts.history).click();
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
    item(archive).click();

    expect(archivedChange).toHaveBeenCalledWith(true);
  });

  it('asks to bring an archived character back', () => {
    const archivedChange = vi.fn();
    fixture.componentRef.setInput('canArchive', true);
    fixture.componentRef.setInput('archived', true);
    fixture.componentInstance.archivedChange.subscribe(archivedChange);

    open();
    expect(labels()).toContain(unarchive);
    expect(labels()).not.toContain(archive);
    item(unarchive).click();

    expect(archivedChange).toHaveBeenCalledWith(false);
  });

  it('offers the owner to convert a 2014 character to the 2024 rules', () => {
    const rulesVersionChange = vi.fn();
    fixture.componentRef.setInput('canViewHistory', true);
    fixture.componentRef.setInput('canArchive', true);
    fixture.componentRef.setInput('canConvertRules', true);
    fixture.componentInstance.rulesVersionChange.subscribe(rulesVersionChange);

    open();
    expect(texts.convertRules('2024')).toBe('Convert to 2024 rules');
    expect(labels()).toEqual([texts.downloadPdf, texts.history, texts.convertRules('2024'), share, archive]);
    expect(item(texts.convertRules('2024')).title).toBe(texts.convertRulesTitle('2024'));
    item(texts.convertRules('2024')).click();
    fixture.detectChanges();

    expect(rulesVersionChange).toHaveBeenCalledWith('2024');
    expect(items()).toHaveLength(0);
  });

  it('offers the owner to convert a 2024 character back to the 2014 rules', () => {
    const rulesVersionChange = vi.fn();
    fixture.componentRef.setInput('canConvertRules', true);
    fixture.componentRef.setInput('rulesVersion', '2024');
    fixture.componentInstance.rulesVersionChange.subscribe(rulesVersionChange);

    open();
    expect(labels()).toContain(texts.convertRules('2014'));
    expect(labels()).not.toContain(texts.convertRules('2024'));
    item(texts.convertRules('2014')).click();

    expect(rulesVersionChange).toHaveBeenCalledWith('2014');
  });

  it('keeps the rules out of the menu of a visitor', () => {
    fixture.componentRef.setInput('canClone', true);
    fixture.componentRef.setInput('rulesVersion', '2024');
    open();

    expect(labels()).toEqual([texts.downloadPdf, texts.clone, share]);
  });

  it('shows on the button that the PDF is being made and blocks a second export', () => {
    const exportPdf = vi.fn();
    fixture.componentInstance.exportPdf.subscribe(exportPdf);
    fixture.componentRef.setInput('exportingPdf', true);
    fixture.detectChanges();

    expect(trigger().getAttribute('aria-busy')).toBe('true');
    expect(trigger().querySelector('.spinner')).not.toBeNull();

    open();
    item(texts.preparingPdf).click();

    expect(exportPdf).not.toHaveBeenCalled();
  });

  it('follows the language, also for a menu that is already open', () => {
    fixture.componentRef.setInput('canArchive', true);
    fixture.componentRef.setInput('canConvertRules', true);
    open();

    TestBed.inject(I18nService).use('nl');
    fixture.detectChanges();

    expect(labels()).toEqual([
      nl.characters.actions.downloadPdf,
      nl.characters.actions.convertRules('2024'),
      nl.common.share,
      nl.characters.archive,
    ]);
    expect(trigger().getAttribute('aria-label')).toBe(nl.characters.actions.menuLabel);
  });
});
