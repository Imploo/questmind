import { Injectable, signal } from '@angular/core';
import { Observable, throwError, from } from 'rxjs';
import { catchError, map, tap } from 'rxjs/operators';
import { GoogleGenAI } from '@google/genai';
import { environment } from '../../environments/environment';
import { DND_CHARACTER_ASSISTANT_PROMPT } from '../prompts';

export interface Message {
  id: string;
  sender: 'user' | 'ai' | 'error';
  text: string;
  timestamp: Date;
}

@Injectable({
  providedIn: 'root'
})
export class ChatService {
  private readonly apiKey = environment.googleAiApiKey;
  private ai: GoogleGenAI;
  
  // Use signals for reactive state management
  private messages = signal<Message[]>([]);
  private conversationHistory: Array<{ role: string; parts: Array<{ text: string }> }> = [];

  // D&D 5e system prompt (imported from prompts folder)
  private readonly SYSTEM_CONTEXT = DND_CHARACTER_ASSISTANT_PROMPT;

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
    this.conversationHistory = [
      {
        role: 'user',
        parts: [{ text: this.SYSTEM_CONTEXT }]
      },
      {
        role: 'model',
        parts: [{ text: 'Understood! I\'m ready to help you create amazing D&D 5e characters following the official rules. What would you like to create today?' }]
      }
    ];
  }

  sendMessage(userMessage: string): Observable<string> {
    // Check if API key is configured
    if (!this.apiKey || this.apiKey === 'YOUR_GOOGLE_AI_API_KEY_HERE') {
      return throwError(() => ({
        status: 401,
        message: 'Google AI API key not configured. Please add your API key to the environment file.'
      }));
    }

    // Build the contents array with conversation history
    const contents = [
      ...this.conversationHistory.map(msg => ({
        role: msg.role,
        parts: [{ text: msg.parts[0].text }]
      })),
      {
        role: 'user',
        parts: [{ text: userMessage }]
      }
    ];

    // Convert Promise to Observable
    return from(
      this.ai.models.generateContent({
        model: environment.aiModel,
        contents: contents
      })
    ).pipe(
      tap(response => {
        // Add to conversation history for context
        this.conversationHistory.push(
          {
            role: 'user',
            parts: [{ text: userMessage }]
          },
          {
            role: 'model',
            parts: [{ text: response.text || '' }]
          }
        );

        // Keep history manageable (last 10 exchanges + system context)
        if (this.conversationHistory.length > 22) {
          // Keep first 2 (system context) and last 20 messages
          this.conversationHistory = [
            ...this.conversationHistory.slice(0, 2),
            ...this.conversationHistory.slice(-20)
          ];
        }
      }),
      map(response => {
        if (!response.text) {
          throw new Error('No response generated');
        }
        return response.text;
      }),
      catchError(error => this.handleError(error))
    );
  }

  private handleError(error: any): Observable<never> {
    let errorMessage = 'An error occurred while communicating with the AI service.';

    if (error?.message) {
      errorMessage = error.message;
    }

    // Handle common Google AI API errors
    if (error?.status) {
      switch (error.status) {
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
      error: error
    });

    return throwError(() => ({
      status: error?.status || 500,
      message: errorMessage,
      error: error
    }));
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
