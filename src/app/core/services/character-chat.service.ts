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
  private conversationHistory: { role: string; parts: { text: string }[] }[] = [];

  getMessages() {
    return this.messages.asReadonly();
  }

  getDraftCharacter() {
    return this.draftCharacter.asReadonly();
  }

  resetConversation() {
    this.messages.set([]);
    this.draftCharacter.set(null);
    this.conversationHistory = [];
  }

  clearDraft() {
    this.draftCharacter.set(null);
  }

  sendMessage(userMessage: string, currentCharacter: DndCharacter): Observable<string> {
    // Always use the latest character: draft if exists, otherwise the current saved version
    const latestCharacter = this.draftCharacter() ?? currentCharacter;
    const systemPrompt = `${CHARACTER_BUILDER_PROMPT}\n\nCurrent Character JSON:\n${JSON.stringify(latestCharacter, null, 2)}`;

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

    // Build contents: system prompt + conversation history (messages only) + new user message
    const contents = [
      { role: 'user', parts: [{ text: systemPrompt }] },
      { role: 'model', parts: [{ text: '{"thought": "System initialized", "character": ' + JSON.stringify(latestCharacter) + ', "response": "Ready to help."}' }] },
      ...this.conversationHistory,
      { role: 'user', parts: [{ text: userMessage }] }
    ];

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

        // Store only the messages in conversation history (not the JSON models)
        this.conversationHistory.push(
          { role: 'user', parts: [{ text: userMessage }] },
          { role: 'model', parts: [{ text: responseText }] }
        );

        // Update draft character if it changed
        if (parsed) {
          const latestCharacter = this.draftCharacter() ?? currentCharacter;
          if (JSON.stringify(parsed.character) !== JSON.stringify(latestCharacter)) {
            this.draftCharacter.set(parsed.character);
          }
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
