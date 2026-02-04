import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AiSettingsMigrationService, type MigrationResult } from '../core/ai-settings-migration.service';

@Component({
  selector: 'app-admin',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="bg-white/90 backdrop-blur rounded-2xl p-6 shadow-lg">
      <div class="mb-6">
        <h2 class="text-2xl font-bold text-gray-800 mb-2">Admin Panel</h2>
        <p class="text-sm text-gray-600">Manage system settings and run migrations</p>
      </div>

      <div class="space-y-6">
        <!-- AI Settings Migration Section -->
        <div class="border border-gray-200 rounded-xl p-5 bg-white">
          <h3 class="text-lg font-semibold text-gray-800 mb-2">AI Settings Migration</h3>
          <p class="text-sm text-gray-600 mb-4">
            Update AI settings with feature-specific configurations for transcription, story generation, and podcast scripts.
          </p>

          <button
            type="button"
            class="px-6 py-3 rounded-xl text-sm font-semibold transition-all shadow-sm"
            [class]="isLoading() ? 'bg-gray-400 text-white cursor-not-allowed' : 'bg-primary text-white hover:bg-primary/90 hover:shadow-md'"
            [disabled]="isLoading()"
            (click)="runMigration()"
          >
            <span class="flex items-center gap-2">
              @if (isLoading()) {
                <span class="inline-block animate-spin">⏳</span>
                <span>Migrating...</span>
              } @else {
                <span>🔧</span>
                <span>Update AI Settings</span>
              }
            </span>
          </button>

          @if (result()) {
            <div
              class="mt-4 p-4 rounded-lg"
              [class]="result()!.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'"
            >
              <div class="flex items-start gap-2">
                <span class="text-lg">{{ result()!.success ? '✅' : '❌' }}</span>
                <div class="flex-1">
                  <p class="font-semibold" [class]="result()!.success ? 'text-green-800' : 'text-red-800'">
                    {{ result()!.success ? 'Success' : 'Error' }}
                  </p>
                  <p class="text-sm" [class]="result()!.success ? 'text-green-700' : 'text-red-700'">
                    {{ result()!.message }}
                  </p>
                  @if (result()!.error) {
                    <p class="text-xs text-red-600 mt-1">{{ result()!.error }}</p>
                  }
                </div>
              </div>
            </div>
          }
        </div>

        <!-- Future migration sections can be added here -->
      </div>
    </div>
  `
})
export class AdminComponent {
  isLoading = signal(false);
  result = signal<MigrationResult | null>(null);

  constructor(private aiMigration: AiSettingsMigrationService) {}

  async runMigration() {
    this.isLoading.set(true);
    this.result.set(null);

    try {
      const migrationResult = await this.aiMigration.updateAISettings();
      this.result.set(migrationResult);
    } catch (error) {
      this.result.set({
        success: false,
        message: 'Unexpected error occurred',
        error: error instanceof Error ? error.message : String(error)
      });
    } finally {
      this.isLoading.set(false);
    }
  }
}
