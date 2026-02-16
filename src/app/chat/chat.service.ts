import { inject, Injectable, signal } from '@angular/core';
import { from, Observable, throwError } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { httpsCallable } from 'firebase/functions';
import { CHARACTER_BUILDER_PROMPT } from '../prompts/character-builder.prompt';
import { IMAGE_GENERATION_SYSTEM_PROMPT } from '../prompts/image-generation.prompt';
import { DndCharacter } from '../shared/schemas/dnd-character.schema';
import {
  buildCharacterChatRequest,
  type CharacterChatRequest,
  type ChatHistoryMessage,
} from '../shared/utils/build-character-context';
import { AiSettingsService } from '../core/services/ai-settings.service';
import { FirebaseService } from '../core/firebase.service';

export type { ChatHistoryMessage, CharacterChatRequest };

const IMAGE_TRIGGER_REGEX = /maak\s+afbeelding/i;

interface GenerateImageRequest {
  chatRequest: CharacterChatRequest;
  model: string;
  characterId: string;
}

interface GenerateImageResponse {
  imageUrl: string;
  mimeType: string;
}

export interface MessageImage {
  url: string;
  mimeType: string;
}

export interface Message {
  id: string;
  sender: 'user' | 'ai' | 'error';
  text: string;
  images?: MessageImage[];
  timestamp: Date;
}

export interface CharacterUpdateResponse {
  character: DndCharacter;
  response: string;
}

function stripSpellDetails(character: DndCharacter): DndCharacter {
  const spells = character.spellcasting?.spells;
  if (!spells) return character;
  return {
    ...character,
    spellcasting: {
      ...character.spellcasting,
      spells: spells.map(spell => {
        if (typeof spell === 'string') return spell;
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { description: _d, usage: _u, ...rest } = spell;
        return rest;
      }),
    },
  };
}

function preserveSpellDetails(updated: DndCharacter, existing: DndCharacter): DndCharacter {
  const existingSpells = existing.spellcasting?.spells;
  const updatedSpells = updated.spellcasting?.spells;
  if (!existingSpells || !updatedSpells) return updated;

  const existingByName = new Map<string, Record<string, unknown>>();
  for (const s of existingSpells as (string | Record<string, unknown>)[]) {
    if (typeof s === 'object' && s !== null) {
      existingByName.set((s as Record<string, unknown>)['name'] as string, s as Record<string, unknown>);
    }
  }

  const mergedSpells = (updatedSpells as (string | Record<string, unknown>)[]).map(s => {
    if (typeof s === 'string') return s;
    const prev = existingByName.get((s as Record<string, unknown>)['name'] as string);
    if (prev) {
      const merged: Record<string, unknown> = { ...s };
      if (prev['description'] !== undefined) merged['description'] = prev['description'];
      if (prev['usage'] !== undefined) merged['usage'] = prev['usage'];
      return merged;
    }
    return s;
  });

  return {
    ...updated,
    spellcasting: { ...updated.spellcasting!, spells: mergedSpells },
  } as DndCharacter;
}

@Injectable({
  providedIn: 'root'
})
export class ChatService {
  private readonly firebase = inject(FirebaseService);
  private readonly aiSettingsService = inject(AiSettingsService);

  private messages = signal<Message[]>([]);
  private conversationHistory: ChatHistoryMessage[] = [];
  private draftCharacter = signal<DndCharacter | null>(null);
  private currentCharacter: DndCharacter | null = null;
  private characterId: string | null = null;

  setCurrentCharacter(character: DndCharacter | null): void {
    this.currentCharacter = character;
    this.draftCharacter.set(null);
    this.conversationHistory = [];
  }

  setCharacterId(characterId: string | null): void {
    this.characterId = characterId;
  }

  getDraftCharacter() {
    return this.draftCharacter.asReadonly();
  }

  clearDraft(): void {
    this.draftCharacter.set(null);
  }

  setDraftSpellDetails(spellName: string, description: string, usage: string): void {
    const draft = this.draftCharacter();
    if (!draft) return;
    const updatedSpells = (draft.spellcasting?.spells ?? []).map(spell => {
      if (typeof spell === 'string') return spell;
      if (spell.name.toLowerCase() === spellName.toLowerCase()) return { ...spell, description, usage };
      return spell;
    });
    this.draftCharacter.set({
      ...draft,
      spellcasting: draft.spellcasting ? { ...draft.spellcasting, spells: updatedSpells } : undefined,
    });
  }

  isImageGenerationRequest(message: string): boolean {
    return IMAGE_TRIGGER_REGEX.test(message);
  }

