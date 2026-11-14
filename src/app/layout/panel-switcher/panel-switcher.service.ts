import { Injectable, signal } from '@angular/core';
import { Subject } from 'rxjs';

/** The two panels a character page splits into on a narrow screen. */
export type PagePanel = 'sheet' | 'chat';

/** How far the panels are scrolled, from 0 (the sheet) to 1 (the chat), as a CSS number. */
const PROGRESS_PROPERTY = '--panel-progress';

/** The panel that counts as the one on screen at a scroll progress between 0 and 1. */
export function panelAt(progress: number): PagePanel {
  return progress > 0.5 ? 'chat' : 'sheet';
}

/**
 * What the panel switcher shows. A page that lays its sheet and chat out as two
 * swipeable panels reports here; the switcher, which sits in the top bar outside that
 * page, reads it and asks for a panel when a tab is tapped.
 */
@Injectable({ providedIn: 'root' })
export class PanelSwitcherService {
  /** True while a page shows its sheet and chat as two panels side by side. */
  readonly enabled = signal(false);
  readonly active = signal<PagePanel>('sheet');
  /** An answer arrived in the chat while the sheet was on screen. */
  readonly unread = signal(false);

  private readonly requests = new Subject<PagePanel>();
  /** A tab was tapped: the page scrolls to that panel. */
  readonly requested = this.requests.asObservable();

  show(panel: PagePanel): void {
    this.requests.next(panel);
  }

  /**
   * The page reports how far its panels are scrolled. The thumb of the switcher follows
   * through a CSS property, so a swipe costs no change detection.
   */
  setProgress(progress: number): void {
    const clamped = Math.min(1, Math.max(0, progress));
    document.documentElement.style.setProperty(PROGRESS_PROPERTY, clamped.toFixed(4));
    const panel = panelAt(clamped);
    if (panel !== this.active()) {
      this.active.set(panel);
    }
    if (panel === 'chat' && this.unread()) {
      this.unread.set(false);
    }
  }

  /** The page stopped showing panels. */
  reset(): void {
    document.documentElement.style.removeProperty(PROGRESS_PROPERTY);
    this.enabled.set(false);
    this.active.set('sheet');
    this.unread.set(false);
  }
}
