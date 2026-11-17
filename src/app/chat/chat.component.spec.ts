import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { ChatComponent } from './chat.component';
import { ChatService } from './chat.service';
import { ChatConversation, Message } from './chat.models';
import { en } from '../core/i18n/en';
import { I18nService } from '../core/i18n/i18n.service';
import type { LanguageCode } from '../core/i18n/language-strategy';
import { nl } from '../core/i18n/nl';
import { provideTestLanguage } from '../core/i18n/testing';
import { isImageRequest } from './chat-view';

describe('ChatComponent', () => {
  let fixture: ComponentFixture<ChatComponent>;
  let component: ChatComponent;
  let element: HTMLElement;

  const messages = signal<Message[]>([]);
  const chatService = {
    messages,
    conversations: signal<ChatConversation[]>([]),
    activeChatId: signal<string | null>(null),
    activeConversation: signal<ChatConversation | null>(null),
    hasMoreConversations: signal(false),
    hasEarlierMessages: signal(false),
    isBusy: signal(false),
    setCurrentCharacter: vi.fn(),
    isImageGenerationRequest: (text: string) => isImageRequest(text),
    send: vi.fn(),
    newChat: vi.fn(),
  };

  const setup = async (language?: LanguageCode) => {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        ...(language ? [provideTestLanguage(language)] : []),
        { provide: ChatService, useValue: chatService },
      ],
    });
    fixture = TestBed.createComponent(ChatComponent);
    component = fixture.componentInstance;
    element = fixture.nativeElement as HTMLElement;
    await fixture.whenStable();
  };

  const text = () => element.textContent ?? '';
  const input = () => element.querySelector<HTMLInputElement>('input[type="text"]');
  const at = (day: Date, hour: number, minute: number) =>
    new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour, minute);

  beforeEach(() => {
    vi.clearAllMocks();
    TestBed.resetTestingModule();
    messages.set([]);
    chatService.hasEarlierMessages.set(false);
  });

  it('invites to ask something, in English unless another language is chosen', async () => {
    await setup();

    expect(text()).toContain(en.chat.emptyTitle);
    expect(text()).toContain(en.chat.emptyExample);
    expect(input()?.getAttribute('placeholder')).toBe(en.chat.composer.placeholder);
    expect(input()?.getAttribute('aria-label')).toBe(en.chat.composer.messageLabel);
    expect(text()).toContain(en.chat.composer.send);
  });

  it('switches language while a conversation is open, and leaves the conversation itself alone', async () => {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    messages.set([
      { id: 'q', sender: 'user', text: 'Welke spells passen bij mij?', timestamp: at(yesterday, 9, 5) },
      { id: 'a', sender: 'ai', text: 'Kies Hypnotic Pattern.', timestamp: at(new Date(), 0, 0) },
    ]);
    chatService.hasEarlierMessages.set(true);
    await setup('nl');

    const days = () => [...element.querySelectorAll('.day')].map(day => day.textContent?.trim());
    expect(days()).toEqual(['Gisteren', 'Vandaag']);
    expect(text()).toContain('Jij');
    expect(text()).toContain('Eerdere berichten laden');
    expect(input()?.getAttribute('placeholder')).toBe(nl.chat.composer.placeholder);

    TestBed.inject(I18nService).use('en');
    await fixture.whenStable();

    expect(days()).toEqual(['Yesterday', 'Today']);
    expect(text()).toContain('You');
    expect(text()).toContain('The Sidekick');
    expect(text()).toContain(en.chat.loadEarlierMessages);
    expect(input()?.getAttribute('placeholder')).toBe(en.chat.composer.placeholder);
    expect(text()).toContain('Welke spells passen bij mij?');
    expect(text()).toContain('Kies Hypnotic Pattern.');
    expect(text()).toContain('09:05');
  });

  it('puts a translated heading over the ability score warnings and shows them as stored', async () => {
    const warning = 'Point buy costs 36 points, the maximum is 27';
    messages.set([{
      id: 'u',
      sender: 'system',
      text: nl.chat.characterUpdate.done,
      timestamp: new Date(),
      versionNumber: 7,
      abilityScoreWarnings: [warning],
    }]);
    await setup('nl');

    expect(text()).toContain('De ability scores volgen de regels niet:');
    expect(text()).toContain(nl.chat.abilityScoreWarningsHint);
    expect(text()).toContain(warning);
    expect(text()).toContain('versie 7');

    TestBed.inject(I18nService).use('en');
    await fixture.whenStable();

    expect(text()).toContain(en.chat.abilityScoreWarningsTitle);
    expect(text()).toContain(warning);
    expect(text()).toContain('version 7');
  });

  describe('a PDF without a message', () => {
    const pdf = { type: 'pdf', fileName: 'mira.pdf', mimeType: 'application/pdf', data: 'AAAA' } as const;

    it('is sent with the request to import it, in English', async () => {
      await setup();

      component.sendAttachment(pdf);

      expect(chatService.send).toHaveBeenCalledWith(en.chat.composer.importCharacterMessage, pdf);
    });

    it('is sent with that request in Dutch when the app is Dutch', async () => {
      await setup('nl');

      component.sendAttachment(pdf);

      expect(chatService.send).toHaveBeenCalledWith('Importeer dit karakter', pdf);
    });

    it('keeps the words of the user when there are any', async () => {
      await setup('nl');
      component.newMessage.set('  Gebruik de 2024 regels  ');

      component.sendAttachment(pdf);

      expect(chatService.send).toHaveBeenCalledWith('Gebruik de 2024 regels', pdf);
    });

    it('changes the placeholder of the field while it is attached', async () => {
      await setup();
      component.pendingAttachment.set(pdf);
      await fixture.whenStable();

      expect(input()?.getAttribute('placeholder')).toBe(en.chat.composer.placeholderWithAttachment);
    });
  });

  it.each<[LanguageCode, string]>([
    ['nl', 'maak afbeelding'],
    ['en', 'generate image'],
  ])('starts an image request in the active language (%s)', async (language, trigger) => {
    await setup(language);

    component.insertImageTrigger();
    await fixture.whenStable();

    expect(component.newMessage()).toBe(trigger);
    expect(component.isImageMode()).toBe(true);
  });

  it('explains in the active language why a file cannot be attached', async () => {
    await setup('nl');
    const picker = element.querySelector<HTMLInputElement>('input[type="file"]');
    const image = new File(['x'], 'mira.png', { type: 'image/png' });
    Object.defineProperty(picker, 'files', { value: [image], configurable: true });

    picker?.dispatchEvent(new Event('change'));
    await vi.waitFor(() => expect(component.error()).not.toBe(''));
    await fixture.whenStable();

    expect(component.error()).toBe(nl.chat.attachment.notPdf);
    expect(component.pendingAttachment()).toBeNull();
    expect(element.querySelector('[role="alert"]')?.textContent).toContain(nl.chat.attachment.notPdf);
  });
});
