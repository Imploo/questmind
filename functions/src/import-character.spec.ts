import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ── Fake admin Firestore and Storage: record what gets written ──────────────

let written: Record<string, Record<string, unknown>>;
let savedFiles: Record<string, { data: Buffer; contentType: unknown }>;
let autoId: number;

function docRef(path: string) {
  return {
    id: path.split('/').pop() as string,
    path,
    collection: (name: string) => collectionRef(`${path}/${name}`),
    set: async (data: Record<string, unknown>) => { written[path] = data; },
  };
}

function collectionRef(path: string) {
  return { doc: (id?: string) => docRef(`${path}/${id ?? `auto-${++autoId}`}`) };
}

vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => ({
    collection: (name: string) => collectionRef(name),
    batch: () => {
      const pending: [string, Record<string, unknown>][] = [];
      return {
        set: (ref: { path: string }, data: Record<string, unknown>) => { pending.push([ref.path, data]); },
        commit: async () => { pending.forEach(([path, data]) => { written[path] = data; }); },
      };
    },
  }),
  FieldValue: { serverTimestamp: () => 'SERVER_TIME' },
  Timestamp: { fromDate: (date: Date) => ({ iso: date.toISOString() }) },
}));
vi.mock('firebase-admin/storage', () => ({
  getStorage: () => ({
    bucket: () => ({
      name: 'default-bucket',
      file: (path: string) => ({
        save: async (data: Buffer, options: { metadata: { contentType: unknown } }) => {
          savedFiles[path] = { data, contentType: options.metadata.contentType };
        },
      }),
    }),
  }),
}));
vi.mock('./utils/sentry-error-handler', () => ({
  captureException: vi.fn(),
  wrapCallable: (_name: string, handler: unknown) => handler,
}));
vi.mock('./utils/emulator-helpers', () => ({ ensureAuthForTesting: vi.fn() }));
vi.mock('./generate-image', () => ({ characterImagePrefix: (id: string) => `images/${id}/` }));
vi.mock('./utils/logger', () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }));
vi.mock('firebase-functions/v2/https', async () => {
  const actual = await vi.importActual<typeof import('firebase-functions/v2/https')>('firebase-functions/v2/https');
  return { ...actual, onCall: (_config: unknown, handler: unknown) => handler };
});

import { executeImportCharacter, importCharacter, ownCharacterSource, parseCharacterLink } from './import-character';

// ── The source environment, as the public REST API and Storage serve it ─────

const SOURCE_ID = '0b5f7c1e-93a4-4f0e-8d26-5a1f2c3d4e5f';
const DOCS = 'https://firestore.googleapis.com/v1/projects/questmind-beta/databases/(default)/documents';
const BUCKET = 'https://firebasestorage.googleapis.com/v0/b/questmind-beta.firebasestorage.app/o';

const str = (value: string) => ({ stringValue: value });
const int = (value: number) => ({ integerValue: String(value) });
const map = (fields: Record<string, unknown>) => ({ mapValue: { fields } });
const list = (values: unknown[]) => ({ arrayValue: { values } });
const ability = (score: number) => map({ score: int(score), modifier: int(Math.floor((score - 10) / 2)) });
const save = map({ proficient: { booleanValue: false }, modifier: int(0) });

const characterFields = {
  name: str('Vesper'), class: str('Paladin'), level: int(5), race: str('Tiefling'), experiencePoints: int(6500),
  abilities: map({ strength: ability(16), dexterity: ability(10), constitution: ability(14), intelligence: ability(8), wisdom: ability(10), charisma: ability(16) }),
  skills: list([]),
  savingThrows: map({ strength: save, dexterity: save, constitution: save, intelligence: save, wisdom: save, charisma: save }),
  passiveWisdom: int(10), proficiencies: list([]), languages: list([str('Common')]),
  armorClass: int(18), initiative: int(0), speed: int(30),
  hitPoints: map({ max: int(44), current: int(44), temp: int(0) }),
  hitDice: map({ total: int(5), current: int(5), die: str('d10') }),
  deathSaves: map({ successes: int(0), failures: int(0) }),
  featuresAndTraits: list([
    map({ name: str('Hellish Rebuke'), description: str(''), uses: map({ max: int(1), recharge: str('longRest') }) }),
  ]),
  internalOnly: str('dropped by the schema'),
};

let routes: Record<string, () => unknown>;

function json(body: unknown) {
  return { ok: true, status: 200, json: async () => body, headers: new Headers() };
}

function binary(data: string, contentType: string) {
  return { ok: true, status: 200, arrayBuffer: async () => new TextEncoder().encode(data).buffer, headers: new Headers({ 'content-type': contentType }) };
}

