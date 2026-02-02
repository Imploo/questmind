import { Injectable, inject } from '@angular/core';
import { from, Observable, throwError } from 'rxjs';
import { catchError, map, retry, switchMap } from 'rxjs/operators';
import { GoogleGenAI } from '@google/genai';

import { SESSION_STORY_GENERATOR_PROMPT } from '../prompts';
import { environment } from '../../environments/environment';
import { getRetryDelay, isOverloadedError, MAX_RETRY_ATTEMPTS } from './audio-utilities';
import { KankaService } from '../kanka/kanka.service';
import { KankaSearchResult } from '../kanka/kanka.models';

@Injectable({
  providedIn: 'root'
})
export class SessionStoryService {
  private readonly ai: GoogleGenAI;
  private readonly kankaService = inject(KankaService);

  constructor() {
    this.ai = new GoogleGenAI({ apiKey: environment.googleAiApiKey });
  }

  generateStoryFromTranscript(
    transcript: string,
    title: string,
    sessionDate?: string,
    enableKankaLookup: boolean = true
  ): Observable<string> {
    if (!this.apiKeyConfigured()) {
      return throwError(() => ({
        status: 401,
        message: 'Google AI API key not configured. Please add your API key to the environment file.'
      }));
    }

    const trimmedTranscript = transcript.trim();

    if (enableKankaLookup && this.kankaService.isConfigured()) {
      return this.generateWithKankaContext(trimmedTranscript, title, sessionDate).pipe(
        catchError(() => this.generateStory(trimmedTranscript, title, sessionDate))
      );
    }

    return this.generateStory(trimmedTranscript, title, sessionDate);
  }

  isKankaAvailable(): boolean {
    return this.kankaService.isConfigured() && environment.kanka.enabled;
  }

  private apiKeyConfigured(): boolean {
    return !!environment.googleAiApiKey && environment.googleAiApiKey !== 'YOUR_GOOGLE_AI_API_KEY_HERE';
  }

  private generateWithKankaContext(
    transcript: string,
    title: string,
    sessionDate?: string
  ): Observable<string> {
    return this.kankaService.getAllEntities().pipe(
      switchMap(context => this.generateStoryWithContext(transcript, title, sessionDate, context))
    );
  }

  private generateStoryWithContext(
    transcript: string,
    title: string,
    sessionDate: string | undefined,
    context: KankaSearchResult
  ): Observable<string> {
    const contextPrompt = this.buildContextPrompt(context);
    const promptText = `${SESSION_STORY_GENERATOR_PROMPT}\n\nCAMPAIGN CONTEXT:\n${contextPrompt}\n\nSESSION TITLE: ${title}\nSESSION DATE: ${
      sessionDate || 'Unknown'
    }\n\nTRANSCRIPT:\n${transcript}\n\nWrite the recap in markdown, using the campaign context to ensure accuracy of names, locations, and quest details.`;

    console.log('Kanka prompt', promptText);
    return this.runPrompt(promptText);
  }

  private generateStory(transcript: string, title: string, sessionDate?: string): Observable<string> {
    const promptText = `${SESSION_STORY_GENERATOR_PROMPT}\n\nSESSION TITLE: ${title}\nSESSION DATE: ${
      sessionDate || 'Unknown'
    }\n\nTRANSCRIPT:\n${transcript}\n\nWrite the recap in markdown.`;

    return this.runPrompt(promptText);
  }

  private runPrompt(promptText: string): Observable<string> {
    return from(
      this.ai.models.generateContent({
        model: environment.aiModel,
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: promptText
              }
            ]
          }
        ],
        config: {
          maxOutputTokens: 32000,
          temperature: 0.5,
          topP: 0.95,
          topK: 40
        }
      })
    ).pipe(
      retry({
        count: MAX_RETRY_ATTEMPTS,
        delay: (error, retryCount) => getRetryDelay(error, retryCount)
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

  private buildContextPrompt(context: KankaSearchResult): string {
    const maxEntities = environment.kanka.maxContextEntities || 20;
    const sections: string[] = [];
    let remaining = maxEntities;

    const addSection = (
      label: string,
      entities: Array<{ name: string; entry?: string; entry_parsed?: string }>,
      limit: number | null = remaining
    ) => {
      if (!entities?.length || (limit !== null && limit <= 0)) {
        return;
      }
      const slice = limit === null ? entities : entities.slice(0, limit);
      if (limit !== null) {
        remaining -= slice.length;
      }
      const lines = slice.map(entity => `- ${entity.name}: ${this.summarizeEntry(entity.entry_parsed || entity.entry)}`);
      sections.push(`${label}:\n${lines.join('\n')}`);
    };

    addSection('CHARACTERS', context.characters, null);
    addSection('LOCATIONS', context.locations);
    addSection('QUESTS', context.quests);
    addSection('ORGANISATIONS', context.organisations);

    return sections.length ? sections.join('\n\n') : 'No matching campaign context found.';
  }

  private summarizeEntry(entry?: string): string {
    if (!entry) {
      return 'No description available.';
    }
    const cleaned = entry.replace(/\s+/g, ' ').trim();
    if (!cleaned) {
      return 'No description available.';
    }
    return cleaned.length > 240 ? `${cleaned.slice(0, 237)}...` : cleaned;
  }

  private handleError(error: any): Observable<never> {
    let errorMessage = 'Failed to generate the session story.';
    const status = error?.status ?? error?.error?.status;

    if (error?.message) {
      errorMessage = error.message;
    }

    if (status) {
      switch (status) {
        case 400:
          errorMessage = 'Invalid request sent to the AI service.';
          break;
        case 401:
          errorMessage = 'API key is invalid or missing. Please check configuration.';
          break;
        case 429:
          errorMessage = 'Rate limit exceeded. Please wait and try again.';
          break;
        case 500:
          errorMessage = 'AI service error. Please try again later.';
          break;
        case 503:
          errorMessage = 'The model is overloaded. Please try again shortly.';
          break;
      }
    }

    if (isOverloadedError(error)) {
      errorMessage = 'The model is overloaded. Please try again shortly.';
    }

    return throwError(() => ({
      status: status || 500,
      message: errorMessage,
      error
    }));
  }
}
