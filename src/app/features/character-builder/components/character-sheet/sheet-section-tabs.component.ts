import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, afterNextRender, inject, input, signal } from '@angular/core';

/** A part of the sheet a tab jumps to: the element marked `data-section="<id>"`. */
export interface SheetSection {
  id: string;
  label: string;
}

/** Where the visible part of the sheet starts, in viewport pixels, and whether it is scrolled to its end. */
export interface SheetView {
  top: number;
  atEnd: boolean;
}

/** Marks what follows the last section; past it no tab is lit. */
const AFTER_SECTIONS = 'story';
/** How far below the top of the view a section has to come before its tab lights up. */
const READING_LINE_PX = 96;
/** How long the sheet takes to scroll to a tapped section, however far away that is. */
const SCROLL_DURATION_MS = 300;

/** Sets off at speed and settles gently. */
const easeOut = (progress: number) => 1 - Math.pow(1 - progress, 3);

/**
 * The section someone is reading: the last one whose top has passed the reading line.
 * None above the first section, and none once the part after the sections has passed
 * the line too. Scrolled to the very end it is the last section, since a short one at
 * the bottom can never reach the line.
 */
export function sectionInView(sections: { id: string; top: number }[], view: SheetView, afterTop: number | null): string | null {
  const line = view.top + READING_LINE_PX;
  if (afterTop !== null && afterTop <= line) return null;
  const passed = view.atEnd ? sections : sections.filter(section => section.top <= line);
  return passed.at(-1)?.id ?? null;
}

/** The element the sheet scrolls in, or null when it is the page itself. */
function scrollParentOf(element: HTMLElement): HTMLElement | null {
  for (let node = element.parentElement; node && node !== document.body; node = node.parentElement) {
    const overflowY = getComputedStyle(node).overflowY;
    if (overflowY === 'auto' || overflowY === 'scroll') return node;
  }
  return null;
}

/**
 * The tabs along the left edge of the sheet. They hang from the bottom of the screen
 * while the sheet scrolls past: a tap scrolls to that section, and the tab of the
 * section being read is lit. With room beside the sheet they are a table of contents
 * on its left instead. Placed beside the sheet, inside the same parent, which has to
 * be positioned; it finds the sections in that parent by their `data-section` mark.
 */
