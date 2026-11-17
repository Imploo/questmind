import { describe, it, expect, beforeEach } from 'vitest';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { AudioUploadComponent } from './audio-upload.component';
import { I18nService } from '../core/i18n/i18n.service';
import { en } from '../core/i18n/en';
import { nl } from '../core/i18n/nl';
import { provideTestLanguage } from '../core/i18n/testing';

const file = (name: string, type = '', size = 1024): File => {
  const result = new File(['x'], name, { type });
  Object.defineProperty(result, 'size', { value: size });
  return result;
};

describe('AudioUploadComponent', () => {
  let fixture: ComponentFixture<AudioUploadComponent>;
  let component: AudioUploadComponent;
  let element: HTMLElement;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideTestLanguage('en')] });
    fixture = TestBed.createComponent(AudioUploadComponent);
    component = fixture.componentInstance;
    element = fixture.nativeElement as HTMLElement;
    fixture.componentRef.setInput('userId', 'u1');
    fixture.componentRef.setInput('campaignId', 'c1');
    fixture.componentRef.setInput('canUpload', true);
    fixture.detectChanges();
  });

  const submit = () => element.querySelector('button.qm-btn-primary')?.textContent?.trim();

  it('says in one sentence, naming the file, why a file is refused', () => {
    expect(component.validateFile(file('notes.txt', 'text/plain'))).toBe(en.audio.uploadErrors.unsupportedType('notes.txt'));
    expect(component.validateFile(file('long.wav', 'audio/wav', 5 * 1024 ** 3))).toBe(en.audio.uploadErrors.wavTooLarge('long.wav'));
    expect(component.validateFile(file('long.mp3', 'audio/mpeg', 600 * 1024 ** 2))).toBe(en.audio.uploadErrors.tooLarge('long.mp3'));
    expect(component.validateFile(file('evening.m4a'))).toBeNull();
  });

  it('shows that reason and keeps the refused file out', () => {
    component.addFiles([file('notes.txt', 'text/plain')]);
    fixture.detectChanges();

    expect(component.selectedFiles()).toEqual([]);
    expect(element.querySelector('[role="alert"]')?.textContent?.trim()).toBe(en.audio.uploadErrors.unsupportedType('notes.txt'));
  });

  it('labels the upload button after what it will do', () => {
    expect(submit()).toBe(en.audio.upload.uploadAndProcess);

    component.addFiles([file('part-1.mp3', 'audio/mpeg'), file('part-2.mp3', 'audio/mpeg')]);
    fixture.detectChanges();
    expect(submit()).toBe(en.audio.upload.mergeAndUpload);
    expect(element.textContent).toContain(en.audio.upload.mergeSummary(2, '2.0 KB'));

    fixture.componentRef.setInput('isBusy', true);
    fixture.detectChanges();
    expect(submit()).toBe(en.audio.upload.processing);
  });

  it('switches every text when the language changes', () => {
    expect(element.textContent).toContain(en.audio.upload.title);
    expect(element.textContent).toContain(en.audio.uploadStages.idle);

    TestBed.inject(I18nService).use('nl');
    fixture.detectChanges();
    expect(element.textContent).toContain(nl.audio.upload.title);
    expect(element.textContent).toContain(nl.audio.uploadStages.idle);
    expect(submit()).toBe(nl.audio.upload.uploadAndProcess);
  });
});
