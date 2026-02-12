import {inject, Injectable, signal} from '@angular/core';
import {from, Observable, throwError} from 'rxjs';
import {catchError, map} from 'rxjs/operators';
import {httpsCallable} from 'firebase/functions';
import {CHARACTER_BUILDER_PROMPT} from '../prompts/character-builder.prompt';
import {IMAGE_GENERATION_SYSTEM_PROMPT} from '../prompts/image-generation.prompt';
import {DndCharacter} from '../shared/schemas/dnd-character.schema';
import {buildCharacterChatRequest} from '../shared/utils/build-character-context';
import {AiSettingsService} from '../core/services/ai-settings.service';
import {FirebaseService} from '../core/firebase.service';

const IMAGE_TRIGGER_REGEX = /maak\s+afbeelding/i;

type ChatRole = 'user' | 'assistant';

export interface ChatHistoryMessage {
  role: ChatRole;
  content: string;
}

export interface CharacterChatRequest {
  systemPrompt: string;
  message: string;
  chatHistory?: ChatHistoryMessage[];
}

interface GenerateImageRequest {
  chatRequest: CharacterChatRequest;
  model: string;
  characterId?: string;
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
  thought: string;
  character: DndCharacter;
  response: string;
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

  isImageGenerationRequest(message: string): boolean {
    return IMAGE_TRIGGER_REGEX.test(message);
  }

  sendMessage(userMessage: string): Observable<{ text: string; images?: MessageImage[] }> {
    if (this.isImageGenerationRequest(userMessage)) {
      return this.sendImageGenerationMessage(userMessage);
    }

    const functions = this.firebase.requireFunctions();

    const payload = buildCharacterChatRequest(this.draftCharacter() ?? this.currentCharacter, CHARACTER_BUILDER_PROMPT, userMessage, this.conversationHistory);

    const characterChat = httpsCallable<CharacterChatRequest, { text: string; images?: MessageImage[] }>(
      functions, 'characterChat'
    );

    return from(characterChat(payload)).pipe(
      map(result => {
        const fullText = result.data.text;
        const images = result.data.images;
        const parsed = this.parseCharacterUpdateResponse(fullText);
        const responseText = parsed?.response ?? fullText;

        if (parsed && this.currentCharacter) {
          if (JSON.stringify(parsed.character) !== JSON.stringify(this.currentCharacter)) {
            this.draftCharacter.set(parsed.character);
          }
        }

        this.conversationHistory.push(
          { role: 'user', content: userMessage },
          { role: 'assistant', content: parsed ? JSON.stringify(parsed) : fullText }
        );

        if (this.conversationHistory.length > 20) {
          this.conversationHistory = this.conversationHistory.slice(-20);
        }

        return { text: responseText, images };
      }),
      catchError(error => throwError(() => this.formatError(error)))
    );
  }

  private sendImageGenerationMessage(userMessage: string): Observable<{ text: string; images?: MessageImage[] }> {
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
      ...(this.characterId && { characterId: this.characterId }),
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
}
