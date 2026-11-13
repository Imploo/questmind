import { Component, effect, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../auth/auth.service';
import { CampaignContextService } from './campaign-context.service';
import { CampaignService } from './campaign.service';
import { Campaign, CampaignVoiceIntro } from './campaign.models';
import { CampaignVoiceIntroService } from './campaign-voice-intro.service';
import { CampaignVoiceIntroComponent } from './campaign-voice-intro.component';
import { CampaignVoiceRosterComponent } from './campaign-voice-roster.component';
import * as logger from '../shared/logger';

@Component({
  selector: 'app-campaign-settings',
  imports: [FormsModule, CampaignVoiceIntroComponent, CampaignVoiceRosterComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="max-w-4xl mx-auto">
      @if (selectedCampaign()) {
        <header class="flex flex-wrap items-end justify-between gap-4 mb-5 sm:mb-6">
          <div class="min-w-0">
            <div class="qm-page-eyebrow">Campaign Settings</div>
            <h2 class="qm-page-title mt-1 break-words">{{ selectedCampaign()!.name }}</h2>
            @if (selectedCampaign()!.description) {
              <p class="qm-page-sub mt-1 max-w-2xl">{{ selectedCampaign()!.description }}</p>
            }
          </div>
          <button type="button" (click)="goBack()" class="qm-btn">
            ← Back
          </button>
        </header>

        <div class="space-y-4 sm:space-y-6">
          <!-- General -->
          <section class="qm-panel sm:!p-6">
            <h4 class="qm-section-title">General Settings</h4>

            <div class="qm-well mb-4">
              <div class="qm-eyebrow">Campaign Owner</div>
              <div class="font-semibold mt-0.5 break-all">{{ selectedCampaign()!.ownerEmail }}</div>
            </div>

            <div class="space-y-3">
              <!-- Kanka Integration -->
              <div class="qm-well">
                <label class="flex items-center gap-2.5 text-sm font-semibold cursor-pointer">
                  <input type="checkbox" [(ngModel)]="kankaEnabled" class="h-4 w-4" />
                  Enable Kanka Integration
                </label>
                @if (kankaEnabled) {
                  <div class="mt-3 ml-6">
                    <label for="kanka-campaign-id" class="qm-label">Kanka Campaign ID</label>
                    <input
                      id="kanka-campaign-id"
                      type="text"
                      [(ngModel)]="kankaCampaignId"
                      placeholder="e.g. 123456"
                      class="qm-input max-w-md"
                    />
                    <p class="qm-help mt-1">
                      Used for Kanka integration when generating stories.
                    </p>
                  </div>
                }
              </div>

              <!-- Member Permissions -->
              <div class="qm-well">
                <label class="flex items-center gap-2.5 text-sm font-semibold cursor-pointer">
                  <input type="checkbox" [(ngModel)]="allowMembersToCreateSessions" class="h-4 w-4" />
                  Allow members to create sessions
                </label>
              </div>

              <!-- Save Button -->
              <div class="flex flex-wrap items-center gap-3 pt-1">
                <button
                  type="button"
                  (click)="saveCampaignSettings()"
                  [disabled]="isSaving()"
                  class="qm-btn qm-btn-primary"
                >
                  {{ isSaving() ? 'Saving...' : 'Save Settings' }}
                </button>
                @if (saveSuccess()) {
                  <div class="text-sm font-medium text-[#3a652f]" role="status">
                    Settings saved successfully!
                  </div>
                }
                @if (saveError()) {
                  <div class="text-sm font-medium text-wine" role="alert">
                    {{ saveError() }}
                  </div>
                }
              </div>
            </div>
          </section>

          <!-- Transcription -->
          <section class="qm-panel sm:!p-6">
            <h4 class="qm-section-title">Transcription</h4>
            <app-campaign-voice-intro
              [voiceIntro]="selectedCampaign()!.settings?.voiceIntro"
              [playbackUrl]="voiceIntroPlaybackUrl()"
              [canEdit]="isCampaignOwner(selectedCampaign()!)"
              [isBusy]="voiceIntroBusy()"
              [progress]="voiceIntroProgress()"
              [errorMessage]="voiceIntroError()"
              (fileSelected)="uploadVoiceIntro($event)"
              (removeRequested)="removeVoiceIntro()"
            />
            <app-campaign-voice-roster
              [roster]="selectedCampaign()!.settings?.voiceIntroRoster ?? ''"
              [canEdit]="isCampaignOwner(selectedCampaign()!)"
              [isBusy]="voiceRosterBusy()"
              [errorMessage]="voiceRosterError()"
              (rosterSaved)="saveVoiceIntroRoster($event)"
            />
          </section>

          <!-- Members -->
          <section class="qm-panel sm:!p-6">
            <h4 class="qm-section-title">Members ({{ campaignMembers().length }})</h4>
            <ul class="space-y-2">
              @for (member of campaignMembers(); track member.userId) {
                <li class="qm-well flex items-center justify-between gap-3">
                  <div class="flex min-w-0 items-center gap-3">
                    <span class="qm-medallion qm-medallion-sm" aria-hidden="true">{{ member.email.charAt(0).toUpperCase() }}</span>
                    <div class="min-w-0">
                      <div class="font-semibold truncate">{{ member.email }}</div>
                      <div class="qm-eyebrow">{{ member.role }}</div>
                    </div>
                  </div>
                  @if (isCampaignOwner(selectedCampaign()!) && member.role !== 'owner') {
                    <button type="button" (click)="removeMember(member.userId)" class="qm-btn qm-btn-sm qm-btn-danger">
                      Remove
                    </button>
                  }
                </li>
              }
            </ul>

            <!-- Invite Member -->
            @if (isCampaignOwner(selectedCampaign()!)) {
              <div class="mt-6 border-t border-dashed border-[#e0d2b6] pt-5">
                <label for="invite-email" class="qm-label">Invite Member</label>
                <div class="flex flex-wrap gap-2">
                  <input
                    id="invite-email"
                    type="email"
                    [(ngModel)]="inviteEmail"
                    placeholder="user@example.com"
                    class="qm-input min-w-0 flex-1"
                  />
                  <button
                    type="button"
                    (click)="inviteMember()"
                    [disabled]="!inviteEmail.trim().length || isInviting()"
                    class="qm-btn qm-btn-primary"
                  >
                    {{ isInviting() ? 'Inviting...' : 'Invite' }}
                  </button>
                </div>
                @if (inviteError()) {
                  <div class="mt-2 text-sm text-wine" role="alert">{{ inviteError() }}</div>
                }
                @if (inviteSuccess()) {
                  <div class="mt-2 text-sm text-[#3a652f]" role="status">{{ inviteSuccess() }}</div>
                }
              </div>
            }
          </section>
        </div>
      } @else {
        <div class="qm-panel qm-hero qm-empty">
          <p class="qm-empty-text">No campaign selected</p>
        </div>
      }
    </div>
  `
})
export class CampaignSettingsComponent {
  private readonly router = inject(Router);
  private readonly authService = inject(AuthService);
  private readonly campaignService = inject(CampaignService);
  private readonly campaignContext = inject(CampaignContextService);
  private readonly voiceIntroService = inject(CampaignVoiceIntroService);

  selectedCampaign = this.campaignContext.selectedCampaign;
  campaignMembers = signal<{ userId: string; role: string; email: string }[]>([]);
  
  inviteEmail = '';
  inviteError = signal('');
  inviteSuccess = signal('');
  isInviting = signal(false);
  
  kankaEnabled = false;
  kankaCampaignId = '';
  allowMembersToCreateSessions = true;
  
  isSaving = signal(false);
  saveSuccess = signal(false);
  saveError = signal('');

  voiceIntroPlaybackUrl = signal<string | null>(null);
  voiceIntroBusy = signal(false);
  voiceIntroProgress = signal<number | null>(null);
  voiceIntroError = signal('');

  voiceRosterBusy = signal(false);
  voiceRosterError = signal('');

  constructor() {
    effect(() => {
      const campaign = this.selectedCampaign();
      if (campaign) {
        this.kankaEnabled = campaign.settings?.kankaEnabled ?? false;
        this.kankaCampaignId = campaign.settings?.kankaCampaignId || '';
        this.allowMembersToCreateSessions = campaign.settings?.allowMembersToCreateSessions ?? true;
        void this.loadMembers();
        void this.loadVoiceIntroPlaybackUrl(campaign.settings?.voiceIntro);
      }
    });
  }

  goBack(): void {
    const campaignId = this.campaignContext.selectedCampaignId();
    if (campaignId) {
      void this.router.navigate(['/campaign', campaignId]);
    } else {
      void this.router.navigate(['/']);
    }
  }

  async saveCampaignSettings(): Promise<void> {
    this.isSaving.set(true);
    this.saveSuccess.set(false);
    this.saveError.set('');
    
    try {
      const campaignId = this.campaignContext.selectedCampaignId();
      if (!campaignId) return;
      
      await this.campaignService.updateCampaign(campaignId, {
        settings: {
          ...(this.selectedCampaign()?.settings || {}),
          allowMembersToCreateSessions: this.allowMembersToCreateSessions,
          kankaEnabled: this.kankaEnabled,
          kankaCampaignId: this.kankaCampaignId.trim() || undefined
        }
      });
      
      await this.campaignContext.refreshCampaigns();
      this.saveSuccess.set(true);
      setTimeout(() => this.saveSuccess.set(false), 3000);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to save settings';
      this.saveError.set(errorMessage);
      setTimeout(() => this.saveError.set(''), 5000);
    } finally {
      this.isSaving.set(false);
    }
  }

  async uploadVoiceIntro(file: File): Promise<void> {
    const campaignId = this.campaignContext.selectedCampaignId();
    if (!campaignId) return;

    const validationError = this.voiceIntroService.validateFile(file);
    if (validationError) {
      this.voiceIntroError.set(validationError);
      return;
    }

    this.voiceIntroError.set('');
    this.voiceIntroBusy.set(true);
    this.voiceIntroProgress.set(0);
    try {
      await this.voiceIntroService.upload(
        campaignId,
        file,
        (progress) => this.voiceIntroProgress.set(progress)
      );
      await this.campaignContext.refreshCampaigns();
    } catch (error: unknown) {
      logger.error('[CampaignSettings] Voice intro upload failed:', error);
      this.voiceIntroError.set(error instanceof Error ? error.message : 'Failed to upload voice introduction');
    } finally {
      this.voiceIntroBusy.set(false);
      this.voiceIntroProgress.set(null);
    }
  }

  async removeVoiceIntro(): Promise<void> {
    const campaignId = this.campaignContext.selectedCampaignId();
    const current = this.selectedCampaign()?.settings?.voiceIntro;
    if (!campaignId || !current) return;
    if (!confirm('Remove the voice introduction? Transcriptions will no longer use it for speaker recognition.')) {
      return;
    }

    this.voiceIntroError.set('');
    this.voiceIntroBusy.set(true);
    try {
      await this.voiceIntroService.remove(campaignId, current);
      await this.campaignContext.refreshCampaigns();
    } catch (error: unknown) {
      logger.error('[CampaignSettings] Voice intro removal failed:', error);
      this.voiceIntroError.set(error instanceof Error ? error.message : 'Failed to remove voice introduction');
    } finally {
      this.voiceIntroBusy.set(false);
    }
  }

  async saveVoiceIntroRoster(roster: string): Promise<void> {
    const campaignId = this.campaignContext.selectedCampaignId();
    if (!campaignId) return;

    this.voiceRosterError.set('');
    this.voiceRosterBusy.set(true);
    try {
      await this.campaignService.updateVoiceIntroRoster(campaignId, roster);
      await this.campaignContext.refreshCampaigns();
    } catch (error: unknown) {
      logger.error('[CampaignSettings] Saving voice intro speaking order failed:', error);
      this.voiceRosterError.set(error instanceof Error ? error.message : 'Failed to save speaking order');
    } finally {
      this.voiceRosterBusy.set(false);
    }
  }

  async inviteMember(): Promise<void> {
    this.inviteError.set('');
    this.inviteSuccess.set('');
    this.isInviting.set(true);
    
    try {
      const campaignId = this.campaignContext.selectedCampaignId();
      if (!campaignId) return;
      
      await this.campaignService.inviteUserByEmail(campaignId, this.inviteEmail);
      this.inviteSuccess.set('User invited successfully!');
      this.inviteEmail = '';
      await this.loadMembers();
      void this.campaignContext.refreshCampaigns();
      setTimeout(() => this.inviteSuccess.set(''), 3000);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to invite user';
      this.inviteError.set(errorMessage);
    } finally {
      this.isInviting.set(false);
    }
  }

  async removeMember(userId: string): Promise<void> {
    if (!confirm('Are you sure you want to remove this member?')) {
      return;
    }
    
    try {
      const campaignId = this.campaignContext.selectedCampaignId();
      if (!campaignId) return;
      
      await this.campaignService.removeMember(campaignId, userId);
      await this.loadMembers();
      void this.campaignContext.refreshCampaigns();
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to remove member';
      this.inviteError.set(errorMessage);
    }
  }

  isCampaignOwner(campaign: Campaign): boolean {
    const userId = this.authService.currentUser()?.uid;
    return this.campaignService.isCampaignOwner(campaign, userId);
  }

  private async loadVoiceIntroPlaybackUrl(voiceIntro: CampaignVoiceIntro | undefined): Promise<void> {
    if (!voiceIntro) {
      this.voiceIntroPlaybackUrl.set(null);
      return;
    }
    try {
      this.voiceIntroPlaybackUrl.set(await this.voiceIntroService.getPlaybackUrl(voiceIntro));
    } catch (error: unknown) {
      logger.error('[CampaignSettings] Could not load voice intro playback URL:', error);
      this.voiceIntroPlaybackUrl.set(null);
    }
  }

  private async loadMembers(): Promise<void> {
    const campaignId = this.campaignContext.selectedCampaignId();
    if (!campaignId) {
      this.campaignMembers.set([]);
      return;
    }
    const members = await this.campaignService.getCampaignMembers(campaignId);
    this.campaignMembers.set(members);
  }
}
