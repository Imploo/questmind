# Ticket #72: Vertalingen — de gebruiker kiest Nederlands of Engels

**Created:** 2026-11-17
**Priority:** Medium
**Status:** Todo
**Effort:** 7-10 dagen, verdeeld over 9 fases die elk los te mergen zijn
**Dependencies:** Geen. Raakt wel bijna elk component; plan de fases zo dat er weinig andere branches tegelijk open staan op dezelfde map.
**Bron:** Inventarisatie van alle zichtbare teksten in `src/` en `functions/src/` op 2026-11-17.

---

## Beschrijving

De app is nu een mix van Engels en Nederlands, soms binnen één scherm. Er is geen vertaalsysteem: alle teksten staan hard in de templates en in TypeScript.

Dit ticket voert een vertaalsysteem in met twee talen (Nederlands en Engels). De gebruiker kiest zelf de taal; de app wisselt direct, zonder herladen.

### Huidige situatie (gemeten)

| Gebied | Teksten (±) | Nederlands / Engels |
|---|---|---|
| `auth/` | 50 | 0 / 100% |
| `layout/`, app-shell, `app.html` | 22 | 40 / 60% |
| `campaign/` | 95 | 20 / 80% |
| `campaign-story/` | 35 | 100 / 0% |
| `audio/` | 190 | 20 / 80% |
| `chat/` | 70 | 75 / 25% |
| `admin/` | 75 | 35 / 65% |
| `features/character-builder/` | 310 | 8 / 92% |
| `shared/` | 140 | 20 / 80% |
| `core/` | 5 | 0 / 100% |
| **Totaal frontend** | **± 1.000** | **± 23 / 77%** |

Daarvan zijn ± 100 teksten D&D-speltermen en ± 30 teksten staan in de PDF-export. Die vallen buiten de vertaling (zie Beslissingen), dus er zijn **± 850 teksten te vertalen**.

Verder:
- Bijna alle templates zijn inline (`template:` in de `.ts`); er zijn maar 2 `.html`-bestanden.
- De app is zoneless met `OnPush` en signals. `strictTemplates` staat aan.
- Datums gebruiken hard `'nl-NL'` (`shared/formatting.service.ts:28,43`, `chat/chat-view.ts:12`, `podcast-version-item.component.ts:204`). Twee plekken gebruiken Angular-pipes met de standaard-locale en-US (`character-version-history.component.ts:45`, `character-sheet.component.ts:249`).
- `src/index.html` zegt `<html lang="en">`.
- De backend levert ook tekst die de UI letterlijk toont: voortgangsmeldingen in Firestore (Engels én Nederlands door elkaar), foutmeldingen van callables (37 Engels, 6 Nederlands) en ruwe exception-teksten in `error`-velden.
- 16 spec-bestanden controleren letterlijke UI-tekst.

## Verwacht resultaat

- De gebruiker kiest Nederlands of Engels. De keuze staat in het profiel en geldt op elk apparaat.
- Wisselen werkt direct: alle zichtbare tekst, datums en getallen veranderen zonder herladen.
- Wie nog niets koos, krijgt de taal van de browser: Nederlands als de browser op Nederlands staat, anders Engels.
- In één taal staat geen tekst meer in de andere taal. Uitzonderingen: D&D-speltermen, inhoud die bij de campagne hoort (verhalen, podcasts, transcript) en door gebruikers ingevoerde tekst.
- Een ontbrekende vertaling of een key die niet bestaat breekt `npm run build`.
- Nieuwe harde tekst in een template breekt `npm run lint`.
- The Sidekick antwoordt in de gekozen taal.

## Genomen beslissingen (met de gebruiker afgestemd, 2026-11-17)

| Onderwerp | Beslissing |
|---|---|
| Techniek | **Eigen getypte vertaallaag**, geen library. Eén TypeScript-bestand per taal (`nl.ts`, `en.ts`), en één interface met alleen de keys. Mist een vertaling, dan breekt de compiler. |
| Indeling | **Eén bestand per taal**, niet per feature. |
| Wisselen | Een **strategy pattern** bepaalt de actieve taal. Vertalingen komen via **signals en een pipe** in de app, zodat alles direct meewisselt. |
| D&D-speltermen | **Blijven Engels** in beide talen (Strength, Saving Throws, Armor Class, skills, conditions, spell-namen). |
| AI-inhoud | **Alleen The Sidekick** volgt de taal van de gebruiker. Verhalen, podcasts en het transcript blijven Nederlands; dat is inhoud van de hele campagne. |
| Standaardtaal | **Browsertaal** (Nederlands → Nederlands, al het andere → Engels). |
| Plek van de taalkiezer | In een nieuwe **profiel-drawer**, niet zichtbaar in de nav-rail. Voor niet-ingelogde bezoekers in de **topbar**, op de karakterpagina én op de gedeelde podcastpagina (zelfde patroon). |
| Engelse notatie | `en-GB`: 6 Nov 2026, 24-uursklok. |
| Opslag van de keuze | Het profiel (`users/{uid}.language`) is de bron. localStorage is alleen een lokale kopie: voor bezoekers zonder account en om te voorkomen dat de app bij elke start even in de verkeerde taal staat (zie §6). |

