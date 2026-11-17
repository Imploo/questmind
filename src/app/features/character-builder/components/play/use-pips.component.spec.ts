import { describe, it, expect, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideTestLanguage } from '../../../../core/i18n/testing';
import { UsePipsComponent } from './use-pips.component';

describe('UsePipsComponent', () => {
  // English on purpose rather than by default: a language another spec left in localStorage would decide otherwise.
  beforeEach(() => TestBed.configureTestingModule({ providers: [provideTestLanguage('en')] }));

  function render(total: number, spent: number, editable = true) {
    const fixture = TestBed.createComponent(UsePipsComponent);
    fixture.componentRef.setInput('total', total);
    fixture.componentRef.setInput('spent', spent);
    fixture.componentRef.setInput('label', 'Level 1 slot');
    fixture.componentRef.setInput('editable', editable);
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    const emitted: number[] = [];
    fixture.componentInstance.spentChange.subscribe(value => emitted.push(value));
    return { host, emitted };
  }

  const spentPips = (host: HTMLElement) =>
    Array.from(host.querySelectorAll('.pip')).map(pip => pip.classList.contains('is-spent'));

  it('ticks the row off from left to right', () => {
    expect(spentPips(render(4, 0).host)).toEqual([false, false, false, false]);
    expect(spentPips(render(4, 1).host)).toEqual([true, false, false, false]);
    expect(spentPips(render(4, 3).host)).toEqual([true, true, true, false]);
    expect(spentPips(render(4, 3, false).host)).toEqual([true, true, true, false]);
  });

  it('never shows more spent than there are', () => {
    expect(spentPips(render(2, 5).host)).toEqual([true, true]);
  });

  it('spends one more on an available pip and gives one back on a spent pip', () => {
    const { host, emitted } = render(4, 2);
    const buttons = Array.from(host.querySelectorAll('button'));

    buttons[3].click();
    buttons[0].click();

    expect(emitted).toEqual([3, 1]);
  });

  const labels = (host: HTMLElement, selector: string) =>
    Array.from(host.querySelectorAll(selector)).map(element => element.getAttribute('aria-label'));

  it('names every pip, the counter buttons and the read-only row for screen readers', () => {
    expect(labels(render(2, 1).host, 'button')).toEqual(['Level 1 slot 1, spent', 'Level 1 slot 2, available']);
    expect(labels(render(8, 3).host, 'button')).toEqual(['Spend 1 of Level 1 slot', 'Restore 1 of Level 1 slot']);
    expect(labels(render(4, 1, false).host, '.pips')).toEqual(['Level 1 slot: 3 of 4 available']);
  });

  it('names them in Dutch around the English label', () => {
    TestBed.configureTestingModule({ providers: [provideTestLanguage('nl')] });

    expect(labels(render(2, 1).host, 'button')).toEqual(['Level 1 slot 1, gebruikt', 'Level 1 slot 2, beschikbaar']);
    expect(labels(render(8, 3).host, 'button')).toEqual(['Level 1 slot: 1 gebruiken', 'Level 1 slot: 1 terugzetten']);
    expect(labels(render(4, 1, false).host, '.pips')).toEqual(['Level 1 slot: 3 van 4 beschikbaar']);
  });
});