describe('parseCharacterLink', () => {
  it('reads share links and page links of the known environments', () => {
    expect(parseCharacterLink(`https://questmind-beta.web.app/share/character/${SOURCE_ID}`)).toMatchObject({
      environment: { projectId: 'questmind-beta' }, characterId: SOURCE_ID, origin: 'Imported from questmind-beta.web.app',
    });
    expect(parseCharacterLink(` questmind.nl/characters/${SOURCE_ID}/ `)).toMatchObject({
      environment: { projectId: 'questmind-dnd' }, characterId: SOURCE_ID,
    });
    expect(parseCharacterLink(`https://questmind-beta--pr-12.web.app/characters/${SOURCE_ID}?x=1`).environment.projectId).toBe('questmind-beta');
  });

  it.each([
    ['', 'Paste a link'],
    [42, 'Paste a link'],
    ['https://', 'does not look like a link'],
    [`https://evil.example.com/characters/${SOURCE_ID}`, 'Only links to a QuestMind character'],
    [`https://questmind-beta.web.app.evil.com/characters/${SOURCE_ID}`, 'Only links to a QuestMind character'],
    [`http://questmind.nl/characters/${SOURCE_ID}`, 'Only links to a QuestMind character'],
    ['https://questmind.nl/characters', 'does not point to a character'],
    ['https://questmind.nl/share/podcast/abcdefghijklmnop', 'does not point to a character'],
    [`https://questmind.nl/characters/${SOURCE_ID}/../x`, 'does not point to a character'],
  ])('rejects %j', (link, message) => {
    expect(() => parseCharacterLink(link)).toThrow(message as string);
  });
});

describe('ownCharacterSource', () => {
  afterEach(() => { delete process.env.GCLOUD_PROJECT; });

  it('points at the character in the environment the function runs in', () => {
    process.env.GCLOUD_PROJECT = 'questmind-beta';
    expect(ownCharacterSource(SOURCE_ID)).toEqual({
      environment: expect.objectContaining({ projectId: 'questmind-beta', bucket: 'questmind-beta.firebasestorage.app' }),
      characterId: SOURCE_ID,
      origin: 'Cloned from a shared character',
    });
  });

  it('uses the default bucket for a project that is not in the list', () => {
    process.env.GCLOUD_PROJECT = 'demo-project';
    expect(ownCharacterSource(SOURCE_ID).environment).toEqual({ projectId: 'demo-project', bucket: 'default-bucket', domains: [] });
  });

  it.each(['', 'x', 'a/b/c/d/e/f/g/h', 42, null])('rejects the id %j', id => {
    expect(() => ownCharacterSource(id)).toThrow('Missing or invalid characterId');
  });
});