### Waarom deze techniek

- `@angular/localize` vertaalt tijdens de build. Dat vraagt een build per taal, herladen bij wisselen en een andere inrichting van Firebase Hosting. Past niet bij "de gebruiker kiest".
- Transloco en ngx-translate wisselen wel tijdens het draaien, maar hun keys zijn losse strings. Een ontbrekende vertaling zie je dan pas in de browser of via een extra CI-tool.
- Een getypte laag sluit aan op wat de repo al afdwingt: elke wijziging eindigt met `npm run build` en `npm run lint`. De compiler en de linter bewaken dan dat de mix niet terugkomt.

---

## Technische details

### 1. Bestanden

```
src/app/core/i18n/
  translations.ts            interface Translations (alleen keys en types)
  nl.ts                      export const nl: Translations
  en.ts                      export const en: Translations
  language-strategy.ts       LanguageStrategy + DutchLanguageStrategy + EnglishLanguageStrategy
  i18n.service.ts            actieve strategy als signal
  language-preference.service.ts   opslaan en ophalen van de keuze
  translate.pipe.ts          'key' | translate
  translation-key.ts         type TranslationKey (alle paden naar een tekst)
  testing.ts                 provideTestLanguage('nl' | 'en')
src/app/shared/dnd-terms.ts  speltermen die Engels blijven
src/app/shared/components/language-switcher.component.ts
src/app/layout/profile-drawer/profile-drawer.component.ts
src/app/layout/public-topbar/public-topbar.component.ts
```

### 2. De interface: alleen keys

`translations.ts` bevat geen teksten. Het is gegroepeerd per gebied, in dezelfde volgorde als de mappen in `src/app`.

```ts
export interface Translations {
  common: {
    save: string;
    cancel: string;
    confirm: string;
    delete: string;
    close: string;
    retry: string;
    busy: string;
    unknownError: string;
  };
  nav: {
    characters: string;
    audio: string;
    story: string;
    podcasts: string;
    admin: string;
    signOut: string;
    openMenu: string;
    closeMenu: string;
    mainNavigation: string;
  };
  campaignStory: {
    intro: string;
    sessionCount: (count: number) => string;
    versionFailed: (version: number, error: string) => string;
  };
  // ... auth, campaign, audio, chat, characters, play, errors, progress, admin
}
```

Regels:
- Een tekst zonder variabelen is een `string`.
- Een tekst met variabelen of een meervoud is een **functie**. De parameters zijn dan ook getypt, en elke taal regelt zijn eigen meervoud en woordvolgorde.
- Geen losse zinsdelen die in de code aan elkaar worden geplakt. Eén key is één volledige zin.

```ts
// nl.ts
export const nl: Translations = {
  campaignStory: {
    intro: 'Het verhaal van de campagne tot nu toe, samengevat uit alle sessies.',
    sessionCount: (count) => (count === 1 ? '1 sessie' : `${count} sessies`),
    versionFailed: (version, error) => `Versie ${version} is mislukt: ${error}`,
  },
  // ...
};
```

Doordat `nl` en `en` allebei het type `Translations` hebben, geeft een ontbrekende of overbodige key in één van de twee een compilerfout.

### 3. Strategy pattern voor de taal

Per taal horen drie dingen bij elkaar: de vertalingen, de locale voor datums en getallen, en de naam in de taalkiezer. Dat is de strategy.

```ts
export type LanguageCode = 'nl' | 'en';

export interface LanguageStrategy {
  readonly code: LanguageCode;
  readonly locale: string;        // voor Intl: 'nl-NL' of 'en-GB'
  readonly nativeName: string;    // 'Nederlands' of 'English'
  readonly translations: Translations;
}

export class DutchLanguageStrategy implements LanguageStrategy {
  readonly code = 'nl';
  readonly locale = 'nl-NL';
  readonly nativeName = 'Nederlands';
  readonly translations = nl;
}

export const LANGUAGE_STRATEGIES = new InjectionToken<readonly LanguageStrategy[]>(
  'LANGUAGE_STRATEGIES',
  { providedIn: 'root', factory: () => [new DutchLanguageStrategy(), new EnglishLanguageStrategy()] },
);
```

