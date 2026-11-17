import { describe, it, expect } from 'vitest';
import { characterResponderPrompt } from './character-responder.prompt';
import { characterJsonGeneratorPrompt } from './character-json-generator.prompt';
import { chatSummaryPrompt, chatTitleInstruction } from './chat-summary.prompt';

describe('characterResponderPrompt', () => {
  it('follows the 2014 books for a 2014 character', () => {
    const prompt = characterResponderPrompt('2014');

    expect(prompt).toContain('## Regelset: D&D 5e 2014');
    expect(prompt).toContain("Player's Handbook (2014 editie)");
    expect(prompt).not.toContain('## Regelset: D&D 5e 2024');
    expect(prompt).toContain('Volg de officiële D&D 5e regels van 2014 strikt');
  });

  it('follows the 2024 books for a 2024 character', () => {
    const prompt = characterResponderPrompt('2024');

    expect(prompt).toContain('## Regelset: D&D 5e 2024');
    expect(prompt).toContain("Player's Handbook (2024 editie)");
    expect(prompt).not.toContain('## Regelset: D&D 5e 2014');
    expect(prompt).toContain('Volg de officiële D&D 5e regels van 2024 strikt');
  });

  it.each([
    ['2014', '2024'],
    ['2024', '2014'],
  ] as const)('converts a character to the %s rules without asking first', (rulesVersion, other) => {
    const prompt = characterResponderPrompt(rulesVersion);

    expect(prompt).toContain(`nog (deels) volgens de regels van ${other} is opgebouwd`);
    expect(prompt).toContain(`bij te werken naar de regels van ${rulesVersion}`);
    expect(prompt).toContain('zet shouldUpdateCharacter op true. Vraag niet eerst om bevestiging');
  });
});

describe('the language The Sidekick answers in', () => {
  const DUTCH_RULE = '4. Antwoord in het Nederlands (in het "text" veld).';
  const ENGLISH_RULE = '4. Antwoord in het Engels (in het "text" veld)';

  it('is Dutch for a Dutch user, and when no language is given', () => {
    for (const prompt of [characterResponderPrompt('2014', 'nl'), characterResponderPrompt('2014')]) {
      expect(prompt).toContain(DUTCH_RULE);
      expect(prompt).not.toContain('Antwoord in het Engels');
    }
  });

  it('is English for an English user', () => {
    const prompt = characterResponderPrompt('2024', 'en');

    expect(prompt).toContain(ENGLISH_RULE);
    expect(prompt).not.toContain('Antwoord in het Nederlands');
  });

  it('leaves the rest of the prompt Dutch, with D&D terms in English, in both languages', () => {
    const rest = (prompt: string) => prompt.replace(/^4\. .*$/m, '');

    expect(rest(characterResponderPrompt('2014', 'en'))).toBe(rest(characterResponderPrompt('2014', 'nl')));
    expect(characterResponderPrompt('2014', 'en')).toContain('Gebruik altijd de Engelse benamingen voor D&D termen');
  });
});

describe('chatSummaryPrompt and chatTitleInstruction', () => {
  it('ask for Dutch for a Dutch user', () => {
    expect(chatSummaryPrompt('nl')).toContain('Schrijf in het Nederlands, in hooguit 200 woorden.');
    expect(chatTitleInstruction('nl')).toContain('hooguit 6 woorden, in het Nederlands,');
  });

  it('ask for English for an English user', () => {
    expect(chatSummaryPrompt('en')).toContain('Schrijf in het Engels, in hooguit 200 woorden.');
    expect(chatSummaryPrompt('en')).not.toContain('het Nederlands');
    expect(chatTitleInstruction('en')).toContain('hooguit 6 woorden, in het Engels,');
    expect(chatTitleInstruction('en')).not.toContain('het Nederlands');
  });

  it('keep D&D terms English in the summary, in both languages', () => {
    for (const language of ['nl', 'en'] as const) {
      expect(chatSummaryPrompt(language)).toContain('Gebruik de Engelse benamingen voor D&D-termen');
    }
  });
});

describe('characterJsonGeneratorPrompt', () => {
  it('records a 2014 character by the 2014 rules', () => {
    const prompt = characterJsonGeneratorPrompt('2014');

    expect(prompt).toContain('Dit karakter gebruikt de D&D 5e regels van 2014');
    expect(prompt).toContain('Racial bonuses volgen de PHB (2014)');
    expect(prompt).toContain('Second Wind (max 1, shortRest)');
    expect(prompt).toContain('Handhaaf de D&D 5e regels van 2014');
    expect(prompt).toContain('Zet "rulesVersion" op "2014".');
  });

  it('records a 2024 character by the 2024 rules', () => {
    const prompt = characterJsonGeneratorPrompt('2024');

    expect(prompt).toContain('Dit karakter gebruikt de herziene D&D 5e regels van 2024');
    expect(prompt).toContain('komen uit de background, niet uit de species');
    expect(prompt).toContain('Second Wind (max 2 op level 1, longRest)');
    expect(prompt).not.toContain('Racial bonuses volgen de PHB (2014)');
    expect(prompt).toContain('Handhaaf de D&D 5e regels van 2024');
    expect(prompt).toContain('Zet "rulesVersion" op "2024".');
  });

  it('asks for a one-sentence summary next to the character', () => {
    const prompt = characterJsonGeneratorPrompt('2014');

    expect(prompt).toContain('{"summary": "...", "character": { ... }}');
    expect(prompt).toContain('**summary**: één korte zin');
  });

  it('asks for every damaging spell in the attack list, with its saving throw', () => {
    const prompt = characterJsonGeneratorPrompt('2014');

    expect(prompt).toContain('neem ELKE spell uit spellcasting.spells op die schade doet');
    expect(prompt).toContain('{"ability": "dexterity", "dc": 15}');
    expect(prompt).toContain('"save":{"type":"object"');
  });

  it('asks for every bonus action and for the reactions, without the opportunity attack', () => {
    const prompt = characterJsonGeneratorPrompt('2014');

    expect(prompt).toContain('ALLES wat het karakter met een bonus action kan doen, ook wat geen schade doet');
    expect(prompt).toContain('Neem de Opportunity Attack NIET op');
    expect(prompt).toContain('"bonusActions":{');
    expect(prompt).toContain('"reactions":{');
  });

  it('holds the character schema either way', () => {
    expect(characterJsonGeneratorPrompt('2014')).toContain('"featuresAndTraits"');
    expect(characterJsonGeneratorPrompt('2024')).toContain('"featuresAndTraits"');
  });
});
