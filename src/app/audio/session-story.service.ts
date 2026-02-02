import { Injectable } from '@angular/core';
import { from, Observable, throwError } from 'rxjs';
import { catchError, map, retry } from 'rxjs/operators';
import { GoogleGenAI } from '@google/genai';

import { SESSION_STORY_GENERATOR_PROMPT } from '../prompts';
import { environment } from '../../environments/environment';
import { getRetryDelay, isOverloadedError, MAX_RETRY_ATTEMPTS } from './audio-utilities';

@Injectable({
  providedIn: 'root'
})
export class SessionStoryService {
  private readonly ai: GoogleGenAI;

  constructor() {
    this.ai = new GoogleGenAI({ apiKey: environment.googleAiApiKey });
  }

  generateStoryFromTranscript(transcript: string, title: string, sessionDate?: string): Observable<string> {
    if (!this.apiKeyConfigured()) {
      return throwError(() => ({
        status: 401,
        message: 'Google AI API key not configured. Please add your API key to the environment file.'
      }));
    }

    const trimmedTranscript =
      transcript.length > 20000 ? `${transcript.slice(0, 20000)}\n\n[Transcript truncated]` : transcript;

    return from(
      this.ai.models.generateContent({
        model: environment.aiModel,
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: `${SESSION_STORY_GENERATOR_PROMPT}\n\nSESSION TITLE: ${title}\nSESSION DATE: ${
                  sessionDate || 'Unknown'
                }\n\nTRANSCRIPT:\n${trimmedTranscript}\n\nWrite the recap in markdown.`
              }
            ]
          }
        ],
        config: {
          maxOutputTokens: 4096,
          temperature: 0.7,
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

  private apiKeyConfigured(): boolean {
    return !!environment.googleAiApiKey && environment.googleAiApiKey !== 'YOUR_GOOGLE_AI_API_KEY_HERE';
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
