import { describe, it, expect } from 'vitest';
import { isSessionLogLine, sanitizeSessionLog } from './session-log-sanitizer';

describe('isSessionLogLine', () => {
  it.each([
    'DM: Dat mist.',
    'DM [rustig, dreigend]: De deur kraakt open.',
    'Speler (onbekend): Drie plus... is elf om te raken.',
    'Speler (onbekend) [lachend]: Geen lederen tasje, ja.',
    'Wyrir: 14 damage.',
    'Bart de Bonker [boos]: Uit de weg!',
    "Immeral: Ik cast Spirit Guardians.",
    '(Groep: gelach)',
    '[OOC: korte pauze, er wordt taart aangeboden]',
  ])('accepts %s', (line) => {
    expect(isSessionLogLine(line)).toBe(true);
  });

  it.each([
    'Faithful conversation log of the audio clip:',
    'Part of the process involves transcribing the multi-speaker audio accurately.',
    'Here is the log: DM spoke first.',
    'en toen gebeurde er iets',
  ])('rejects %s', (line) => {
    expect(isSessionLogLine(line)).toBe(false);
  });
});

describe('sanitizeSessionLog', () => {
  it('drops leaked preamble lines and keeps log lines in order', () => {
    const raw = [
      'Faithful conversation log of the audio clip:',
      '',
      'DM: Jullie staan voor de poort.',
      '(Groep: gejuich)',
      'Marun [opgewonden]: Ik trap hem open!',
    ].join('\n');

    const { text, dropped } = sanitizeSessionLog(raw);

    expect(text).toBe('DM: Jullie staan voor de poort.\n(Groep: gejuich)\nMarun [opgewonden]: Ik trap hem open!');
    expect(dropped).toEqual(['Faithful conversation log of the audio clip:']);
  });

  it('recovers a fixed speaker line glued to leaked reasoning', () => {
    const raw =
      'Part of the process involves noting rolls and game mechanics.Speler (onbekend): De deur blijft dicht, jongen.';

    const { text, dropped } = sanitizeSessionLog(raw);

    expect(text).toBe('Speler (onbekend): De deur blijft dicht, jongen.');
    expect(dropped).toEqual(['Part of the process involves noting rolls and game mechanics.']);
  });

  it('returns an empty log when nothing matches', () => {
    expect(sanitizeSessionLog('Ik kan de audio niet goed horen.')).toEqual({
      text: '',
      dropped: ['Ik kan de audio niet goed horen.'],
    });
  });
});
