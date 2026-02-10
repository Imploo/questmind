import { Injectable, signal, inject } from '@angular/core';
import { Observable, from, throwError } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { httpsCallable } from 'firebase/functions';
import { CHARACTER_BUILDER_PROMPT } from "../prompts/character-builder.prompt";
import { DndCharacter } from '../shared/schemas/dnd-character.schema';
import { AiSettingsService } from '../core/services/ai-settings.service';
import { FirebaseService } from '../core/firebase.service';

const IMAGE_TRIGGER_REGEX = /maak\s+afbeelding/i;

interface ChatContent {
  role: string;
  parts: { text: string }[];
}

interface ChatGenerationConfig {
  responseMimeType: string;
  responseModalities?: string[];
  temperature: number;
  topP: number;
  topK: number;
  maxOutputTokens: number;
}

interface CharacterChatRequest {
  contents: ChatContent[];
  config: ChatGenerationConfig;
  model: string;
  characterId?: string;
}

interface CharacterVisuals {
  name: string;
  race: string;
  characterClass: string;
  appearance?: {
    age?: string;
    height?: string;
    weight?: string;
    eyes?: string;
    skin?: string;
    hair?: string;
    description?: string;
  };
}

interface GenerateImageRequest {
  prompt: string;
  model: string;
  characterId?: string;
  characterVisuals?: CharacterVisuals;
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
  private conversationHistory: { role: string; parts: { text: string }[] }[] = [];
  private draftCharacter = signal<DndCharacter | null>(null);
  private currentCharacter: DndCharacter | null = null;
  private characterId: string | null = null;

  constructor() {
    this.initializeConversation();
  }

  private initializeConversation(): void {
    this.conversationHistory = [
      {
        role: 'user',
        parts: [{ text: CHARACTER_BUILDER_PROMPT }]
      },
      {
        role: 'model',
        parts: [{ text: 'Ready to help evolve your character.' }]
      }
    ];
  }

  setCurrentCharacter(character: DndCharacter | null): void {
    this.currentCharacter = character;
    this.draftCharacter.set(null);
    this.initializeConversation();
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

    const messageText = `Current Character JSON:\n${JSON.stringify(this.currentCharacter, null, 2)}\n\nUser Message: ${userMessage}`;

    const contents = [
      ...this.conversationHistory.map(msg => ({
        role: msg.role,
        parts: [{ text: msg.parts[0].text }]
      })),
      {
        role: 'user',
        parts: [{ text: messageText }]
      }
    ];

    const aiConfig = this.aiSettingsService.getCharacterChatConfig();
    const config = {
      responseMimeType: 'application/json',
      temperature: aiConfig.temperature,
      topP: aiConfig.topP,
      topK: aiConfig.topK,
      maxOutputTokens: aiConfig.maxOutputTokens
    };

    const model = aiConfig.model;

    const characterChat = httpsCallable<CharacterChatRequest, { text: string; images?: MessageImage[] }>(
      functions, 'characterChat'
    );

    const payload: CharacterChatRequest = {
      contents,
      config,
      model,
      ...(this.characterId && { characterId: this.characterId })
    };

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
          { role: 'user', parts: [{ text: userMessage }] },
          { role: 'model', parts: [{ text: parsed ? JSON.stringify(parsed) : fullText }] }
        );

        if (this.conversationHistory.length > 22) {
          this.conversationHistory = [
            ...this.conversationHistory.slice(0, 2),
            ...this.conversationHistory.slice(-20)
          ];
        }

        return { text: responseText, images };
      }),
      catchError(error => throwError(() => this.formatError(error)))
    );
  }

  private sendImageGenerationMessage(userMessage: string): Observable<{ text: string; images?: MessageImage[] }> {
    const functions = this.firebase.requireFunctions();

    // Extract prompt: text after "maak afbeelding", or use the full message as prompt
    const match = userMessage.match(/maak\s+afbeelding\s*(.*)/i);
    const prompt = match?.[1]?.trim() || userMessage;

    const imageConfig = this.aiSettingsService.getImageGenerationConfig();

    const generateImage = httpsCallable<GenerateImageRequest, GenerateImageResponse>(
      functions, 'generateImage'
    );

    const characterVisuals: CharacterVisuals | undefined = this.currentCharacter
      ? {
          name: this.currentCharacter.name,
          race: this.currentCharacter.race,
          characterClass: this.currentCharacter.class,
          ...(this.currentCharacter.appearance && { appearance: this.currentCharacter.appearance })
        }
      : undefined;

    const payload: GenerateImageRequest = {
      prompt,
      model: imageConfig.model,
      ...(this.characterId && { characterId: this.characterId }),
      ...(characterVisuals && { characterVisuals })
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

    // Firebase Functions error codes
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
    this.initializeConversation();
  }
}
