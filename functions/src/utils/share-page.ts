import { captureException } from './sentry-error-handler';

/** Hosts a share page may be served under — used for absolute og:url/og:image links. */
const ALLOWED_HOST_PATTERN = /^(questmind\.nl|[\w-]+\.web\.app|[\w-]+\.firebaseapp\.com)$/;
/** The SPA shell changes per deploy (hashed bundles), so it is only cached briefly. */
const INDEX_CACHE_MS = 60 * 1000;

let indexCache: { html: string; fetchedAt: number } | null = null;

/**
 * The built index.html, fetched from the project's own Hosting site (never from
 * the request's host, so a forged header can't point the fetch elsewhere).
 * `functionName` only labels the error report when the fetch fails.
 */
export async function loadIndexHtml(functionName: string): Promise<string | null> {
  if (indexCache && Date.now() - indexCache.fetchedAt < INDEX_CACHE_MS) {
    return indexCache.html;
  }
  const projectId = process.env.GCLOUD_PROJECT;
  if (!projectId) return null;
  try {
    const response = await fetch(`https://${projectId}.web.app/index.html`);
    if (!response.ok) throw new Error(`index.html fetch failed: HTTP ${response.status}`);
    indexCache = { html: await response.text(), fetchedAt: Date.now() };
    return indexCache.html;
  } catch (error) {
    captureException(error as Error, { function: functionName });
    return indexCache?.html ?? null;
  }
}

/** The origin for absolute links: the request's host when it is one of ours, else the project domain. */
export function resolveOrigin(host: string): string {
  const hostname = host.split(',')[0].trim().toLowerCase();
  if (ALLOWED_HOST_PATTERN.test(hostname)) {
    return `https://${hostname}`;
  }
  return `https://${process.env.GCLOUD_PROJECT}.web.app`;
}

/** Replace the default title/description of the SPA shell and add the share tags. */
export function injectMetaTags(indexHtml: string, metaTags: string, title?: string): string {
  if (!metaTags) return indexHtml;
  // Function replacers: a `$` in a title must not be read as a replacement pattern.
  return indexHtml
    .replace(/<title>[^<]*<\/title>/, () => `<title>${escapeHtml(`${title} · QuestMind`)}</title>`)
    .replace(/\s*<meta name="description"[^>]*>/, '')
    .replace('</head>', () => `  ${metaTags}\n</head>`);
}

export function meta(attribute: 'name' | 'property', key: string, content: string): string {
  return `<meta ${attribute}="${key}" content="${escapeHtml(content)}">`;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
