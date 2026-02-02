# AI System Prompts

This folder contains all AI system prompts used throughout the application. Extracting prompts to separate files makes them easier to maintain, test, and version control.

## Available Prompts

### 1. D&D Character Assistant (`dnd-character-assistant.prompt.ts`)

**Used by:** `ChatService` (`src/app/chat/chat.service.ts`)

**Purpose:** Configures the AI to act as an expert D&D 5e assistant for character creation and rules interpretation.

**Key Features:**

- Focuses on official D&D 5e content (PHB, Tasha's, Xanathar's)
- Provides rules-compliant character creation guidance
- References specific page numbers when citing rules
- Distinguishes between official and homebrew content

### 2. Session Story Generator (`session-story-generator.prompt.ts`)

**Used by:** `AudioSessionService` (`src/app/audio/audio-session.service.ts`)

**Purpose:** Transforms session transcripts into coherent, readable session recaps in Dutch.

**Key Features:**

- Generates narrative recaps in Dutch (Nederlands)
- Focuses on in-game content (combat, plot, NPCs, loot)
- Excludes meta-game discussion and technical interruptions
- Uses Markdown formatting for structure

### 3. Audio Transcription (`audio-transcription.prompt.ts`)

**Used by:** `AudioSessionService` (`src/app/audio/audio-session.service.ts`)

**Purpose:** Transcribes D&D session audio recordings with specific formatting and validation.

**Key Features:**

- Validates audio accessibility and quality
- Provides structured JSON output with timestamps
- Includes error handling for corrupted/empty audio
- Generates brief summaries (1-3 sentences max)
- Prevents AI hallucination and repetition

## Usage

All prompts are exported through the central `index.ts` file:

```typescript
import {
  DND_CHARACTER_ASSISTANT_PROMPT,
  SESSION_STORY_GENERATOR_PROMPT,
  AUDIO_TRANSCRIPTION_PROMPT,
} from '../prompts';
```

## Modifying Prompts

When modifying prompts:

1. **Test thoroughly** - Changes to prompts can significantly affect AI behavior
2. **Document changes** - Update this README if you add functionality
3. **Maintain consistency** - Keep similar formatting and structure across prompts
4. **Version control** - Commit prompt changes separately for easy rollback

## Best Practices

- Keep prompts clear and specific
- Use structured formatting (bullet points, numbered lists)
- Include examples when behavior might be ambiguous
- Define both what to include AND what to exclude
- Specify output format requirements
- Add validation rules where applicable
