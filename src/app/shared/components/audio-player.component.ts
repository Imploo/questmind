import {
  Component,
  input,
  output,
  signal,
  computed,
  effect,
  OnDestroy,
  ChangeDetectionStrategy
} from '@angular/core';
import { CommonModule } from '@angular/common';

export interface AudioPlayerState {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  isMuted: boolean;
  playbackRate: number;
  isLoading: boolean;
  error: string | null;
}

/**
 * Reusable audio player component with full playback controls.
 * Presentational component that manages its own audio playback state.
 */
@Component({
  selector: 'app-audio-player',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="bg-gradient-to-br from-purple-50 to-pink-50 rounded-xl p-6 border border-purple-200 shadow-sm">
      @if (error()) {
        <div class="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
          <p class="text-sm text-red-700 m-0">⚠️ {{ error() }}</p>
        </div>
      }

      <!-- Main Controls -->
      <div class="flex items-center gap-4 mb-4">
        <!-- Play/Pause Button -->
        <button
          (click)="togglePlayPause()"
          [disabled]="isLoading() || !audioUrl()"
          class="flex-shrink-0 w-14 h-14 flex items-center justify-center rounded-full bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg hover:shadow-xl"
          [title]="isPlaying() ? 'Pauzeer' : 'Afspelen'"
        >
          @if (isLoading()) {
            <div class="w-6 h-6 border-3 border-white border-t-transparent rounded-full animate-spin"></div>
          } @else if (isPlaying()) {
            <svg class="w-7 h-7" fill="currentColor" viewBox="0 0 24 24">
              <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/>
            </svg>
          } @else {
            <svg class="w-7 h-7" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z"/>
            </svg>
          }
        </button>

        <!-- Progress Bar -->
        <div class="flex-1">
          <div class="flex items-center justify-between text-xs text-gray-600 mb-1">
            <span class="font-mono">{{ formatTime(currentTime()) }}</span>
            <span class="font-mono">{{ formatTime(duration()) }}</span>
          </div>
          <div class="relative group">
            <input
              type="range"
              [min]="0"
              [max]="duration() || 100"
              [value]="currentTime()"
              (input)="onSeek($event)"
              [disabled]="!audioUrl()"
              class="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer disabled:cursor-not-allowed
                     [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4
                     [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-purple-600
                     [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:shadow-md
                     hover:[&::-webkit-slider-thumb]:bg-purple-700
                     [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:rounded-full
                     [&::-moz-range-thumb]:bg-purple-600 [&::-moz-range-thumb]:border-0
                     [&::-moz-range-thumb]:cursor-pointer [&::-moz-range-thumb]:shadow-md
                     hover:[&::-moz-range-thumb]:bg-purple-700"
              [style.background]="progressGradient()"
            />
          </div>
          <div class="text-xs text-gray-500 mt-1 text-center">
            {{ progressPercentage() }}% afgespeeld
          </div>
        </div>
      </div>

      <!-- Additional Controls -->
      <div class="flex items-center justify-between gap-4">
        <!-- Volume Control -->
        <div class="flex items-center gap-2 flex-1 max-w-xs">
          <button
            (click)="toggleMute()"
            class="text-gray-600 hover:text-purple-600 transition-colors"
            [title]="isMuted() ? 'Dempen opheffen' : 'Dempen'"
          >
            @if (isMuted() || volume() === 0) {
              <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/>
              </svg>
            } @else if (volume() < 0.5) {
              <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M7 9v6h4l5 5V4l-5 5H7z"/>
              </svg>
            } @else {
              <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/>
              </svg>
            }
          </button>
          <input
            type="range"
            min="0"
            max="100"
            [value]="volume() * 100"
            (input)="onVolumeChange($event)"
            class="flex-1 h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer
                   [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3
                   [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-purple-600
                   [&::-webkit-slider-thumb]:cursor-pointer
                   [&::-moz-range-thumb]:w-3 [&::-moz-range-thumb]:h-3 [&::-moz-range-thumb]:rounded-full
                   [&::-moz-range-thumb]:bg-purple-600 [&::-moz-range-thumb]:border-0"
          />
          <span class="text-xs text-gray-600 font-mono w-10 text-right">{{ Math.round(volume() * 100) }}%</span>
        </div>

        <!-- Playback Speed -->
        <div class="flex items-center gap-2">
          <label class="text-xs text-gray-600">Snelheid:</label>
          <select
            [value]="playbackRate()"
            (change)="onPlaybackRateChange($event)"
            class="text-xs border border-gray-300 rounded px-2 py-1 bg-white hover:border-purple-400 focus:outline-none focus:ring-2 focus:ring-purple-500 cursor-pointer"
          >
            <option [value]="0.5">0.5x</option>
            <option [value]="0.75">0.75x</option>
            <option [value]="1">1x</option>
            <option [value]="1.25">1.25x</option>
            <option [value]="1.5">1.5x</option>
            <option [value]="2">2x</option>
          </select>
        </div>

        <!-- Stop Button -->
        <button
          (click)="stop()"
          [disabled]="!isPlaying() && currentTime() === 0"
          class="px-3 py-1.5 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium"
          title="Stop en reset"
        >
          ⏹️ Stop
        </button>
      </div>
    </div>
  `
})
export class AudioPlayerComponent implements OnDestroy {
  // Inputs
  audioUrl = input<string | null>(null);
  autoPlay = input<boolean>(false);

  // Outputs
  play = output<void>();
  pause = output<void>();
  ended = output<void>();
  timeUpdate = output<number>();
  stateChange = output<AudioPlayerState>();

  // State signals
  isPlaying = signal(false);
  currentTime = signal(0);
  duration = signal(0);
  volume = signal(1);
  isMuted = signal(false);
  playbackRate = signal(1);
  isLoading = signal(false);
  error = signal<string | null>(null);

  // Computed values
  progressPercentage = computed(() => {
    const dur = this.duration();
    if (dur === 0) return 0;
    return Math.round((this.currentTime() / dur) * 100);
  });

  progressGradient = computed(() => {
    const percentage = this.progressPercentage();
    return `linear-gradient(to right, rgb(147 51 234) 0%, rgb(147 51 234) ${percentage}%, rgb(229 231 235) ${percentage}%, rgb(229 231 235) 100%)`;
  });

  // Audio element
  private audio: HTMLAudioElement | null = null;
  protected readonly Math = Math;

  constructor() {
    // Effect to handle audio URL changes
    effect(() => {
      const url = this.audioUrl();
      if (url) {
        this.loadAudio(url);
      } else {
        this.cleanup();
      }
    });

    // Effect for autoplay
    effect(() => {
      if (this.autoPlay() && this.audio && !this.isPlaying()) {
        void this.togglePlayPause();
      }
    });
  }

  ngOnDestroy(): void {
    this.cleanup();
  }

  private loadAudio(url: string): void {
    this.cleanup();
    this.isLoading.set(true);
    this.error.set(null);

    try {
      this.audio = new Audio(url);

      // Set up event listeners
      this.audio.addEventListener('loadedmetadata', () => {
        if (this.audio) {
          this.duration.set(this.audio.duration || 0);
          this.isLoading.set(false);
        }
      });

      this.audio.addEventListener('timeupdate', () => {
        if (this.audio) {
          this.currentTime.set(this.audio.currentTime);
          this.timeUpdate.emit(this.audio.currentTime);
          this.emitState();
        }
      });

      this.audio.addEventListener('ended', () => {
        this.isPlaying.set(false);
        this.ended.emit();
        this.emitState();
      });

      this.audio.addEventListener('play', () => {
        this.isPlaying.set(true);
        this.play.emit();
        this.emitState();
      });

      this.audio.addEventListener('pause', () => {
        this.isPlaying.set(false);
        this.pause.emit();
        this.emitState();
      });

      this.audio.addEventListener('error', (e) => {
        console.error('Audio playback error:', e);
        this.error.set('Fout bij afspelen van audio');
        this.isLoading.set(false);
        this.isPlaying.set(false);
        this.emitState();
      });

      // Set initial volume
      this.audio.volume = this.volume();
      this.audio.playbackRate = this.playbackRate();

    } catch (err) {
      console.error('Failed to load audio:', err);
      this.error.set('Kon audio niet laden');
      this.isLoading.set(false);
    }
  }

  private cleanup(): void {
    if (this.audio) {
      this.audio.pause();
      this.audio.src = '';
      this.audio = null;
    }
    this.isPlaying.set(false);
    this.currentTime.set(0);
    this.duration.set(0);
  }

  async togglePlayPause(): Promise<void> {
    if (!this.audio) return;

    if (this.isPlaying()) {
      this.audio.pause();
    } else {
      try {
        await this.audio.play();
      } catch (err) {
        console.error('Play failed:', err);
        this.error.set('Afspelen mislukt');
      }
    }
  }

  stop(): void {
    if (!this.audio) return;
    this.audio.pause();
    this.audio.currentTime = 0;
    this.currentTime.set(0);
    this.isPlaying.set(false);
    this.emitState();
  }

  onSeek(event: Event): void {
    if (!this.audio) return;
    const target = event.target as HTMLInputElement;
    const time = parseFloat(target.value);
    this.audio.currentTime = time;
    this.currentTime.set(time);
  }

  onVolumeChange(event: Event): void {
    if (!this.audio) return;
    const target = event.target as HTMLInputElement;
    const vol = parseFloat(target.value) / 100;
    this.volume.set(vol);
    this.audio.volume = vol;
    if (vol > 0) {
      this.isMuted.set(false);
      this.audio.muted = false;
    }
  }

  toggleMute(): void {
    if (!this.audio) return;
    const newMutedState = !this.isMuted();
    this.isMuted.set(newMutedState);
    this.audio.muted = newMutedState;
  }

  onPlaybackRateChange(event: Event): void {
    if (!this.audio) return;
    const target = event.target as HTMLSelectElement;
    const rate = parseFloat(target.value);
    this.playbackRate.set(rate);
    this.audio.playbackRate = rate;
  }

  formatTime(seconds: number): string {
    if (!isFinite(seconds) || seconds < 0) return '0:00';

    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  private emitState(): void {
    this.stateChange.emit({
      isPlaying: this.isPlaying(),
      currentTime: this.currentTime(),
      duration: this.duration(),
      volume: this.volume(),
      isMuted: this.isMuted(),
      playbackRate: this.playbackRate(),
      isLoading: this.isLoading(),
      error: this.error()
    });
  }
}
