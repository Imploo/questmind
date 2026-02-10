import { Injectable, inject, signal, OnDestroy } from '@angular/core';
import { doc, getDoc, onSnapshot, type Firestore, type Unsubscribe } from 'firebase/firestore';
import { FirebaseService } from '../firebase.service';

export interface AiModelConfig {
  model: string;
  temperature: number;
  topP: number;
  topK: number;
  maxOutputTokens: number;
}

export interface AiSettings {
  features: {
    transcription: AiModelConfig;
    storyGeneration: AiModelConfig;
    podcastScript: AiModelConfig;
    characterChat: AiModelConfig;
    podcastVoices: {
      host1VoiceId: string;
      host2VoiceId: string;
    };
  };
}

@Injectable({
  providedIn: 'root'
})
export class AiSettingsService implements OnDestroy {
  private readonly firebase = inject(FirebaseService);
  private readonly db: Firestore | null;
  private unsubscribe: Unsubscribe | null = null;

  // Cached settings
  private settings = signal<AiSettings | null>(null);
  private loading = signal<boolean>(false);
  private error = signal<string | null>(null);

  // Default fallback values
  private readonly defaultCharacterChatConfig: AiModelConfig = {
    model: 'gemini-2.0-flash-exp',
    temperature: 0.4,
    topP: 0.95,
    topK: 40,
    maxOutputTokens: 8192
  };

  constructor() {
    this.db = this.firebase.firestore;
    if (this.db) {
      this.subscribeToSettings();
    }
  }

  /**
   * Get character chat config (with fallback to defaults)
   */
  getCharacterChatConfig(): AiModelConfig {
    const settings = this.settings();
    return settings?.features?.characterChat ?? this.defaultCharacterChatConfig;
  }

  /**
   * Get all settings (readonly signal)
   */
  getSettings() {
    return this.settings.asReadonly();
  }

  /**
   * Get loading state
   */
  isLoading() {
    return this.loading.asReadonly();
  }

  /**
   * Get error state
   */
  getError() {
    return this.error.asReadonly();
  }

  /**
   * Subscribe to settings document in Firestore (real-time updates)
   */
  private subscribeToSettings(): void {
    if (!this.db) return;

    this.loading.set(true);
    this.error.set(null);

    const settingsDoc = doc(this.db, 'settings/ai');

    this.unsubscribe = onSnapshot(
      settingsDoc,
      (snapshot) => {
        if (snapshot.exists()) {
          this.settings.set(snapshot.data() as AiSettings);
          this.error.set(null);
        } else {
          console.warn('AI settings document not found, using defaults');
          this.error.set('Settings document not found');
        }
        this.loading.set(false);
      },
      (err) => {
        console.error('Error loading AI settings:', err);
        this.error.set(err.message || 'Failed to load settings');
        this.loading.set(false);
      }
    );
  }

  /**
   * Manually reload settings (one-time fetch)
   */
  async reloadSettings(): Promise<void> {
    if (!this.db) return;

    this.loading.set(true);
    this.error.set(null);

    try {
      const settingsDoc = doc(this.db, 'settings/ai');
      const snapshot = await getDoc(settingsDoc);

      if (snapshot.exists()) {
        this.settings.set(snapshot.data() as AiSettings);
        this.error.set(null);
      } else {
        console.warn('AI settings document not found, using defaults');
        this.error.set('Settings document not found');
      }
    } catch (err) {
      console.error('Error loading AI settings:', err);
      this.error.set(err instanceof Error ? err.message : 'Failed to load settings');
    } finally {
      this.loading.set(false);
    }
  }

  /**
   * Cleanup subscription on service destroy
   */
  ngOnDestroy(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
  }
}
