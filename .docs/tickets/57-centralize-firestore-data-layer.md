# #57 — Centraliseer Firestore Data Layer via FirestoreRepository

**Created:** 2026-02-19
**Priority:** High
**Estimated Effort:** 1-2 weken
**Status:** Todo
**Related:** #28 (Repository Pattern — vervangt dit ticket met concrete implementatie)

---

## Beschrijving

Alle directe Firestore `getDoc`, `getDocs`, en `onSnapshot` calls in de codebase vervangen door concrete repository classes die `FirestoreRepository<T, K>` extenden. Hierdoor ontstaat een centrale data layer waarbij **alle data retrieval via `onSnapshot` streams** verloopt en de frontend altijd automatisch update met nieuwe data.

## Huidige Situatie

- **20 bestanden** gebruiken Firestore direct (imports uit `firebase/firestore`)
- `getDoc`/`getDocs` worden 16x gebruikt voor one-time fetches — data wordt niet real-time bijgewerkt
- `onSnapshot` wordt 9x los geïmplementeerd met handmatige subscribe/unsubscribe
- Elke service bouwt eigen Firestore referenties, error handling, en loading states
- `FirestoreRepository` base class bestaat al maar wordt door **geen enkele service** gebruikt

## Gewenst Resultaat

- Eén repository class per Firestore collectie
- Alle data retrieval gaat via `onSnapshot` (real-time signals)
- Services bevatten alleen business logic, geen Firestore imports
- Centrale error handling en loading states via `FirestoreRepository` base class
- Geen directe `firebase/firestore` imports buiten de repository layer (behalve `Timestamp` in models/utils)

---

## Te Maken Repository Classes

### 1. `UserProfileRepository` — `users/{userId}`

**Locatie:** `src/app/shared/repository/user-profile.repository.ts`
**Betreft enkel-document pattern** (geen collectie-query, maar één specifiek user document)

> **Let op:** `FirestoreRepository` is ontworpen voor collectie-queries. Voor single-document access is een aparte `FirestoreDocumentRepository<T>` base class nodig (zie Technische Details).

**Vervangt directe calls in:**
| Bestand | Huidige calls | Wordt |
|---------|--------------|-------|
| `user.service.ts` | `doc()`, `getDoc()` | `userProfileRepo.get` signal |
| `campaign-context.service.ts` | `doc()`, `onSnapshot()` | `userProfileRepo.get` signal |
| `user-profile.service.ts` | `doc()`, `getDoc()`, `setDoc()`, `updateDoc()` | `userProfileRepo.update()` |

**Key prop:** `uid` (document ID = Firebase Auth UID)
**Query:** Enkel document — `users/{userId}`

---

### 2. `CampaignRepository` — `campaigns`

**Locatie:** `src/app/shared/repository/campaign.repository.ts`

**Vervangt directe calls in:**
| Bestand | Huidige calls | Wordt |
|---------|--------------|-------|
| `campaign.service.ts` | `collection()`, `doc()`, `getDoc()`, `getDocs()`, `setDoc()`, `updateDoc()`, `query()`, `where()` | `campaignRepo.get` signal, `.update()`, `.getByKey()` |

**Key prop:** `id`
**Collection path:** `campaigns`
**Constraints:** Filteren op campaign IDs van de huidige user (uit `UserProfileRepository`)
**Custom methoden:**
- `findByMemberEmail(email: string)` — voor invite flow (`where('email', '==', email)` op `users` collectie)

---

### 3. `CharacterRepository` — `characters`

**Locatie:** `src/app/shared/repository/character.repository.ts`

**Vervangt directe calls in:**
| Bestand | Huidige calls | Wordt |
|---------|--------------|-------|
| `character.service.ts` | `collection()`, `doc()`, `getDoc()`, `getDocs()`, `setDoc()`, `updateDoc()`, `onSnapshot()`, `query()`, `where()`, `orderBy()` | `characterRepo.get` signal, `.update()` |

**Key prop:** `id`
**Collection path:** `characters`
**Constraints:**
- `where('userId', '==', currentUserId)`
- `orderBy('updatedAt', 'desc')`

---

### 4. `CharacterVersionRepository` — `characters/{characterId}/versions` (subcollectie)

**Locatie:** `src/app/shared/repository/character-version.repository.ts`
**Type:** Subcollectie via factory pattern (zie sectie "Subcollectie Factory Pattern")

**Vervangt directe calls in:**
| Bestand | Huidige calls | Wordt |
|---------|--------------|-------|
| `character-version.service.ts` | `collection()`, `doc()`, `getDoc()`, `getDocs()`, `setDoc()`, `updateDoc()`, `deleteDoc()`, `onSnapshot()`, `query()`, `orderBy()`, `limit()` | `versionRepo.get` signal, `.update()`, `.delete()` |

