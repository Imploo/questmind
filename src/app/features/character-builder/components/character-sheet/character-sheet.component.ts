import { ChangeDetectionStrategy, Component, computed, input, output, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { HttpClient } from '@angular/common/http';
import { httpsCallable } from 'firebase/functions';
import { DndCharacter } from '../../../../shared/models/dnd-character.model';
import { CharacterImage } from '../../../../core/models/schemas/character-image.schema';
import { CharacterImageGalleryComponent } from '../character-image-gallery/character-image-gallery.component';
import { FirebaseService } from '../../../../core/firebase.service';
import { lookupSpellFromJson, SpellDetails } from '../../../../shared/utils/spell-lookup';
import { lookupFeatureFromJson, FeatureDetails } from '../../../../shared/utils/feature-lookup';

export interface SpellResolvedEvent {
  spellName: string;
  description: string;
  usage: string;
}

export interface FeatureResolvedEvent {
  featureName: string;
  description: string;
}

@Component({
  selector: 'app-character-sheet',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, MatProgressBarModule, CharacterImageGalleryComponent],
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
          @if (character().playerName) {
            <div class="text-xs opacity-50 mt-1">Player: {{ character().playerName }}</div>
          }
          @if (character().experiencePoints) {
            <div class="text-xs opacity-50">XP: {{ character().experiencePoints }}</div>
          }
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
                    <span>Initiative</span>
                    <span>{{ character().initiative >= 0 ? '+' : '' }}{{ character().initiative }}</span>
                </div>
                <div class="flex justify-between gap-4">
                    <span>Speed</span>
                    <span>{{ character().speed }} ft</span>
                </div>
                <div class="flex justify-between gap-4">
                    <span>Hit Dice</span>
                    <span>{{ character().hitDice.current }}/{{ character().hitDice.total }}{{ character().hitDice.die }}</span>
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

          <!-- Saving Throws -->
          <div class="card bg-base-100 shadow-sm border border-base-200">
            <div class="card-body p-4">
              <h3 class="card-title text-sm uppercase tracking-wider border-b pb-2 mb-2">Saving Throws</h3>
              <ul class="space-y-1 text-sm">
                @for (st of savingThrowsList; track st.key) {
                  <li class="flex justify-between items-center">
                    <span [class.font-bold]="st.proficient">
                      {{ st.proficient ? '●' : '○' }} {{ st.label }}
                    </span>
                    <span>{{ st.modifier >= 0 ? '+' : '' }}{{ st.modifier }}</span>
                  </li>
                }
              </ul>
              <div class="flex justify-between items-center text-sm mt-3 pt-2 border-t border-base-300">
                <span class="font-semibold">Passive Wisdom</span>
                <span class="font-bold">{{ character().passiveWisdom }}</span>
              </div>
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
                            class="flex items-center justify-between cursor-pointer select-none hover:bg-base-200 -mx-2 px-2 py-1 rounded transition-colors"
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
                                <mat-progress-bar mode="indeterminate"></mat-progress-bar>
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

          <!-- Death Saves -->
          @if (character().deathSaves.successes > 0 || character().deathSaves.failures > 0) {
            <div class="card bg-base-100 shadow-sm border border-base-200">
              <div class="card-body p-4">
                <h3 class="card-title text-sm uppercase tracking-wider border-b pb-2 mb-2">Death Saves</h3>
                <div class="flex justify-between text-sm">
                  <div>
                    <span class="opacity-60">Successes:</span>
                    <span class="ml-2 flex gap-1 inline-flex">
                      @for (i of [0, 1, 2]; track i) {
                        <span class="w-3 h-3 rounded-full border-2 inline-block"
                          [class.bg-success]="i < character().deathSaves.successes"
                          [class.border-success]="i < character().deathSaves.successes"
                          [class.border-base-300]="i >= character().deathSaves.successes"
                        ></span>
                      }
                    </span>
                  </div>
                  <div>
                    <span class="opacity-60">Failures:</span>
                    <span class="ml-2 flex gap-1 inline-flex">
                      @for (i of [0, 1, 2]; track i) {
                        <span class="w-3 h-3 rounded-full border-2 inline-block"
                          [class.bg-error]="i < character().deathSaves.failures"
                          [class.border-error]="i < character().deathSaves.failures"
                          [class.border-base-300]="i >= character().deathSaves.failures"
                        ></span>
                      }
                    </span>
                  </div>
                </div>
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
                        <td>{{ (attack.bonus ?? 0) >= 0 ? '+' : '' }}{{ attack.bonus ?? 0 }}</td>
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
              <div class="space-y-2">
                @for (feature of character().featuresAndTraits; track $index) {
                  <div class="pb-2 last:pb-0">
                    @if (isString(feature)) {
                      <div class="font-bold text-sm">{{ feature }}</div>
                    } @else {
                      <div>
                        <div
                          class="flex items-center justify-between cursor-pointer select-none hover:bg-base-200 -mx-2 px-2 py-1 rounded transition-colors"
                          (click)="toggleFeature($index, feature)"
                        >
                          <div class="flex items-center gap-2 flex-1">
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              class="h-3 w-3 transition-transform"
                              [class.rotate-90]="expandedFeatures().has($index)"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                            >
                              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                            </svg>
                            <span class="font-bold text-sm">{{ feature.name }}</span>
                          </div>
                          @if (feature.source) {
                            <span class="badge badge-xs badge-ghost shrink-0">{{ feature.source }}</span>
                          }
                        </div>
                        @if (expandedFeatures().has($index)) {
                          <div class="ml-5 mt-2 text-xs opacity-70">
                            @if (loadingFeatures().has($index)) {
                              <mat-progress-bar mode="indeterminate"></mat-progress-bar>
                            } @else if (feature.description) {
                              <div class="whitespace-pre-line">{{ feature.description }}</div>
                            } @else {
                              <span class="italic opacity-50">No description available</span>
                            }
                          </div>
                        }
                      </div>
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
                <div class="badge badge-neutral">EP: {{ character().coins.ep }}</div>
                <div class="badge badge-neutral">GP: {{ character().coins.gp }}</div>
                <div class="badge badge-neutral">PP: {{ character().coins.pp }}</div>
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

      <!-- Personality & Flavor -->
      @if (character().personalityTraits || character().ideals || character().bonds || character().flaws) {
        <div class="card bg-base-100 shadow-sm border border-base-200">
          <div class="card-body p-4">
            <h3 class="card-title text-sm uppercase tracking-wider border-b pb-2 mb-2">Personality</h3>
            <div class="space-y-3 text-sm">
              @if (character().personalityTraits) {
                <div>
                  <div class="font-bold text-xs uppercase opacity-60 mb-1">Personality Traits</div>
                  <p class="whitespace-pre-line">{{ character().personalityTraits }}</p>
                </div>
              }
              @if (character().ideals) {
                <div>
                  <div class="font-bold text-xs uppercase opacity-60 mb-1">Ideals</div>
                  <p class="whitespace-pre-line">{{ character().ideals }}</p>
                </div>
              }
              @if (character().bonds) {
                <div>
                  <div class="font-bold text-xs uppercase opacity-60 mb-1">Bonds</div>
                  <p class="whitespace-pre-line">{{ character().bonds }}</p>
                </div>
              }
              @if (character().flaws) {
                <div>
                  <div class="font-bold text-xs uppercase opacity-60 mb-1">Flaws</div>
                  <p class="whitespace-pre-line">{{ character().flaws }}</p>
                </div>
              }
            </div>
          </div>
        </div>
      }

      <!-- Appearance -->
      @if (character().appearance) {
        <div class="card bg-base-100 shadow-sm border border-base-200">
          <div class="card-body p-4">
            <h3 class="card-title text-sm uppercase tracking-wider border-b pb-2 mb-2">Appearance</h3>
            @if (hasAppearanceDetails()) {
              <div class="flex flex-wrap gap-x-6 gap-y-2 text-sm mb-3">
                @if (character().appearance!.age) {
                  <div><span class="opacity-60">Age:</span> {{ character().appearance!.age }}</div>
                }
                @if (character().appearance!.height) {
                  <div><span class="opacity-60">Height:</span> {{ character().appearance!.height }}</div>
                }
                @if (character().appearance!.weight) {
                  <div><span class="opacity-60">Weight:</span> {{ character().appearance!.weight }}</div>
                }
                @if (character().appearance!.eyes) {
                  <div><span class="opacity-60">Eyes:</span> {{ character().appearance!.eyes }}</div>
                }
                @if (character().appearance!.skin) {
                  <div><span class="opacity-60">Skin:</span> {{ character().appearance!.skin }}</div>
                }
                @if (character().appearance!.hair) {
                  <div><span class="opacity-60">Hair:</span> {{ character().appearance!.hair }}</div>
                }
              </div>
            }
            @if (character().appearance!.description) {
              <p class="text-sm whitespace-pre-line">{{ character().appearance!.description }}</p>
            }
          </div>
        </div>
      }

      <!-- Backstory -->
      @if (character().backstory) {
        <div class="card bg-base-100 shadow-sm border border-base-200">
          <div class="card-body p-4">
            <h3 class="card-title text-sm uppercase tracking-wider border-b pb-2 mb-2">Backstory</h3>
            <p class="text-sm whitespace-pre-line">{{ character().backstory }}</p>
          </div>
        </div>
      }
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
  featureResolved = output<FeatureResolvedEvent>();

  expandedSpells = signal<Set<number>>(new Set());
  loadingSpells = signal<Set<number>>(new Set());
  expandedFeatures = signal<Set<number>>(new Set());
  loadingFeatures = signal<Set<number>>(new Set());

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

  async toggleFeature(
    index: number,
    feature: string | { name: string; description?: string; source?: string }
  ): Promise<void> {
    const isExpanding = !this.expandedFeatures().has(index);
    this.expandedFeatures.update(set => {
      const s = new Set(set);
      if (isExpanding) {
        s.add(index);
      } else {
        s.delete(index);
      }
      return s;
    });

    if (!isExpanding || typeof feature === 'string' || feature.description) return;

    this.loadingFeatures.update(s => new Set([...s, index]));
    try {
      // 1. Try static ClassFeature.json first
      const local: FeatureDetails | null = await lookupFeatureFromJson(this.http, feature.name);
      if (local) {
        this.featureResolved.emit({ featureName: feature.name, ...local });
        return;
      }

      // 2. Fallback: resolveFeature Cloud Function
      const fn = httpsCallable<unknown, { description: string }>(
        this.firebase.requireFunctions(),
        'resolveFeature'
      );
      const character = this.character();
      const result = await fn({
        characterId: this.characterId(),
        featureName: feature.name,
        featureSource: feature.source,
        characterClass: character.class,
        characterRace: character.race,
      });
      this.featureResolved.emit({ featureName: feature.name, ...result.data });
    } catch (e) {
      console.error('Failed to resolve feature details:', e);
    } finally {
      this.loadingFeatures.update(s => {
        const n = new Set(s);
        n.delete(index);
        return n;
      });
    }
  }

  hasAppearanceDetails = computed(() => {
    const a = this.character().appearance;
    return !!(a?.age || a?.height || a?.weight || a?.eyes || a?.skin || a?.hair);
  });

  get savingThrowsList() {
    const st = this.character().savingThrows;
    return [
      { key: 'strength', label: 'STR', ...st.strength },
      { key: 'dexterity', label: 'DEX', ...st.dexterity },
      { key: 'constitution', label: 'CON', ...st.constitution },
      { key: 'intelligence', label: 'INT', ...st.intelligence },
      { key: 'wisdom', label: 'WIS', ...st.wisdom },
      { key: 'charisma', label: 'CHA', ...st.charisma },
    ];
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
      .map(([level, data]) => {
        const slotData = data as { total?: number; expended?: number };
        return {
          level: parseInt(level),
          total: slotData.total || 0,
          expended: slotData.expended || 0,
        };
      })
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
