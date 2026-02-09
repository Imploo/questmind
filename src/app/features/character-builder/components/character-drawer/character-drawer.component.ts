import { Component, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Character } from '../../../../core/models/schemas/character.schema';

@Component({
  selector: 'app-character-drawer',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="p-4 border-b border-base-300 flex justify-between items-center bg-base-200">
      <h2 class="font-bold text-lg">Characters</h2>
      <button class="btn btn-sm btn-primary" (click)="createCharacter.emit()">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
        </svg>
        New
      </button>
    </div>
    
    <div class="overflow-y-auto flex-1 p-2 space-y-2">
      @for (char of characters(); track char.id) {
        <div 
          class="card card-compact bg-base-100 shadow-sm hover:shadow-md transition-all cursor-pointer border border-transparent"
          [class.border-primary]="selectedCharacterId() === char.id"
          [class.bg-primary-content]="selectedCharacterId() === char.id"
          (click)="selectCharacter.emit(char.id)"
        >
          <div class="card-body">
            <h3 class="card-title text-sm">{{ char.name }}</h3>
            <p class="text-xs opacity-70">
              Updated: {{ char.updatedAt.toDate() | date:'shortDate' }}
            </p>
          </div>
        </div>
      } @empty {
        <div class="text-center p-4 opacity-50 text-sm">
          No characters yet. Create one to get started!
        </div>
      }
    </div>
  `
})
export class CharacterDrawerComponent {
  characters = input.required<Character[]>();
  selectedCharacterId = input<string | null>(null);
  
  selectCharacter = output<string>();
  createCharacter = output<void>();
}
