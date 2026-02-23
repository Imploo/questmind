# Ticket #65: PDF Character Sheet Import via Chat + Migrate Chat to Gemini

**Status:** Done
**Priority:** High
**Created:** 2026-02-23

---

## Description

Allow users to import existing D&D character sheets by uploading a PDF in the character chat. The AI reads the PDF, extracts all character data, and populates the `DndCharacter` model. This supports characters created manually, with D&D Beyond, or any other tool that produces a standard character sheet PDF.

As part of this feature, migrate the character chat's text responder (AI 1) from Claude Haiku to Gemini, unifying the AI stack on a single provider that natively excels at multimodal input (text + PDF/images).

---

## Expected Result

1. User opens a new or existing character in the character builder
2. In the chat, user attaches a PDF file (drag-and-drop or file picker)
3. User sends a message like "Import this character" (or just sends the PDF)
4. The AI reads the PDF, extracts all character data, and responds with a summary of what it found
5. The character JSON is generated (via AI 2) and saved as a draft version
6. User reviews the draft and commits or adjusts

---

## Current Architecture

### Character Chat (Dual-AI Pipeline)

- **AI 1 — Text Responder:** Claude Haiku (`@anthropic-ai/sdk`) → returns text to user synchronously
- **AI 2 — JSON Generator:** Gemini Flash (`@google/genai`) → generates character JSON asynchronously via Cloud Tasks, saves as Firestore draft
- **Frontend:** `ChatService.sendMessage()` sends text-only messages (`ChatHistoryMessage = { role, content: string }`)
- **Backend:** `functions/src/character-chat.ts` — HTTPS Callable function

### Why Gemini for the Entire Chat

- Gemini 3 excels at reading PDFs — accurate extraction of tables, stat blocks, spell lists
- Unifies the AI stack: both AI 1 (text) and AI 2 (JSON) on the same provider
- Removes the `@anthropic-ai/sdk` dependency from the character chat path
- Simplifies the codebase: one prompt format, one API surface, one config
- Gemini already handles multimodal input in `generate-image.ts` — proven pattern

---

## Technical Details

### Phase 1: Migrate AI 1 (Text Responder) to Gemini

**Goal:** Replace Claude Haiku with Gemini for the text responder while keeping behavior identical.

#### Backend Changes (`functions/src/character-chat.ts`)

1. Replace Anthropic `client.messages.create()` with `ai.models.generateContent()`
2. Convert the system prompt + message history from Anthropic format to Gemini format:
   - Anthropic: `system` string + `messages[{role, content}]`
   - Gemini: `systemInstruction` + `contents[{role, parts}]`
3. Map roles: Anthropic `assistant` → Gemini `model`
4. Keep the same system prompt content from `character-responder.prompt.ts`
5. Make the model configurable via Firestore `settings/ai` (already supported — just change the default/feature key)
6. Keep AI 2 (JSON generator) on Gemini as-is — no changes needed

#### Config Changes

- Update `settings/ai` feature entry for `characterChat` AI 1:
  - `provider`: `google` (was `anthropic`)
  - `model`: `gemini-3-flash-preview` or a suitable model
  - `maxOutputTokens`: 512 (keep same)

#### Prompt Adjustments (`character-responder.prompt.ts`)

- Review prompt for any Anthropic-specific instructions (e.g., Claude persona references)
- Adjust if needed — the prompt is mostly D&D-focused, should transfer cleanly

#### Testing

- Verify text responses maintain the same quality and tone
- Verify character context injection still works
- Verify the AI 2 pipeline (Cloud Tasks → draft) is unaffected

---

### Phase 2: Add PDF Upload Support to Chat

**Goal:** Allow users to attach PDF files in the chat, which get sent to the AI as multimodal input.

#### Frontend Changes

##### `ChatHistoryMessage` model update

```typescript
// Before
interface ChatHistoryMessage {
  role: 'user' | 'assistant';
  content: string;
}

// After
interface ChatHistoryMessage {
  role: 'user' | 'assistant';
  content: string;
  attachments?: ChatAttachment[];
}

interface ChatAttachment {
  type: 'pdf' | 'image';
  fileName: string;
  mimeType: string;
  data: string; // base64-encoded
}
```

##### Chat UI Component

- Add "Import PDF" option in the existing `+` button drawer (alongside other actions)
- Accept `.pdf` files via file picker opened from the drawer
- Also support drag-and-drop: user can drop a PDF directly onto the chat message input area
  - `dragover` event shows a visual drop zone indicator (border highlight / overlay)
  - `drop` event extracts the file from `DataTransfer`, validates it's a PDF, and attaches it