Een derde taal toevoegen is dan: een nieuw bestand `de.ts`, een nieuwe strategy en één extra waarde in `LanguageCode`. Bestaande code verandert niet.

### 4. `I18nService`: signals

```ts
@Injectable({ providedIn: 'root' })
export class I18nService {
  private readonly strategies = inject(LANGUAGE_STRATEGIES);
  private readonly active = signal<LanguageStrategy>(/* starttaal, zie §6 */);

  readonly language = computed(() => this.active().code);
  readonly locale = computed(() => this.active().locale);
  readonly t = computed(() => this.active().translations);
  readonly available = this.strategies;

  use(code: LanguageCode): void { /* zet de strategy met deze code actief */ }
  translate<K extends TranslationKey>(key: K, ...args: ParamsOf<K>): string { /* ... */ }
}
```

De service weet niets van Firestore of localStorage. Een `effect` zet `document.documentElement.lang` op de actieve taal.

### 5. Gebruik in de app

**In templates: de pipe.**

```html
<span class="nav-label">{{ 'nav.signOut' | translate }}</span>
<button [attr.aria-label]="(isMenuOpen() ? 'nav.closeMenu' : 'nav.openMenu') | translate"></button>
<p>{{ 'campaignStory.sessionCount' | translate: sessions().length }}</p>
```

- `TranslationKey` is een union van alle paden naar een tekst (`'nav.signOut' | 'campaignStory.sessionCount' | ...`), afgeleid van `Translations` met een recursief template-literal-type. Door `strictTemplates` geeft een tikfout in een key een buildfout.
- De parameters van de pipe zijn getypt via `ParamsOf<K>`.
- De pipe is `pure: false` en leest het `t`-signal in `transform`. Een pure pipe rekent alleen opnieuw als zijn invoer verandert, en bij een taalwissel verandert de key niet.

**In TypeScript: het signal.**

```ts
private readonly i18n = inject(I18nService);

this.toast.show(this.i18n.t().chat.renameFailed, 'error');
readonly navItems = computed(() => [{ id: 'story', label: this.i18n.t().nav.story, ... }]);
```

- Labels in `computed()` wisselen automatisch mee, omdat ze het signal lezen.
- Constanten op moduleniveau met tekst (bijvoorbeeld `REPLY_ERRORS` in `chat-view.ts`, de feature-lijst in `admin.component.ts:351-446`) worden een `computed` of slaan een key op in plaats van tekst.
- Het signal mag ook in een template (`{{ t().nav.story }}`), maar de afspraak is: pipe in templates, signal in code.

**Pure functies buiten Angular** (`shared/utils/character-play-state.ts`, `chat/chat-view.ts`, `attack-roll.ts`, `spell-lookup.ts`, `session-progress.utils.ts`): die krijgen het stuk woordenboek dat ze nodig hebben als parameter, bijvoorbeeld `castMessage(request, t: Translations['play'])`. Ze blijven puur en de tests geven `en.play` of `nl.play` mee. Functies die nu een zin uit losse stukken bouwen (`character-play-state.ts:407-424`, `:456-460`) geven gestructureerde gegevens aan één vertaalfunctie.

### 6. Taal kiezen, opslaan en de starttaal

`LanguagePreferenceService` regelt de opslag:

1. **Start (synchroon, vóór de eerste render):** `localStorage['questmind.language']`. Staat daar niets, dan de browsertaal: de eerste waarde in `navigator.languages` die met `nl` of `en` begint; anders Engels.
2. **Na inloggen:** heeft het profiel een `language`, dan wint die en wordt localStorage bijgewerkt.
3. **Bij een keuze:** signal zetten, localStorage schrijven en, als de gebruiker is ingelogd, `users/{uid}.language` patchen via `UserService`.

Alleen een bewuste keuze komt in het profiel. Wie nooit kiest, blijft de browser volgen.

**Waarom localStorage naast het profiel.** Het profiel is de bron en wint altijd. localStorage is een kopie op dit apparaat, om twee redenen:
- **Bezoekers zonder account** (gedeelde podcast, publieke karakterpagina, inlogpagina) hebben geen profiel. Zonder localStorage is hun keuze in de topbar weg na herladen of na het openen van een volgende link.
- **Het profiel is er pas na het opstarten.** Firebase Auth en daarna het profieldocument laden asynchroon. Zonder lokale kopie start de app in de browsertaal en springt hij een moment later naar de profieltaal. Iemand met een Nederlandse browser die Engels koos, ziet dat bij elke start.

Uitloggen wist de lokale kopie niet: de inlogpagina blijft dan in de taal die de gebruiker net gebruikte.

