import { onRequest } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { captureException } from './utils/sentry-error-handler';
import { escapeHtml, injectMetaTags, loadIndexHtml, meta, resolveOrigin } from './utils/share-page';
import { BANNER_HEIGHT, BANNER_WIDTH, renderShareBanner } from './utils/share-banner';
import { characterImagePrefix } from './generate-image';

const ID_PATTERN = /^[\w-]{8,64}$/;
/** Link-preview image for a character without a portrait (source: public/og/character-share.svg). */
const OG_IMAGE_PATH = '/og/character-share.png';
/** Storage folder of the rendered banners, per character and per portrait. */
const BANNER_PREFIX = 'share-previews/';
const STORY_MAX_LENGTH = 160;
/** A banner belongs to one portrait and never changes, so it may be cached for good. */
const BANNER_CACHE_CONTROL = 'public, max-age=31536000, immutable';

/** The fields of a character that go into the link preview. */
export interface CharacterPreviewSource {
  name?: string;
  class?: string;
  level?: number;
  race?: string;
  background?: string;
  alignment?: string;
  backstory?: string;
  appearance?: { description?: string };
}

interface CharacterPreview {
  title: string;
  description: string;
  /** Id of the newest portrait, when the character has one. */
  imageId: string | null;
}

/**
 * Serves `/share/character/:characterId` (via a Hosting rewrite) with Open Graph tags
 * for the character, so WhatsApp, Slack etc. show a link preview. Browsers get the
 * normal Angular app, which sends them on to the character page.
 *
 * `/share/character/:characterId/preview/:imageId.jpg` serves the banner image of
 * that preview: the portrait, scaled down to a small 1200x630 JPEG.
 */
export const characterSharePage = onRequest(
  { memory: '512MiB', timeoutSeconds: 60, concurrency: 20 },
  async (req, res) => {
    const origin = resolveOrigin(req.get('x-forwarded-host') ?? req.hostname);
    // ['share', 'character', characterId] or [..., characterId, 'preview', '<imageId>.jpg']
    const [, , characterId = '', kind, file = ''] = req.path.split('/').filter(Boolean);

    if (kind === 'preview') {
      const imageId = file.replace(/\.jpg$/i, '');
      const banner = ID_PATTERN.test(characterId) && ID_PATTERN.test(imageId)
        ? await loadBanner(characterId, imageId)
        : null;
      if (!banner) {
        res.redirect(302, `${origin}${OG_IMAGE_PATH}`);
        return;
      }
      res.set('Content-Type', 'image/jpeg');
      res.set('Cache-Control', BANNER_CACHE_CONTROL);
      res.status(200).send(banner);
      return;
    }

    let preview: CharacterPreview | null = null;
    if (ID_PATTERN.test(characterId)) {
      try {
        preview = await loadPreview(characterId);
      } catch (error) {
        captureException(error as Error, { function: 'characterSharePage', characterId });
      }
    }

    const pageUrl = `${origin}/share/character/${characterId}`;
    const imageUrl = preview?.imageId
      ? `${pageUrl}/preview/${preview.imageId}.jpg`
      : `${origin}${OG_IMAGE_PATH}`;
    const metaTags = preview ? buildCharacterMetaTags(preview.title, preview.description, pageUrl, imageUrl) : '';
    const indexHtml = await loadIndexHtml('characterSharePage');

    res.set('Cache-Control', 'public, max-age=0, s-maxage=300');
    res.status(preview ? 200 : 404);
    if (indexHtml) {
      res.send(injectMetaTags(indexHtml, metaTags, preview?.title));
    } else {
      res.send(renderFallbackPage(metaTags, preview, characterId));
    }
  }
);

async function loadPreview(characterId: string): Promise<CharacterPreview | null> {
  const characterRef = getFirestore().collection('characters').doc(characterId);
  const characterSnap = await characterRef.get();
  if (!characterSnap.exists) return null;

  const data = characterSnap.data() ?? {};
  const activeVersionId = typeof data.activeVersionId === 'string' ? data.activeVersionId : '';
  const [versionSnap, imagesSnap] = await Promise.all([
    activeVersionId ? characterRef.collection('versions').doc(activeVersionId).get() : null,
    // Newest first, the same order in which the sheet picks its portrait.
    characterRef.collection('images').orderBy('createdAt', 'desc').limit(1).get(),
  ]);

  const character = (versionSnap?.data()?.character ?? {}) as CharacterPreviewSource;
  const title = character.name || (typeof data.name === 'string' ? data.name : '') || 'Character';
  return {
    title,
    description: describeCharacter(character),
    imageId: imagesSnap.docs[0]?.id ?? null,
  };
}

