# AI-Driven Character Builder Spec Plan

## Overview

Replace the traditional manual form builder with an AI-driven chat interface combined with a multi-character management system. Users build and evolve characters by conversing with the AI Sidekick. The AI proposes character changes in structured JSON, but **changes are only persisted when the user explicitly commits them** via an "Update Character" button. Each commit creates a new **version** of that character, giving users full control and a complete history.

## Core Concepts

### Characters
- A user can own **multiple characters**. Characters live under the **user**, not under a campaign.
- A character can optionally be **linked to a campaign** (and unlinked just as easily). This is a loose reference, not a structural dependency.
- Each character has a unique identity and a version history.
- One version of a character is marked as **active** at any time.

### Versioning (Manual)
- The AI proposes character updates during conversation, reflected as a **draft preview** on the Character Sheet.
- The user reviews the proposed changes and clicks **"Update Character"** to commit them.
- Each commit creates a new **version** (immutable snapshot) of the character in the database.
- The latest committed version becomes the **active version** by default.
- Users can browse all versions and **restore any previous version** as the active one (this creates a new version based on the restored snapshot -- versions are never deleted or mutated).

### Character-Aware Chat
- Chat is **ephemeral** -- conversation history is held **in-memory only** and is not persisted to the database.
- When the user switches characters or navigates away, the chat resets.
- The AI system prompt is injected with the **active version** of the current character so the AI always has full context.
- The only thing that gets saved is the character data itself, when the user clicks "Update Character".

## User Flow

1. **Browse Characters**: User opens the app and sees their character roster in the left drawer.
2. **Select / Create Character**: User selects an existing character or creates a new one. Creating a new character opens a blank sheet + fresh chat. Characters can optionally be linked to a campaign from the character sheet.
3. **Conversation**: User describes changes or asks questions in the Sidekick chat (right panel).
4. **AI Proposes Changes**: AI returns an updated Character JSON. The Character Sheet (center) shows a **draft preview** highlighting what changed.
5. **User Commits**: User clicks **"Update Character"** to persist the draft as a new version. Or dismisses the draft to keep the current version.
6. **Version History**: User can open a version history panel, browse past versions, compare them, and **set any version as active** (which creates a new version from that snapshot).

## Page Layout (Three-Panel)

```
┌──────────────┬──────────────────────────────┬─────────────────────┐
│              │                              │                     │
│  CHARACTER   │     CHARACTER SHEET          │    SIDEKICK CHAT    │
│  DRAWER      │     (Active Version)         │    (Ephemeral)      │
│              │                              │                     │
│  - Char 1 ◄─┤  Stats, Abilities, Spells,   │  Chat with AI about │
│  - Char 2   │  Equipment, Traits, etc.     │  this character     │
│  - Char 3   │                              │                     │
│              │  ┌─────────────────────┐     │  "I want to swap my │
│  [+ New]     │  │ Draft Preview       │     │   background to     │
│              │  │ (when AI proposes)  │     │   Acolyte"          │
│              │  │                     │     │                     │
│              │  │ [Update Character]  │     │                     │
│              │  │ [Dismiss]           │     │                     │
│              │  └─────────────────────┘     │                     │
│              │                              │                     │
│              │  [Version History]           │                     │
│              │                              │                     │
└──────────────┴──────────────────────────────┴─────────────────────┘
```

- **Left -- Character Drawer**: Collapsible list of all user characters. Click to switch. Button to create new character.
- **Center -- Character Sheet**: Displays the active version of the selected character. Shows draft preview overlay when AI proposes changes. Contains the "Update Character" / "Dismiss" buttons and a "Version History" button.
- **Right -- Sidekick Chat**: The existing chat component, scoped to the selected character. Chat is ephemeral (in-memory only) and resets when switching characters.

## Technical Architecture

### 1. Data Schema (Zod)

The existing `DndCharacterSchema` at `src/app/shared/schemas/dnd-character.schema.ts` defines the character structure. Additionally, we need wrapper schemas for the database documents.

**Character Document** (Firestore: `users/{userId}/characters/{characterId}`):