@Component({
  selector: 'app-sheet-section-tabs',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.is-lifted]': 'lifted()' },
  template: `
    <nav class="rail" aria-label="Sections of the sheet">
      @for (section of sections(); track section.id) {
        <button
          type="button"
          class="tab"
          [class.is-active]="active() === section.id"
          [attr.aria-current]="active() === section.id ? 'location' : null"
          (click)="goTo(section.id)"
        >
          <span class="mark" aria-hidden="true"></span>
          <span class="label">{{ section.label }}</span>
        </button>
      }
    </nav>
  `,
  styles: [`
    /* A line without height at the foot of the sheet, held just above the bottom of the screen. */
    :host {
      position: sticky;
      bottom: calc(0.75rem + env(safe-area-inset-bottom, 0px));
      z-index: 15;
      display: block;
      height: 0;
      max-width: 64rem;
      margin: 0 auto;
    }
    /* A play toast lies along the bottom edge: the tabs make room for it. */
    :host(.is-lifted) { bottom: calc(5.5rem + env(safe-area-inset-bottom, 0px)); }

    /* The tabs grow upward from that line. They hug the edge of the screen and lie over the margin of the sheet. */
    .rail {
      position: absolute;
      bottom: 0;
      left: calc(-1 * var(--sheet-gutter, 0.75rem));
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 3px;
    }
    .tab {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 7px;
      width: 26px;
      padding: 10px 0 11px;
      color: #5f5347;
      background: #f3ecdc;
      border: 1px solid #d9c9a6;
      border-left: none;
      border-radius: 0 8px 8px 0;
      box-shadow: 3px 4px 10px -6px rgba(30, 16, 70, 0.5);
      cursor: pointer;
      touch-action: manipulation;
      transition: width 0.18s, background 0.18s, color 0.18s;
    }
    .tab:hover { color: var(--ink, #2a2320); background: var(--paper-2, #f8f2e6); }
    .tab.is-active {
      width: 30px;
      color: var(--gold-deep, #8a6623);
      background: var(--paper, #fffdf8);
      border-color: var(--gold, #b48a3c);
      box-shadow: 5px 6px 14px -8px rgba(30, 16, 70, 0.6);
    }
    .tab:focus-visible { outline: 2px solid var(--ink, #2a2320); outline-offset: 2px; }
    /* The diamond of the sheet: filled on the lit tab, hollow on the others, like a spent use. */
    .mark { width: 6px; height: 6px; transform: rotate(45deg); border: 1.5px solid #a8956c; }
    .tab.is-active .mark { background: var(--gold, #b48a3c); border-color: var(--gold, #b48a3c); }
    .label {
      writing-mode: vertical-rl;
      transform: rotate(180deg);
      font-family: var(--font-display);
      font-size: 10px;
      font-weight: 700;
      line-height: 1;
      letter-spacing: 0.14em;
      text-transform: uppercase;
    }

    @media (min-width: 640px) {
      .rail { left: calc(-1 * var(--sheet-gutter, 1.5rem)); }
    }

    /*
     * A short screen: the tabs tighten up rather than run off the top, and on one too
     * short even for that they step aside. Once by the height of the screen, for a
     * sheet that scrolls with the page, and once by the height of the panel it scrolls in.
     */
    @media (max-height: 600px) {
      .rail { gap: 2px; }
      .tab { padding: 6px 0 7px; }
      .mark { display: none; }
    }
    @media (max-height: 480px) {
      :host { display: none; }
    }
    @container sheet-panel (max-height: 560px) {
      .rail { gap: 2px; }
      .tab { padding: 6px 0 7px; }
      .mark { display: none; }
    }
    @container sheet-panel (max-height: 430px) {
      :host { display: none; }
    }

    /*
     * On a desktop with room beside the sheet the tabs are its table of contents: a
     * small panel on its left with the labels written out, which stays at the top of
     * the screen while the sheet scrolls past. The page keeps that room free under the
     * same two conditions, and says how wide it is. Last in this sheet, so it also
     * undoes the tightening above.
     */
    @media (min-width: 1024px) {
      @container sheet-panel (min-width: 53.5rem) {
        /* A column as high as the sheet, for the panel to travel down. */
        :host, :host(.is-lifted) {
          position: absolute;
          top: 0;
          bottom: 0;
          right: calc(100% + var(--sheet-toc-gap, 1.25rem));
          display: block;
          width: var(--sheet-toc-width, 10.25rem);
          height: auto;
          margin: 0;
        }
        .rail {
          position: sticky;
          top: 1.5rem;
          bottom: auto;
          left: auto;
          align-items: stretch;
          gap: 2px;
          padding: 10px;
          background: var(--paper, #fffdf8);
          border: 1px solid var(--line, #e8dcc5);
          border-radius: 14px;
          box-shadow: var(--panel-shadow);
        }
        .tab {
          flex-direction: row;
          gap: 10px;
          width: auto;
          min-height: 40px;
          padding: 0 9px;
          background: transparent;
          border: 1px solid transparent;
          border-radius: 8px;
          box-shadow: none;
          transition: background 0.18s, color 0.18s;
        }
        .tab:hover { background: var(--paper-2, #f8f2e6); }
        .tab.is-active {
          width: auto;
          background: var(--paper-2, #f8f2e6);
          border-color: #e0d2b6;
          box-shadow: none;
        }
        .mark { display: block; flex-shrink: 0; }
        .label { writing-mode: horizontal-tb; transform: none; font-size: 11.5px; letter-spacing: 0.12em; }
      }
    }
  `]
})
export class SheetSectionTabsComponent {
  sections = input.required<SheetSection[]>();
  /** Something lies along the bottom edge of the sheet: the tabs start above it. */
  lifted = input(false);