- Show attached file as a chip/pill in the message input area (file name + remove button)
- On send: read file as base64 via `FileReader.readAsDataURL()`
- Include attachment data in the callable function payload
- Show the attachment in the chat history (as a PDF icon + filename, not the raw data)

##### File Size Limit

- Client-side limit: 10 MB per PDF (Gemini supports up to 20 MB inline)
- Show error toast if file exceeds limit

#### Backend Changes (`functions/src/character-chat.ts`)

##### Accept attachments in the callable payload

```typescript
// Add to request validation
attachments?: Array<{
  type: string;
  fileName: string;
  mimeType: string;
  data: string; // base64
}>;
```

##### Build multimodal content parts for Gemini

```typescript
// When user message has attachments, build parts array:
const userParts: Part[] = [];

// Add text part
if (messageText) {
  userParts.push({ text: messageText });
}

// Add PDF/image parts
for (const attachment of attachments) {
  userParts.push({
    inlineData: {
      mimeType: attachment.mimeType,
      data: attachment.data, // base64
    },
  });
}
```

This follows the exact same pattern already used in `generate-image.ts`.

##### Pass PDF blob to AI 2 (JSON Generator)

- When the user message includes a PDF attachment, forward the base64 PDF blob to AI 2 as well
- AI 2 reads the PDF directly (as multimodal `inlineData`) alongside AI 1's text summary
- This avoids conversion errors — AI 2 extracts field values straight from the source PDF rather than relying on AI 1's text interpretation
- Slightly higher token cost but ensures accurate JSON generation (stat blocks, spell slots, equipment lists are parsed precisely)

#### System Prompt Update

Add instruction to `CHARACTER_RESPONDER_PROMPT`:

```
## PDF Character Sheet Import
When the user uploads a PDF character sheet, carefully read and extract ALL character data from the PDF:
- Basic info: name, race, class, level, background, alignment
- Ability scores and modifiers
- Skills, proficiencies, saving throws
- Hit points, armor class, initiative, speed
- Equipment, weapons, and coins
- Spells and spell slots (if applicable)
- Features, traits, and special abilities
- Personality traits, ideals, bonds, flaws
- Backstory and appearance notes

Respond with a concise summary of the character you extracted. Mention any fields that were unclear or missing from the sheet. The character JSON will be generated automatically from your analysis.
```

---

### Phase 3: Cleanup

- Remove `@anthropic-ai/sdk` import from `character-chat.ts` if it's no longer used elsewhere
- Check if `@anthropic-ai/sdk` is still needed in `package.json` (may be used by other functions)
- Update AI admin panel if needed to reflect the provider change

---

## Files to Change

| File | Change |
|------|--------|
| `functions/src/character-chat.ts` | Replace Anthropic call with Gemini, accept attachments |
| `functions/src/prompts/character-responder.prompt.ts` | Add PDF import instructions, remove Claude-specific references |
| `src/app/shared/models/chat.model.ts` (or wherever `ChatHistoryMessage` lives) | Add `attachments` field |
| Chat UI component (input area) | Add file attachment button, file preview chip |
| Chat UI component (message display) | Show PDF attachment indicator in sent messages |
| `functions/package.json` | Potentially remove `@anthropic-ai/sdk` if unused elsewhere |

---

## Out of Scope

- Image-based character sheet import (photos of hand-written sheets) — future enhancement
- Importing from D&D Beyond API directly (requires auth) — separate ticket
- Importing from other digital formats (JSON, XML, Roll20 export) — separate ticket
- Modifying the PDF export/generator (`PdfGeneratorService`) — unrelated

---

## Dependencies

- None blocking — can be implemented independently
- Benefits from ticket #34 pattern (Firestore-driven AI config)

---

## Risks & Considerations

- **PDF quality varies wildly:** D&D Beyond PDFs are structured and clean. Hand-filled PDFs, scanned sheets, or homebrew templates may produce lower quality extraction. The AI should gracefully handle partial data and tell the user what it couldn't read.
- **File size:** Character sheet PDFs are typically small (100 KB – 2 MB). The 10 MB limit is generous.
- **Token cost:** Sending a PDF as inline base64 to Gemini consumes more input tokens than a text-only message. This is acceptable for an import action (not every message).
- **AI 1 tone shift:** Switching from Claude Haiku to Gemini may slightly change the conversational tone. Test with existing chat scenarios to ensure quality remains high. The system prompt should anchor the behavior.
- **Anthropic SDK removal:** Verify no other Cloud Functions depend on `@anthropic-ai/sdk` before removing from `package.json`.