```typescript
// src/app/core/models/schemas/character.schema.ts
{
  id: string;                    // Firestore document ID
  userId: string;                // Owner
  name: string;                  // Display name (denormalized from active version for list display)
  activeVersionId: string;       // Points to the current active version
  campaignId: string | null;     // Optional link to a campaign (null = unlinked)
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

**Character Version Document** (Firestore: `users/{userId}/characters/{characterId}/versions/{versionId}`):

```typescript
// Part of character.schema.ts
{
  id: string;                    // Firestore document ID
  versionNumber: number;         // Sequential: 1, 2, 3...
  character: DndCharacter;       // Full character snapshot (immutable)
  commitMessage: string;         // Auto-generated or user-provided note (e.g. "Changed background to Acolyte")
  source: 'ai' | 'restore' | 'manual';  // How this version was created
  restoredFromVersionId?: string;         // If source is 'restore', which version it came from
  createdAt: Timestamp;
}
```

### 2. Chat Context (Ephemeral)

- Chat history is **in-memory only** -- held in an Angular signal, never written to Firestore.
- When the user switches characters, the in-memory chat is cleared and a fresh conversation starts with the new character's active version injected into the system prompt.
- This keeps the database lean and avoids storing potentially large conversation logs.

### 3. AI System Prompt Strategy

The system prompt must include:
- **Role**: Expert D&D 5e Dungeon Master and Character Creator.
- **Task**: Assist the user in evolving their character.
- **Output Format**: Strict JSON adhering to the `DndCharacterSchema`.
- **Context**: The **active version** of the character JSON (injected at each turn).

**Prompt Flow**:
- **Input**: User message + Current Active Character JSON.
- **Output**:
  - `thought`: AI's reasoning (internal, not shown to user).
  - `character`: Updated Character JSON (becomes the draft preview).
  - `response`: Conversational response to the user.

### 4. Frontend Implementation

#### Components

| Component | Type | Description |
|---|---|---|
| `CharacterBuilderPageComponent` | Smart | Top-level page orchestrating the three-panel layout |
| `CharacterDrawerComponent` | Dumb | Left panel -- character list with selection and create button |
| `CharacterSheetComponent` | Dumb | Center panel -- renders active character version |
| `CharacterDraftPreviewComponent` | Dumb | Overlay on sheet showing proposed changes with commit/dismiss |
| `CharacterVersionHistoryComponent` | Dumb | Modal/panel listing all versions with restore action |
| `ChatComponent` (existing) | Smart | Right panel -- refactored to accept character context as input |

#### State Management (Signals)

```
selectedCharacterId  ──► activeCharacter (from Firestore)
                         ├── activeVersion (DndCharacter)
                         ├── draftVersion (DndCharacter | null)  ← from AI response
                         └── versions (CharacterVersion[])       ← lazy loaded
```

- `selectedCharacterId`: signal tracking which character is selected in the drawer.
- `activeVersion`: computed from the character's `activeVersionId`.
- `draftVersion`: populated when AI proposes changes, cleared on commit or dismiss.

#### Services

| Service | Responsibility |
|---|---|
| `CharacterService` | CRUD for character documents, fetching character list, linking/unlinking campaigns |
| `CharacterVersionService` | Creating versions, fetching version history, setting active version |
| `CharacterChatService` | In-memory chat state per character, injecting active character version into AI prompts |

### 5. Database & Firestore Rules

**Collections**:
```
users/{userId}/characters/{characterId}
users/{userId}/characters/{characterId}/versions/{versionId}
```

**Rules** (extend existing):
- Characters: read/write by owner only (`request.auth.uid == userId`).
- Versions: read by owner, create by owner only, **no update or delete** (immutable).
- Note: Campaign members who need to see a character (e.g. DM view) would be a future enhancement.

### 6. Routing

```typescript
// New routes under the campaign shell
{
  path: 'characters',
  component: CharacterBuilderPageComponent,
  children: [
    { path: ':characterId', component: CharacterBuilderPageComponent }
  ]
}
```

- `/characters` -- shows drawer + empty state prompting to select or create a character.
- `/characters/:characterId` -- shows full three-panel layout for the selected character.

## Tasks

### Phase 1: Data Layer
- [ ] Create `character.schema.ts` with Character and CharacterVersion Zod schemas in `src/app/core/models/schemas/`.
- [ ] Create `CharacterService` for character CRUD operations (under `users/{userId}/characters`), including campaign link/unlink.
- [ ] Create `CharacterVersionService` for version management (create, list, set active, restore).
- [ ] Update Firestore security rules for character and version collections.

### Phase 2: Character Management UI
- [ ] Create `CharacterBuilderPageComponent` (three-panel layout shell).
- [ ] Create `CharacterDrawerComponent` (character list + create button).
- [ ] Create `CharacterSheetComponent` (display active character version).
- [ ] Add routing for `/characters` and `/characters/:characterId`.

### Phase 3: AI Integration & Versioning
- [ ] Create `CharacterChatService` (ephemeral in-memory chat state, prompt injection with active character version).
- [ ] Refactor `ChatComponent` to accept character context via inputs; chat resets on character switch.
- [ ] Implement draft preview flow: AI response -> draft signal -> preview overlay.
- [ ] Create `CharacterDraftPreviewComponent` (show changes, "Update Character" / "Dismiss" buttons).
- [ ] Wire "Update Character" to `CharacterVersionService.createVersion()`.

### Phase 4: Version History
- [ ] Create `CharacterVersionHistoryComponent` (list versions, show details).
- [ ] Implement "Set as Active" / restore flow (creates new version from snapshot).
- [ ] Add version comparison view (optional -- highlight differences between two versions).

## Validation & Rules
- The AI is responsible for enforcing 5e rules (e.g., correct number of skills, valid ability scores for point buy/standard array if requested).
- The Zod schema ensures the data structure is valid for the app to render.
- Versions are **immutable** once created -- no edits, no deletes.
- Restoring a version creates a **new** version (preserving full audit trail).

## Open Questions
- Should the draft preview show a visual diff (highlighted fields) or just the full updated sheet?
- Should version commit messages be auto-generated by the AI, user-provided, or both?
- Should campaign-linked characters be visible (read-only) to other campaign members / DM? (future enhancement)
- Maximum number of characters per user?
