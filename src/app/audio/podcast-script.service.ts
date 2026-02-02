import { Injectable, inject } from '@angular/core';
import { from, Observable, throwError } from 'rxjs';
import { catchError, map, retry, switchMap } from 'rxjs/operators';
import { GoogleGenAI } from '@google/genai';

import { PODCAST_SCRIPT_GENERATOR_PROMPT } from '../prompts';
import { environment } from '../../environments/environment';
import { getRetryDelay, isOverloadedError, MAX_RETRY_ATTEMPTS } from './audio-utilities';
import { KankaService } from '../kanka/kanka.service';
import { KankaSearchResult } from '../kanka/kanka.models';
import { PodcastScript, PodcastSegment } from './audio-session.models';

@Injectable({
  providedIn: 'root'
})
export class PodcastScriptService {
  private readonly ai: GoogleGenAI;
  private readonly kankaService = inject(KankaService);

  constructor() {
    this.ai = new GoogleGenAI({ apiKey: environment.googleAiApiKey });
  }

  generatePodcastScript(
    story: string,
    sessionTitle: string,
    sessionDate?: string,
    enableKankaLookup: boolean = true
  ): Observable<PodcastScript> {
    if (!this.apiKeyConfigured()) {
      return throwError(() => ({
        status: 401,
        message: 'Google AI API key not configured. Please add your API key to the environment file.'
      }));
    }

    const trimmedStory = story.trim();

    if (enableKankaLookup && this.kankaService.isConfigured()) {
      return this.generateWithKankaContext(trimmedStory, sessionTitle, sessionDate).pipe(
        catchError(() => this.generateScript(trimmedStory, sessionTitle, sessionDate))
      );
    }

    return this.generateScript(trimmedStory, sessionTitle, sessionDate);
  }

  private apiKeyConfigured(): boolean {
    return !!environment.googleAiApiKey && environment.googleAiApiKey !== 'YOUR_GOOGLE_AI_API_KEY_HERE';
  }

  private generateWithKankaContext(
    story: string,
    sessionTitle: string,
    sessionDate?: string
  ): Observable<PodcastScript> {
    return this.kankaService.getAllEntities().pipe(
      switchMap(context => this.generateScriptWithContext(story, sessionTitle, sessionDate, context))
    );
  }

  private generateScriptWithContext(
    story: string,
    sessionTitle: string,
    sessionDate: string | undefined,
    context: KankaSearchResult
  ): Observable<PodcastScript> {
    const contextPrompt = this.buildContextPrompt(context);
    const promptText = `${PODCAST_SCRIPT_GENERATOR_PROMPT}\n\nCAMPAIGN CONTEXT:\n${contextPrompt}\n\nSESSION TITLE: ${sessionTitle}\nSESSION DATE: ${
      sessionDate || 'Unknown'
    }\n\nSESSION STORY:\n${story}\n\nGenereer een podcast script met natuurlijke dialoog tussen HOST1 (man) en HOST2 (vrouw).`;

    return this.runPrompt(promptText);
  }

  private generateScript(
    story: string,
    sessionTitle: string,
    sessionDate?: string
  ): Observable<PodcastScript> {
    const promptText = `${PODCAST_SCRIPT_GENERATOR_PROMPT}\n\nSESSION TITLE: ${sessionTitle}\nSESSION DATE: ${
      sessionDate || 'Unknown'
    }\n\nSESSION STORY:\n${story}\n\nGenereer een podcast script met natuurlijke dialoog tussen HOST1 (man) en HOST2 (vrouw).`;

    return this.runPrompt(promptText);
  }

  private runPrompt(promptText: string): Observable<PodcastScript> {
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
          maxOutputTokens: 8192,
          temperature: 0.9, // Higher creativity for natural dialogue
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
        return this.parseScriptResponse(response.text);
      }),
      catchError(error => this.handleError(error))
    );
  }

  private parseScriptResponse(text: string): PodcastScript {
    const segments: PodcastSegment[] = [];
    const lines = text.split('\n').filter(line => line.trim());

    for (const line of lines) {
      const trimmedLine = line.trim();
      if (trimmedLine.startsWith('HOST1:')) {
        segments.push({
          speaker: 'host1',
          text: trimmedLine.replace('HOST1:', '').trim()
        });
      } else if (trimmedLine.startsWith('HOST2:')) {
        segments.push({
          speaker: 'host2',
          text: trimmedLine.replace('HOST2:', '').trim()
        });
      }
    }

    // Estimate duration: ~150 words per minute, average 3 words per second
    const totalWords = segments.reduce((sum, seg) => sum + seg.text.split(/\s+/).length, 0);
    const estimatedDuration = Math.ceil((totalWords / 150) * 60);

    return { segments, estimatedDuration };
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
    let errorMessage = 'Failed to generate the podcast script.';
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
