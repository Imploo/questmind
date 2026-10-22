import { describe, it, expect, beforeEach } from 'vitest';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { CampaignVoiceRosterComponent } from './campaign-voice-roster.component';

describe('CampaignVoiceRosterComponent', () => {
  let fixture: ComponentFixture<CampaignVoiceRosterComponent>;
  let element: HTMLElement;

  beforeEach(() => {
    fixture = TestBed.createComponent(CampaignVoiceRosterComponent);
    element = fixture.nativeElement as HTMLElement;
  });

  function saveButton(): HTMLButtonElement {
    return Array.from(element.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Save speaking order')
    ) as HTMLButtonElement;
  }

  function typeInto(value: string): void {
    const textarea = element.querySelector('textarea') as HTMLTextAreaElement;
    textarea.value = value;
    textarea.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  it('prefills the textarea with the saved roster for the owner', () => {
    fixture.componentRef.setInput('roster', '1. DM\n2. Thorin');
    fixture.componentRef.setInput('canEdit', true);
    fixture.detectChanges();

    expect((element.querySelector('textarea') as HTMLTextAreaElement).value).toBe('1. DM\n2. Thorin');
    expect(saveButton().disabled).toBe(true);
  });

  it('enables saving after an edit and emits the trimmed value', () => {
    fixture.componentRef.setInput('canEdit', true);
    fixture.detectChanges();
    const emitted: string[] = [];
    fixture.componentInstance.rosterSaved.subscribe((value) => emitted.push(value));

    typeInto('  1. DM\n2. Lyra  ');
    expect(saveButton().disabled).toBe(false);
    saveButton().click();

    expect(emitted).toEqual(['1. DM\n2. Lyra']);
  });

  it('shows the roster read-only for members', () => {
    fixture.componentRef.setInput('roster', '1. DM\n2. Thorin');
    fixture.detectChanges();

    expect(element.querySelector('textarea')).toBeNull();
    expect(element.textContent).toContain('2. Thorin');
  });

  it('shows errors', () => {
    fixture.componentRef.setInput('errorMessage', 'Save failed');
    fixture.detectChanges();

    expect(element.textContent).toContain('Save failed');
  });
});
