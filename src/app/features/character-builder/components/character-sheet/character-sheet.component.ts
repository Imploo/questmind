import { ChangeDetectionStrategy, Component, input, output, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { httpsCallable } from 'firebase/functions';
import { DndCharacter } from '../../../../shared/schemas/dnd-character.schema';
import { CharacterImage } from '../../../../core/models/schemas/character-image.schema';
import { CharacterImageGalleryComponent } from '../character-image-gallery/character-image-gallery.component';
import { FirebaseService } from '../../../../core/firebase.service';
import { lookupSpellFromJson, SpellDetails } from '../../../../shared/utils/spell-lookup';

export interface SpellResolvedEvent {
  spellName: string;
  description: string;
  usage: string;
}

@Component({
  selector: 'app-character-sheet',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, CharacterImageGalleryComponent],
  template: `
    <div class="p-2 max-w-4xl mx-auto space-y-8">
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

          <!-- Spells -->
          @if (character().spellcasting?.spells && character().spellcasting!.spells!.length > 0) {
            <div class="card bg-base-100 shadow-sm border border-base-200">
              <div class="card-body p-4">
                <h3 class="card-title text-sm uppercase tracking-wider border-b pb-2 mb-2">Spells</h3>
                <div class="space-y-2">
                  @for (spell of character().spellcasting!.spells; track $index) {
                    <div class="pb-2 last:pb-0">
                      @if (isString(spell)) {
                        <div class="font-bold text-sm">{{ spell }}</div>
                      } @else {
                        <div>
                          <div
                            class="flex items-center justify-between cursor-pointer hover:bg-base-200 -mx-2 px-2 py-1 rounded transition-colors"
                            (click)="toggleSpell($index, spell)"
                          >
                            <div class="flex items-center gap-2 flex-1">
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                class="h-3 w-3 transition-transform"
                                [class.rotate-90]="expandedSpells().has($index)"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                              >
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                              </svg>
                              <span class="font-bold text-sm">{{ spell.name }}</span>
                            </div>
                            <div class="flex gap-1">
                              @if (spell.level !== undefined) {
                                <span class="badge badge-xs badge-ghost shrink-0">
                                  {{ spell.level === 0 ? 'Cantrip' : 'Level ' + spell.level }}
                                </span>
                              }
                              @if (spell.school) {
                                <span class="badge badge-xs badge-ghost">{{ spell.school }}</span>
                              }
                            </div>
                          </div>
                          @if (expandedSpells().has($index)) {
                            <div class="ml-5 mt-2 text-xs opacity-70">
                              @if (loadingSpells().has($index)) {
                                <span class="loading loading-dots loading-xs"></span>
                              } @else if (spell.description) {
                                <div class="whitespace-pre-line">{{ spell.description }}</div>
                                @if (spell.usage) {
                                  <div class="mt-2 font-mono text-xs opacity-60 whitespace-pre-line border-t border-base-300 pt-2">{{ spell.usage }}</div>
                                }
                              } @else {
                                <span class="italic opacity-50">Geen beschrijving beschikbaar</span>
                              }
                            </div>
                          }
                        </div>
                      }
                    </div>
                  }
                </div>
              </div>
            </div>
          }
        </div>

        <!-- Right Column -->
        <div class="space-y-6">
          <!-- Character Images Gallery -->
          @if (images().length > 0) {
            <app-character-image-gallery [images]="images()" [canDelete]="canDelete()" (deleteImage)="deleteImage.emit($event)" />
          }

          <!-- Spellcasting -->
          @let spellcasting = character().spellcasting;
          @if (spellcasting) {
            <div class="card bg-base-100 shadow-sm border border-base-200">
              <div class="card-body p-4">
                <h3 class="card-title text-sm uppercase tracking-wider border-b pb-2 mb-2">Spellcasting</h3>
                <div class="flex gap-4 mb-3 text-sm">
                  @if (spellcasting.spellSaveDc) {
                    <div>
                      <span class="opacity-60">Spell Save DC:</span>
                      <span class="font-bold ml-1">{{ spellcasting.spellSaveDc }}</span>
                    </div>
                  }
                  @if (spellcasting.spellAttackBonus !== undefined) {
                    <div>
                      <span class="opacity-60">Spell Attack:</span>
                      <span class="font-bold ml-1">{{ spellcasting.spellAttackBonus >= 0 ? '+' : '' }}{{ spellcasting.spellAttackBonus }}</span>
                    </div>
                  }
                </div>
                @if (spellSlots.length > 0) {
                  <div class="space-y-2">
                    <div class="text-xs font-bold uppercase opacity-60 mb-1">Spell Slots</div>
                    @for (slot of spellSlots; track slot.level) {
                      <div class="flex items-center justify-between text-sm">
                        <span class="font-semibold">Level {{ slot.level }}</span>
                        <div class="flex gap-1">
                          @for (i of getSlotArray(slot.total); track i) {
                            <div
                              class="w-4 h-4 rounded-sm border-2 transition-colors"
                              [class.bg-primary]="i >= slot.expended"
                              [class.border-primary]="i >= slot.expended"
                              [class.bg-base-200]="i < slot.expended"
                              [class.border-base-300]="i < slot.expended"
                            ></div>
                          }
                        </div>
                      </div>
                    }
                  </div>
                }
              </div>
            </div>
          }

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
  characterId = input<string | null>(null);
  activeVersionId = input<string>('');
  images = input<CharacterImage[]>([]);
  canDelete = input<boolean>(false);
  viewHistory = output<void>();
  deleteImage = output<CharacterImage>();
  spellResolved = output<SpellResolvedEvent>();

  expandedSpells = signal<Set<number>>(new Set());
  loadingSpells = signal<Set<number>>(new Set());

  private readonly http = inject(HttpClient);
  private readonly firebase = inject(FirebaseService);

  async toggleSpell(
    index: number,
    spell: string | { name: string; description?: string; usage?: string; level?: number; school?: string }
  ): Promise<void> {
    const isExpanding = !this.expandedSpells().has(index);
    this.expandedSpells.update(set => {
      const s = new Set(set);
      if (isExpanding) {
        s.add(index);
      } else {
        s.delete(index);
      }
      return s;
    });

    if (!isExpanding || typeof spell === 'string' || spell.description) return;

    this.loadingSpells.update(s => new Set([...s, index]));
    try {
      // 1. Try static Spell.json first
      const local: SpellDetails | null = await lookupSpellFromJson(this.http, spell.name);
      if (local) {
        this.spellResolved.emit({ spellName: spell.name, ...local });
        return;
      }

      // 2. Fallback: resolveSpell Cloud Function
      const fn = httpsCallable<unknown, { description: string; usage: string }>(
        this.firebase.requireFunctions(),
        'resolveSpell'
      );
      const result = await fn({
        characterId: this.characterId(),
        spellName: spell.name,
        spellLevel: spell.level,
        spellSchool: spell.school,
      });
      this.spellResolved.emit({ spellName: spell.name, ...result.data });
    } catch (e) {
      console.error('Failed to resolve spell details:', e);
    } finally {
      this.loadingSpells.update(s => {
        const n = new Set(s);
        n.delete(index);
        return n;
      });
    }
  }

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

  isString(value: unknown): value is string {
    return typeof value === 'string';
  }

  get spellSlots() {
    const spellcasting = this.character().spellcasting;
    if (!spellcasting?.slots) return [];

    if (Array.isArray(spellcasting.slots)) {
      return spellcasting.slots.sort((a, b) => a.level - b.level);
    }

    return Object.entries(spellcasting.slots)
      .map(([level, data]: [string, { total?: number; expended?: number }]) => ({
        level: parseInt(level),
        total: data.total || 0,
        expended: data.expended || 0,
      }))
      .sort((a, b) => a.level - b.level);
  }

  getSlotArray(total: number): number[] {
    return Array.from({ length: total }, (_, i) => i);
  }

  get allSkills() {
    const c = this.character();
    const characterSkills = c.skills;

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
      if (charSkill) return charSkill;

      const abilityKey = skill.ability as keyof typeof c.abilities;
      const modifier = c.abilities[abilityKey].modifier;

      return { name: skill.name, proficient: false, modifier };
    });
  }
}
