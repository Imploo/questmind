import { Injectable, signal, inject } from '@angular/core';
import { Observable, throwError } from 'rxjs';
import { GoogleGenAI } from '@google/genai';
import { environment } from '../../environments/environment';
import { CHARACTER_BUILDER_PROMPT } from "../prompts/character-builder.prompt";
import { DndCharacter } from '../shared/schemas/dnd-character.schema';
import { extractStreamingResponseText } from '../core/utils/streaming-response.utils';
import { AiSettingsService } from '../core/services/ai-settings.service';

type StreamingChunk = { text?: string };
type StreamingHandle = AsyncIterable<StreamingChunk> & { cancel?: () => void };

export interface Message {
  id: string;
  sender: 'user' | 'ai' | 'error';
  text: string;
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
  private readonly apiKey = environment.googleAiApiKey;
  private ai: GoogleGenAI;
  private aiSettingsService = inject(AiSettingsService);

  // Use signals for reactive state management
  private messages = signal<Message[]>([]);
  private conversationHistory: Array<{ role: string; parts: Array<{ text: string }> }> = [];
  private draftCharacter = signal<DndCharacter | null>(null);
  private currentCharacter: DndCharacter | null = null;

  constructor() {
    // Initialize Google AI SDK
    this.ai = new GoogleGenAI({
      apiKey: this.apiKey
    });
    
    // Initialize conversation with system context
    this.initializeConversation();
  }

  private initializeConversation(): void {
    // Add system context as first message in history
    const prompt = CHARACTER_BUILDER_PROMPT;
    const response = 'Ready to help evolve your character.';
    
    this.conversationHistory = [
      {
        role: 'user',
        parts: [{ text: prompt }]
      },
      {
        role: 'model',
        parts: [{ text: response }]
      }
    ];
  }

  setCurrentCharacter(character: DndCharacter | null): void {
    this.currentCharacter = character;
    this.draftCharacter.set(null);
    this.initializeConversation();
  }

  getDraftCharacter() {
    return this.draftCharacter.asReadonly();
  }

  clearDraft(): void {
    this.draftCharacter.set(null);
  }

  sendMessage(userMessage: string): Observable<string> {
    // Check if API key is configured
    if (!this.apiKey || this.apiKey === 'YOUR_GOOGLE_AI_API_KEY_HERE') {
      return throwError(() => ({
        status: 401,
        message: 'Google AI API key not configured. Please add your API key to the environment file.'
      }));
    }

    if (!this.currentCharacter) {
      return throwError(() => ({
        status: 400,
        message: 'No character selected. Please open a character to chat.'
      }));
    }

    const messageText = `Current Character JSON:\n${JSON.stringify(this.currentCharacter, null, 2)}\n\nUser Message: ${userMessage}`;

    // Build the contents array with conversation history
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

    // Get AI settings
    const aiConfig = this.aiSettingsService.getCharacterChatConfig();
    const config = {
      responseMimeType: 'application/json',
      temperature: aiConfig.temperature,
      topP: aiConfig.topP,
      topK: aiConfig.topK,
      maxOutputTokens: aiConfig.maxOutputTokens
    };

    return new Observable<string>(observer => {
      let stream: StreamingHandle | null = null;
      let lastEmitted = '';

      const run = async () => {
        try {
          const activeStream = await this.ai.models.generateContentStream({
            model: aiConfig.model || environment.aiModel,
            contents,
            config
          }) as StreamingHandle;
          stream = activeStream;

          let fullText = '';

          for await (const chunk of activeStream) {
            const chunkText = chunk.text || '';
            if (!chunkText) {
              continue;
            }
            fullText += chunkText;

            const extracted = extractStreamingResponseText(fullText);
            if (extracted && extracted.text !== lastEmitted) {
              lastEmitted = extracted.text;
              observer.next(extracted.text);
            }
          }

          const parsed = this.parseCharacterUpdateResponse(fullText);
          const responseText = parsed?.response || lastEmitted || fullText;

          if (parsed && this.currentCharacter) {
            if (JSON.stringify(parsed.character) !== JSON.stringify(this.currentCharacter)) {
              this.draftCharacter.set(parsed.character);
            }
          }

          this.conversationHistory.push(
            {
              role: 'user',
              parts: [{ text: userMessage }]
            },
            {
              role: 'model',
              parts: [{ text: parsed ? JSON.stringify(parsed) : fullText }]
            }
          );

          if (this.conversationHistory.length > 22) {
            this.conversationHistory = [
              ...this.conversationHistory.slice(0, 2),
              ...this.conversationHistory.slice(-20)
            ];
          }

          if (responseText !== lastEmitted) {
            observer.next(responseText);
          }
          observer.complete();
        } catch (error) {
          observer.error(this.formatError(error));
        }
      };

      run();

      return () => {
        stream?.cancel?.();
      };
    });
  }