- `UserProfile` (`core/models/user.model.ts`) krijgt `language?: 'nl' | 'en'`.
- `firestore.rules` hoeft niet aangepast: een gebruiker mag zijn eigen profiel schrijven.

### 7. Taalkiezer

`LanguageSwitcherComponent` is een dumb component met `language` en `languages` als input en `languageChange` als output. Het toont twee knoppen ("NL" en "EN", met `aria-pressed` en de volledige naam als `aria-label`). Het wordt op drie plekken gebruikt.

**a. Ingelogd: de profiel-drawer (nieuw)**

Er is nog geen profielscherm; het enige gebruikersdeel is het blok onderaan de nav-rail (`nav-rail.component.ts:216-232`: avatar, naam, "Uitloggen").

- Nieuw: `ProfileDrawerComponent` in `layout/profile-drawer/`. Het volgt het bestaande drawer-patroon van `campaign-story-versions-drawer.component.ts`: `qm-scrim` + `qm-drawer`, `role="dialog"`, `aria-modal`, sluiten met Escape, met de sluitknop en met een klik op de scrim.
- Inhoud: avatar, naam, e-mailadres en de taalkeuze met het label "Taal" / "Language".
- De drawer is dumb: `open`, `user`, `language` en `languages` als input; `languageChange` en `closed` als output. De nav-rail (smart) beheert het open-signal en roept `LanguagePreferenceService` aan.
- Openen: de rij met avatar en naam in de nav-rail wordt een knop (`aria-label` "Profiel openen", `aria-haspopup="dialog"`). Op mobiel sluit de hamburger-lade als de drawer opent.
- De taalkiezer staat **niet** in de nav-rail zelf.
- "Uitloggen" blijft in de nav-rail (zie Open vragen).

**b. Niet ingelogd: de topbar**

De kop voor niet-ingelogde bezoekers staat nu inline in `app-shell.component.ts:24-32` (logo en "Questmind" links, "Sign in" rechts) en verschijnt op de publieke karakterpagina. De gedeelde podcastpagina (`podcast-share-page.component.ts:15-21`) valt buiten de shell en heeft een eigen, gecentreerde kop zonder knoppen.

- Nieuw: `PublicTopbarComponent` in `layout/public-topbar/`: logo en "Questmind" links; rechts de taalkiezer en de knop "Inloggen" / "Sign in".
- `app-shell.component.ts` gebruikt dit component in plaats van de inline kop.
- `podcast-share-page.component.ts` toont dezelfde topbar als de bezoeker niet is ingelogd. De gecentreerde kop vervalt; de eyebrow "Podcast" verhuist naar de kaart.
- Een ingelogde gebruiker die een gedeelde podcast opent, ziet geen topbar met taalkiezer: de taal komt uit het profiel.

**c. Inlogpagina**

`sign-in-page.component.ts` heeft geen topbar. De taalkiezer staat daar rechtsboven op de pagina.

### 8. Datums en getallen

- De pure functies in `shared/formatting.service.ts` krijgen een `locale`-parameter. `FormattingService` geeft `i18n.locale()` door.
- `chat/chat-view.ts`: de constante `LOCALE` wordt een parameter. "Vandaag" en "Gisteren" komen uit het woordenboek.
- `podcast-version-item.component.ts:204`: gebruikt `i18n.locale()`.
- De twee Angular-pipes (`date:'medium'` en `number`) worden vervangen door `FormattingService`. `LOCALE_ID` staat vast bij het opstarten en wisselt dus niet mee.
- `formatFileSize` geeft `'N/A'` terug; dat wordt een key.

### 9. D&D-speltermen blijven Engels

Alle speltermen die nu als constante in de code staan, verhuizen naar één bestand `shared/dnd-terms.ts`: ability-namen en -afkortingen, de 18 skills, de 14 conditions, muntsoorten, alignments, en vaste labels van de sheet zoals "Armor Class", "Hit Dice", "Saving Throws", "Passive Perception", "Death Saves", "Cantrips", "Spell Slots".

- Templates verwijzen naar `terms.armorClass`. Er staat dan geen losse tekst meer in de template, dus de lint-regel (§11) kan streng blijven.
- Wil je speltermen later toch vertalen, dan verhuist dit bestand naar `Translations`.
- Tekst **om** de termen heen wordt wel vertaald: "Take a long rest?" wordt in het Nederlands "Long rest nemen?".
- Conditions, skill-namen en alignments zijn ook opslagsleutels in Firestore. Die waarden veranderen niet; er is geen migratie.
- Spreuk- en featurebeschrijvingen (`data/Spell.json`, `data/ClassFeature.json`, en wat `resolveSpell`/`resolveFeature` genereren) blijven Engels.

