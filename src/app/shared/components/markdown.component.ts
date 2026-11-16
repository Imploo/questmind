import { ChangeDetectionStrategy, Component, ViewEncapsulation, computed, input } from '@angular/core';
import { markdownToHtml } from '../utils/markdown';

/**
 * A rule text or note with its markdown worked out: headings, emphasis, lists and tables.
 * It takes the font size and colour of the place it is put in.
 */
@Component({
  selector: 'app-markdown',
  changeDetection: ChangeDetectionStrategy.OnPush,
  // The rendered HTML is not part of the template, so scoped styles would not reach it.
  encapsulation: ViewEncapsulation.None,
  host: { '[innerHTML]': 'html()' },
  template: '',
  styles: [`
    app-markdown { display: block; overflow-wrap: break-word; }
    app-markdown > :first-child { margin-top: 0; }
    app-markdown > :last-child { margin-bottom: 0; }

    app-markdown p, app-markdown ul, app-markdown ol, app-markdown blockquote, app-markdown pre, app-markdown table {
      margin: 0 0 0.65em;
    }
    app-markdown :is(h1, h2, h3, h4, h5, h6) {
      margin: 1.1em 0 0.3em;
      font-family: var(--font-display);
      font-size: 1em;
      font-weight: 700;
      letter-spacing: 0.04em;
      line-height: 1.35;
      color: var(--gold-deep);
    }
    app-markdown :is(h1, h2) { font-size: 1.12em; }
    app-markdown strong { font-weight: 700; color: var(--ink); }
    app-markdown a { color: var(--color-primary-dark); text-decoration: underline; }
    app-markdown hr { margin: 0.9em 0; border: 0; border-top: 1px dashed var(--line); }

    app-markdown ul, app-markdown ol { padding-left: 1.15rem; }
    app-markdown ol { list-style: decimal; }
    app-markdown ol > li::marker { font-weight: 600; color: var(--gold-deep); }
    app-markdown ul > li { position: relative; }
    app-markdown ul > li::before {
      content: '';
      position: absolute;
      left: -0.95rem;
      top: 0.6em;
      width: 5px;
      height: 5px;
      background: var(--gold);
      transform: rotate(45deg);
    }
    app-markdown li + li, app-markdown li > :is(ul, ol) { margin-top: 0.25em; }
    app-markdown li > :is(ul, ol), app-markdown li > p:last-child { margin-bottom: 0; }

    app-markdown blockquote { padding-left: 0.75rem; border-left: 2px solid var(--gold); font-style: italic; }
    app-markdown :is(code, pre) { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.92em; }
    app-markdown pre { white-space: pre-wrap; }

    /* A wide table scrolls within the text instead of widening the page. */
    app-markdown table { display: block; max-width: 100%; overflow-x: auto; border-collapse: collapse; font-variant-numeric: tabular-nums; }
    app-markdown :is(th, td) { padding: 0.3em 0.9em 0.3em 0; text-align: left; vertical-align: top; }
    app-markdown :is(th, td):last-child { padding-right: 0; }
    app-markdown th { font-weight: 700; color: var(--ink); border-bottom: 1px solid #d9c9a6; }
    app-markdown td { border-bottom: 1px dashed var(--line); }
    app-markdown tr:last-child > td { border-bottom: 0; }
  `],
})
export class MarkdownComponent {
  text = input.required<string>();

  protected readonly html = computed(() => markdownToHtml(this.text()));
}
