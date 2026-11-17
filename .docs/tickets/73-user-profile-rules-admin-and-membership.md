# Ticket #73: Rechten op gebruikersprofielen dichtzetten — admin, campagnelidmaatschap en leesbare profielen

**Created:** 2026-11-17
**Priority:** Critical (beveiliging)
**Status:** Todo
**Effort:** 2-3 dagen, in 3 fases die elk los te deployen zijn
**Dependencies:** Geen. Gebruikt `functions/src/utils/access.ts` uit #70. Raakt `users/{uid}`, net als #72 (dat het veld `language` toevoegt): de veldenlijst in §2 houdt daar al rekening mee.
**Bron:** Gevonden op 2026-11-17 tijdens de inventarisatie voor #72, door `firestore.rules`, `storage.rules` en `functions/src/utils/access.ts` te lezen.

> **Status van de bevindingen:** alle vijf volgen uit de regels en de code zoals ze nu in de repo staan. Ze zijn **niet uitgeprobeerd** tegen de emulator of tegen productie. Fase 1 begint daarom met een test die elk lek eerst aantoont.

---

## Beschrijving

Het profiel `users/{uid}` is nu tegelijk drie dingen: gegevens van de gebruiker, de plek waar staat of iemand admin is, en de eerste bron voor campagnelidmaatschap. De gebruiker mag zijn eigen profiel volledig schrijven. Daardoor kan hij zichzelf rechten geven.

Registreren is open (Google en e-mail), dus iedereen met een account kan dit.

### De vijf bevindingen

**1. Iedereen kan zichzelf admin maken.**
- `firestore.rules:54`: `allow write: if isAuthenticated() && getUserId() == userId;` Geen beperking op velden.
- `firestore.rules:44-48`: `isAdmin()` leest `users/{uid}.admin`.
- Gevolg: schrijfrechten op `settings/*` (`:170-174`). Daarmee wijzig je voor de hele app de AI-modellen, tokenlimieten, stemmen en segmentatie (`settings/ai`). Dat kost geld of breekt functies. Het admin-scherm in de app gaat ook open (`core/user.service.ts:63`, `auth/admin.guard.ts`).

**2. Iedereen kan zichzelf lid maken van elke campagne.**
- `firestore.rules:13-22`, `storage.rules:4-13` en `access.ts:67,129-133` kijken eerst of het campagne-id in `users/{uid}.campaigns` staat. Dat veld schrijft de gebruiker zelf.
- Gevolg, met een campagne-id:
  - lezen: het campagnedocument (met de e-mailadressen van de leden), alle sessies met transcript en verhaal, de campagneverhalen, en de audio en podcasts in Storage;
  - schrijven: nieuwe sessies aanmaken, correcties op sessies van anderen, podcastbestanden overschrijven (`storage.rules:71-77`);
  - backend: alle callables die `assertCampaignMember` gebruiken, zoals podcasts genereren en publieke deellinks maken. Dat kost geld en maakt inhoud openbaar.

**3. Elke ingelogde gebruiker kan alle profielen lezen.**
- `firestore.rules:52`: `allow read: if isAuthenticated();` Dat geldt voor één profiel en voor de hele lijst.
- Gevolg: alle e-mailadressen, namen en foto's liggen open. En alle campagne-id's: daarmee is bevinding 2 voor iedereen uitvoerbaar.
- De enige reden voor deze regel is het uitnodigen: `campaign.service.ts:235-262` zoekt in de browser een gebruiker op e-mailadres.

**4. Iedereen kan campagne-id's toevoegen aan het profiel van een ander.**
- `firestore.rules:58-61` staat dat toe voor uitnodigingen. Het commentaar zegt dat de campagneregels de veiligheid bewaken; door bevinding 2 klopt dat niet.

**5. Een verwijderd lid houdt toegang, en een lid kan niet zelf vertrekken.**
- `campaign.service.ts:207-211` haalt het lid uit `campaign.members` en roept daarna `userService.removeCampaign(memberId, ...)` aan.
- Die tweede stap schrijft naar het profiel van een ander en verwijdert een id. De regels staan bij een ander alleen toevoegen toe (`:60-61`), dus dit wordt geweigerd.
- Gevolg: het id blijft in het profiel staan en het verwijderde lid blijft lid volgens `isCampaignMember`.
- Een lid dat zichzelf verwijdert: `campaign.service.ts:197` staat het toe, maar het campagnedocument mag alleen de eigenaar wijzigen (`firestore.rules:118`). Dat wordt dus geweigerd.