**Key prop:** `id`
**Collection path:** `characters/{characterId}/versions`
**Constraints:** `orderBy('versionNumber', 'desc')`
**Custom methoden:**
- `getLatestVersion()` — convenience voor eerste item uit gesorteerde lijst (computed signal op `get()[0]`)

**Lifecycle:** Instance wordt aangemaakt in `CharacterBuilderPageComponent` bij route-activatie met `characterId` uit route params. Wordt destroyed wanneer gebruiker wegnavigeerd van `/characters/:characterId` (component destroy). Bij route param change (ander characterId) wordt de oude instance `destroy()`'d en een nieuwe aangemaakt.

---

### 5. `CharacterImageRepository` — `characters/{characterId}/images` (subcollectie)

**Locatie:** `src/app/shared/repository/character-image.repository.ts`
**Type:** Subcollectie via factory pattern (zie sectie "Subcollectie Factory Pattern")

**Vervangt directe calls in:**
| Bestand | Huidige calls | Wordt |
|---------|--------------|-------|
| `character-image.service.ts` | `collection()`, `doc()`, `getDocs()`, `query()`, `orderBy()`, `deleteDoc()` | `imageRepo.get` signal, `.delete()` |

**Key prop:** `id`
**Collection path:** `characters/{characterId}/images`
**Constraints:** `orderBy('createdAt', 'desc')`

**Lifecycle:** Zelfde als `CharacterVersionRepository` — leeft in `CharacterBuilderPageComponent`, destroyed bij navigatie weg van character detail.

---

### 6. `AudioSessionRepository` — `campaigns/{campaignId}/audioSessions` (subcollectie)

**Locatie:** `src/app/shared/repository/audio-session.repository.ts`
**Type:** Subcollectie via factory pattern (zie sectie "Subcollectie Factory Pattern")

**Vervangt directe calls in:**
| Bestand | Huidige calls | Wordt |
|---------|--------------|-------|
| `audio-session-state.service.ts` | `collection()`, `doc()`, `onSnapshot()`, `setDoc()`, `updateDoc()`, `query()`, `orderBy()` | `sessionRepo.get` signal, `.update()` |
| `audio-backend-operations.service.ts` | `doc()`, `onSnapshot()`, `getDoc()` | `sessionRepo.get` signal of `.getByKey()` |
| `audio-complete-processing.service.ts` | `doc()`, `updateDoc()`, `onSnapshot()` | `sessionRepo.update()`, `.get` signal |
| `podcast-audio.service.ts` | `doc()`, `onSnapshot()` | `sessionRepo.get` signal |
| `audio-session.component.ts` | `doc()`, `onSnapshot()` | `sessionRepo.get` signal |
| `podcast-library.component.ts` | `collection()`, `getDocs()` | `sessionRepo.get` signal |

**Key prop:** `id`
**Collection path:** `campaigns/{campaignId}/audioSessions`
**Constraints:** `orderBy('createdAt', 'desc')`

**Lifecycle:** Instance wordt aangemaakt zodra een campaign actief is. Wanneer de gebruiker van campaign wisselt via de campaign selector navigeert de app naar `/campaign/{nieuwId}`, waardoor de hele route-tree onder `/campaign/:campaignId` destroyed wordt (inclusief `AudioSessionComponent`, `PodcastLibraryComponent`, etc.). Op dat moment wordt `destroy()` aangeroepen op de oude repository instance. De nieuwe campaign route maakt een nieuwe instance aan.

---

### 7. `AiSettingsRepository` — `settings/ai`

**Locatie:** `src/app/shared/repository/ai-settings.repository.ts`
**Betreft singleton document** (net als UserProfile, geen collectie)

**Vervangt directe calls in:**
| Bestand | Huidige calls | Wordt |
|---------|--------------|-------|
| `ai-settings.service.ts` | `doc()`, `getDoc()`, `onSnapshot()` | `aiSettingsRepo.get` signal |
| `admin.component.ts` | `doc()`, `getDoc()`, `setDoc()` | `aiSettingsRepo.get` signal, `.update()` |

**Key prop:** N/A (singleton document)
**Document path:** `settings/ai`

---

## Technische Details

### Nieuwe Base Class: `FirestoreDocumentRepository<T>`

Voor single-document access (UserProfile, AiSettings) is een aparte base class nodig naast de bestaande `FirestoreRepository`:

```typescript
// src/app/shared/repository/firestore-document-repository.ts
export abstract class FirestoreDocumentRepository<T extends Record<string, unknown>> {
  // Signals: data, loading, error (zelfde pattern als FirestoreRepository)
  // Enkele onSnapshot op één document i.p.v. collectie-query
  // update() voor setDoc met merge
}
```

### Subcollectie Factory Pattern