### 10. Tekst die de backend levert

Regel: **de frontend toont geen backendtekst meer letterlijk.** De backend levert een code, de frontend kiest de tekst.

**a. Voortgang van een sessie** (`audioSessions/{id}.progress`)
- `stage` is al een enum. De frontend toont de vertaalde titel per stage (de map in `session-progress-card.component.ts:150-176` verhuist naar het woordenboek) en toont `progress.message` niet meer (`:27`).
- Voor "3 van 7 segmenten" schrijft de backend een nieuw optioneel veld `progress.detail: { current: number; total: number }` (`transcribe-audio-fast.ts:390,496`). De frontend maakt daar zelf de zin van.
- De frontend schrijft zelf ook voortgangstekst (`audio-complete-processing.service.ts:72,85,160`, `audio-upload-page.component.ts:106`). Die blijft `message` vullen voor oude clients, maar wordt niet meer getoond.

**b. Voortgang van podcast en campagneverhaal** (`progressMessage`)
- Nieuw veld `progressStep`. Voor podcasts zijn de waarden de bestaande sleutels van `PODCAST_MESSAGES` (`run-podcast-generation.ts:49-57`): `starting | script | audio | uploading | done | failed`. Voor het campagneverhaal: `collecting | writing | done | failed` (`generate-campaign-story.ts:68-109`).
- Deelstappen van de audio ("deel 2/5", `podcast-tts.ts:93`) komen in `progressDetail: { current, total }`.
- De frontend vertaalt `progressStep`. Ontbreekt het veld (oude documenten), dan toont hij de vertaalde tekst voor de `status`.
- `progressMessage` blijft de backend nog één release schrijven.

**c. Foutmeldingen van callables**
- Fouten waar de gebruiker iets mee kan, krijgen een `reason` in het derde argument van `HttpsError`: `new HttpsError('failed-precondition', '...', { reason: 'story-already-generating' })`. Het gaat om ± 15 redenen: de 6 Nederlandse "loopt al / nog niet klaar"-meldingen, de 6 meldingen van `import-character.ts`, de lengte van het voorstelrondje (`process-voice-intro.ts:72`) en de limieten in `character-chat.ts:77,247`.
- De frontend krijgt één gedeelde functie `callableErrorMessage(error, t)` in `shared/utils/callable-error.ts`: eerst `details.reason`, dan de standaardcode (`permission-denied`, `unauthenticated`, `resource-exhausted`, `unavailable`, ...), dan een algemene melding. De mapping in `chat.service.ts:372-383` gaat hierin op.
- Plekken die nu `error.message` of `result.message` tonen, gebruiken deze functie: `campaign-story.service.ts:93-94`, `podcast-generation.service.ts:78-80`, `audio-session.component.ts:515,530`, `podcast-audio.service.ts:48`.
- Fouten die de frontend zelf gooit en toont (`campaign.service.ts:34-201`, `auth.service.ts:180-196`, `campaign-voice-intro.service.ts`) gooien voortaan een fout met een key, niet met een zin.

**d. Opgeslagen `error`-velden** (`progress.error`, `podcasts[].error`, `campaignStories.error`, `transcriptionFast.error`)
- Dit zijn ruwe exception-teksten. De UI toont een vertaalde algemene melding en zet de ruwe tekst eronder in een inklapbaar blok "Technische details". Die tekst wordt niet vertaald.

**e. The Sidekick**
- `CharacterChatRequest` krijgt `language: 'nl' | 'en'` (standaard `'nl'`). De frontend stuurt de actieve taal mee (`chat.service.ts:298`).
- `prompts/character-responder.prompt.ts:48` ("Antwoord in het Nederlands") en `prompts/chat-summary.prompt.ts:10,21` krijgen de taal als parameter. De prompts zelf blijven Nederlands. De regel dat D&D-termen Engels blijven (`:52`) blijft staan.
- De automatische chattitels `Import: ...` en `Afbeelding: ...` (`chat/chat-helpers.ts:42-46`) volgen dezelfde taal.
- De ability-score-waarschuwingen (`character/ability-score-validation.ts:99-140`, nu Engels) worden in de taal van het gesprek opgeslagen. De Engelse versie blijft de feedback aan het model.
- `chat-view.ts:5` herkent nu alleen "maak afbeelding". Daar komt een Engelse variant bij ("make/create/generate image").
- Tekst die de app namens de gebruiker stuurt ('Import this character' in `chat.component.ts:709`, de regelconversie in `rules-version.ts:25-30`) gaat in de actieve taal.