## Verwacht resultaat

- Admin-rechten staan op een plek die geen gebruiker kan schrijven.
- Lidmaatschap van een campagne volgt alleen uit het campagnedocument. Dat kan alleen de eigenaar of de backend wijzigen.
- Een gebruiker leest alleen zijn eigen profiel. E-mailadressen en campagne-id's van anderen zijn niet meer op te vragen.
- Uitnodigen, een lid verwijderen en zelf vertrekken werken, en gaan via de backend.
- Een verwijderd lid heeft direct geen toegang meer.
- Elke regel is gedekt door een test die de aanval probeert en een weigering verwacht.

## Genomen beslissingen (met de gebruiker afgestemd, 2026-11-17)

| Onderwerp | Beslissing |
|---|---|
| Scope | **Alle vijf bevindingen in één ticket.** De oorzaak en de oplossing hangen samen. |
| Wie is admin | **Aparte collectie `admins/{uid}`.** Een document betekent admin. Niemand schrijft het via de app; beheer in de Firebase-console. |

---

## Technische details

### 1. Admin: `admins/{uid}`

**Regels (`firestore.rules`):**
```
function isAdmin() {
  return isAuthenticated() &&
    exists(/databases/$(database)/documents/admins/$(getUserId()));
}

match /admins/{userId} {
  allow get: if isAuthenticated() && getUserId() == userId;
  allow list, write: if false;
}
```
- Een admin toevoegen of weghalen doe je in de Firebase-console: document `admins/<uid>` aanmaken of verwijderen. De inhoud doet er niet toe; zet er `{ addedAt, note }` in voor de herkenbaarheid.
- Het werkt direct, zonder opnieuw inloggen.

**Frontend:**
- `UserService.isAdmin` (`core/user.service.ts:63`) leest niet meer `profile.admin`, maar of `admins/{uid}` bestaat. Gebruik een live view via een repository, zoals het profiel zelf (`shared/repository/user-profile.repository.ts` als voorbeeld).
- `UserProfile.admin` verdwijnt uit `core/models/user.model.ts` en uit het terugvalprofiel in `user.service.ts:52-58`.
- `admin.guard.ts`, `admin.component.ts:29,493` en `nav-rail.component.ts:275` gebruiken `isAdmin()` al en veranderen niet. Let op het laden: de guard mag pas beslissen als het antwoord er is.

**Backend:** geen enkele callable controleert nu op admin (gecontroleerd met een zoekactie op `admin` in `functions/src`). Er verandert daar niets.

### 2. Eigen profiel: alleen bekende velden

```
match /users/{userId} {
  allow get: if isAuthenticated() && getUserId() == userId;
  allow list: if false;

  allow create: if isAuthenticated() && getUserId() == userId &&
    request.resource.data.keys().hasOnly(profileFields());
  allow update: if isAuthenticated() && getUserId() == userId &&
    request.resource.data.diff(resource.data).affectedKeys().hasOnly(profileFields());
  allow delete: if false;
}

function profileFields() {
  return ['uid', 'email', 'displayName', 'photoURL', 'campaigns',
          'defaultCampaignId', 'language', 'createdAt', 'updatedAt'];
}
```
- `admin` staat niet in de lijst. Het veld heeft na §1 geen betekenis meer; de lijst voorkomt dat een nieuw veld later ongemerkt wel betekenis krijgt.
- Bij `update` telt alleen wat verandert (`affectedKeys`). Bestaande profielen met een oud `admin`-veld blijven dus te bewerken.
- `language` staat erin voor #72.
- De lijst komt overeen met wat de app schrijft: `ensureProfile` (`user.service.ts:82-119`), `addCampaign` voor de eigen gebruiker, `setDefaultCampaign` (`:143`).
- `campaigns` blijft door de gebruiker zelf te schrijven. Na §3 is het alleen nog een lijstje voor de eigen campagnekiezer en geeft het geen rechten.
- De regel uit bevinding 4 (`firestore.rules:56-61`) vervalt.
- `get` alleen voor het eigen profiel en geen `list`: pas in fase 3, als uitnodigen via de backend loopt.

### 3. Lidmaatschap: alleen het campagnedocument

