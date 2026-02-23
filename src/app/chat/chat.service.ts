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
  type ChatAttachment,
} from '../shared/utils/build-character-context';
import { AiSettingsService } from '../core/services/ai-settings.service';
import { CharacterImageService } from '../core/services/character-image.service';
import { FirebaseService } from '../core/firebase.service';
import * as logger from '../shared/logger';

export type { ChatHistoryMessage, ChatAttachment };

const IMAGE_TRIGGER_REGEX = /maak\s+afbeelding/i;

interface CharacterChatRequest {
  characterId: string;
  currentCharacter: DndCharacter;
  chatHistory: ChatHistoryMessage[];
  attachments?: ChatAttachment[];
}

interface GenerateImageRequest {
  chatRequest: ImageChatRequest;
  model: string;
  characterId: string;
  referenceImageStoragePath?: string;
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
  sender: 'user' | 'ai' | 'error' | 'system';
  text: string;
  images?: MessageImage[];
  pdfFileName?: string;
  timestamp: Date;
  isUpdatingCharacter?: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class ChatService {
  private readonly firebase = inject(FirebaseService);
  private readonly aiSettingsService = inject(AiSettingsService);
  private readonly characterImageService = inject(CharacterImageService);

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

  sendMessage(userMessage: string, attachments?: ChatAttachment[]): Observable<{ text: string; images?: MessageImage[]; shouldUpdateCharacter?: boolean }> {
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
      ...(attachments?.length && { attachments }),
    };

    const characterChat = httpsCallable<CharacterChatRequest, { text: string; shouldUpdateCharacter: boolean }>(
      functions, 'characterChat'
    );

    return from(characterChat(payload)).pipe(
      map(result => {
        const { text, shouldUpdateCharacter } = result.data;

        // Store only text in conversation history (not attachment data)
        this.conversationHistory.push(
          { role: 'user', content: userMessage },
          { role: 'assistant', content: text }
        );

        if (this.conversationHistory.length > 20) {
          this.conversationHistory = this.conversationHistory.slice(-20);
        }

        return { text, shouldUpdateCharacter };
      }),
      catchError(error => throwError(() => this.formatError(error)))
    );
  }

  generateCharacterDraft(ai1Response: string, attachments?: ChatAttachment[]): Observable<{ success: boolean }> {
    if (!this.currentCharacter || !this.characterId) {
      return throwError(() => ({
        status: 400,
        message: 'No character selected.'
      }));
    }

    const functions = this.firebase.requireFunctions();
    const stripped = stripCharacterDetails(this.currentCharacter);
    const pdfAttachment = attachments?.find(a => a.mimeType === 'application/pdf');

    const payload = {
      characterId: this.characterId,
      currentCharacter: stripped,
      chatHistory: [...this.conversationHistory],
      ai1Response,
      ...(pdfAttachment && { pdfAttachment: { mimeType: pdfAttachment.mimeType, data: pdfAttachment.data } }),
    };

    const callable = httpsCallable<typeof payload, { success: boolean }>(
      functions, 'generateCharacterDraftCallable'
    );

    return from(callable(payload)).pipe(
      map(result => result.data),
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

    const latestImage = this.characterImageService.images()[0];

    const payload: GenerateImageRequest = {
      chatRequest,
      model: imageConfig.model,
      characterId: this.characterId,
      ...(latestImage?.storagePath && { referenceImageStoragePath: latestImage.storagePath }),
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

    logger.error('ChatService Error:', { message: errorMessage, error: err });

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
