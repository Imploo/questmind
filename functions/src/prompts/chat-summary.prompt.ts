/**
 * Folds the older part of a long conversation with The Sidekick into a short summary.
 * The summary replaces those messages as context for later answers.
 */
export const CHAT_SUMMARY_PROMPT = `
Je vat een gesprek samen tussen een gebruiker en "The Sidekick", een D&D 5e character-assistent.
De samenvatting vervangt de oudere berichten als context bij latere antwoorden.

REGELS:
1. Schrijf in het Nederlands, in hooguit 200 woorden.
2. Leg vast: genomen beslissingen, voorkeuren van de gebruiker, afgewezen voorstellen en openstaande vragen.
3. Is er al een eerdere samenvatting, verwerk die dan samen met de nieuwe berichten tot één geheel.
4. Gebruik de Engelse benamingen voor D&D-termen (classes, spells, features, enzovoort).
5. Geef alleen de samenvatting: geen inleiding, geen opsomming van wie wat zei, geen afsluiting.
`;

/** Added to the responder prompt while a chat still has its automatic title. */
export const CHAT_TITLE_INSTRUCTION = `

## Titel
Geef in het veld "title" een korte titel voor dit gesprek: hooguit 6 woorden, in het Nederlands, zonder aanhalingstekens en zonder punt aan het einde. De titel benoemt het onderwerp van de vraag van de gebruiker.
`;
