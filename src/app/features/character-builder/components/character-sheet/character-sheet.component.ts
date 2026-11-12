import { ChangeDetectionStrategy, Component, computed, input, output, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { DndCharacter, Spell } from '../../../../shared/models/dnd-character.model';
import { CharacterImage } from '../../../../core/models/schemas/character-image.schema';
import { CharacterImageGalleryComponent } from '../character-image-gallery/character-image-gallery.component';
import { ImageLightboxComponent } from '../../../../chat/image-lightbox.component';
import { CharacterEntryResolverService } from '../../../../core/services/character-entry-resolver.service';
import * as logger from '../../../../shared/logger';

export interface SpellResolvedEvent {
  spellName: string;
  description: string;
  usage: string;
}

export interface FeatureResolvedEvent {
  featureName: string;
  description: string;
}

type AbilityKey = 'strength' | 'dexterity' | 'constitution' | 'intelligence' | 'wisdom' | 'charisma';

const ABILITY_LABELS: { key: AbilityKey; label: string; name: string }[] = [
  { key: 'strength', label: 'STR', name: 'Strength' },
  { key: 'dexterity', label: 'DEX', name: 'Dexterity' },
  { key: 'constitution', label: 'CON', name: 'Constitution' },
  { key: 'intelligence', label: 'INT', name: 'Intelligence' },
  { key: 'wisdom', label: 'WIS', name: 'Wisdom' },
  { key: 'charisma', label: 'CHA', name: 'Charisma' },
];

const DND_SKILLS: { name: string; ability: AbilityKey }[] = [
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

interface SpellGroup {
  key: string;
  label: string;
  slot?: { total: number; expended: number };
  entries: { spell: string | Spell; index: number }[];
}

@Component({
  selector: 'app-character-sheet',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, MatProgressBarModule, CharacterImageGalleryComponent, ImageLightboxComponent],
  template: `
    @if (portraitLightbox()) {
      <app-image-lightbox [url]="portraitLightbox()!" (closed)="portraitLightbox.set(null)" />
    }

    <div class="sheet max-w-5xl mx-auto space-y-6">
      <!-- ═══ Hero ═══ -->
      <header class="hero panel">
        <div class="flex flex-col sm:flex-row gap-5 sm:gap-6 items-center sm:items-start">
          <!-- Portrait -->
          <button
            type="button"
            class="portrait shrink-0"
            [class.cursor-zoom-in]="!!portraitUrl()"
            [disabled]="!portraitUrl()"
            [attr.aria-label]="portraitUrl() ? 'Portret vergroten' : null"
            (click)="portraitUrl() && portraitLightbox.set(portraitUrl())"
          >
            @if (portraitUrl()) {
              <img [src]="portraitUrl()" [alt]="'Portret van ' + character().name" class="w-full h-full object-cover" />
            } @else {
              <span class="portrait-initial">{{ initial() }}</span>
            }
            <span class="level-badge" [attr.aria-label]="'Level ' + character().level">{{ character().level }}</span>
          </button>

          <!-- Identity -->
          <div class="flex-1 min-w-0 text-center sm:text-left">
            <div class="eyebrow">Level {{ character().level }} · {{ character().race }} {{ character().class }}</div>
            <h1 class="display text-3xl sm:text-4xl leading-tight mt-1 break-words">{{ character().name }}</h1>

            <div class="flex flex-wrap justify-center sm:justify-start gap-2 mt-3">
              @if (character().background) {
                <span class="tag">{{ character().background }}</span>
              }
              @if (character().alignment) {
                <span class="tag">{{ character().alignment }}</span>
              }
              @if (character().experiencePoints) {
                <span class="tag">{{ character().experiencePoints | number }} XP</span>
              }
              @if (character().playerName) {
                <span class="tag tag-quiet">Player: {{ character().playerName }}</span>
              }
            </div>
          </div>

          <!-- Actions -->
          <div class="flex sm:flex-col gap-2 shrink-0">
            <button type="button" class="action" [disabled]="exportingPdf()" [attr.aria-busy]="exportingPdf()" (click)="exportPdf.emit()">
              @if (exportingPdf()) {
                <span class="spinner" aria-hidden="true"></span>
              } @else {
                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
              }
              {{ exportingPdf() ? 'Preparing PDF…' : 'PDF' }}
            </button>
            <button type="button" class="action" (click)="viewHistory.emit()">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              History
            </button>
          </div>
        </div>

        <!-- Vitals -->
        <div class="vitals mt-6">
          <div class="vital">
            <div class="shield">
              <svg viewBox="0 0 40 46" class="absolute inset-0 w-full h-full" aria-hidden="true"><path d="M20 2 L37 8 V22 C37 33 29.5 40.5 20 44 C10.5 40.5 3 33 3 22 V8 Z" /></svg>
              <span class="relative">{{ character().armorClass }}</span>
            </div>
            <span class="vital-label">Armor Class</span>
          </div>

          <div class="vital vital-hp">
            <div class="flex items-baseline gap-1">
              <span class="vital-value">{{ character().hitPoints.current }}</span>
              <span class="text-sm muted">/ {{ character().hitPoints.max }}</span>
              @if (character().hitPoints.temp) {
                <span class="temp-hp" title="Temporary hit points">+{{ character().hitPoints.temp }}</span>
              }
            </div>
            <div class="hp-track" role="progressbar" aria-label="Hit points" [attr.aria-valuenow]="character().hitPoints.current" aria-valuemin="0" [attr.aria-valuemax]="character().hitPoints.max">
              <div class="hp-fill" [class.hp-low]="hpPercent() <= 25" [style.width.%]="hpPercent()"></div>
            </div>
            <span class="vital-label">Hit Points</span>
          </div>

          <div class="vital">
            <span class="vital-value">{{ signed(character().initiative) }}</span>
            <span class="vital-label">Initiative</span>
          </div>

          <div class="vital">
            <span class="vital-value">{{ character().speed }}<span class="text-sm muted ml-0.5">ft</span></span>
            <span class="vital-label">Speed</span>
          </div>

          <div class="vital">
            <span class="vital-value">{{ character().hitDice.current }}<span class="text-sm muted">/{{ character().hitDice.total }}{{ character().hitDice.die }}</span></span>
            <span class="vital-label">Hit Dice</span>
          </div>

          <div class="vital">
            <span class="vital-value">{{ character().passiveWisdom }}</span>
            <span class="vital-label">Passive Perception</span>
          </div>
        </div>

        @if (character().deathSaves.successes > 0 || character().deathSaves.failures > 0) {
          <div class="death-saves mt-4">
            <span class="eyebrow">Death Saves</span>
            <div class="flex items-center gap-2">
              <span class="text-xs muted">Successes</span>
              @for (i of [0, 1, 2]; track i) {
                <span class="pip" [class.pip-success]="i < character().deathSaves.successes"></span>
              }
            </div>
            <div class="flex items-center gap-2">
              <span class="text-xs muted">Failures</span>
              @for (i of [0, 1, 2]; track i) {
                <span class="pip" [class.pip-fail]="i < character().deathSaves.failures"></span>
              }
            </div>
          </div>
        }
      </header>

      <!-- ═══ Ability scores ═══ -->
      <section class="grid grid-cols-3 md:grid-cols-6 gap-3" aria-label="Ability scores">
        @for (ability of abilities; track ability.key) {
          <div class="ability" [title]="ability.name">
            <span class="ability-label">{{ ability.label }}</span>
            <span class="ability-mod">{{ signed(ability.value.modifier) }}</span>
            <span class="ability-score">{{ ability.value.score }}</span>
          </div>
        }
      </section>

      <!-- ═══ Main grid ═══ -->
      <div class="grid grid-cols-1 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] gap-6 items-start">

        <!-- Left column -->
        <div class="space-y-6">
          <section class="panel">
            <h3 class="section-title">Saving Throws</h3>
            <ul class="grid grid-cols-2 gap-x-4">
              @for (st of savingThrowsList; track st.key) {
                <li class="row">
                  <span class="flex items-center gap-2">
                    <span class="prof-dot" [class.is-prof]="st.proficient" aria-hidden="true"></span>
                    <span [class.font-semibold]="st.proficient">{{ st.label }}</span>
                  </span>
                  <span class="mod">{{ signed(st.modifier) }}</span>
                </li>
              }
            </ul>
          </section>

          <section class="panel">
            <h3 class="section-title">Skills</h3>
            <ul>
              @for (skill of allSkills; track skill.name) {
                <li class="row">
                  <span class="flex items-center gap-2 min-w-0">
                    <span class="prof-dot" [class.is-prof]="skill.proficient" [class.is-expert]="skill.expertise" aria-hidden="true"></span>
                    <span class="truncate" [class.font-semibold]="skill.proficient">{{ skill.name }}</span>
                    <span class="ability-hint">{{ skill.abilityLabel }}</span>
                    @if (skill.expertise) {
                      <span class="sr-only">(expertise)</span>
                    } @else if (skill.proficient) {
                      <span class="sr-only">(proficient)</span>
                    }
                  </span>
                  <span class="mod">{{ signed(skill.modifier) }}</span>
                </li>
              }
            </ul>
          </section>

          <section class="panel">
            <h3 class="section-title">Proficiencies & Languages</h3>
            @if (character().proficiencies.length) {
              <ul class="space-y-1.5 text-sm mb-4">
                @for (prof of character().proficiencies; track prof) {
                  <li class="bullet">{{ prof }}</li>
                }
              </ul>
            }
            <div class="flex flex-wrap gap-1.5">
              @for (lang of character().languages; track lang) {
                <span class="tag">{{ lang }}</span>
              }
            </div>
          </section>
        </div>

        <!-- Right column -->
        <div class="space-y-6">
          <section class="panel">
            <h3 class="section-title">Attacks</h3>
            @if (character().attacks.length) {
              <ul class="space-y-2">
                @for (attack of character().attacks; track attack.name) {
                  <li class="attack">
                    <span class="attack-name">{{ attack.name }}</span>
                    <span class="attack-bonus" title="Attack bonus">{{ signed(attack.bonus ?? 0) }}</span>
                    <span class="text-sm muted min-w-0">{{ attack.damage }} {{ attack.type }}</span>
                  </li>
                }
              </ul>
            } @else {
              <p class="empty">No attacks configured</p>
            }
          </section>

          @let spellcasting = character().spellcasting;
          @if (spellcasting) {
            <section class="panel">
              <h3 class="section-title">Spellcasting</h3>

              <div class="flex flex-wrap gap-3 mb-4">
                @if (spellcasting.ability) {
                  <div class="stat-chip"><span class="muted">Ability</span><strong class="capitalize">{{ spellcasting.ability }}</strong></div>
                }
                @if (spellcasting.spellSaveDc) {
                  <div class="stat-chip"><span class="muted">Save DC</span><strong>{{ spellcasting.spellSaveDc }}</strong></div>
                }
                @if (spellcasting.spellAttackBonus !== undefined) {
                  <div class="stat-chip"><span class="muted">Spell Attack</span><strong>{{ signed(spellcasting.spellAttackBonus) }}</strong></div>
                }
              </div>

              @for (group of spellGroups(); track group.key) {
                <div class="spell-group">
                  <div class="flex items-center justify-between gap-3 mb-1">
                    <span class="eyebrow">{{ group.label }}</span>
                    @if (group.slot) {
                      <span class="flex gap-1" [attr.aria-label]="(group.slot.total - group.slot.expended) + ' of ' + group.slot.total + ' slots available'">
                        @for (i of getSlotArray(group.slot.total); track i) {
                          <span class="slot" [class.slot-used]="i >= group.slot.total - group.slot.expended"></span>
                        }
                      </span>
                    }
                  </div>

                  @for (entry of group.entries; track entry.index) {
                    @if (isString(entry.spell)) {
                      <div class="entry-head font-semibold text-sm">{{ entry.spell }}</div>
                    } @else {
                      <button
                        type="button"
                        class="entry-head w-full text-left"
                        [attr.aria-expanded]="expandedSpells().has(entry.index)"
                        (click)="toggleSpell(entry.index, entry.spell)"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" class="chevron" [class.rotate-90]="expandedSpells().has(entry.index)" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" /></svg>
                        <span class="font-semibold text-sm flex-1">{{ entry.spell.name }}</span>
                        @if (entry.spell.school) {
                          <span class="tag tag-sm">{{ entry.spell.school }}</span>
                        }
                      </button>
                      @if (expandedSpells().has(entry.index)) {
                        <div class="entry-body">
                          @if (loadingSpells().has(entry.index)) {
                            <mat-progress-bar mode="indeterminate"></mat-progress-bar>
                          } @else if (entry.spell.description) {
                            <div class="whitespace-pre-line">{{ entry.spell.description }}</div>
                            @if (entry.spell.usage) {
                              <div class="usage">{{ entry.spell.usage }}</div>
                            }
                          } @else {
                            <span class="italic muted">Geen beschrijving beschikbaar</span>
                          }
                        </div>
                      }
                    }
                  }
                </div>
              }

              @if (orphanSlots().length) {
                <div class="spell-group">
                  <span class="eyebrow block mb-1">Spell Slots</span>
                  @for (slot of orphanSlots(); track slot.level) {
                    <div class="row">
                      <span class="text-sm">Level {{ slot.level }}</span>
                      <span class="flex gap-1">
                        @for (i of getSlotArray(slot.total); track i) {
                          <span class="slot" [class.slot-used]="i >= slot.total - slot.expended"></span>
                        }
                      </span>
                    </div>
                  }
                </div>
              }
            </section>
          }

          <section class="panel">
            <h3 class="section-title">Features & Traits</h3>
            @for (feature of character().featuresAndTraits; track $index) {
              @if (isString(feature)) {
                <div class="entry-head font-semibold text-sm">{{ feature }}</div>
              } @else {
                <button
                  type="button"
                  class="entry-head w-full text-left"
                  [attr.aria-expanded]="expandedFeatures().has($index)"
                  (click)="toggleFeature($index, feature)"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" class="chevron" [class.rotate-90]="expandedFeatures().has($index)" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" /></svg>
                  <span class="font-semibold text-sm flex-1">{{ feature.name }}</span>
                  @if (feature.source) {
                    <span class="tag tag-sm">{{ feature.source }}</span>
                  }
                </button>
                @if (expandedFeatures().has($index)) {
                  <div class="entry-body">
                    @if (loadingFeatures().has($index)) {
                      <mat-progress-bar mode="indeterminate"></mat-progress-bar>
                    } @else if (feature.description) {
                      <div class="whitespace-pre-line">{{ feature.description }}</div>
                    } @else {
                      <span class="italic muted">No description available</span>
                    }
                  </div>
                }
              }
            } @empty {
              <p class="empty">No features yet</p>
            }
          </section>

          <section class="panel">
            <h3 class="section-title">Inventory</h3>
            <div class="flex flex-wrap gap-2 mb-4">
              @for (coin of coins(); track coin.key) {
                <span class="coin" [title]="coin.name">
                  <span class="coin-dot" [style.background]="coin.color" aria-hidden="true"></span>
                  <strong>{{ coin.amount }}</strong>
                  <span class="muted uppercase text-[0.7rem] tracking-wider">{{ coin.key }}</span>
                </span>
              }
            </div>
            @if (character().equipment.length) {
              <ul class="grid sm:grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
                @for (item of character().equipment; track item) {
                  <li class="bullet">{{ item }}</li>
                }
              </ul>
            } @else {
              <p class="empty">No equipment</p>
            }
          </section>

          @if (images().length > 0) {
            <app-character-image-gallery [images]="images()" [canDelete]="canDelete()" (deleteImage)="deleteImage.emit($event)" />
          }
        </div>
      </div>

      <!-- ═══ Story ═══ -->
      @if (personality().length) {
        <section class="panel">
          <h3 class="section-title">Personality</h3>
          <div class="grid sm:grid-cols-2 gap-4">
            @for (p of personality(); track p.label) {
              <div class="trait">
                <div class="eyebrow mb-1">{{ p.label }}</div>
                <p class="prose-text whitespace-pre-line">{{ p.text }}</p>
              </div>
            }
          </div>
        </section>
      }

      @if (character().appearance; as appearance) {
        <section class="panel">
          <h3 class="section-title">Appearance</h3>
          @if (appearanceDetails().length) {
            <dl class="grid grid-cols-3 sm:grid-cols-6 gap-3 mb-4">
              @for (d of appearanceDetails(); track d.label) {
                <div class="detail">
                  <dt class="eyebrow">{{ d.label }}</dt>
                  <dd class="text-sm font-semibold mt-0.5">{{ d.value }}</dd>
                </div>
              }
            </dl>
          }
          @if (appearance.description) {
            <p class="prose-text whitespace-pre-line">{{ appearance.description }}</p>
          }
        </section>
      }

      @if (character().backstory) {
        <section class="panel">
          <h3 class="section-title">Backstory</h3>
          <p class="prose-text backstory whitespace-pre-line">{{ character().backstory }}</p>
        </section>
      }
    </div>
  `,
  styles: [`
    :host {
      display: block;
      --ink: #2a2320;
      --muted: #7b6e60;
      --paper: #fffdf8;
      --paper-2: #f8f2e6;
      --line: #e8dcc5;
      --gold: #b48a3c;
      --gold-soft: #f2e6cb;
      --gold-deep: #8a6623;
      --wine: #9b2f3a;
      color: var(--ink);
    }

    .display, .section-title, .ability-label, .eyebrow, .vital-label, .portrait-initial, .level-badge {
      font-family: 'Cinzel', 'Cormorant Garamond', Georgia, serif;
    }
    .display { font-weight: 700; letter-spacing: 0.01em; color: var(--ink); }
    .muted { color: var(--muted); }

    /* Panels */
    .panel {
      background: var(--paper);
      border: 1px solid var(--line);
      border-radius: 14px;
      padding: 1.25rem;
      box-shadow: 0 1px 2px rgba(60, 40, 10, 0.04), 0 4px 16px -8px rgba(60, 40, 10, 0.12);
    }

    .section-title {
      display: flex;
      align-items: center;
      gap: 0.6rem;
      font-size: 0.8rem;
      font-weight: 700;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: var(--gold-deep);
      margin-bottom: 0.9rem;
    }
    .section-title::before {
      content: '';
      width: 7px;
      height: 7px;
      background: var(--gold);
      transform: rotate(45deg);
      flex-shrink: 0;
    }
    .section-title::after {
      content: '';
      flex: 1;
      height: 1px;
      background: linear-gradient(to right, var(--line), transparent);
    }

    .eyebrow {
      font-size: 0.7rem;
      font-weight: 600;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: var(--muted);
    }

    /* Hero */
    .hero {
      position: relative;
      overflow: hidden;
      padding: 1.5rem;
      background:
        radial-gradient(120% 80% at 0% 0%, rgba(180, 138, 60, 0.12), transparent 60%),
        radial-gradient(80% 60% at 100% 0%, rgba(155, 47, 58, 0.06), transparent 60%),
        var(--paper);
    }
    .hero::after {
      content: '';
      position: absolute;
      inset: 6px;
      border: 1px solid rgba(180, 138, 60, 0.25);
      border-radius: 10px;
      pointer-events: none;
    }

    .portrait {
      position: relative;
      width: 112px;
      height: 112px;
      border-radius: 50%;
      padding: 3px;
      background: linear-gradient(145deg, #e5c77f, var(--gold) 45%, #7a5a1e);
      box-shadow: 0 6px 18px -6px rgba(90, 60, 10, 0.45);
    }
    .portrait:disabled { cursor: default; }
    .portrait > img, .portrait-initial {
      border-radius: 50%;
      border: 3px solid var(--paper);
    }
    .portrait-initial {
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 2.75rem;
      font-weight: 700;
      color: var(--gold-deep);
      background: radial-gradient(circle at 35% 30%, #fff8e8, var(--gold-soft));
    }
    .level-badge {
      position: absolute;
      bottom: -2px;
      right: -2px;
      min-width: 2rem;
      height: 2rem;
      padding: 0 0.4rem;
      border-radius: 999px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 0.85rem;
      font-weight: 700;
      color: #fff;
      background: var(--wine);
      border: 2px solid var(--paper);
    }

    .tag {
      display: inline-flex;
      align-items: center;
      padding: 0.2rem 0.65rem;
      border-radius: 999px;
      font-size: 0.78rem;
      font-weight: 500;
      background: var(--gold-soft);
      color: var(--gold-deep);
      border: 1px solid rgba(180, 138, 60, 0.25);
    }
    .tag-quiet { background: transparent; color: var(--muted); border-color: var(--line); }
    .tag-sm { padding: 0.05rem 0.5rem; font-size: 0.68rem; flex-shrink: 0; }

    .action {
      position: relative;
      z-index: 1;
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      padding: 0.45rem 0.85rem;
      border-radius: 8px;
      font-size: 0.85rem;
      font-weight: 500;
      color: var(--ink);
      background: var(--paper);
      border: 1px solid var(--line);
      transition: border-color 0.15s, background 0.15s;
    }
    .action:hover:not(:disabled) { border-color: var(--gold); background: var(--gold-soft); }
    .action:disabled { opacity: 0.6; cursor: wait; }
    .spinner {
      width: 0.9rem;
      height: 0.9rem;
      border-radius: 50%;
      border: 2px solid var(--line);
      border-top-color: var(--gold-deep);
      animation: spin 0.8s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }

    /* Vitals */
    .vitals {
      position: relative;
      display: grid;
      grid-template-columns: repeat(6, minmax(0, 1fr));
      gap: 0.75rem;
    }
    .vitals > .vital { grid-column: span 2; }
    .vitals > .vital:nth-child(5), .vitals > .vital:nth-child(6) { grid-column: span 3; }
    .vitals > .vital-hp { grid-column: span 6; order: -1; }
    @media (min-width: 768px) {
      .vitals { grid-template-columns: 1fr 1.6fr 1fr 1fr 1fr 1fr; }
      .vitals > .vital, .vitals > .vital:nth-child(5), .vitals > .vital:nth-child(6), .vitals > .vital-hp { grid-column: auto; order: 0; }
    }
    .vital {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: flex-end;
      gap: 0.3rem;
      padding: 0.75rem 0.5rem;
      border-radius: 10px;
      background: var(--paper-2);
      border: 1px solid var(--line);
      min-height: 88px;
    }
    .vital-value { font-size: 1.5rem; font-weight: 700; line-height: 1; font-variant-numeric: tabular-nums; }
    .vital-label { font-size: 0.62rem; font-weight: 600; letter-spacing: 0.1em; text-transform: uppercase; color: var(--muted); text-align: center; }

    .shield {
      position: relative;
      width: 40px;
      height: 46px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1.15rem;
      font-weight: 700;
      color: var(--gold-deep);
    }
    .shield path { fill: var(--paper); stroke: var(--gold); stroke-width: 2.5; }

    .hp-track { width: 100%; max-width: 180px; height: 6px; border-radius: 999px; background: #eadfcb; overflow: hidden; }
    .hp-fill { height: 100%; border-radius: inherit; background: linear-gradient(90deg, #b8434e, var(--wine)); transition: width 0.4s ease; }
    .hp-fill.hp-low { background: linear-gradient(90deg, #d0662f, #b23a2a); }
    .temp-hp { font-size: 0.75rem; font-weight: 600; color: #2f6b8f; margin-left: 0.25rem; }

    .death-saves { position: relative; display: flex; flex-wrap: wrap; align-items: center; gap: 1rem 1.5rem; }
    .pip { width: 12px; height: 12px; border-radius: 50%; border: 2px solid var(--line); background: var(--paper); }
    .pip-success { background: #4c8a52; border-color: #4c8a52; }
    .pip-fail { background: var(--wine); border-color: var(--wine); }

    /* Abilities */
    .ability {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 0.85rem 0.5rem 0;
      background: var(--paper);
      border: 1px solid var(--line);
      border-radius: 14px 14px 40% 40% / 14px 14px 24px 24px;
      box-shadow: 0 2px 10px -6px rgba(60, 40, 10, 0.25);
    }
    .ability-label { font-size: 0.72rem; font-weight: 700; letter-spacing: 0.16em; color: var(--gold-deep); }
    .ability-mod { font-size: 1.75rem; font-weight: 700; line-height: 1.1; margin: 0.2rem 0 0.35rem; font-variant-numeric: tabular-nums; }
    .ability-score {
      transform: translateY(50%);
      min-width: 2.4rem;
      padding: 0.1rem 0.5rem;
      text-align: center;
      font-size: 0.85rem;
      font-weight: 600;
      border-radius: 999px;
      background: var(--paper);
      border: 1px solid var(--gold);
      color: var(--ink);
    }
    section[aria-label="Ability scores"] { padding-bottom: 0.75rem; }

    /* Rows */
    .row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.75rem;
      padding: 0.35rem 0;
      font-size: 0.875rem;
      border-bottom: 1px dashed #efe6d4;
    }
    .row:last-child { border-bottom: none; }
    .mod { font-weight: 600; font-variant-numeric: tabular-nums; min-width: 2rem; text-align: right; }
    .ability-hint { font-size: 0.62rem; letter-spacing: 0.08em; color: #b3a692; text-transform: uppercase; }

    .prof-dot { width: 9px; height: 9px; border-radius: 50%; border: 1.5px solid #c9b896; flex-shrink: 0; }
    .prof-dot.is-prof { background: var(--gold); border-color: var(--gold); }
    .prof-dot.is-expert { background: var(--wine); border-color: var(--wine); box-shadow: 0 0 0 2px var(--paper), 0 0 0 3.5px var(--wine); }

    .bullet { position: relative; padding-left: 1rem; }
    .bullet::before {
      content: '';
      position: absolute;
      left: 0.1rem;
      top: 0.5em;
      width: 5px;
      height: 5px;
      background: var(--gold);
      transform: rotate(45deg);
    }

    .empty { font-size: 0.875rem; color: var(--muted); font-style: italic; text-align: center; padding: 0.5rem 0; }

    /* Attacks */
    .attack {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr);
      align-items: center;
      gap: 0.35rem 0.6rem;
      padding: 0.6rem 0.8rem;
      border-radius: 10px;
      background: var(--paper-2);
      border: 1px solid var(--line);
      font-size: 0.9rem;
    }
    .attack-name { grid-column: 1 / -1; font-weight: 600; overflow-wrap: anywhere; }
    .attack-bonus {
      font-weight: 700;
      font-variant-numeric: tabular-nums;
      padding: 0.1rem 0.55rem;
      border-radius: 6px;
      background: var(--ink);
      color: #f6efe0;
      font-size: 0.8rem;
    }

    /* Spellcasting */
    .stat-chip {
      display: inline-flex;
      align-items: baseline;
      gap: 0.4rem;
      padding: 0.35rem 0.75rem;
      border-radius: 8px;
      background: var(--paper-2);
      border: 1px solid var(--line);
      font-size: 0.85rem;
    }
    .spell-group + .spell-group { margin-top: 1rem; padding-top: 0.75rem; border-top: 1px solid #efe6d4; }
    .slot {
      width: 12px;
      height: 12px;
      transform: rotate(45deg);
      border-radius: 2px;
      background: var(--gold);
      border: 1.5px solid var(--gold);
    }
    .slot.slot-used { background: transparent; border-color: #d6c7a8; }

    .entry-head {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.4rem 0.5rem;
      margin: 0 -0.5rem;
      border-radius: 8px;
      touch-action: manipulation;
      -webkit-touch-callout: none;
      user-select: none;
      transition: background 0.15s;
    }
    button.entry-head:hover { background: var(--paper-2); }
    .chevron { width: 0.75rem; height: 0.75rem; color: var(--gold); transition: transform 0.15s; flex-shrink: 0; }
    .entry-body {
      margin: 0.25rem 0 0.6rem 0.75rem;
      padding: 0.25rem 0 0.25rem 0.85rem;
      border-left: 2px solid var(--gold-soft);
      font-size: 0.82rem;
      line-height: 1.55;
      color: #4d4339;
    }
    .usage {
      margin-top: 0.5rem;
      padding-top: 0.5rem;
      border-top: 1px dashed var(--line);
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 0.75rem;
      color: var(--muted);
      white-space: pre-line;
    }

    /* Inventory */
    .coin {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      padding: 0.25rem 0.65rem;
      border-radius: 999px;
      background: var(--paper-2);
      border: 1px solid var(--line);
      font-size: 0.85rem;
      font-variant-numeric: tabular-nums;
    }
    .coin-dot { width: 12px; height: 12px; border-radius: 50%; box-shadow: inset 0 -2px 0 rgba(0, 0, 0, 0.18), inset 0 1px 0 rgba(255, 255, 255, 0.5); }

    /* Story */
    .prose-text {
      font-family: 'Cormorant Garamond', Georgia, serif;
      font-size: 1.08rem;
      line-height: 1.6;
      color: #3a312b;
    }
    .trait {
      padding: 0.85rem 1rem;
      border-radius: 10px;
      background: var(--paper-2);
      border-left: 3px solid var(--gold);
    }
    .detail { padding: 0.5rem 0.65rem; border-radius: 8px; background: var(--paper-2); border: 1px solid var(--line); }
    .backstory::first-letter {
      float: left;
      font-family: 'Cinzel', Georgia, serif;
      font-size: 3.2rem;
      line-height: 0.9;
      font-weight: 700;
      padding: 0.3rem 0.5rem 0 0;
      color: var(--gold-deep);
    }
  `]
})
export class CharacterSheetComponent {
  character = input.required<DndCharacter>();
  characterName = input.required<string>();
  characterId = input<string | null>(null);
  activeVersionId = input<string>('');
  images = input<CharacterImage[]>([]);
  canDelete = input<boolean>(false);
  exportingPdf = input<boolean>(false);
  viewHistory = output<void>();
  exportPdf = output<void>();
  deleteImage = output<CharacterImage>();
  spellResolved = output<SpellResolvedEvent>();
  featureResolved = output<FeatureResolvedEvent>();

  expandedSpells = signal<Set<number>>(new Set());
  loadingSpells = signal<Set<number>>(new Set());
  expandedFeatures = signal<Set<number>>(new Set());
  loadingFeatures = signal<Set<number>>(new Set());
  portraitLightbox = signal<string | null>(null);

  private readonly resolver = inject(CharacterEntryResolverService);

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
      const details = await this.resolver.resolveSpell(this.characterId(), spell);
      this.spellResolved.emit({ spellName: spell.name, description: details.description, usage: details.usage });
    } catch (e) {
      logger.error('Failed to resolve spell details:', e);
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
      const details = await this.resolver.resolveFeature(this.characterId(), feature, this.character());
      this.featureResolved.emit({ featureName: feature.name, description: details.description });
    } catch (e) {
      logger.error('Failed to resolve feature details:', e);
    } finally {
      this.loadingFeatures.update(s => {
        const n = new Set(s);
        n.delete(index);
        return n;
      });
    }
  }

  portraitUrl = computed(() => this.images().find(img => !!img.url)?.url ?? null);

  initial = computed(() => (this.character().name?.trim()[0] ?? '?').toUpperCase());

  hpPercent = computed(() => {
    const { current, max } = this.character().hitPoints;
    if (!max) return 0;
    return Math.max(0, Math.min(100, Math.round((current / max) * 100)));
  });

  coins = computed(() => {
    const c = this.character().coins;
    return [
      { key: 'pp', name: 'Platinum', amount: c.pp, color: '#d9dde3' },
      { key: 'gp', name: 'Gold', amount: c.gp, color: '#e2b13c' },
      { key: 'ep', name: 'Electrum', amount: c.ep, color: '#cfc38a' },
      { key: 'sp', name: 'Silver', amount: c.sp, color: '#b9bec4' },
      { key: 'cp', name: 'Copper', amount: c.cp, color: '#b8693a' },
    ];
  });

  personality = computed(() => {
    const c = this.character();
    return [
      { label: 'Personality Traits', text: c.personalityTraits },
      { label: 'Ideals', text: c.ideals },
      { label: 'Bonds', text: c.bonds },
      { label: 'Flaws', text: c.flaws },
    ].filter((p): p is { label: string; text: string } => !!p.text);
  });

  appearanceDetails = computed(() => {
    const a = this.character().appearance;
    if (!a) return [];
    return [
      { label: 'Age', value: a.age },
      { label: 'Height', value: a.height },
      { label: 'Weight', value: a.weight },
      { label: 'Eyes', value: a.eyes },
      { label: 'Skin', value: a.skin },
      { label: 'Hair', value: a.hair },
    ].filter((d): d is { label: string; value: string } => !!d.value);
  });

  hasAppearanceDetails = computed(() => this.appearanceDetails().length > 0);

  /** Spells grouped by level (cantrips first), with the matching slot row attached. */
  spellGroups = computed<SpellGroup[]>(() => {
    const spells = this.character().spellcasting?.spells ?? [];
    const slots = this.spellSlots;
    const groups = new Map<string, SpellGroup>();

    spells.forEach((spell, index) => {
      const level = typeof spell === 'string' ? undefined : spell.level;
      const key = level === undefined ? 'other' : String(level);
      if (!groups.has(key)) {
        const slot = level ? slots.find(s => s.level === level) : undefined;
        groups.set(key, {
          key,
          label: level === undefined ? 'Spells' : level === 0 ? 'Cantrips' : `Level ${level}`,
          slot: slot ? { total: slot.total, expended: slot.expended } : undefined,
          entries: [],
        });
      }
      groups.get(key)!.entries.push({ spell, index });
    });

    const order = (k: string) => (k === 'other' ? Number.MAX_SAFE_INTEGER : Number(k));
    return [...groups.values()].sort((a, b) => order(a.key) - order(b.key));
  });

  /** Slot levels that have no spells listed for them, so they still show up. */
  orphanSlots = computed(() => {
    const shown = new Set(this.spellGroups().map(g => g.key));
    return this.spellSlots.filter(s => s.total > 0 && !shown.has(String(s.level)));
  });

  signed(value: number): string {
    return `${value >= 0 ? '+' : ''}${value}`;
  }

  get savingThrowsList() {
    const st = this.character().savingThrows;
    return ABILITY_LABELS.map(a => ({ key: a.key, label: a.name, ...st[a.key] }));
  }

  get abilities() {
    const c = this.character();
    return ABILITY_LABELS.map(a => ({ key: a.key, label: a.label, name: a.name, value: c.abilities[a.key] }));
  }

  isString(value: unknown): value is string {
    return typeof value === 'string';
  }

  get spellSlots() {
    const spellcasting = this.character().spellcasting;
    if (!spellcasting?.slots) return [];

    if (Array.isArray(spellcasting.slots)) {
      return [...spellcasting.slots].sort((a, b) => a.level - b.level);
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
    const label = (key: AbilityKey) => ABILITY_LABELS.find(a => a.key === key)!.label;

    return DND_SKILLS.map(skill => {
      const charSkill = c.skills.find(s => s.name === skill.name);
      if (charSkill) return { ...charSkill, abilityLabel: label(skill.ability) };
      return {
        name: skill.name,
        proficient: false,
        expertise: false,
        modifier: c.abilities[skill.ability].modifier,
        abilityLabel: label(skill.ability),
      };
    });
  }
}
