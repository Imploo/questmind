import { inject, Injectable, signal } from '@angular/core';
import { from, Observable, throwError } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { httpsCallable } from 'firebase/functions';
import { IMAGE_GENERATION_SYSTEM_PROMPT } from '../prompts/image-generation.prompt';
import { DndCharacter } from '../shared/models/dnd-character.model';
import {
  buildImageChatRequest,
  stripCharacterDetails,
  type ImageChatRequest,
  type ChatHistoryMessage,
} from '../shared/utils/build-character-context';
import { AiSettingsService } from '../core/services/ai-settings.service';
import { FirebaseService } from '../core/firebase.service';

export type { ChatHistoryMessage };

const IMAGE_TRIGGER_REGEX = /maak\s+afbeelding/i;

interface CharacterChatRequest {
  characterId: string;
  currentCharacter: DndCharacter;
  chatHistory: ChatHistoryMessage[];
}

interface GenerateImageRequest {
  chatRequest: ImageChatRequest;
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

@Injectable({
  providedIn: 'root'
})
export class ChatService {
  private readonly firebase = inject(FirebaseService);
  private readonly aiSettingsService = inject(AiSettingsService);

  private messages = signal<Message[]>([]);
  private conversationHistory: ChatHistoryMessage[] = [];
  private currentCharacter: DndCharacter | null = null;
  private characterId: string | null = null;

  setCurrentCharacter(character: DndCharacter | null): void {
    this.currentCharacter = character;
  }

  setCharacterId(characterId: string | null): void {
    if (this.characterId !== characterId) {
      this.characterId = characterId;
      this.conversationHistory = [];
    }
  }

  isImageGenerationRequest(message: string): boolean {
    return IMAGE_TRIGGER_REGEX.test(message);
  }

  sendMessage(userMessage: string): Observable<{ text: string; images?: MessageImage[] }> {
    if (!this.currentCharacter || !this.characterId) {
      return throwError(() => ({
        status: 400,
        message: 'No character selected. Please open a character to chat.'
      }));
    }

    if (this.isImageGenerationRequest(userMessage)) {
      return this.sendImageGenerationMessage(userMessage);
    }

    const functions = this.firebase.requireFunctions();
    const stripped = stripCharacterDetails(this.currentCharacter);

    const payload: CharacterChatRequest = {
      characterId: this.characterId,
      currentCharacter: stripped,
      chatHistory: [
        ...this.conversationHistory,
        { role: 'user', content: userMessage },
      ],
    };

    const characterChat = httpsCallable<CharacterChatRequest, { text: string }>(
      functions, 'characterChat'
    );

    return from(characterChat(payload)).pipe(
      map(result => {
        const text = result.data.text;

        this.conversationHistory.push(
          { role: 'user', content: userMessage },
          { role: 'assistant', content: text }
        );

        if (this.conversationHistory.length > 20) {
          this.conversationHistory = this.conversationHistory.slice(-20);
        }

        return { text };
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

    const chatRequest = buildImageChatRequest(this.currentCharacter, IMAGE_GENERATION_SYSTEM_PROMPT, userPrompt, this.conversationHistory);

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

  getMessages(): Message[] {
    return this.messages();
  }

  clearHistory(): void {
    this.messages.set([]);
    this.conversationHistory = [];
  }
}