  /** The section being read; null above the first one and below the last. */
  active = signal<string | null>(null);

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  /** Set while a tap scrolls the sheet: the tapped tab stays lit until the sheet has arrived. */
  private scrollFrame: number | null = null;
  private frame: number | null = null;

  constructor() {
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      // Scroll events do not bubble, but they can be caught on their way down: this
      // way it does not matter whether the page scrolls or a panel around the sheet.
      const onScroll = (event: Event) => {
        if (this.concerns(event)) this.scheduleUpdate();
      };
      const onResize = () => this.scheduleUpdate();
      document.addEventListener('scroll', onScroll, { capture: true, passive: true });
      window.addEventListener('resize', onResize, { passive: true });
      destroyRef.onDestroy(() => {
        document.removeEventListener('scroll', onScroll, { capture: true });
        window.removeEventListener('resize', onResize);
        if (this.frame !== null) cancelAnimationFrame(this.frame);
        if (this.scrollFrame !== null) cancelAnimationFrame(this.scrollFrame);
      });
      this.update();
    });
  }

  /**
   * Scrolls the sheet to a section, in a fixed short time: the scroll of the browser
   * itself takes up to a second for a section far away, and cannot be told to hurry.
   */
  goTo(id: string): void {
    const target = this.sectionElement(id);
    if (!target) return;
    if (this.scrollFrame !== null) cancelAnimationFrame(this.scrollFrame);
    this.scrollFrame = null;
    this.active.set(id);

    const scroller = scrollParentOf(this.host);
    const page = document.scrollingElement ?? document.documentElement;
    const from = scroller ? scroller.scrollTop : window.scrollY;
    const viewTop = scroller ? scroller.getBoundingClientRect().top : 0;
    const end = scroller ? scroller.scrollHeight - scroller.clientHeight : page.scrollHeight - window.innerHeight;
    // The section keeps the distance from the top that its scroll margin asks for.
    const margin = parseFloat(getComputedStyle(target).scrollMarginTop) || 0;
    const to = Math.max(0, Math.min(end, from + target.getBoundingClientRect().top - viewTop - margin));
    const scrollTo = (top: number) => (scroller ?? window).scrollTo({ top, behavior: 'instant' });

    // The scroll events of the last step, or of the jump, set the lit tab right once the sheet is there.
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      scrollTo(to);
      return;
    }
    const start = performance.now();
    const step = (now: number) => {
      const progress = Math.max(0, Math.min(1, (now - start) / SCROLL_DURATION_MS));
      scrollTo(from + (to - from) * easeOut(progress));
      this.scrollFrame = progress < 1 ? requestAnimationFrame(step) : null;
    };
    this.scrollFrame = requestAnimationFrame(step);
  }

  /** Whether the scroll moved the sheet: that of the page, or of an element around the sheet. */
  private concerns(event: Event): boolean {
    const target = event.target;
    return !(target instanceof Element) || target.contains(this.host);
  }

  private scheduleUpdate(): void {
    if (this.frame !== null) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = null;
      this.update();
    });
  }

  private update(): void {
    if (this.scrollFrame !== null) return;
    const sections = this.sections().flatMap(({ id }) => {
      const element = this.sectionElement(id);
      return element ? [{ id, top: element.getBoundingClientRect().top }] : [];
    });
    const after = this.sectionElement(AFTER_SECTIONS);
    this.active.set(sectionInView(sections, this.view(), after ? after.getBoundingClientRect().top : null));
  }

  private sectionElement(id: string): HTMLElement | null {
    return this.host.parentElement?.querySelector<HTMLElement>(`[data-section="${id}"]`) ?? null;
  }

  private view(): SheetView {
    const scroller = scrollParentOf(this.host);
    if (!scroller) {
      const page = document.scrollingElement ?? document.documentElement;
      const atEnd = window.scrollY > 0 && window.scrollY + window.innerHeight >= page.scrollHeight - 2;
      return { top: 0, atEnd };
    }
    const atEnd = scroller.scrollTop > 0 && scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 2;
    return { top: scroller.getBoundingClientRect().top, atEnd };
  }
}