**`firestore.rules` en `storage.rules`:** de eerste tak (profiel) vervalt.
```
function isCampaignMember(campaignId) {
  return isAuthenticated() &&
    exists(/databases/$(database)/documents/campaigns/$(campaignId)) &&
    (get(/databases/$(database)/documents/campaigns/$(campaignId)).data.ownerId == getUserId() ||
     getUserId() in get(/databases/$(database)/documents/campaigns/$(campaignId)).data.members);
}
```
- `members` is een map in nieuwe documenten (`campaign.service.ts:55-61`) en volgens `access.ts:33-41` soms een lijst in oudere. `in` werkt in de regels voor allebei.
- In `storage.rules` dezelfde wijziging met `firestore.get` en `firestore.exists`.

**`functions/src/utils/access.ts`:** `profileListsCampaign` (`:129-133`) en de aanroep op `:67` vervallen. Het commentaar bovenaan ("follows the same rules as `isCampaignMember`") blijft dan kloppen.

**Campagnedocument:** de eigenaar mag het blijven wijzigen, maar niet meer de velden `members` en `ownerId`. Die lopen via de backend, zodat het profiel van het lid gelijk blijft.
```
allow update: if isCampaignOwner(campaignId) &&
  !request.resource.data.diff(resource.data).affectedKeys().hasAny(['members', 'ownerId']);
```

**Frontend, campagnes laden:** `getCampaignsByIds` (`campaign.service.ts:83-94`) gebruikt `Promise.all`. Staat er in het profiel een id waar de gebruiker geen lid (meer) van is, dan faalt na deze wijziging het hele laden. Dat wordt `Promise.allSettled`: geweigerde of ontbrekende campagnes worden overgeslagen, en `campaign-context.service.ts` haalt die id's uit het eigen profiel.

### 4. Controle vóór het omzetten

Er kunnen gebruikers zijn die nu alleen via hun profiel lid zijn: echte leden van oude campagnes, verwijderde leden (bevinding 5), of misbruik. Na §3 verliezen ze allemaal de toegang. Kijk dus eerst.

Nieuw script `functions/scripts/audit-profile-access.ts` (Admin SDK, lokaal draaien met een service account, alleen lezen):
- Voor elk profiel en elk id in `campaigns`: bestaat de campagne, en staat de gebruiker in `members` of is hij eigenaar? Druk elke afwijking af: uid, e-mailadres, campagne-id, campagnenaam, eigenaar.
- Alle profielen met `admin: true`.
- De inhoud en de laatste wijzigingsdatum van elk document in `settings/`.

Wat je met de uitkomst doet:
- Een echt lid dat ontbreekt in `members`: toevoegen aan het campagnedocument (met de hand, of met de vlag `--add-member <uid> <campaignId>`).
- Een verwijderd of onbekend lid: het id uit het profiel halen (`--prune`).
- Een onverwachte admin of een onverwachte waarde in `settings/ai`: dat is een aanwijzing dat het lek is gebruikt. Zet de instellingen terug en kijk in de logs van Firestore en Functions wat dat account deed.

### 5. Uitnodigen, verwijderen en vertrekken via de backend

**`inviteCampaignMember({ campaignId, email })`** (callable, `europe-west1`, via `wrapCallable`):
1. `requireAuthUid`, `assertValidId`, `assertCampaignOwner`.
2. E-mailadres trimmen en naar kleine letters. Opzoeken met `getAuth().getUserByEmail()`.
3. Niet gevonden → `HttpsError('not-found', ..., { reason: 'user-not-found' })`. Al lid → `'already-exists'` met `reason: 'already-member'`.
4. In één batch: `members.<uid> = { role: 'member', email, joinedAt }` op de campagne, en `campaigns: arrayUnion(campaignId)` op het profiel van het nieuwe lid (`set` met `merge`, want het profiel kan nog ontbreken).

**`removeCampaignMember({ campaignId, memberId })`** (callable):
1. De aanroeper is de eigenaar, of `memberId` is de aanroeper zelf (vertrekken).
2. De eigenaar kan niet worden verwijderd → `failed-precondition`, `reason: 'cannot-remove-owner'`.
3. In één batch: `members.<memberId>` verwijderen, en op het profiel `campaigns: arrayRemove(campaignId)`. Is `defaultCampaignId` deze campagne, dan dat veld verwijderen.

