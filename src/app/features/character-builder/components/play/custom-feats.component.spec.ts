import { describe, it, expect } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { CustomFeat } from '../../../../shared/models/character-play-state.model';
import { customFeatUsesKey } from '../../../../shared/utils/character-play-state';
import { CustomFeatChange, CustomFeatSpentChange, CustomFeatsComponent } from './custom-feats.component';

const boon: CustomFeat = { id: 'boon', name: "Stormcaller's Boon", description: 'Call **lightning**.', uses: { max: 2, recharge: 'longRest' } };

describe('CustomFeatsComponent', () => {
  function render(feats: CustomFeat[], editable = true, usesSpent: Record<string, number> = {}) {
    const fixture = TestBed.createComponent(CustomFeatsComponent);
    fixture.componentRef.setInput('feats', feats);
    fixture.componentRef.setInput('usesSpent', usesSpent);
    fixture.componentRef.setInput('editable', editable);
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    const button = (label: string) =>
      Array.from(host.querySelectorAll('button')).find(b => b.textContent?.trim() === label) as HTMLButtonElement | undefined;
    const type = (selector: string, value: string) => {
      const field = host.querySelector(selector) as HTMLInputElement | HTMLTextAreaElement;
      field.value = value;
      field.dispatchEvent(new Event('input'));
      fixture.detectChanges();
    };
    return { fixture, host, button, type, component: fixture.componentInstance };
  }

  it('adds a feat by name and opens it to write its text', () => {
    const { fixture, host, type, component } = render([]);
    const added: { id: string; name: string }[] = [];
    component.added.subscribe(feat => added.push(feat));

    type('.add input', '  Second Skin ');
    host.querySelector('.add')!.dispatchEvent(new Event('submit'));

    expect(added).toHaveLength(1);
    expect(added[0].name).toBe('Second Skin');

    // The parent stores the feat and hands it back.
    fixture.componentRef.setInput('feats', [{ id: added[0].id, name: 'Second Skin', description: '' }]);
    fixture.detectChanges();
    expect((host.querySelector('.form input') as HTMLInputElement).value).toBe('Second Skin');
    expect((host.querySelector('.add input') as HTMLInputElement).value).toBe('');
  });

  it('saves a new name and text in one change', () => {
    const { fixture, host, button, type, component } = render([boon]);
    const changes: CustomFeatChange[] = [];
    component.updated.subscribe(change => changes.push(change));

    (host.querySelector('.head') as HTMLButtonElement).click();
    fixture.detectChanges();
    button('Edit feat')!.click();
    fixture.detectChanges();
    type('.form input', 'Storm Boon');
    type('.form textarea', 'Thunder. ');
    host.querySelector('.form')!.dispatchEvent(new Event('submit'));

    expect(changes).toEqual([{ id: 'boon', changes: { name: 'Storm Boon', description: 'Thunder.' } }]);
  });

  it('shows the tracker with what is spent and reports a spent use under the key of the feat', () => {
    const key = customFeatUsesKey('boon');
    const { host, component } = render([boon], true, { [key]: 1 });
    const spent: CustomFeatSpentChange[] = [];
    component.spentChange.subscribe(change => spent.push(change));

    expect(host.querySelector('.recharge')!.textContent).toBe('Long rest');
    const pips = Array.from(host.querySelectorAll('app-use-pips button')) as HTMLButtonElement[];
    expect(pips.map(pip => pip.getAttribute('aria-pressed'))).toEqual(['true', 'false']);

    pips[1].click();
    expect(spent).toEqual([{ key, spent: 2 }]);
  });

  it('is read-only for someone who cannot play with the sheet', () => {
    const { fixture, host, button } = render([boon], false);

    (host.querySelector('.head') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(host.querySelector('.add')).toBeNull();
    expect(button('Edit feat')).toBeUndefined();
    expect(host.querySelector('app-tracker-editor')).toBeNull();
    expect(host.querySelector('app-markdown strong')!.textContent).toBe('lightning');
  });
});