**f. Deelpagina's met linkpreview**
- De Angular-pagina `podcast-share-page.component.ts` volgt de browsertaal van de bezoeker, zoals de rest van de app.
- De previewtekst van een podcast (`podcast-share-page.ts:48`) blijft Nederlands: de podcast zelf is Nederlands.
- De previewtekst van een karakter (`character-share-page.ts:115-124`) mengt nu Engels en Nederlands. Die wordt taalneutraal: alleen `Level 5 Human Fighter` (speltermen), zonder de Nederlandse terugvaltekst.
- De nood-HTML van beide functies kiest de taal uit `Accept-Language` (nl → Nederlands, anders Engels) en zet `lang` daarop.

**g. Tekst die al is opgeslagen**
- Bestaande documenten blijven in de taal waarin ze zijn geschreven. Er is geen migratie.
- Standaardnamen bij aanmaken (`New Character 3`, `<naam> Campaign`, `Untitled Session`) worden in de actieve taal geschreven.
- `commitMessage: 'Initial character creation'` en `source` in de versiegeschiedenis: de bekende vaste waarden worden bij het tonen vertaald; al het andere wordt getoond zoals opgeslagen.

### 11. Bewaking: lint en compiler

- **Compiler:** ontbrekende keys, tikfouten in keys en verkeerde parameters breken `npm run build`.
- **Lint op harde tekst in templates:** zet `@angular-eslint/template/i18n` aan met `checkId: false`, `checkText: true`, `checkAttributes: true`. Omdat wij nooit `i18n`-attributen zetten, meldt de regel elke losse tekst en elk hard `placeholder`, `title`, `aria-label` of `alt`. De inline templates worden al gelint via `processInlineTemplates`.
  - **Eerst uitproberen in fase 0:** meldt de regel alleen losse tekst, en accepteert hij `{{ 'key' | translate }}` en leestekens? Zo niet, schrijf dan een klein eigen script (`scripts/check-hardcoded-text.js`) dat hetzelfde controleert en draai dat in `npm run lint`.
  - De regel gaat per map aan zodra die map klaar is (een `files`-blok per fase in `eslint.config.js`), en in fase 8 voor heel `src/app`.
- **Harde tekst in TypeScript** (toasts, `confirm`, `error.set('...')`) vangt de linter niet. Dat blijft een punt voor de review, en komt als regel in `.claude/claude.md`.

### 12. Bundelgrootte

Beide talen zitten in de eerste bundel: ± 850 teksten per taal, geschat 40-50 kB per taal vóór compressie. Dat houdt de code eenvoudig en synchroon; er is geen laadmoment bij het wisselen. Controleer in fase 0 dat de bundel onder de budgetten in `angular.json` blijft (waarschuwing bij 1,8 MB productie, 1,5 MB beta). Komt er ooit een derde of vierde taal bij, dan kan de strategy de niet-actieve talen met een dynamische `import()` laden zonder dat de rest van de app verandert.

---

## Fases

Elke fase is los te mergen. Tot een gebied aan de beurt is, blijft het in zijn huidige taal. Een fase is klaar als: alle zichtbare tekst van die map via het woordenboek loopt, de lint-regel voor die map aan staat, de specs zijn bijgewerkt, en build, lint en test slagen.

### Fase 0 — Fundament (1,5-2 dagen)
- [ ] `core/i18n/`: interface, `nl.ts`, `en.ts`, strategies, `I18nService`, `TranslatePipe`, `TranslationKey`, `testing.ts`.
- [ ] `LanguagePreferenceService`, `UserProfile.language`, `<html lang>`.
- [ ] `LanguageSwitcherComponent`, `ProfileDrawerComponent` en `PublicTopbarComponent` (§7); de topbar ook op de gedeelde podcastpagina.
- [ ] Datums en getallen via de actieve locale (§8).
- [ ] `shared/dnd-terms.ts` aanmaken (nog leeg op de eerste termen na).
- [ ] Lint-regel uitproberen en beslissen: bestaande regel of eigen script (§11).
- [ ] Bewijs dat wisselen werkt in een zoneless `OnPush`-component, via de pipe én via het signal (zie Tests).
- [ ] Bundelgrootte controleren.

### Fase 1 — Shell en inloggen (0,5-1 dag)
`layout/`, `app-shell.component.ts`, `app.html`, `loading.component.ts`, `auth/` (inclusief de Firebase-foutcodes in `auth.service.ts:180-196`), `toast.service.ts`, `toast-container`, `callable-error.ts`.
Ook: de beschrijving in `src/index.html:8` en `public/manifest.webmanifest` gaat over "audio journaling" en klopt niet met de app. Die tekst is statisch; zet er één juiste Engelse beschrijving neer.