  sendMessage(userMessage: string): Observable<{ text: string; images?: MessageImage[] }> {
    if (!this.currentCharacter) {
      return throwError(() => ({
        status: 400,
        message: 'No character selected. Please open a character to chat.'
      }));
    }

    if (this.isImageGenerationRequest(userMessage)) {
      return this.sendImageGenerationMessage(userMessage);
    }

    const functions = this.firebase.requireFunctions();

    const characterForLlm = stripSpellDetails(this.draftCharacter() ?? this.currentCharacter);
    const payload = buildCharacterChatRequest(characterForLlm, CHARACTER_BUILDER_PROMPT, userMessage, this.conversationHistory);

    const characterChat = httpsCallable<CharacterChatRequest, { text: string }>(
      functions, 'characterChat'
    );

    return from(characterChat(payload)).pipe(
      map(result => {
        const fullText = result.data.text;
        const parsed = this.parseCharacterUpdateResponse(fullText);
        const responseText = parsed?.response ?? fullText;

        if (parsed?.character && this.currentCharacter) {
          const existing = this.draftCharacter() ?? this.currentCharacter;
          const withDetails = preserveSpellDetails(parsed.character, existing);
          if (JSON.stringify(withDetails) !== JSON.stringify(existing)) {
            this.draftCharacter.set(withDetails);
          }
        }

        this.conversationHistory.push(
          { role: 'user', content: userMessage },
          { role: 'assistant', content: responseText }
        );

        if (this.conversationHistory.length > 20) {
          this.conversationHistory = this.conversationHistory.slice(-20);
        }

        return { text: responseText };
      }),
      catchError(error => throwError(() => this.formatError(error)))
    );
  }

  private sendImageGenerationMessage(userMessage: string): Observable<{ text: string; images?: MessageImage[] }> {
    if (!this.characterId) {
      return throwError(() => ({
        status: 400,
        message: 'No character selected. Please open a character to generate an image.'
      }));
    }

    const functions = this.firebase.requireFunctions();

    const match = userMessage.match(/maak\s+afbeelding\s*(.*)/i);
    const userPrompt = match?.[1]?.trim() || userMessage;

    const imageConfig = this.aiSettingsService.getImageGenerationConfig();

    const generateImage = httpsCallable<GenerateImageRequest, GenerateImageResponse>(
      functions, 'generateImage'
    );

    const chatRequest = buildCharacterChatRequest(this.draftCharacter() ?? this.currentCharacter, IMAGE_GENERATION_SYSTEM_PROMPT, userPrompt, this.conversationHistory);

    const payload: GenerateImageRequest = {
      chatRequest,
      model: imageConfig.model,
      characterId: this.characterId,
    };

    return from(generateImage(payload)).pipe(
      map(result => {
        const { imageUrl, mimeType } = result.data;
        return {
          text: '',
          images: [{ url: imageUrl, mimeType }]
        };
      }),
      catchError(error => throwError(() => this.formatError(error)))
    );
  }

  private formatError(error: unknown): { status: number; message: string; error?: unknown } {
    const err = error as { message?: string; code?: string; status?: number };
    let errorMessage = 'An error occurred while communicating with the AI service.';

    if (err?.message) {
      errorMessage = err.message;
    }

    if (err?.code === 'functions/invalid-argument') {
      errorMessage = 'Invalid request. Please try rephrasing your message.';
    } else if (err?.code === 'functions/unauthenticated') {
      errorMessage = 'Not authenticated. Please sign in.';
    } else if (err?.code === 'functions/permission-denied') {
      errorMessage = 'Access forbidden. Please verify your permissions.';
    } else if (err?.code === 'functions/resource-exhausted') {
      errorMessage = 'Rate limit exceeded. Please wait a moment before trying again.';
    } else if (err?.code === 'functions/internal') {
      errorMessage = 'AI service error. Please try again later.';
    }

    console.error('ChatService Error:', { message: errorMessage, error: err });

    return {
      status: err?.status ?? 500,
      message: errorMessage,
      error: err
    };
  }

  private parseCharacterUpdateResponse(text: string): CharacterUpdateResponse | null {
    if (!text) return null;
    try {
      return JSON.parse(text) as CharacterUpdateResponse;
    } catch (error) {
      console.error('Failed to parse character update response', error);
      return null;
    }
  }

  getMessages(): Message[] {
    return this.messages();
  }

  clearHistory(): void {
    this.messages.set([]);
    this.conversationHistory = [];
  }
}