**Frontend:**
- `campaign.service.ts`: `inviteUserByEmail` (`:138-183`) en `removeMember` (`:185-212`) roepen de callables aan. `findUserByEmail` (`:235-262`) vervalt.
- `user.service.ts`: `addCampaign` alleen nog voor de eigen gebruiker (bij het aanmaken van een campagne); `removeCampaign` vervalt.
- `campaign-settings.component.ts:343-369` toont nu `error.message`. Gebruik de `reason` voor de melding. Bouw dit zo dat het aansluit op `callableErrorMessage` uit #72 als dat er al is.

**Bekend gevolg:** de melding "geen gebruiker met dit e-mailadres" vertelt een campagne-eigenaar of een adres een account heeft. Dat is nu ook zo en hoort bij uitnodigen op e-mailadres. Na dit ticket kan het alleen nog adres voor adres, niet meer als lijst.

---

## Fases

Elke fase is los te deployen. De volgorde is die van risico: eerst wat het meeste oplevert voor het minste werk.

### Fase 1 — Admin en eigen profiel (0,5 dag)
- [ ] Tests die bevinding 1 aantonen (zie Tests), daarna de regels uit §1 en §2. De leesregel van `users` blijft nog zoals hij is.
- [ ] Frontend: `isAdmin` uit `admins/{uid}`; `UserProfile.admin` weg.
- [ ] **Vóór de deploy:** in de console `admins/<jouw uid>` aanmaken. Anders ben je zelf geen admin meer.
- [ ] Na de deploy: het veld `admin` uit de profielen verwijderen.

### Fase 2 — Lidmaatschap uit het campagnedocument (1 dag)
- [ ] Het script uit §4 schrijven en draaien tegen productie; de afwijkingen afhandelen.
- [ ] §3: `firestore.rules`, `storage.rules`, `access.ts`, de updateregel van de campagne.
- [ ] Frontend: campagnes laden met `Promise.allSettled` en oude id's opruimen.
- Na deze fase zijn bevinding 2 en het eerste deel van bevinding 5 (verwijderd lid houdt toegang) dicht. Verwijderen in de app geeft tot fase 3 nog steeds een foutmelding na afloop, maar de toegang is wel weg.

### Fase 3 — Ledenbeheer via de backend, profielen dicht (1 dag)
- [ ] §5: de twee callables, de frontend erop aansluiten.
- [ ] `users`: `get` alleen eigen profiel, geen `list`; de regel voor profielen van anderen weg.
- [ ] Het commentaar in `firestore.rules` en `storage.rules` bijwerken.

Tussen fase 2 en 3 werkt uitnodigen nog op de oude manier: de eigenaar schrijft `members` zelf. De beperking op `members` in de updateregel (§3) gaat daarom pas in fase 3 in.

---

## Tests

**Regeltests (nieuw):** de repo heeft nog geen tests voor de regels. Voeg `@firebase/rules-unit-testing` toe met een eigen script `npm run test:rules`, dat via `firebase emulators:exec --only firestore,storage` draait. De emulators staan al in `firebase.json`. Het script hoort niet in `npm run test`, omdat het de emulator (Java) nodig heeft.

Elke test probeert de aanval en verwacht een weigering:
- Een gebruiker zet `admin: true` in zijn eigen profiel → geweigerd. Hetzelfde bij aanmaken, en via verwijderen en opnieuw aanmaken.
- Een gebruiker schrijft `admins/<eigen uid>` → geweigerd. Zonder dat document schrijven naar `settings/ai` → geweigerd; met het document (door de testopzet aangemaakt) → toegestaan.
- Een gebruiker zet een vreemd campagne-id in zijn eigen `campaigns` en leest daarna de campagne, een sessie, een campagneverhaal en een audiobestand in Storage → alle vier geweigerd.
- Een lid in `members` leest dezelfde vier → toegestaan. De eigenaar ook.
- Een gebruiker leest het profiel van een ander en vraagt de lijst `users` op → geweigerd. Het eigen profiel → toegestaan.
- Een gebruiker voegt een campagne-id toe aan het profiel van een ander → geweigerd.
- De eigenaar wijzigt `name` van de campagne → toegestaan; `members` of `ownerId` → geweigerd (vanaf fase 3).
- De eigen profielvelden uit §2, waaronder `language` en `defaultCampaignId` → toegestaan; een onbekend veld → geweigerd.