### Fase 2 — Campaign en campagneverhaal (1 dag)
`campaign/` (± 95) en `campaign-story/` (± 35). Let op de lange alinea met `<em>` in `campaign-voice-intro.component.ts:15-20`: splits die in vaste delen of geef de nadruk een eigen key. De twee `confirm()`-aanroepen in `campaign-settings.component.ts:299,357` gaan naar `toastService.confirm`.

### Fase 3 — Audio (1-1,5 dag)
`audio/` en `audio/services/` (± 190), plus `shared/components/podcast-version-item.component.ts`. Frontenddeel van §10a, b en d.

### Fase 4 — Chat (0,5-1 dag)
`chat/` (± 70). Frontenddeel van §10e.

### Fase 5 — Character builder (2 dagen)
`features/character-builder/` (± 310, waarvan een groot deel speltermen) en de hulpfuncties `shared/utils/character-play-state.ts`, `attack-roll.ts`, `spell-lookup.ts`, `shared/models/rules-version.ts`. Eerst de speltermen naar `dnd-terms.ts`, daarna de rest naar het woordenboek. De twee `window.prompt()`-aanroepen voor het kopiëren van een link (`character-sheet.component.ts:1225`, `podcast-share-button.component.ts:61`) krijgen vertaalde tekst.

### Fase 6 — Admin (0,5 dag)
`admin/admin.component.ts` (± 75). De 30 stemnamen zijn eigennamen en blijven zoals ze zijn.

### Fase 7 — Backend (1,5-2 dagen)
Backenddeel van §10: `progress.detail`, `progressStep`, `reason` in `HttpsError`, `language` in de chat, deelpagina's. De frontend uit fase 3 en 4 werkt al met terugval; na deze fase vervalt de terugval nog niet (zie fase 8).

### Fase 8 — Afronden (0,5 dag)
- [ ] Lint-regel aan voor heel `src/app`.
- [ ] Sectie "Vertalingen" in `.claude/claude.md`: geen harde UI-tekst; nieuwe tekst = key in `translations.ts` + `nl.ts` + `en.ts`; pipe in templates, signal in code; speltermen in `dnd-terms.ts`.
- [ ] Eén release na fase 7: de backend stopt met het schrijven van `message` en `progressMessage`, en de frontend verwijdert de terugval.
- [ ] Hele app in beide talen doorlopen (zie Verificatie).

---

## Tests

**Nieuw:**
- `I18nService`: `use('en')` verandert `language`, `locale` en `t`; een onbekende code doet niets.
- `TranslatePipe`: geeft de tekst van een key, geeft parameters door aan een functie.
- **Wisselen in de praktijk:** een `OnPush`-testcomponent in een zoneless TestBed toont één tekst via de pipe en één via het signal. Na `use('en')` en `fixture.detectChanges()` tonen beide de Engelse tekst. Slaagt de pipe-variant niet, dan krijgt de pipe een `effect` met `ChangeDetectorRef.markForCheck()`.
- `LanguagePreferenceService`: volgorde profiel → localStorage → browser; een keuze schrijft naar localStorage en naar het profiel; zonder login alleen localStorage; `navigator.languages = ['de', 'nl']` geeft Nederlands, `['fr']` geeft Engels.
- Woordenboeken: geen lege teksten in `nl` of `en`; elke functie geeft een niet-lege tekst voor 0, 1 en 2.
- `ProfileDrawerComponent`: toont naam en e-mailadres; een klik op "EN" geeft `languageChange` met `'en'`; Escape en de scrim geven `closed`.
- Nav-rail: bevat geen taalkiezer; de rij met avatar en naam opent de drawer.
- `PublicTopbarComponent`: toont de taalkiezer en de inlogknop. De gedeelde podcastpagina toont de topbar zonder login en niet met login.
- `callableErrorMessage`: `reason` wint van de code, onbekende reden valt terug op de code, onbekende code op de algemene melding.
- Backend: `characterChat` met `language: 'en'` geeft de Engelse taalregel in de prompt; zonder `language` de Nederlandse.

**Bestaande specs (16 controleren letterlijke tekst):**
- `testing.ts` levert `provideTestLanguage('nl' | 'en')`. Zonder die provider is de testtaal vast Engels, zodat de uitkomst niet van jsdom afhangt.
- Controleer waar mogelijk tegen het woordenboek (`en.auth.emailRequired`) in plaats van tegen een letterlijke zin. Dan breekt een tekstwijziging geen test.
- Tests van pure functies geven het woordenboek mee (`en.play`).
- `feature-lookup.spec.ts`, `level-tailoring.spec.ts` en de PDF-specs controleren Engelse SRD- en PDF-tekst. Die veranderen niet.

## Verificatie

In parallel (Haiku-subagents, conform CLAUDE.md):
```bash
npm run build
npm run build:backend
npm run lint
npm run test
```