describe('executeImportCharacter', () => {
  const fetchMock = vi.fn();
  const link = parseCharacterLink(`https://questmind-beta.web.app/share/character/${SOURCE_ID}`);

  beforeEach(() => {
    written = {};
    savedFiles = {};
    autoId = 0;
    routes = {
      [`${DOCS}/characters/${SOURCE_ID}`]: () => json({
        name: `x/characters/${SOURCE_ID}`,
        fields: {
          userId: str('someone-else'),
          activeVersionId: str('v2'),
          campaignId: str('camp-1'),
          playState: map({
            hp: map({ current: int(31), temp: int(5) }),
            conditions: list([str('Poisoned')]),
            inventory: list([map({ id: str('a'), name: str('Rope'), value: str('50 ft') })]),
          }),
        },
      }),
      [`${DOCS}/characters/${SOURCE_ID}/versions/v2`]: () => json({ name: 'x/versions/v2', fields: { character: map(characterFields) } }),
      [`${DOCS}/characters/${SOURCE_ID}/images?orderBy=createdAt+desc&pageSize=10`]: () => json({
        documents: [
          { name: 'x/images/new', fields: { storagePath: str(`images/${SOURCE_ID}/new.png`), mimeType: str('image/png'), createdAt: { timestampValue: '2026-11-10T08:00:00Z' } } },
          { name: 'x/images/old', fields: { storagePath: str(`images/${SOURCE_ID}/old.jpg`), mimeType: str('image/jpeg'), createdAt: { timestampValue: '2026-10-01T08:00:00Z' } } },
          { name: 'x/images/foreign', fields: { storagePath: str('audio/someone-else.mp3'), mimeType: str('image/png') } },
        ],
      }),
      [`${BUCKET}/${encodeURIComponent(`images/${SOURCE_ID}/new.png`)}?alt=media`]: () => binary('new-bytes', 'image/png'),
      [`${BUCKET}/${encodeURIComponent(`images/${SOURCE_ID}/old.jpg`)}?alt=media`]: () => binary('old-bytes', 'image/jpeg'),
    };
    fetchMock.mockReset();
    fetchMock.mockImplementation(async (url: string) => routes[url]?.() ?? { ok: false, status: 404 });
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('copies the character, its play state and its portraits to the caller', async () => {
    const { characterId } = await executeImportCharacter('me', link);

    const character = written[`characters/${characterId}`];
    expect(character).toMatchObject({
      id: characterId,
      userId: 'me',
      name: 'Vesper',
      campaignId: null,
      playState: {
        hp: { current: 31, temp: 5 },
        conditions: ['Poisoned'],
        inventory: [{ id: 'a', name: 'Rope', value: '50 ft', description: '' }],
      },
    });

    const version = written[`characters/${characterId}/versions/${character.activeVersionId}`];
    expect(version).toMatchObject({ versionNumber: 1, source: 'manual', commitMessage: 'Imported from questmind-beta.web.app' });
    const copy = version.character as Record<string, unknown>;
    expect(copy).toMatchObject({ name: 'Vesper', class: 'Paladin', level: 5, hitPoints: { max: 44, current: 44, temp: 0 } });
    expect(copy.featuresAndTraits).toEqual([{ name: 'Hellish Rebuke', description: '', uses: { max: 1, recharge: 'longRest' } }]);
    expect(copy).not.toHaveProperty('internalOnly');

    // Two portraits copied into the new character's folder; the foreign path is skipped.
    const files = Object.keys(savedFiles);
    expect(files).toHaveLength(2);
    expect(files.every(path => path.startsWith(`images/${characterId}/`))).toBe(true);
    const images = Object.entries(written).filter(([path]) => path.startsWith(`characters/${characterId}/images/`)).map(([, data]) => data);
    expect(images).toHaveLength(2);
    expect(images.map(image => image.createdAt)).toEqual(expect.arrayContaining([
      { iso: '2026-11-10T08:00:00.000Z' },
      { iso: '2026-10-01T08:00:00.000Z' },
    ]));
    expect(images.every(image => image.characterId === characterId && files.includes(image.storagePath as string))).toBe(true);
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('someone-else'))).toBe(false);
  });

  it('falls back to the newest committed version when the active one is missing', async () => {
    delete routes[`${DOCS}/characters/${SOURCE_ID}/versions/v2`];
    routes[`${DOCS}/characters/${SOURCE_ID}/versions?orderBy=versionNumber+desc&pageSize=5`] = () => json({
      documents: [
        { name: 'x/versions/draft', fields: { isDraft: { booleanValue: true }, character: map({ ...characterFields, name: str('Draft') }) } },
        { name: 'x/versions/v1', fields: { character: map(characterFields) } },
      ],
    });

    const { characterId } = await executeImportCharacter('me', link);
    expect(written[`characters/${characterId}`].name).toBe('Vesper');
  });

  it('imports without play state when the source has none or it is malformed', async () => {
    routes[`${DOCS}/characters/${SOURCE_ID}`] = () => json({
      name: 'x', fields: { activeVersionId: str('v2'), playState: map({ hp: str('broken') }) },
    });

    const { characterId } = await executeImportCharacter('me', link);
    expect(written[`characters/${characterId}`]).not.toHaveProperty('playState');
  });

  it('still imports the character when a portrait cannot be downloaded', async () => {
    delete routes[`${BUCKET}/${encodeURIComponent(`images/${SOURCE_ID}/new.png`)}?alt=media`];

    const { characterId } = await executeImportCharacter('me', link);
    expect(written[`characters/${characterId}`]).toBeDefined();
    expect(Object.keys(savedFiles)).toHaveLength(1);
  });

  it('reports a missing character', async () => {
    delete routes[`${DOCS}/characters/${SOURCE_ID}`];
    await expect(executeImportCharacter('me', link)).rejects.toThrow('No character was found');
    expect(written).toEqual({});
  });

  it('clones a character of the own environment by id, for the signed-in caller', async () => {
    process.env.GCLOUD_PROJECT = 'questmind-beta';
    const handler = importCharacter as unknown as (request: unknown) => Promise<{ characterId: string }>;

    const { characterId } = await handler({ auth: { uid: 'me' }, data: { characterId: SOURCE_ID } });

    const character = written[`characters/${characterId}`];
    expect(character).toMatchObject({ userId: 'me', name: 'Vesper' });
    expect(written[`characters/${characterId}/versions/${character.activeVersionId}`].commitMessage).toBe('Cloned from a shared character');
    expect(Object.keys(savedFiles)).toHaveLength(2);
    delete process.env.GCLOUD_PROJECT;
  });

  it('requires a signed-in caller', async () => {
    const handler = importCharacter as unknown as (request: unknown) => Promise<unknown>;
    await expect(handler({ data: { characterId: SOURCE_ID } })).rejects.toThrow('Authentication required');
    expect(written).toEqual({});
  });

  it('refuses a character that does not fit the schema', async () => {
    routes[`${DOCS}/characters/${SOURCE_ID}/versions/v2`] = () => json({ name: 'x', fields: { character: map({ name: str('Only a name') }) } });
    await expect(executeImportCharacter('me', link)).rejects.toThrow('could not be read');
    expect(written).toEqual({});
  });
});