  private formatError(error: unknown): { status: number; message: string; error?: unknown } {
    const err = error as { message?: string; status?: number };
    let errorMessage = 'An error occurred while communicating with the AI service.';

    if (err?.message) {
      errorMessage = err.message;
    }

    // Handle common Google AI API errors
    if (typeof err?.status === 'number') {
      switch (err.status) {
        case 400:
          errorMessage = 'Invalid request. Please try rephrasing your message.';
          break;
        case 401:
          errorMessage = 'API key is invalid. Please check your configuration.';
          break;
        case 403:
          errorMessage = 'Access forbidden. Please verify your API key has the correct permissions.';
          break;
        case 429:
          errorMessage = 'Rate limit exceeded. Please wait a moment before trying again.';
          break;
        case 500:
          errorMessage = 'AI service error. Please try again later.';
          break;
      }
    }

    console.error('ChatService Error:', {
      message: errorMessage,
      error: err
    });

    return {
      status: err?.status || 500,
      message: errorMessage,
      error: err
    };
  }

  private parseCharacterUpdateResponse(text: string): CharacterUpdateResponse | null {
    if (!text) {
      return null;
    }

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

  // Mock response for development/testing without API key
  getMockResponse(query: string): Observable<string> {
    const mockResponses: Record<string, string> = {
      'wizard': `Great choice! Let's create a wizard character for D&D 5e.

**Wizard Overview:**
- **Hit Points:** 6 + Constitution modifier at 1st level
- **Primary Ability:** Intelligence
- **Saving Throws:** Intelligence and Wisdom
- **Skills:** Choose 2 from Arcana, History, Insight, Investigation, Medicine, and Religion

**Starting Equipment:**
- A spellbook
- Component pouch or arcane focus
- Scholar's pack or explorer's pack
- Quarterstaff or dagger

**Spellcasting:**
At 1st level, you know 3 cantrips and can prepare 6 spells (1 + Intelligence modifier).

Popular starting cantrips:
- Fire Bolt (damage)
- Mage Hand (utility)
- Prestidigitation (utility)

Would you like help selecting spells or choosing a specific Arcane Tradition for 2nd level?`,
      
      'tasha': `Tasha's Cauldron of Everything adds great options for wizards!

**Key Features from Tasha's:**

1. **Custom Origin Rules:** You can reassign racial ability score increases
2. **New Spells:** Including Tasha's Mind Whip, Tasha's Caustic Brew
3. **Class Features:** Optional features like Cantrip Formulas (lets you swap cantrips)
4. **Bladesinging Wizard:** If you want a melee-focused wizard

Would you like to explore any of these options in detail?`,
      
      'default': `I'd be happy to help you with D&D 5e character creation!

I can assist with:
- Creating characters from any official class
- Explaining rules from the Player's Handbook, Tasha's Cauldron, and Xanathar's Guide
- Suggesting spell combinations and equipment
- Clarifying rules and mechanics

What kind of character would you like to create? Or do you have a specific question about D&D 5e rules?`
    };

    const lowerQuery = query.toLowerCase();
    let response = mockResponses['default'];

    if (lowerQuery.includes('wizard')) {
      response = mockResponses['wizard'];
    } else if (lowerQuery.includes('tasha')) {
      response = mockResponses['tasha'];
    }

    // Simulate network delay
    return new Observable(observer => {
      setTimeout(() => {
        observer.next(response);
        observer.complete();
      }, 1000 + Math.random() * 1000);
    });
  }
}