Handmatig, per fase voor het gebied van die fase en in fase 8 voor de hele app:
1. Zet de taal op Nederlands en loop elk scherm door: geen Engelse tekst behalve speltermen en inhoud.
2. Wissel naar Engels op een open scherm: alles verandert direct, ook datums, open dialogen en toasts die daarna verschijnen.
3. Herlaad: de taal blijft. Log in op een ander apparaat of in een privévenster: de taal uit het profiel wordt gebruikt.
4. Wis localStorage en log uit: de inlogpagina volgt de browsertaal.
5. Open een gedeelde podcastlink en een publieke karakterpagina zonder login, met de browser op Engels en op Nederlands. Beide tonen dezelfde topbar met taalkiezer; een keuze daar blijft na herladen.
6. Ingelogd: de nav-rail toont geen taalkiezer. Een klik op de avatar opent de profiel-drawer; wisselen daar verandert de app direct, ook op mobiel vanuit de hamburger-lade.
7. Zet de browser op Nederlands, kies Engels en herlaad: de app start meteen in het Engels, zonder een moment Nederlands.
8. Start een upload en een podcast: de voortgangsteksten staan in de gekozen taal.
9. Forceer een fout (bijvoorbeeld een tweede verhaal starten terwijl er één loopt): de melding staat in de gekozen taal.
10. Stel The Sidekick een vraag in beide talen: het antwoord volgt de gekozen taal, speltermen blijven Engels.
11. Verwijder tijdelijk één key uit `en.ts`: `npm run build` faalt. Zet een losse tekst in een template: `npm run lint` faalt.

## Buiten scope

- **Taal van campagne-inhoud:** sessieverhaal, campagneverhaal, podcast (script en stemmen) en transcript blijven Nederlands. De opmaak van het transcript en de filters hangen aan Nederlandse labels (`Speler (onbekend)`, `Groep`, `OOC` in `audio/session-log-sanitizer.ts:12-28`). Een taal per campagne is een eigen ticket.
- **D&D-speltermen en SRD-data** vertalen.
- **PDF-export** van de character sheet: het sjabloon (`public/templates/dnd-5e-character-sheet.pdf`) is Engels en bestaat vooral uit speltermen. De PDF blijft volledig Engels.
- **De taal van de AI-prompts zelf.** Alleen de taal van het antwoord van The Sidekick verandert.
- **Logmeldingen** (`logger.*`, Sentry).
- **Bestaande opgeslagen tekst migreren.**
- **Meer dan twee talen.** De opzet laat het toe, maar het wordt nu niet gebouwd.

## Bekende nadelen van de gekozen opzet

- **Eén bestand per taal wordt groot** (± 1.000 regels) en elke feature-branch raakt het. Dat geeft sneller mergeconflicten. Beperk dat door nieuwe keys binnen de eigen groep te zetten (niet onderaan) en de volgorde in `nl.ts` en `en.ts` gelijk te houden aan de interface.
- **De pipe is niet puur** en wordt bij elke change-detection van zijn view opnieuw aangeroepen. De kosten zijn een paar property-lookups per aanroep. Meet het op de character sheet (het grootste scherm); is het merkbaar, onthoud dan het resultaat per taal en key.
- **Keys als string in de pipe** hebben geen "ga naar definitie" in de editor. Het signal (`t().nav.story`) heeft dat wel.

## Bijvangst (niet in dit ticket oplossen)

`firestore.rules:54` laat een gebruiker elk veld van zijn eigen profiel schrijven, ook `admin`. `isAdmin()` (`:44-48`) leest precies dat veld en geeft schrijfrechten op `settings/*`. Elke ingelogde gebruiker kan zichzelf dus admin maken. Dit staat los van vertalingen en verdient een eigen ticket met hoge prioriteit; `language` toevoegen maakt het niet erger.

## Open vragen (aannames in dit ticket; bevestigen of aanpassen)

1. **"Uitloggen":** blijft in de nav-rail. Moet die knop mee naar de profiel-drawer?
2. **Admin-scherm:** wordt ook vertaald, als laatste (fase 6). Alleen jij ziet dit scherm; het mag ook eentalig Engels blijven en van de lint-regel worden uitgezonderd. Dat scheelt een halve dag.
3. **PDF-export:** blijft volledig Engels.
4. **Inlogpagina:** krijgt ook een taalkiezer, rechtsboven.
5. **Previewtekst van gedeelde podcasts:** blijft Nederlands.
6. **Speltermen in Nederlandse zinnen:** "Long rest nemen?", "Level 2 slot gebruikt". Goed zo, of liever volledig Engelse zinnen op de sheet?
