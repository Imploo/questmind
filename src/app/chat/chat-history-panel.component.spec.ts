import { beforeEach, describe, expect, it } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { Timestamp } from 'firebase/firestore';
import { ChatHistoryPanelComponent } from './chat-history-panel.component';
import { ChatConversation } from './chat.models';
import { en } from '../core/i18n/en';
import { I18nService } from '../core/i18n/i18n.service';
import type { LanguageCode } from '../core/i18n/language-strategy';
import { nl } from '../core/i18n/nl';
import { provideTestLanguage } from '../core/i18n/testing';

describe('ChatHistoryPanelComponent', () => {
  let fixture: ComponentFixture<ChatHistoryPanelComponent>;
  let element: HTMLElement;

  const conversation = (id: string, updatedAt: Date, overrides: Partial<ChatConversation> = {}): ChatConversation => ({
    id,
    title: `Gesprek ${id}`,
    titleSource: 'ai',
    lastMessagePreview: 'Ik voeg Hypnotic Pattern toe.',
    createdAt: Timestamp.fromDate(updatedAt),
    updatedAt: Timestamp.fromDate(updatedAt),
    ...overrides,
  });
  const today = new Date();
  const longAgo = new Date(2020, 0, 15, 12);

  const setup = async (conversations: ChatConversation[], language?: LanguageCode) => {
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), ...(language ? [provideTestLanguage(language)] : [])],
    });
    fixture = TestBed.createComponent(ChatHistoryPanelComponent);
    fixture.componentRef.setInput('open', true);
    fixture.componentRef.setInput('conversations', conversations);
    fixture.componentRef.setInput('characterName', 'Mira');
    element = fixture.nativeElement as HTMLElement;
    await fixture.whenStable();
  };

  const text = () => element.textContent ?? '';
  const headings = () => [...element.querySelectorAll('.qm-eyebrow')].map(heading => heading.textContent?.trim());
  const buttonWithText = (label: string) =>
    [...element.querySelectorAll('button')].find(button => button.textContent?.trim() === label);

  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  it('is in English unless another language is chosen', async () => {
    await setup([conversation('a', today), conversation('b', longAgo, { updatedCharacter: true, lastVersionNumber: 4, hasImages: true })]);

    expect(element.querySelector('[role="dialog"]')?.getAttribute('aria-label')).toBe(en.chat.earlierConversations);
    expect(text()).toContain(en.chat.history.title);
    expect(text()).toContain(en.chat.history.withCharacter('Mira'));
    expect(text()).toContain(en.chat.newConversation);
    expect(element.querySelector('input[type="search"]')?.getAttribute('placeholder')).toBe(en.chat.history.search);
    expect(headings()).toEqual([en.chat.today, en.chat.history.older]);
    expect(text()).toContain(en.chat.history.updated(4));
    expect(text()).toContain(en.chat.history.hasImages);
    expect(text()).toContain('15 Jan 2020');
  });

  it('switches to the other language while it is open', async () => {
    await setup([conversation('a', today), conversation('b', longAgo, { updatedCharacter: true })], 'nl');

    expect(headings()).toEqual(['Vandaag', 'Ouder']);
    expect(text()).toContain('Gesprekken');
    expect(text()).toContain('met Mira');
    expect(text()).toContain('Aangepast');
    expect(text()).toContain('15 jan 2020');

    TestBed.inject(I18nService).use('en');
    await fixture.whenStable();

    expect(headings()).toEqual(['Today', 'Older']);
    expect(text()).toContain('with Mira');
    expect(text()).toContain('Updated');
    expect(text()).toContain('15 Jan 2020');
    expect(text()).not.toContain('Gesprekken');
  });

  it('shows titles and previews as they were stored', async () => {
    await setup([conversation('a', today, { title: 'Spells voor level 5' })]);

    expect(text()).toContain('Spells voor level 5');
    expect(text()).toContain('Ik voeg Hypnotic Pattern toe.');
  });

  it('names the conversation in the label of its actions and when asking to delete it', async () => {
    await setup([conversation('a', today, { title: 'Multiclass?' })], 'nl');

    const actions = element.querySelector<HTMLButtonElement>(`button[aria-label="${nl.chat.history.actionsFor('Multiclass?')}"]`);
    expect(actions).not.toBeNull();
    actions?.click();
    await fixture.whenStable();

    expect(buttonWithText(nl.common.rename)).toBeDefined();
    buttonWithText(nl.common.delete)?.click();
    await fixture.whenStable();

    expect(text()).toContain('"Multiclass?" verwijderen? Dit kan niet ongedaan worden gemaakt.');
    expect(buttonWithText(nl.common.cancel)).toBeDefined();
  });

  it('says so when there is nothing to show', async () => {
    await setup([]);
    expect(text()).toContain(en.chat.history.empty);

    fixture.componentInstance.query.set('warlock');
    await fixture.whenStable();
    expect(text()).toContain(en.chat.history.noResults('warlock'));
  });
});
