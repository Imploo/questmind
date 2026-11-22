import { Injectable, computed, inject, resource, signal } from '@angular/core';
import type { ActivatedRoute } from '@angular/router';
import { CampaignShareService } from './campaign-share.service';
import type { SharedCampaign } from './campaign-share.models';

/** The share id in the address of a page of a shared campaign, from wherever that page sits below it. */
export function shareIdOf(route: ActivatedRoute): string {
  return route.snapshot.pathFromRoot.map(part => part.paramMap.get('shareId')).find(Boolean) ?? '';
}

/**
 * The shared campaign behind a share link, loaded once for all its pages (the tabs
 * and the sessions). Provided by the route of the share link.
 */
@Injectable()
export class SharedCampaignStore {
  private readonly shareService = inject(CampaignShareService);

  readonly shareId = signal('');

  private readonly loaded = resource({
    params: () => this.shareId() || undefined,
    loader: ({ params }) => this.shareService.getSharedCampaign(params),
  });

  readonly isLoading = computed(() => !!this.shareId() && this.loaded.isLoading());
  /** The campaign; null while loading, when the link does not exist, or when loading failed. */
  readonly campaign = computed<SharedCampaign | null>(() => (this.loaded.hasValue() ? this.loaded.value() : null) ?? null);
  /** Loading failed for another reason than an unknown link. */
  readonly failed = computed(() => this.loaded.status() === 'error');
  /** The address of the shared campaign, for the links of its parts. */
  readonly base = computed(() => ['/share/campaign', this.shareId()]);

  /** Show the campaign of this share link (again the same one: nothing is reloaded). */
  select(shareId: string): void {
    this.shareId.set(shareId);
  }
}
