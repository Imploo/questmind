# Dynamic Character Form Builder Spec Plan

## Overview
Implement a D&D 5e-compliant character form with:
- Fields for race, class, subclass, ability scores, background, equipment, spell slots, and class features
- Rule-based validation (e.g., "Strength modifier must be at least +1 for a fighter")
- Integration with AI chat module for rule suggestions

## Key Requirements
1. **D&D 5e Compliance**
   - Validate stats against official 2014 ruleset
   - Support for *Tasha's Cauldron* and *Xanathar's Guide* features

2. **Form Functionality**
   - Ability score sliders with real-time modifier calculation
   - Class-specific feature selectors (e.g., spell lists for wizards)
   - Background trait selections with associated bonuses

3. **Technical Requirements**
   - Use Angular Reactive Forms with Signals for state management
   - Implement validation rules for:
     - Minimum ability score requirements by class
     - Spell slot progression by level
     - Class feature prerequisites

## Technical Implementation
- Create `form.component.ts` with:
  ```ts
  interface Character {
    name: string;
    race: string;
    class: string; // e.g., "Wizard"
    subclass: string; // e.g., "School of Evocation"
    stats: {
      strength: number;
      dexterity: number;
      constitution: number;
      intelligence: number;
      wisdom: number;
      charisma: number;
    };
    background: string; // e.g., "Acolyte"
    equipment: string[];
    spellSlots: number[]; // e.g., [3, 2, 1] for wizard level 5
    classFeatures: string[];
  }
  ```
- Develop `form.service.ts` with validation logic:
  ```ts
  validateStrengthModifier(modifier: number, className: string): boolean {
    // Example rule: Fighter requires Strength modifier ≥ +1
    if (className === 'Fighter' && modifier < 1) {
      return false;
    }
    return true;
  }
  ```
- Integrate with AI chat module for rule suggestions:
  ```ts
  // Example: When user selects "Warlock" class
  aiService.suggest("What class features does a warlock get?");
  ```

## Mock Development
- Implement placeholder validation rules during frontend development
- Create mock data for class features and spell lists
- Connect to AI service for rule validation suggestions