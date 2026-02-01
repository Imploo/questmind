# PDF Character Sheet Generator Spec Plan

## Overview
Implement a D&D 5e character sheet generator with:
- Integration with pdfMake for PDF generation
- Support for D&D 5e character sheet templates (e.g., [https://www.dndbeyond.com/character-sheets](https://www.dndbeyond.com/character-sheets))
- Dynamic content population from character form data

## Key Requirements
1. **Template Support**
   - Use D&D 5e character sheet templates (PDF or JSON format)
   - Support for:
     - Stat blocks with modifiers
     - Spell lists from *Player's Handbook* and *Xanathar's Guide*
     - Equipment and magic items

2. **Technical Implementation**
   - Create `generator.service.ts` with:
     ```ts
     generatePDF(character: Character): void {
       const docDefinition = {
         content: [
           { text: 'Character Sheet', style: 'header' },
           { text: `Name: ${character.name}`, style: 'subheader' },
           // Add tables, lists, etc.
         ],
         styles: {
           header: { fontSize: 20, bold: true },
           subheader: { fontSize: 14 }
         }
       };
       pdfMake.createPdf(docDefinition).open();
     }
     ```
   - Define JSON templates in `assets/pdf-templates/dnd5e-character.json`:
     ```json
     {
       "header": "Character Name: {{character.name}}",
       "race": "{{character.race}}",
       "class": "{{character.class}} ({{character.subclass}})",
       "statsTable": [
         ["Strength", "{{character.stats.strength | modifier}}"],
         // ...
       ],
       "spellSlots": {
         "Level 1": "{{character.spellSlots[0]}}",
         "Level 2": "{{character.spellSlots[1]}}"
       }
     }
     ```

3. **User Experience**
   - Add "Export PDF" button in character form
   - Display preview of generated sheet before download

## Mock Development
- Implement placeholder template with sample character data
- Create mock PDF generation using static content
- Connect to character form data once backend is ready