**Beslissing:** Alle subcollectie-repositories gebruiken het **factory pattern**. Er is geen DI (dependency injection) voor de subcollectie-instances zelf — ze worden als lokale variabelen in het component of de service bewaard en leven totdat het component destroyed wordt of de context wisselt.

**Waarom factory en geen switch-methode:**
- Een repository instance is gebonden aan precies één parent (één characterId of één campaignId)
- De `onSnapshot` listener in `FirestoreRepository` start bij eerste `get` access en loopt tot `destroy()`
- Bij context-switch (ander character, andere campaign) wil je een schone nieuwe instance, niet een bestaande resetten
- Lokale variabelen in het component maken de eigendomsrelatie expliciet: component bezit de repo, component destroy = repo destroy
- Geen risico op stale listeners of race conditions bij snelle context-switches

#### Factory Implementatie

```typescript
// src/app/shared/repository/audio-session.repository.ts
export class AudioSessionRepository extends FirestoreRepository<AudioSession, 'id'> {
  constructor(campaignId: string) {
    super(`campaigns/${campaignId}/audioSessions`, 'id');
  }

  protected override getConstraints(): QueryConstraint[] {
    return [orderBy('createdAt', 'desc')];
  }
}

// Factory als injectable service — maakt niet-DI instances aan
@Injectable({ providedIn: 'root' })
export class AudioSessionRepositoryFactory {
  create(campaignId: string): AudioSessionRepository {
    return new AudioSessionRepository(campaignId);
  }
}
```

> **Noot:** Omdat `FirestoreRepository` intern `inject(FirebaseService)` gebruikt, moet de factory
> aangeroepen worden binnen een injection context (constructor, `inject()` call, of `runInInjectionContext()`).
> Dit is automatisch het geval wanneer de factory wordt gebruikt in een component constructor of
> `effect()` / `computed()` die in de constructor draait.

#### Gebruik in Component

```typescript
@Component({ ... })
export class AudioSessionComponent implements OnDestroy {
  private readonly factory = inject(AudioSessionRepositoryFactory);
  private sessionRepo: AudioSessionRepository | null = null;

  constructor() {
    // Bij route param change: oude repo opruimen, nieuwe aanmaken
    effect(() => {
      const campaignId = this.campaignContext.selectedCampaignId();
      if (!campaignId) return;

      // Cleanup vorige instance
      this.sessionRepo?.destroy();

      // Nieuwe instance voor deze campaign
      this.sessionRepo = this.factory.create(campaignId);
    });

    // DestroyRef als safety net
    inject(DestroyRef).onDestroy(() => this.sessionRepo?.destroy());
  }

  // Signals zijn direct beschikbaar
  readonly sessions = computed(() => this.sessionRepo?.get() ?? []);
  readonly loading = computed(() => this.sessionRepo?.loading() ?? false);
}
```

#### Alle Subcollectie Factories

| Factory | Repository | Parent ID | Leeft in |
|---------|-----------|-----------|----------|
| `CharacterVersionRepositoryFactory` | `CharacterVersionRepository` | `characterId` | `CharacterBuilderPageComponent` |
| `CharacterImageRepositoryFactory` | `CharacterImageRepository` | `characterId` | `CharacterBuilderPageComponent` |
| `AudioSessionRepositoryFactory` | `AudioSessionRepository` | `campaignId` | Audio/podcast components en services |

#### Lifecycle per Subcollectie

```
┌─────────────────────────────────────────────────────────────┐
│ Route: /characters/:characterId                             │
│ Component: CharacterBuilderPageComponent                    │
│                                                             │
│  characterId uit route params                               │
│       │                                                     │
│       ├─→ versionRepo = versionFactory.create(characterId)  │
│       │     └─ onSnapshot op characters/{id}/versions       │
│       │                                                     │
│       └─→ imageRepo = imageFactory.create(characterId)      │
│             └─ onSnapshot op characters/{id}/images         │
│                                                             │
│  Navigate away → component destroyed                        │
│       ├─→ versionRepo.destroy()  (listener gestopt)         │
│       └─→ imageRepo.destroy()    (listener gestopt)         │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ Route: /campaign/:campaignId/*                              │
│ Components: AudioSession, PodcastLibrary, etc.              │
│                                                             │
│  campaignId uit route params / campaign selector            │
│       │                                                     │
│       └─→ sessionRepo = sessionFactory.create(campaignId)   │
│             └─ onSnapshot op campaigns/{id}/audioSessions   │
│                                                             │
│  Campaign switch via selector:                              │
│     1. Navigeert naar /campaign/{nieuwId}                   │
│     2. Oude route-tree destroyed                            │
│     3. sessionRepo.destroy() via DestroyRef                 │
│     4. Nieuwe route-tree opgebouwd                          │
│     5. Nieuwe sessionRepo aangemaakt met nieuw campaignId   │
└─────────────────────────────────────────────────────────────┘
```

