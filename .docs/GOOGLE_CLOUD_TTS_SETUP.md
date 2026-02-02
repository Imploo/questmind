# Google Cloud Text-to-Speech Setup

Deze guide legt uit hoe je Google Cloud TTS configureert voor natuurlijk klinkende Nederlandse podcast stemmen.

## 🎯 Waarom Google Cloud TTS?

- **WaveNet stemmen**: Veel natuurlijker dan browser TTS
- **Meerdere Nederlandse stemmen**: Keuze uit 5 verschillende stemmen
- **Hoge kwaliteit**: Neural network gegenereerde spraak
- **Betrouwbaar**: Google's productie-ready API

## 📋 Stap 1: Google Cloud Account

1. Ga naar [Google Cloud Console](https://console.cloud.google.com/)
2. Maak een account aan (nieuwe gebruikers krijgen $300 gratis credits)
3. Maak een nieuw project aan of gebruik een bestaand project

## 🔑 Stap 2: API Key Aanmaken

### Optie A: Bestaande Google AI Studio Key Gebruiken (Aanbevolen)

Als je al een Google AI Studio API key hebt (voor Gemini), kun je dezelfde key gebruiken:

1. Ga naar [Google Cloud Console - APIs](https://console.cloud.google.com/apis/dashboard)
2. Zorg dat je in hetzelfde project bent als je AI Studio key
3. Klik op "+ ENABLE APIS AND SERVICES"
4. Zoek naar "Cloud Text-to-Speech API"
5. Klik "Enable"
6. Je bestaande API key werkt nu ook voor TTS!

### Optie B: Nieuwe API Key Aanmaken

1. Ga naar [Google Cloud Console - Credentials](https://console.cloud.google.com/apis/credentials)
2. Klik op "+ CREATE CREDENTIALS" → "API key"
3. Kopieer de API key
4. (Optioneel) Klik op de key om deze te beperken tot alleen "Cloud Text-to-Speech API"

## 🔌 Stap 3: API Inschakelen

1. Ga naar [Cloud Text-to-Speech API](https://console.cloud.google.com/apis/library/texttospeech.googleapis.com)
2. Klik "ENABLE"
3. Wacht tot de API is ingeschakeld

## ⚙️ Stap 4: Configureren in QuestMind

### Development (environment.local.ts)

Open `src/environments/environment.local.ts` en update:

```typescript
googleCloudApiKey: 'JOUW_API_KEY_HIER',
tts: {
  enabled: true,
  voiceMale: 'nl-NL-Wavenet-B',      // Of -C voor andere mannenstem
  voiceFemale: 'nl-NL-Wavenet-A',    // Of -D/-E voor andere vrouwenstem
  speakingRate: 1.0,                  // 0.25-4.0 (1.0 = normaal)
  pitch: 0.0                          // -20.0 tot 20.0 (0 = normaal)
}
```

### Production (environment.ts)

Voor productie, update `src/environments/environment.ts` met dezelfde configuratie.

## 🎤 Beschikbare Nederlandse Stemmen

| Voice Name      | Gender | Type    | Beschrijving        |
| --------------- | ------ | ------- | ------------------- |
| nl-NL-Wavenet-A | Female | WaveNet | Helder, vriendelijk |
| nl-NL-Wavenet-B | Male   | WaveNet | Diep, professioneel |
| nl-NL-Wavenet-C | Male   | WaveNet | Warm, natuurlijk    |
| nl-NL-Wavenet-D | Female | WaveNet | Zacht, kalm         |
| nl-NL-Wavenet-E | Female | WaveNet | Energiek, levendig  |

### Stemmen Testen

Je kunt stemmen online testen op:
https://cloud.google.com/text-to-speech#demo

## 💰 Kosten

Google Cloud TTS prijzen (vanaf 2024):

- **WaveNet stemmen**: $16.00 per 1 miljoen characters
- **Gratis tier**: Eerste 1 miljoen characters WaveNet per maand GRATIS (vanaf maart 2023)

### Voorbeeld Kosten voor 20-min Podcast

- Geschat: ~8,000-12,000 characters
- Kosten: ~$0.10-$0.20 per podcast
- **Met gratis tier**: Eerste 80-120 podcasts per maand GRATIS!

## 🔒 Beveiliging

**BELANGRIJK**:

1. **Voeg NOOIT je API key toe aan Git**:

   - `environment.local.ts` staat al in `.gitignore`
   - Gebruik environment variables voor productie

2. **Beperk je API key**:

   - Ga naar [API Credentials](https://console.cloud.google.com/apis/credentials)
   - Klik op je API key
   - Onder "API restrictions" → Selecteer "Restrict key"
   - Kies alleen "Cloud Text-to-Speech API"
   - Sla op

3. **Gebruik Application restrictions** (optioneel):
   - Voor productie: Voeg HTTP referrers toe (bijv. `*.firebaseapp.com/*`)
   - Dit voorkomt misbruik van andere websites

## ✅ Testen

1. Start de applicatie: `npm start`
2. Ga naar een audio sessie met een gegenereerd verhaal
3. Klik "Genereer Podcast"
4. Klik "▶️ Afspelen" op de gegenereerde podcast
5. Je zou nu natuurlijk klinkende Nederlandse stemmen moeten horen!

## 🐛 Troubleshooting

### "Google Cloud TTS is niet geconfigureerd"

- Controleer of `googleCloudApiKey` is ingevuld in environment file
- Controleer of `tts.enabled` is `true`
- Controleer of je de juiste environment file gebruikt (local vs production)

### "TTS API error: API key not valid"

- Controleer of de API key correct is gekopieerd (geen extra spaties)
- Controleer of Cloud Text-to-Speech API is enabled in je Google Cloud project
- Controleer of je API key restrictions niet te streng zijn

### "TTS API error: The caller does not have permission"

- Zorg dat Cloud Text-to-Speech API is enabled
- Wacht een paar minuten na het enablen van de API
- Controleer of je billing hebt ingeschakeld (vereist, maar gratis tier is beschikbaar)

### Geen geluid

- Controleer browser volume
- Controleer of andere websites geluid maken
- Check browser console voor errors (F12)
- Probeer een andere browser

## 📚 Meer Informatie

- [Cloud TTS Documentation](https://cloud.google.com/text-to-speech/docs)
- [Voice List](https://cloud.google.com/text-to-speech/docs/voices)
- [Pricing](https://cloud.google.com/text-to-speech/pricing)
- [SSML Support](https://cloud.google.com/text-to-speech/docs/ssml) (voor geavanceerde spraakcontrole)

## 🎨 Aanpassen

### Snelheid Aanpassen

In environment file:

```typescript
speakingRate: 1.2; // 20% sneller
speakingRate: 0.8; // 20% langzamer
```

### Toonhoogte Aanpassen

```typescript
pitch: 2.0; // Hogere stem
pitch: -2.0; // Lagere stem
```

### Andere Stemmen Gebruiken

Probeer verschillende combinaties:

```typescript
voiceMale: 'nl-NL-Wavenet-C',    // Warmere mannenstem
voiceFemale: 'nl-NL-Wavenet-E',  // Energiekere vrouwenstem
```

---

**Veel plezier met natuurlijk klinkende podcasts! 🎙️**