**Backend (`functions/src/utils/access.spec.ts`):**
- De test "falls back to users/{uid}.campaigns" (`:70`) wordt omgedraaid: alleen in het profiel staan is niet genoeg.
- `inviteCampaignMember`: niet de eigenaar → `permission-denied`; onbekend adres → `user-not-found`; al lid → `already-member`; succes schrijft campagne en profiel.
- `removeCampaignMember`: eigenaar verwijdert een lid; een lid verwijdert zichzelf; een lid verwijdert een ander → `permission-denied`; de eigenaar verwijderen → `cannot-remove-owner`; `defaultCampaignId` wordt gewist als het deze campagne was.

**Frontend:**
- `UserService.isAdmin`: waar met een `admins`-document, onwaar zonder, en onwaar als het profiel `admin: true` bevat.
- Campagnes laden: één geweigerde campagne laat de rest gewoon laden en haalt het id uit het profiel.
- `campaign.service`: uitnodigen en verwijderen roepen de callables aan en schrijven niet meer zelf naar Firestore.

## Verificatie

In parallel (Haiku-subagents, conform CLAUDE.md):
```bash
npm run build
npm run build:backend
npm run lint
npm run test
```
En apart: `npm run test:rules`.

Handmatig in de emulator, met twee accounts (A is eigenaar van een campagne, B is een vreemde):
1. B zet in de browserconsole `admin: true` in zijn eigen profiel → geweigerd. `/admin` blijft dicht.
2. B zet het campagne-id van A in zijn eigen `campaigns` → de app toont de campagne niet; een directe leesactie op een sessie wordt geweigerd.
3. B vraagt de collectie `users` op → geweigerd.
4. A nodigt B uit → B ziet de campagne na herladen.
5. A verwijdert B → geen foutmelding; B ziet de campagne niet meer en een directe leesactie wordt geweigerd.
6. A nodigt B opnieuw uit; B vertrekt zelf → B is weg uit de ledenlijst van A.
7. Een account met een `admins`-document opent `/admin` en slaat een instelling op.

## Deploy

1. **Fase 1:** eerst `admins/<uid>` aanmaken in de console (productie en beta), dan deployen. Daarna inloggen en `/admin` controleren.
2. **Fase 2:** het script uit §4 draaien en de afwijkingen afhandelen, dan deployen.
3. **Fase 3:** deployen. `scripts/deploy-firebase.js` zet eerst de functions en daarna hosting en regels neer; dat is de goede volgorde. Wie de app nog open heeft met de oude versie, krijgt bij uitnodigen een weigering tot de pagina is ververst (de melding "A new version of the app is available" verschijnt dan al).

## Buiten scope

- **Uploads naar Storage zonder lidmaatschapscheck.** `storage.rules:60-67` laat elke ingelogde gebruiker tot 4 GB audio uploaden naar het pad van elke campagne. Het commentaar daar legt uit dat dit een bewuste keuze is en dat de backend het lidmaatschap controleert vóór verwerking. Het bestand staat dan wel al in de bucket. Eigen ticket als dit moet veranderen.
- **Eigenaarschap van een campagne overdragen.** `ownerId` is na dit ticket alleen nog via de console te wijzigen.
- **Rollen binnen een campagne** anders dan eigenaar en lid.
- **De legacy-regels voor `campaigns/{id}/metadata`** (`firestore.rules:122-128`).

## Open vragen (aannames in dit ticket; bevestigen of aanpassen)

1. **Wie is admin:** alleen jij. Klopt dat, of moeten er meer uid's in `admins`?
2. **Regeltests in CI:** `npm run test:rules` draait lokaal en niet in de GitHub-workflows, omdat de emulator Java nodig heeft en de build langer maakt. Wil je het toch in CI?
3. **Vertrekken uit een campagne:** de backend ondersteunt het na dit ticket. Er komt geen nieuwe knop voor; de bestaande code roept het alleen aan als een lid zichzelf verwijdert in de ledenlijst. Is een aparte knop "Campagne verlaten" gewenst?
4. **Afwijkingen uit de controle (§4):** de aanname is dat je ze per geval beoordeelt. Bij veel afwijkingen: alle leden die nu alleen via hun profiel toegang hebben automatisch toevoegen aan `members`, of juist automatisch verwijderen?