### Bestaande `FirestoreRepository` Aanpassingen

De huidige `FirestoreRepository` base class hoeft **niet** aangepast te worden:
- `buildQuery()` en `getConstraints()` bieden al voldoende flexibiliteit voor custom queries
- `mapDocToModel()` kan overschreven worden voor custom mapping
- `destroy()` bestaat al en stopt de `onSnapshot` listener correct
- Het collectionPath wordt in de constructor meegegeven — perfect voor het factory pattern

### Migratiestrategie per Service

Per service:
1. Maak de repository class aan
2. Inject de repository in de service
3. Vervang directe Firestore calls door repository methods/signals
4. Verwijder `firebase/firestore` imports uit de service
5. Test dat real-time updates correct werken
6. Verwijder eventuele handmatige `onSnapshot` unsubscribe logic

---

## Implementatievolgorde

Aanbevolen volgorde op basis van complexiteit en afhankelijkheden:

| Stap | Repository | Reden |
|------|-----------|-------|
| 1 | `FirestoreDocumentRepository` base class | Nodig voor stap 2 en 7 |
| 2 | `AiSettingsRepository` | Simpelste case — singleton document, weinig consumers |
| 3 | `CharacterImageRepository` | Simpele subcollectie, alleen reads + delete |
| 4 | `CharacterRepository` | Eenvoudige top-level collectie met filter |
| 5 | `CharacterVersionRepository` | Subcollectie, iets complexer door version management |
| 6 | `UserProfileRepository` | Single document, meerdere consumers |
| 7 | `CampaignRepository` | Complexer door member management en cross-collectie queries |
| 8 | `AudioSessionRepository` | Meest complex — 6 consumers, subcollectie, veel write-operaties |

---

## Bestanden die Gewijzigd Worden

### Nieuwe bestanden (8)
- `src/app/shared/repository/firestore-document-repository.ts`
- `src/app/shared/repository/user-profile.repository.ts`
- `src/app/shared/repository/campaign.repository.ts`
- `src/app/shared/repository/character.repository.ts`
- `src/app/shared/repository/character-version.repository.ts`
- `src/app/shared/repository/character-image.repository.ts`
- `src/app/shared/repository/audio-session.repository.ts`
- `src/app/shared/repository/ai-settings.repository.ts`

### Bestaande bestanden (aangepast — Firestore imports verwijderd)
- `src/app/core/user.service.ts`
- `src/app/core/services/character.service.ts`
- `src/app/core/services/character-image.service.ts`
- `src/app/core/services/character-version.service.ts`
- `src/app/core/services/ai-settings.service.ts`
- `src/app/campaign/campaign.service.ts`
- `src/app/campaign/campaign-context.service.ts`
- `src/app/campaign/user-profile.service.ts`
- `src/app/audio/services/audio-session-state.service.ts`
- `src/app/audio/services/audio-backend-operations.service.ts`
- `src/app/audio/services/audio-complete-processing.service.ts`
- `src/app/audio/services/podcast-audio.service.ts`
- `src/app/audio/audio-session.component.ts`
- `src/app/audio/podcast-library.component.ts`
- `src/app/admin/admin.component.ts`

### Niet gewijzigd (Timestamp imports zijn OK)
- `src/app/core/models/schemas/character.schema.ts` — alleen `Timestamp` type
- `src/app/core/models/schemas/character-image.schema.ts` — alleen `Timestamp` type
- `src/app/core/utils/timestamp.util.ts` — utility functies voor Timestamp conversie
- `src/app/core/firebase.service.ts` — Firebase initialisatie (blijft)

---

## Voordelen

- **Real-time data overal** — Geen stale data meer door `getDoc` calls; alles via `onSnapshot`
- **Centrale error/loading states** — Eén plek voor loading spinners en error handling per collectie
- **Minder boilerplate** — Services hoeven geen Firestore referenties, error handling of unsubscribe logic te beheren
- **Betere testbaarheid** — Repositories zijn makkelijk te mocken
- **Signal-based** — Past bij Angular's nieuwe reactieve model (geen Observable→Signal conversie nodig)
- **Consistente patterns** — Elke collectie volgt exact hetzelfde data access pattern

## Risico's

- **Meer onSnapshot listeners** — Vervanging van `getDoc` door `onSnapshot` betekent meer actieve listeners; monitor Firestore reads
- **Subcollectie lifecycle** — Dynamische paden vereisen zorgvuldige cleanup bij context-switch (bijv. campaign wisselen)
- **Grote refactor** — 15 bestanden worden aangepast; per repository uitrollen en testen om regressies te voorkomen
- **Memory leaks** — Alle listeners moeten correct opgeruimd worden bij `DestroyRef` of route-navigatie
