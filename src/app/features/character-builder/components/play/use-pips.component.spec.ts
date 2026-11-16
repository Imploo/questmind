import { describe, it, expect } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { UsePipsComponent } from './use-pips.component';

describe('UsePipsComponent', () => {
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
});