/** "Level 5 Tiefling Paladin · Soldier · Lawful Good" plus the start of the backstory. */
export function describeCharacter(character: CharacterPreviewSource): string {
  const identity = [
    typeof character.level === 'number' ? `Level ${character.level}` : '',
    character.race,
    character.class,
  ].filter(Boolean).join(' ');
  const summary = [identity, character.background, character.alignment].filter(Boolean).join(' · ');
  const story = excerpt(character.backstory || character.appearance?.description || '');
  const text = [summary, story || 'bekijk de character sheet'].filter(Boolean).join(' — ');
  return `⚔️ ${text}`;
}

/** The first words of a text on one line, cut at a word boundary. */
function excerpt(text: string): string {
  const plain = text.replace(/[*_#>`]/g, '').replace(/\s+/g, ' ').trim();
  if (plain.length <= STORY_MAX_LENGTH) return plain;
  const cut = plain.slice(0, STORY_MAX_LENGTH);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), STORY_MAX_LENGTH / 2)).trimEnd()}…`;
}

export function buildCharacterMetaTags(title: string, description: string, pageUrl: string, imageUrl: string): string {
  return [
    meta('name', 'description', description),
    meta('property', 'og:type', 'website'),
    meta('property', 'og:site_name', 'QuestMind'),
    meta('property', 'og:title', title),
    meta('property', 'og:description', description),
    meta('property', 'og:url', pageUrl),
    meta('property', 'og:image', imageUrl),
    meta('property', 'og:image:width', String(BANNER_WIDTH)),
    meta('property', 'og:image:height', String(BANNER_HEIGHT)),
    meta('property', 'og:image:alt', `${title} — QuestMind character sheet`),
    meta('name', 'twitter:card', 'summary_large_image'),
    meta('name', 'twitter:title', title),
    meta('name', 'twitter:description', description),
    meta('name', 'twitter:image', imageUrl),
  ].join('\n  ');
}

/**
 * The banner for one portrait: from the cache in Storage, or rendered now and cached.
 * Returns null when the portrait does not exist or cannot be rendered.
 */
async function loadBanner(characterId: string, imageId: string): Promise<Buffer | null> {
  try {
    const bucket = getStorage().bucket();
    const cached = bucket.file(`${BANNER_PREFIX}${characterId}/${imageId}.jpg`);
    const [isCached] = await cached.exists();
    if (isCached) {
      const [banner] = await cached.download();
      return banner;
    }

    const imageSnap = await getFirestore()
      .collection('characters').doc(characterId)
      .collection('images').doc(imageId)
      .get();
    const storagePath = imageSnap.data()?.storagePath;
    // The image document is written by the owner's client, so only trust a path in the character's own folder.
    if (typeof storagePath !== 'string' || !storagePath.startsWith(characterImagePrefix(characterId))) {
      return null;
    }

    const [original] = await bucket.file(storagePath).download();
    const banner = await renderShareBanner(original);
    // Best effort: a failed write only means the banner is rendered again next time.
    await cached
      .save(banner, { metadata: { contentType: 'image/jpeg', cacheControl: BANNER_CACHE_CONTROL } })
      .catch((error: unknown) => captureException(error as Error, { function: 'characterSharePage', characterId, imageId }));
    return banner;
  } catch (error) {
    captureException(error as Error, { function: 'characterSharePage', characterId, imageId });
    return null;
  }
}

function renderFallbackPage(metaTags: string, preview: CharacterPreview | null, characterId: string): string {
  const body = preview
    ? `<h1>${escapeHtml(preview.title)}</h1><p>${escapeHtml(preview.description)}</p>` +
      `<p><a href="/characters/${escapeHtml(characterId)}">Open de character sheet</a></p>`
    : '<h1>Karakter niet gevonden</h1><p>Deze link bestaat niet (meer).</p>';
  return `<!doctype html>
<html lang="nl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(preview ? `${preview.title} · QuestMind` : 'QuestMind')}</title>
  ${metaTags}
</head>
<body style="font-family:system-ui,sans-serif;max-width:36rem;margin:3rem auto;padding:0 1rem">${body}</body>
</html>`;
}
