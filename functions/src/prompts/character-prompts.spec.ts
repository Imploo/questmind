import { describe, it, expect } from 'vitest';
import { characterResponderPrompt } from './character-responder.prompt';
import { characterJsonGeneratorPrompt } from './character-json-generator.prompt';

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

  it('holds the character schema either way', () => {
    expect(characterJsonGeneratorPrompt('2014')).toContain('"featuresAndTraits"');
    expect(characterJsonGeneratorPrompt('2024')).toContain('"featuresAndTraits"');
  });
});
