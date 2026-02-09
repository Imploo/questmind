import { Component, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DndCharacter } from '../../../../shared/schemas/dnd-character.schema';

@Component({
  selector: 'app-character-sheet',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="p-8 max-w-4xl mx-auto space-y-8">
      <!-- Header -->
      <div class="flex justify-between items-start border-b border-base-300 pb-6">
        <div>
          <h1 class="text-4xl font-bold font-serif">{{ character().name }}</h1>
          <div class="text-lg opacity-70 mt-2">
            {{ character().race }} {{ character().class }} (Lvl {{ character().level }})
          </div>
          <div class="text-sm opacity-60 mt-1">
            {{ character().background }} • {{ character().alignment }}
          </div>
        </div>
        
        <div class="flex flex-col items-end gap-2">
            <button class="btn btn-sm btn-ghost" (click)="viewHistory.emit()">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                History
            </button>
            <div class="flex flex-col gap-1 text-sm font-semibold bg-base-200 rounded-lg px-4 py-3 shadow min-w-48">
                <div class="flex justify-between gap-4">
                    <span>AC</span>
                    <span>{{ character().armorClass }}</span>
                </div>
                <div class="flex justify-between gap-4">
                    <span>HP</span>
                    <span>{{ character().hitPoints.current }}/{{ character().hitPoints.max }}</span>
                </div>
                <div class="flex justify-between gap-4">
                    <span>Speed</span>
                    <span>{{ character().speed }}</span>
                </div>
            </div>
        </div>
      </div>

      <!-- Ability Scores -->
      <div class="grid grid-cols-3 md:grid-cols-6 gap-4">
        @for (ability of abilities; track ability.key) {
          <div class="flex flex-col items-center p-3 bg-base-200 rounded-xl border border-base-300">
            <span class="text-xs font-bold uppercase tracking-wider opacity-60">{{ ability.label }}</span>
            <span class="text-2xl font-bold my-1">{{ ability.value.score }}</span>
            <span class="badge badge-sm" [class.badge-primary]="ability.value.modifier > 0">
              {{ ability.value.modifier >= 0 ? '+' : '' }}{{ ability.value.modifier }}
            </span>
          </div>
        }
      </div>

      <!-- Main Content Grid -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
        
        <!-- Left Column -->
        <div class="space-y-6">
          <!-- Skills -->
          <div class="card bg-base-100 shadow-sm border border-base-200">
            <div class="card-body p-4">
              <h3 class="card-title text-sm uppercase tracking-wider border-b pb-2 mb-2">Skills</h3>
              <ul class="space-y-1 text-sm">
                @for (skill of allSkills; track skill.name) {
                  <li class="flex justify-between items-center">
                    <span [class.font-bold]="skill.proficient">
                      {{ skill.proficient ? '●' : '○' }} {{ skill.name }}
                    </span>
                    <span>{{ skill.modifier >= 0 ? '+' : '' }}{{ skill.modifier }}</span>
                  </li>
                }
              </ul>
            </div>
          </div>

          <!-- Proficiencies -->
          <div class="card bg-base-100 shadow-sm border border-base-200">
            <div class="card-body p-4">
              <h3 class="card-title text-sm uppercase tracking-wider border-b pb-2 mb-2">Proficiencies & Languages</h3>
              <div class="space-y-1 mb-3">
                @for (prof of character().proficiencies; track prof) {
                  <div class="text-sm">• {{ prof }}</div>
                }
              </div>
              <div class="flex flex-wrap gap-1">
                @for (lang of character().languages; track lang) {
                  <span class="badge badge-ghost">{{ lang }}</span>
                }
              </div>
            </div>
          </div>
        </div>

        <!-- Right Column -->
        <div class="space-y-6">
           <!-- Attacks -->
           <div class="card bg-base-100 shadow-sm border border-base-200">
            <div class="card-body p-4">
              <h3 class="card-title text-sm uppercase tracking-wider border-b pb-2 mb-2">Attacks</h3>
              <div class="overflow-x-auto">
                <table class="table table-xs">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Bonus</th>
                      <th>Damage</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (attack of character().attacks; track attack.name) {
                      <tr>
                        <td class="font-bold">{{ attack.name }}</td>
                        <td>{{ attack.bonus >= 0 ? '+' : '' }}{{ attack.bonus }}</td>
                        <td>{{ attack.damage }} {{ attack.type }}</td>
                      </tr>
                    } @empty {
                      <tr><td colspan="3" class="text-center opacity-50">No attacks configured</td></tr>
                    }
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <!-- Features -->
          <div class="card bg-base-100 shadow-sm border border-base-200">
            <div class="card-body p-4">
              <h3 class="card-title text-sm uppercase tracking-wider border-b pb-2 mb-2">Features & Traits</h3>
              <div class="space-y-3">
                @for (feature of character().featuresAndTraits; track $index) {
                  <div>
                    @if (isString(feature)) {
                      <div class="font-bold text-sm">{{ feature }}</div>
                    } @else {
                      <div class="font-bold text-sm">{{ feature.name }}</div>
                      @if (feature.description) {
                        <p class="text-xs opacity-70">{{ feature.description }}</p>
                      }
                      @if (feature.source) {
                        <span class="badge badge-xs badge-ghost mt-1">{{ feature.source }}</span>
                      }
                    }
                  </div>
                } @empty {
                  <div class="text-center opacity-50 text-sm">No features yet</div>
                }
              </div>
            </div>
          </div>
          
           <!-- Inventory -->
           <div class="card bg-base-100 shadow-sm border border-base-200">
            <div class="card-body p-4">
              <h3 class="card-title text-sm uppercase tracking-wider border-b pb-2 mb-2">Inventory</h3>
              <div class="flex flex-wrap gap-2 mb-4">
                <div class="badge badge-neutral">CP: {{ character().coins.cp }}</div>
                <div class="badge badge-neutral">SP: {{ character().coins.sp }}</div>
                <div class="badge badge-neutral">GP: {{ character().coins.gp }}</div>
              </div>
              <ul class="list-disc list-inside text-sm opacity-80">
                @for (item of character().equipment; track item) {
                  <li>{{ item }}</li>
                }
              </ul>
            </div>
          </div>

        </div>
      </div>
    </div>
  `
})
export class CharacterSheetComponent {
  character = input.required<DndCharacter>();
  characterName = input.required<string>();
  viewHistory = output<void>();

  get abilities() {
    const c = this.character();
    return [
      { key: 'strength', label: 'STR', value: c.abilities.strength },
      { key: 'dexterity', label: 'DEX', value: c.abilities.dexterity },
      { key: 'constitution', label: 'CON', value: c.abilities.constitution },
      { key: 'intelligence', label: 'INT', value: c.abilities.intelligence },
      { key: 'wisdom', label: 'WIS', value: c.abilities.wisdom },
      { key: 'charisma', label: 'CHA', value: c.abilities.charisma },
    ];
  }

  isString(value: any): value is string {
    return typeof value === 'string';
  }

  get allSkills() {
    const c = this.character();
    const characterSkills = c.skills;

    // All D&D 5e skills with their associated ability
    const allDndSkills = [
      { name: 'Acrobatics', ability: 'dexterity' },
      { name: 'Animal Handling', ability: 'wisdom' },
      { name: 'Arcana', ability: 'intelligence' },
      { name: 'Athletics', ability: 'strength' },
      { name: 'Deception', ability: 'charisma' },
      { name: 'History', ability: 'intelligence' },
      { name: 'Insight', ability: 'wisdom' },
      { name: 'Intimidation', ability: 'charisma' },
      { name: 'Investigation', ability: 'intelligence' },
      { name: 'Medicine', ability: 'wisdom' },
      { name: 'Nature', ability: 'intelligence' },
      { name: 'Perception', ability: 'wisdom' },
      { name: 'Performance', ability: 'charisma' },
      { name: 'Persuasion', ability: 'charisma' },
      { name: 'Religion', ability: 'intelligence' },
      { name: 'Sleight of Hand', ability: 'dexterity' },
      { name: 'Stealth', ability: 'dexterity' },
      { name: 'Survival', ability: 'wisdom' },
    ];

    return allDndSkills.map(skill => {
      const charSkill = characterSkills.find(s => s.name === skill.name);
      if (charSkill) {
        return charSkill;
      }

      // Calculate modifier based on ability score
      const abilityKey = skill.ability as keyof typeof c.abilities;
      const modifier = c.abilities[abilityKey].modifier;

      return {
        name: skill.name,
        proficient: false,
        modifier: modifier
      };
    });
  }
}
