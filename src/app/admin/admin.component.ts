import { Component, signal, OnInit, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FirebaseService } from '../core/firebase.service';
import { UserService } from '../core/user.service';
import { doc, getDoc, setDoc } from 'firebase/firestore';

export interface AiSettings {
  features: {
    transcription: {
      model: string;
      temperature: number;
      topP: number;
      topK: number;
      maxOutputTokens: number;
    };
    storyGeneration: {
      model: string;
      temperature: number;
      topP: number;
      topK: number;
      maxOutputTokens: number;
    };
    podcastScript: {
      model: string;
      temperature: number;
      topP: number;
      topK: number;
      maxOutputTokens: number;
    };
  };
}

@Component({
  selector: 'app-admin',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="bg-white/90 backdrop-blur rounded-2xl p-6 shadow-lg">
      @if (!userService.isAdmin()) {
        <div class="p-8 text-center">
          <div class="text-6xl mb-4">🚫</div>
          <h2 class="text-2xl font-bold text-gray-800 mb-2">Access Denied</h2>
          <p class="text-gray-600">You do not have permission to access the admin panel.</p>
        </div>
      } @else {
        <div class="mb-6">
          <h2 class="text-2xl font-bold text-gray-800 mb-2">Admin Panel</h2>
          <p class="text-sm text-gray-600">Manage system settings</p>
        </div>

        <div class="space-y-6">
          <!-- AI Settings Editor Section -->
        <div class="border border-gray-200 rounded-xl p-5 bg-white">
          <h3 class="text-lg font-semibold text-gray-800 mb-2">AI Settings Editor</h3>
          <p class="text-sm text-gray-600 mb-4">
            View and edit AI model configurations for different features.
          </p>

          @if (loadingSettings()) {
            <div class="flex items-center justify-center py-8">
              <span class="inline-block animate-spin text-2xl">⏳</span>
              <span class="ml-2 text-gray-600">Loading settings...</span>
            </div>
          } @else if (settingsError()) {
            <div class="p-4 rounded-lg bg-red-50 border border-red-200">
              <div class="flex items-start gap-2">
                <span class="text-lg">❌</span>
                <div class="flex-1">
                  <p class="font-semibold text-red-800">Error Loading Settings</p>
                  <p class="text-sm text-red-700">{{ settingsError() }}</p>
                </div>
              </div>
              <button
                type="button"
                class="mt-3 px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-semibold hover:bg-red-700 transition-all"
                (click)="loadSettings()"
              >
                Retry
              </button>
            </div>
          } @else if (aiSettings()) {
            <form (ngSubmit)="saveSettings()">
              <!-- Transcription Settings -->
              <div class="mb-6 p-4 bg-gray-50 rounded-lg">
                <h4 class="font-semibold text-gray-800 mb-3 flex items-center gap-2">
                  <span>🎤</span>
                  <span>Transcription</span>
                </h4>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Model</label>
                    <input
                      type="text"
                      [(ngModel)]="aiSettings()!.features.transcription.model"
                      name="transcription-model"
                      class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Temperature</label>
                    <input
                      type="number"
                      [(ngModel)]="aiSettings()!.features.transcription.temperature"
                      name="transcription-temperature"
                      step="0.1"
                      min="0"
                      max="2"
                      class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Top P</label>
                    <input
                      type="number"
                      [(ngModel)]="aiSettings()!.features.transcription.topP"
                      name="transcription-topP"
                      step="0.05"
                      min="0"
                      max="1"
                      class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Top K</label>
                    <input
                      type="number"
                      [(ngModel)]="aiSettings()!.features.transcription.topK"
                      name="transcription-topK"
                      step="1"
                      min="1"
                      class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                    />
                  </div>
                  <div class="md:col-span-2">
                    <label class="block text-sm font-medium text-gray-700 mb-1">Max Output Tokens</label>
                    <input
                      type="number"
                      [(ngModel)]="aiSettings()!.features.transcription.maxOutputTokens"
                      name="transcription-maxTokens"
                      step="1000"
                      min="1000"
                      class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                    />
                  </div>
                </div>
              </div>

              <!-- Story Generation Settings -->
              <div class="mb-6 p-4 bg-gray-50 rounded-lg">
                <h4 class="font-semibold text-gray-800 mb-3 flex items-center gap-2">
                  <span>📖</span>
                  <span>Story Generation</span>
                </h4>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Model</label>
                    <input
                      type="text"
                      [(ngModel)]="aiSettings()!.features.storyGeneration.model"
                      name="story-model"
                      class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Temperature</label>
                    <input
                      type="number"
                      [(ngModel)]="aiSettings()!.features.storyGeneration.temperature"
                      name="story-temperature"
                      step="0.1"
                      min="0"
                      max="2"
                      class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Top P</label>
                    <input
                      type="number"
                      [(ngModel)]="aiSettings()!.features.storyGeneration.topP"
                      name="story-topP"
                      step="0.05"
                      min="0"
                      max="1"
                      class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Top K</label>
                    <input
                      type="number"
                      [(ngModel)]="aiSettings()!.features.storyGeneration.topK"
                      name="story-topK"
                      step="1"
                      min="1"
                      class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                    />
                  </div>
                  <div class="md:col-span-2">
                    <label class="block text-sm font-medium text-gray-700 mb-1">Max Output Tokens</label>
                    <input
                      type="number"
                      [(ngModel)]="aiSettings()!.features.storyGeneration.maxOutputTokens"
                      name="story-maxTokens"
                      step="1000"
                      min="1000"
                      class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                    />
                  </div>
                </div>
              </div>

              <!-- Podcast Script Settings -->
              <div class="mb-6 p-4 bg-gray-50 rounded-lg">
                <h4 class="font-semibold text-gray-800 mb-3 flex items-center gap-2">
                  <span>🎙️</span>
                  <span>Podcast Script</span>
                </h4>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Model</label>
                    <input
                      type="text"
                      [(ngModel)]="aiSettings()!.features.podcastScript.model"
                      name="podcast-model"
                      class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Temperature</label>
                    <input
                      type="number"
                      [(ngModel)]="aiSettings()!.features.podcastScript.temperature"
                      name="podcast-temperature"
                      step="0.1"
                      min="0"
                      max="2"
                      class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Top P</label>
                    <input
                      type="number"
                      [(ngModel)]="aiSettings()!.features.podcastScript.topP"
                      name="podcast-topP"
                      step="0.05"
                      min="0"
                      max="1"
                      class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Top K</label>
                    <input
                      type="number"
                      [(ngModel)]="aiSettings()!.features.podcastScript.topK"
                      name="podcast-topK"
                      step="1"
                      min="1"
                      class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                    />
                  </div>
                  <div class="md:col-span-2">
                    <label class="block text-sm font-medium text-gray-700 mb-1">Max Output Tokens</label>
                    <input
                      type="number"
                      [(ngModel)]="aiSettings()!.features.podcastScript.maxOutputTokens"
                      name="podcast-maxTokens"
                      step="1000"
                      min="1000"
                      class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                    />
                  </div>
                </div>
              </div>

              <!-- Action Buttons -->
              <div class="flex gap-3">
                <button
                  type="submit"
                  class="px-6 py-3 rounded-xl text-sm font-semibold transition-all shadow-sm"
                  [class]="savingSettings() ? 'bg-gray-400 text-white cursor-not-allowed' : 'bg-primary text-white hover:bg-primary/90 hover:shadow-md'"
                  [disabled]="savingSettings()"
                >
                  <span class="flex items-center gap-2">
                    @if (savingSettings()) {
                      <span class="inline-block animate-spin">⏳</span>
                      <span>Saving...</span>
                    } @else {
                      <span>💾</span>
                      <span>Save Settings</span>
                    }
                  </span>
                </button>

                <button
                  type="button"
                  class="px-6 py-3 rounded-xl text-sm font-semibold transition-all shadow-sm bg-gray-200 text-gray-700 hover:bg-gray-300"
                  [disabled]="savingSettings()"
                  (click)="loadSettings()"
                >
                  <span class="flex items-center gap-2">
                    <span>🔄</span>
                    <span>Reload</span>
                  </span>
                </button>
              </div>

              @if (saveResult()) {
                <div
                  class="mt-4 p-4 rounded-lg"
                  [class]="saveResult()!.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'"
                >
                  <div class="flex items-start gap-2">
                    <span class="text-lg">{{ saveResult()!.success ? '✅' : '❌' }}</span>
                    <div class="flex-1">
                      <p class="font-semibold" [class]="saveResult()!.success ? 'text-green-800' : 'text-red-800'">
                        {{ saveResult()!.success ? 'Success' : 'Error' }}
                      </p>
                      <p class="text-sm" [class]="saveResult()!.success ? 'text-green-700' : 'text-red-700'">
                        {{ saveResult()!.message }}
                      </p>
                    </div>
                  </div>
                </div>
              }
            </form>
          }
        </div>
        </div>
      }
    </div>
  `
})
export class AdminComponent implements OnInit {
  private readonly firebaseService = inject(FirebaseService);
  readonly userService = inject(UserService);

  // AI Settings Editor
  aiSettings = signal<AiSettings | null>(null);
  loadingSettings = signal(false);
  savingSettings = signal(false);
  settingsError = signal<string | null>(null);
  saveResult = signal<{ success: boolean; message: string } | null>(null);

  ngOnInit() {
    // Only load settings if user is admin
    if (this.userService.isAdmin()) {
      this.loadSettings();
    }
  }

  async loadSettings() {
    this.loadingSettings.set(true);
    this.settingsError.set(null);
    this.saveResult.set(null);

    try {
      const firestore = this.firebaseService.requireFirestore();
      const settingsDoc = doc(firestore, 'settings/ai');
      const snapshot = await getDoc(settingsDoc);

      if (snapshot.exists()) {
        this.aiSettings.set(snapshot.data() as AiSettings);
      } else {
        this.settingsError.set('AI settings document not found. Run migration first.');
      }
    } catch (error) {
      console.error('Error loading AI settings:', error);
      this.settingsError.set(
        error instanceof Error ? error.message : 'Failed to load AI settings'
      );
    } finally {
      this.loadingSettings.set(false);
    }
  }

  async saveSettings() {
    const settings = this.aiSettings();
    if (!settings) {
      return;
    }

    this.savingSettings.set(true);
    this.saveResult.set(null);

    try {
      const firestore = this.firebaseService.requireFirestore();
      const settingsDoc = doc(firestore, 'settings/ai');
      await setDoc(settingsDoc, settings, { merge: true });

      this.saveResult.set({
        success: true,
        message: 'AI settings saved successfully'
      });

      console.log('AI settings saved:', settings);
    } catch (error) {
      console.error('Error saving AI settings:', error);
      this.saveResult.set({
        success: false,
        message: error instanceof Error ? error.message : 'Failed to save AI settings'
      });
    } finally {
      this.savingSettings.set(false);
    }
  }
}
