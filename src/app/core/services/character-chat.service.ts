import { Injectable, signal } from '@angular/core';
import { Observable, throwError } from 'rxjs';
import { GoogleGenAI } from '@google/genai';
import { environment } from '../../../environments/environment';
import { CHARACTER_BUILDER_PROMPT } from '../../prompts/character-builder.prompt';
import { DndCharacter } from '../../shared/schemas/dnd-character.schema';
import { extractStreamingResponseText } from '../utils/streaming-response.utils';

type StreamingChunk = { text?: string };
type StreamingHandle = AsyncIterable<StreamingChunk> & { cancel?: () => void };

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
  private readonly apiKey = environment.googleAiApiKey;
  private ai: GoogleGenAI;
  
  // State
  private messages = signal<ChatMessage[]>([]);
  private draftCharacter = signal<DndCharacter | null>(null);
  private conversationHistory: Array<{ role: string; parts: Array<{ text: string }> }> = [];

  constructor() {
    this.ai = new GoogleGenAI({ apiKey: this.apiKey });
  }

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
    if (!this.apiKey || this.apiKey === 'YOUR_GOOGLE_AI_API_KEY_HERE') {
      return throwError(() => new Error('Google AI API key not configured.'));
    }

    // Prepare context
    const systemPrompt = `${CHARACTER_BUILDER_PROMPT}\n\nCurrent Character JSON:\n${JSON.stringify(currentCharacter, null, 2)}`;

    // If history is empty, initialize it
    if (this.conversationHistory.length === 0) {
      this.conversationHistory = [
        { role: 'user', parts: [{ text: systemPrompt }] },
        { role: 'model', parts: [{ text: '{"thought": "System initialized", "character": ' + JSON.stringify(currentCharacter) + ', "response": "Ready to help."}' }] }
      ];
    }

    // Add user message to UI immediately
    const userMsgObj: ChatMessage = {
      id: Date.now().toString(),
      sender: 'user',
      text: userMessage,
      timestamp: new Date()
    };
    this.messages.update(msgs => [...msgs, userMsgObj]);

    // Prepare request
    const contents = [
      ...this.conversationHistory,
      { role: 'user', parts: [{ text: userMessage }] }
    ];

    const aiMessageId = (Date.now() + 1).toString();
    const aiMsgObj: ChatMessage = {
      id: aiMessageId,
      sender: 'ai',
      text: '',
      timestamp: new Date()
    };
    this.messages.update(msgs => [...msgs, aiMsgObj]);

    return new Observable<string>(observer => {
      let stream: StreamingHandle | null = null;
      let lastEmitted = '';

      const run = async () => {
        try {
          const activeStream = await this.ai.models.generateContentStream({
            model: environment.aiModel,
            contents,
            config: {
              responseMimeType: 'application/json'
            }
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
              this.updateAiMessage(aiMessageId, extracted.text);
              observer.next(extracted.text);
            }
          }

          const parsed = this.parseAiResponse(fullText);
          const responseText = parsed?.response || lastEmitted || fullText;

          if (parsed) {
            this.conversationHistory.push(
              { role: 'user', parts: [{ text: userMessage }] },
              { role: 'model', parts: [{ text: JSON.stringify(parsed) }] }
            );

            if (JSON.stringify(parsed.character) !== JSON.stringify(currentCharacter)) {
              this.draftCharacter.set(parsed.character);
            }
          } else {
            this.conversationHistory.push(
              { role: 'user', parts: [{ text: userMessage }] },
              { role: 'model', parts: [{ text: fullText }] }
            );
          }

          if (responseText !== lastEmitted) {
            this.updateAiMessage(aiMessageId, responseText);
            observer.next(responseText);
          }

          observer.complete();
        } catch (err) {
          const errorMsg: ChatMessage = {
            id: Date.now().toString(),
            sender: 'error',
            text: (err as { message?: string }).message || 'Unknown error',
            timestamp: new Date()
          };
          this.messages.update(msgs => [...msgs, errorMsg]);
          observer.error(err);
        }
      };

      run();

      return () => {
        stream?.cancel?.();
      };
    });
  }

  private updateAiMessage(messageId: string, text: string): void {
    this.messages.update(msgs =>
      msgs.map(message =>
        message.id === messageId ? { ...message, text } : message
      )
    );
  }

  private parseAiResponse(text: string): AiResponse | null {
    if (!text) {
      return null;
    }

    try {
      return JSON.parse(text) as AiResponse;
    } catch (error) {
      console.error('Failed to parse AI response', error);
      return null;
    }
  }
}
