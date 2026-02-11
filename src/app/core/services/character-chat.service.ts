import { Injectable, signal, inject } from '@angular/core';
import { Observable, from, throwError } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { httpsCallable } from 'firebase/functions';
import { environment } from '../../../environments/environment';
import { CHARACTER_BUILDER_PROMPT } from '../../prompts/character-builder.prompt';
import { DndCharacter } from '../../shared/schemas/dnd-character.schema';
import { FirebaseService } from '../firebase.service';

interface ChatContent {
  role: string;
  parts: { text: string }[];
}

interface ChatGenerationConfig {
  responseMimeType: string;
}

interface CharacterChatRequest {
  contents: ChatContent[];
  config: ChatGenerationConfig;
  model: string;
}

// Only the visible text per turn — no metadata, no JSON blobs
interface DialogueTurn {
  role: 'user' | 'model';
  text: string;
}

export interface ChatMessage {
  id: string;
  sender: 'user' | 'ai' | 'error';
  text: string;
  timestamp: Date;
}

export interface AiResponse {
  thought: string;
  character: DndCharacter;
  response: string;
}

@Injectable({
  providedIn: 'root'
})
export class CharacterChatService {
  private readonly firebaseService = inject(FirebaseService);

  private messages = signal<ChatMessage[]>([]);
  private draftCharacter = signal<DndCharacter | null>(null);

  // Only stores the visible dialogue — user text as typed, AI text as the response field
  private dialogueHistory: DialogueTurn[] = [];

  getMessages() {
    return this.messages.asReadonly();
  }

  getDraftCharacter() {
    return this.draftCharacter.asReadonly();
  }

  resetConversation() {
    this.messages.set([]);
    this.draftCharacter.set(null);
    this.dialogueHistory = [];
  }

  clearDraft() {
    this.draftCharacter.set(null);
  }

  sendMessage(userMessage: string, currentCharacter: DndCharacter): Observable<string> {
    const userMsgObj: ChatMessage = {
      id: Date.now().toString(),
      sender: 'user',
      text: userMessage,
      timestamp: new Date()
    };
    this.messages.update(msgs => [...msgs, userMsgObj]);

    const aiMessageId = (Date.now() + 1).toString();
    this.messages.update(msgs => [...msgs, {
      id: aiMessageId,
      sender: 'ai',
      text: '',
      timestamp: new Date()
    }]);

    const contents = this.buildContents(userMessage, currentCharacter);

    const functions = this.firebaseService.requireFunctions();
    const characterChat = httpsCallable<CharacterChatRequest, { text: string }>(
      functions, 'characterChat'
    );

    return from(characterChat({
      contents,
      config: { responseMimeType: 'application/json' },
      model: environment.aiModel
    })).pipe(
      map(result => {
        const fullText = result.data.text;
        const parsed = this.parseAiResponse(fullText);
        const responseText = parsed?.response ?? fullText;

        // Store only the visible dialogue — no metadata, no embedded JSON
        this.dialogueHistory.push(
          { role: 'user', text: userMessage },
          { role: 'model', text: responseText }
        );

        if (parsed && JSON.stringify(parsed.character) !== JSON.stringify(currentCharacter)) {
          this.draftCharacter.set(parsed.character);
        }

        this.updateAiMessage(aiMessageId, responseText);
        return responseText;
      }),
      catchError(err => {
        const errorMsg: ChatMessage = {
          id: Date.now().toString(),
          sender: 'error',
          text: (err as { message?: string }).message ?? 'Unknown error',
          timestamp: new Date()
        };
        this.messages.update(msgs => [...msgs, errorMsg]);
        return throwError(() => err);
      })
    );
  }

  /**
   * Builds the full contents payload for each request:
   * 1. System prompt
   * 2. Current character state (draft if available, otherwise the last known version)
   * 3. Visible dialogue history (user text + AI response text only)
   * 4. New user message
   */
  private buildContents(userMessage: string, currentCharacter: DndCharacter): ChatContent[] {
    const character = this.draftCharacter() ?? currentCharacter;

    return [
      { role: 'user', parts: [{ text: CHARACTER_BUILDER_PROMPT }] },
      { role: 'model', parts: [{ text: 'Ready to help evolve your character.' }] },
      { role: 'user', parts: [{ text: `Huidig karakter:\n${JSON.stringify(character, null, 2)}` }] },
      { role: 'model', parts: [{ text: 'Begrepen, ik gebruik dit als basis.' }] },
      ...this.dialogueHistory.map(turn => ({
        role: turn.role,
        parts: [{ text: turn.text }]
      })),
      { role: 'user', parts: [{ text: userMessage }] },
    ];
  }

  private updateAiMessage(messageId: string, text: string): void {
    this.messages.update(msgs =>
      msgs.map(message =>
        message.id === messageId ? { ...message, text } : message
      )
    );
  }

  private parseAiResponse(text: string): AiResponse | null {
    if (!text) return null;
    try {
      return JSON.parse(text) as AiResponse;
    } catch (error) {
      console.error('Failed to parse AI response', error);
      return null;
    }
  }
}
