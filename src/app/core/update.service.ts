import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import bundledVersion from '../../version.json';

@Injectable({ providedIn: 'root' })
export class UpdateService {
  private http = inject(HttpClient);

  updateAvailable = signal(false);

  async init(): Promise<void> {
    await this.checkForUpdate();
    setInterval(() => void this.checkForUpdate(), 30 * 60 * 1000);
  }

  async checkForUpdate(): Promise<void> {
    const latest = await this.fetchVersion();
    if (latest && latest !== bundledVersion.v) {
      this.updateAvailable.set(true);
    }
  }

  reload(): void {
    window.location.reload();
  }

  private async fetchVersion(): Promise<string | null> {
    try {
      const data = await firstValueFrom(
        this.http.get<{ v: string }>('/version.json', {
          headers: { 'Cache-Control': 'no-cache' },
        })
      );
      return data?.v ?? null;
    } catch {
      return null;
    }
  }
}
