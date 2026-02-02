# Ticket 15: User Comments for AI Guidance

## Overview

Add functionality for users to provide comments and guidance notes on audio sessions to help the AI correctly interpret names, terms, and context during transcription and story generation. This addresses cases where the AI misinterprets spoken words (e.g., "corikan" should be "khuri-khan").

## Current State

**Session Story Service** (`src/app/audio/session-story.service.ts`):

- Generates session recaps from audio transcripts using only the transcript text
- Has no ability to receive user guidance or corrections
- Cannot be directed to interpret ambiguous terms correctly

**Audio Session Component** (`src/app/audio/audio-session.component.ts`):

- Handles audio upload and transcription
- Generates story from transcript automatically
- No UI for user to provide context or corrections

**Limitations**:

- AI cannot be guided when ambiguous names or terms are detected
- No way to correct misheard character names, locations, or special terms
- Users must manually edit generated stories after the fact
- No pre-generation correction mechanism

## Problem Statement

During D&D sessions, players often mention names and terms that are:

1. **Phonetically Ambiguous**: "Khuri-Khan" might be transcribed as "Corikan", "Kuri Khan", "Cori-khan"
2. **Fantasy Names**: Unusual spellings that sound similar to common words
3. **Campaign-Specific**: Custom locations, NPCs, items with unique names
4. **Accented Speech**: Non-standard pronunciation affecting transcription
5. **Background Noise**: Audio quality issues causing misinterpretation

**Example Issues**:

- "Khuri-Khan" (proper name) → transcribed as "corikan" or "kori khan"
- "Baldur's Gate" → transcribed as "ball doors gate"
- "Tiamat" → transcribed as "tea a mat"
- "Elven wizard" → transcribed as "eleven wizard"

**Current Workflow Problem**:

1. User uploads audio
2. AI transcribes with errors
3. AI generates story with incorrect names
4. User must manually edit markdown story
5. No way to fix the source (transcript) or guide the AI upfront

## Proposed Solution

Add a **user corrections** feature that allows users to review the generated story and provide corrections for regeneration. This creates an iterative workflow where users can refine the AI output.

### Workflow

1. **User uploads audio** → Transcription runs automatically
2. **Story is generated automatically** → User sees the initial story
3. **User reviews story** → Identifies errors (wrong names, missed context)
4. **User adds corrections** → Types guidance in a field next to the story
5. **Corrections auto-save** → Saved to Firestore with debounce
6. **User clicks "Regenerate"** → New story generated with corrections applied

### User Corrections Feature

**Input Types**:

1. **Name Corrections**: "When you hear 'corikan', it should be 'Khuri-Khan'"
2. **Context Notes**: "The party is currently in the Shadowfell, not the Feywild"
3. **Character Reminders**: "Theron is the party's rogue, Elara is the cleric"
4. **Plot Context**: "The players are searching for the Crystal of Eternal Light"
5. **Missed Details**: "Don't forget we also found a magical sword in the vault"

**UI Placement**:

- Corrections field displayed NEXT TO the generated story
- Available immediately after story generation
- Auto-saves with sensible debounce (500ms after user stops typing)
- Persisted with session data in Firestore
- "Regenerate Story" button applies corrections

**Prompt Integration**:

- User corrections prepended to the story generation prompt
- Formatted as "DM CORRECTIONS" section
- AI instructed to apply corrections to improve accuracy

### Implementation Approach

#### Phase 1: Data Model Update

**Firestore Schema** (`audioSessions` collection):

Add new optional fields:

```typescript
interface AudioSession {
  // ... existing fields
  userCorrections?: string; // User corrections for regeneration
  correctionsUpdatedAt?: Timestamp; // When corrections were last updated
  storyRegeneratedAt?: Timestamp; // When story was last regenerated
  storyRegenerationCount?: number; // Number of times story has been regenerated
}
```

#### Phase 2: Component Enhancement

**Update Audio Session Component** (`src/app/audio/audio-session.component.ts`):

```typescript
export class AudioSessionComponent {
  // ... existing code

  userCorrections = signal<string>('');
  correctionsSaveStatus = signal<'idle' | 'saving' | 'saved'>('idle');
  private saveDebounceTimer?: ReturnType<typeof setTimeout>;

  onCorrectionsInput(corrections: string) {
    this.userCorrections.set(corrections);
    this.correctionsSaveStatus.set('saving');

    // Clear existing timer
    if (this.saveDebounceTimer) {
      clearTimeout(this.saveDebounceTimer);
    }

    // Debounce save to Firestore (500ms after user stops typing)
    this.saveDebounceTimer = setTimeout(() => {
      this.saveCorrectionsToFirestore(corrections);
    }, 500);
  }

  private async saveCorrectionsToFirestore(corrections: string) {
    if (!this.sessionId()) return;

    try {
      const docRef = doc(this.firestore, 'audioSessions', this.sessionId()!);
      await updateDoc(docRef, {
        userCorrections: corrections,
        correctionsUpdatedAt: serverTimestamp(),
      });
      this.correctionsSaveStatus.set('saved');

      // Reset to idle after 2 seconds
      setTimeout(() => this.correctionsSaveStatus.set('idle'), 2000);
    } catch (error) {
      console.error('Failed to save corrections:', error);
      this.correctionsSaveStatus.set('idle');
    }
  }

  async regenerateStory() {
    if (!this.sessionId() || !this.transcriptText()) return;

    this.isGeneratingStory.set(true);

    try {
      const story = await firstValueFrom(
        this.storyService.generateStoryFromTranscript(
          this.transcriptText()!,
          this.sessionTitle() || 'Untitled Session',
          this.sessionDate(),
          this.userCorrections(), // Include corrections
          this.kankaEnabled()
        )
      );

      this.generatedStory.set(story);

      // Update Firestore with regenerated story
      const docRef = doc(this.firestore, 'audioSessions', this.sessionId()!);
      await updateDoc(docRef, {
        story,
        storyRegeneratedAt: serverTimestamp(),
        storyRegenerationCount: increment(1),
      });
    } catch (error) {
      console.error('Failed to regenerate story:', error);
      // Handle error
    } finally {
      this.isGeneratingStory.set(false);
    }
  }
}
```

**Add UI for Corrections Input** (next to generated story):

```html
<!-- In audio-session.component.ts template section -->

<!-- Story and Corrections Section (shown after story generation) -->
@if (generatedStory()) {
<div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
  <!-- Left: Generated Story -->
  <div class="space-y-4">
    <div class="flex items-center justify-between">
      <h3 class="text-lg font-semibold">Generated Story</h3>
      <button
        (click)="regenerateStory()"
        [disabled]="isGeneratingStory()"
        class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
      >
        {{ isGeneratingStory() ? 'Regenerating...' : 'Regenerate Story' }}
      </button>
    </div>

    <div class="prose max-w-none bg-white border rounded-lg p-6">
      <!-- Markdown rendered story -->
      <div [innerHTML]="generatedStory() | markdown"></div>
    </div>
  </div>

  <!-- Right: Corrections Input -->
  <div class="space-y-4">
    <div class="flex items-center justify-between">
      <h3 class="text-lg font-semibold">Corrections & Guidance</h3>
      @if (correctionsSaveStatus() !== 'idle') {
      <span class="text-xs text-gray-500">
        {{ correctionsSaveStatus() === 'saving' ? 'Saving...' : 'Saved ✓' }}
      </span>
      }
    </div>

    <div class="bg-gray-50 border rounded-lg p-4 space-y-3">
      <p class="text-sm text-gray-600">
        Review the story and add corrections below. The AI will apply these when you regenerate the
        story.
      </p>

      <textarea
        [value]="userCorrections()"
        (input)="onCorrectionsInput($any($event.target).value)"
        placeholder="Example: When you hear 'corikan', the correct name is 'Khuri-Khan'. The party is in Waterdeep, not Baldur's Gate."
        class="w-full h-96 p-3 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-vertical font-mono"
      ></textarea>

      <div class="flex items-start gap-2 text-xs text-gray-500">
        <svg class="w-4 h-4 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
          <path
            fill-rule="evenodd"
            d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
            clip-rule="evenodd"
          />
        </svg>
        <span>
          Your corrections auto-save as you type. Click "Regenerate Story" to create an improved
          version.
        </span>
      </div>
    </div>
  </div>
</div>
}
```

#### Phase 3: Service Enhancement

**Update Session Story Service** (`src/app/audio/session-story.service.ts`):

```typescript
generateStoryFromTranscript(
  transcript: string,
  title: string,
  sessionDate?: string,
  userCorrections?: string, // NEW: User-provided corrections
  enableKankaLookup: boolean = true
): Observable<string> {
  // If user corrections provided, include in prompt
  const correctionsSection = userCorrections
    ? this.buildCorrectionsPrompt(userCorrections)
    : '';

  // ... rest of generation logic with corrections included
}

private buildCorrectionsPrompt(corrections: string): string {
  return `
DM CORRECTIONS:
The Dungeon Master has reviewed a previous version of this story and provided the following corrections:

${corrections}

IMPORTANT: Apply these corrections when generating the story. Prioritize these corrections over ambiguous interpretations from the transcript.
`;
}
```

**Prompt Integration Example**:

```
You are an experienced D&D 5e session recorder...

DM CORRECTIONS:
When you hear "corikan" or similar, the correct name is "Khuri-Khan" (the party's quest giver).
The party is in Waterdeep, not Baldur's Gate.
Theron is the rogue, Elara is the cleric, Grimjaw is the barbarian.

SESSION TITLE: The Shadow Vault
TRANSCRIPT:
[transcript here...]
```

#### Phase 4: UI/UX Enhancements

**Two-Column Layout**:

1. **Left column**: Generated story (read-only, markdown rendered)
2. **Right column**: Corrections input (editable textarea)
3. **Regenerate button**: Prominent placement at top of story column
4. **Auto-save indicator**: Shows "Saving..." / "Saved ✓" status

**Auto-Save Behavior**:

- Debounce timer: 500ms after user stops typing
- Visual feedback: Status indicator shows save state
- No manual save button needed
- Corrections persist across page refreshes

**Responsive Design**:

- Desktop: Two-column side-by-side layout
- Tablet/Mobile: Single column, stacked layout
- Story first, then corrections below

**Smart Suggestions** (Future Enhancement):

- Detect common transcription issues automatically
- Suggest adding corrections for unclear words
- Show confidence scores from transcription
- Offer quick-fill templates

**Correction Templates** (Future):

Provide common templates users can select:

- "Character name corrections"
- "Location name corrections"
- "Campaign context"
- "Missed details"

#### Phase 5: Regeneration Flow

**User Workflow**:

1. **Story generated automatically** after transcription completes
2. **User reviews story** and identifies errors
3. **User types corrections** in right-hand panel (auto-saves)
4. **User clicks "Regenerate Story"** button
5. **Service calls AI** with corrections included in prompt
6. **New story replaces old** in left panel
7. **User can iterate** - add more corrections and regenerate again

**Tracking Regenerations**:

- Store `storyRegenerationCount` in Firestore
- Track `storyRegeneratedAt` timestamp
- Optional: Keep history of previous versions

## Technical Implementation

### Data Flow

```
User uploads audio
  ↓
Transcription runs automatically
  ↓
Story is generated automatically (first version)
  ↓
User reviews story → identifies errors ← NEW STEP
  ↓
User adds corrections (auto-saved) ← NEW STEP
  ↓
User clicks "Regenerate Story" ← NEW STEP
  ↓
Session Story Service receives: transcript + corrections
  ↓
AI prompt includes corrections section
  ↓
Improved story generated and replaces previous version
  ↓
User can iterate: add more corrections → regenerate again
```

### Firestore Structure

```typescript
// audioSessions/{sessionId}
{
  // ... existing fields
  userCorrections: "When you hear 'corikan', use 'Khuri-Khan'. Party is in Waterdeep.",
  correctionsUpdatedAt: Timestamp,
  storyRegeneratedAt: Timestamp,
  storyRegenerationCount: 2, // Track how many times regenerated
}
```

### Component State

```typescript
interface AudioSessionState {
  // ... existing state
  userCorrections: string;
  correctionsSaveStatus: 'idle' | 'saving' | 'saved';
  isGeneratingStory: boolean;
}
```

## Implementation Steps

### Step 1: Data Model and Firestore

- [ ] Update Firestore schema to include `userCorrections` field
- [ ] Add fields for `correctionsUpdatedAt`, `storyRegeneratedAt`, `storyRegenerationCount`
- [ ] Update Firestore rules to allow users to update their session corrections
- [ ] Create migration script if needed (likely not - optional fields)
- [ ] Update TypeScript interfaces in `audio-session.models.ts`

### Step 2: Component UI

- [ ] Add two-column layout (story left, corrections right)
- [ ] Add corrections textarea next to generated story
- [ ] Add "Regenerate Story" button at top of story column
- [ ] Add save indicator (saving/saved status) for corrections
- [ ] Style with Tailwind for consistency (responsive grid layout)
- [ ] Add helpful tooltips and examples
- [ ] Make layout responsive (stacked on mobile/tablet)

### Step 3: Component Logic

- [ ] Add `userCorrections` signal to component
- [ ] Implement `onCorrectionsInput()` method with debounce
- [ ] Add debounced auto-save to Firestore (500ms delay)
- [ ] Implement `correctionsSaveStatus` signal for UI feedback
- [ ] Load existing corrections when component initializes
- [ ] Implement `regenerateStory()` method
- [ ] Track regeneration count when story is regenerated

### Step 4: Service Enhancement

- [ ] Update `generateStoryFromTranscript()` signature to accept corrections
- [ ] Implement `buildCorrectionsPrompt()` helper method
- [ ] Integrate corrections into AI prompt construction
- [ ] Test prompt with various correction scenarios
- [ ] Handle empty/missing corrections gracefully

### Step 5: Prompt Optimization

- [ ] Update session-story-generator prompt to explain corrections usage
- [ ] Test AI's adherence to correction instructions
- [ ] Optimize corrections section formatting
- [ ] Add examples to prompt if needed
- [ ] Ensure corrections are prioritized over ambiguous transcript text

### Step 6: Regeneration Feature

- [ ] Implement story regeneration with corrections
- [ ] Update Firestore with regenerated story
- [ ] Increment `storyRegenerationCount` field
- [ ] Update `storyRegeneratedAt` timestamp
- [ ] Show loading state during regeneration
- [ ] Handle regeneration errors gracefully

### Step 7: Testing

- [ ] Test with various guidance inputs
- [ ] Verify name corrections work correctly
- [ ] Test with empty guidance (no regression)
- [ ] Test save/load functionality
- [ ] Test regeneration flow
- [ ] Validate Firestore rules

### Step 8: Documentation

- [ ] Document guidance feature in README
- [ ] Add examples of effective guidance
- [ ] Create user guide for best practices
- [ ] Document limitations

## UI Mockup

```
┌────────────────────────────────────────────────────────────────────────────┐
│ Audio Session: The Shadow Vault                                            │
├────────────────────────────────────────────────────────────────────────────┤
│                                                                            │
│ [✓] Audio uploaded (15:32)                                                 │
│ [✓] Transcription complete                                                 │
│ [✓] Story generated                                                        │
│                                                                            │
├─────────────────────────────────┬──────────────────────────────────────────┤
│ Generated Story                 │ Corrections & Guidance                   │
│                     [Regenerate]│                            [Saved ✓]     │
├─────────────────────────────────┼──────────────────────────────────────────┤
│                                 │                                          │
│ # The Shadow Vault              │ Review the story and add corrections:    │
│                                 │                                          │
│ The party descended into the    │ ┌────────────────────────────────────┐  │
│ ancient vault beneath Corikan's │ │ When you hear "Corikan", the       │  │
│ tower. Inside, they discovered  │ │ correct name is "Khuri-Khan".      │  │
│ a magical artifact...           │ │                                    │  │
│                                 │ │ The party is in Waterdeep, not     │  │
│ [More story content...]         │ │ Baldur's Gate.                     │  │
│                                 │ │                                    │  │
│                                 │ │                                    │  │
│                                 │ └────────────────────────────────────┘  │
│                                 │                                          │
│                                 │ ℹ️  Auto-saves as you type. Click        │
│                                 │    "Regenerate" to apply corrections.    │
│                                 │                                          │
└─────────────────────────────────┴──────────────────────────────────────────┘
```

## Examples of User Corrections

### Example 1: Name Corrections

```
When you hear "corikan" or "kori khan", the correct name is "Khuri-Khan" (our quest giver).
"Theron" is our rogue (not "Thereon" or "Theran").
"Grimjaw" is the barbarian (not "Grim Jaw" or "Grim Joe").
```

### Example 2: Campaign Context

```
The party is currently in the Shadowfell, not the Feywild.
We're searching for the Crystal of Eternal Light.
The BBEG is Lord Malachar (not "Malachi" or "Malakar").
```

### Example 3: Location Names

```
"Waterdeep" not "water deep" or "water's deep"
"Baldur's Gate" not "ball doors gate"
"Neverwinter" not "never winter"
```

### Example 4: Rules Clarifications

```
When we say "I cast fireball", we're talking about the spell, not a literal fireball.
"AOE" means "area of effect" damage.
"DPR" means "damage per round".
```

## Benefits

1. **Iterative Refinement**: Users can improve story quality through multiple regenerations
2. **Targeted Corrections**: Users only add corrections after seeing what needs fixing
3. **No Wasted Effort**: Don't need to pre-guess what might be wrong
4. **Better User Experience**: Natural workflow - see result, then refine
5. **Improved Accuracy**: Each regeneration applies corrections for better results
6. **Campaign Consistency**: Ensures names remain consistent across sessions
7. **Learning from Mistakes**: Corrections teach the AI what you want

## Integration with Existing Features

### Works Well With Kanka Integration (Ticket 14)

- **Kanka provides**: Official campaign entity database
- **User Corrections provide**: Session-specific corrections based on actual errors
- **Combined**: Kanka gives global context, corrections fix specific mistakes

Example:

- Kanka knows "Khuri-Khan" exists in the campaign
- First story generation: Uses "Corikan" (from transcript)
- User sees error, adds correction: "corikan = Khuri-Khan"
- Regeneration: AI uses correct name with both Kanka and user corrections

### Complements Transcription Service

- Corrections don't modify transcription (that stays as-is)
- Corrections only affect story generation
- Transcription errors remain visible for debugging
- Users see what was actually transcribed vs. what should be used

## Considerations

### Prompt Token Limits

- User corrections add tokens to the prompt
- Keep corrections concise (consider 500-1000 character soft limit)
- Could implement character counter with soft limit warning
- Prioritize essential corrections

### UX Balance

- Corrections are always visible (not hidden)
- Side-by-side layout makes it natural to review and correct
- Show value with examples and tooltips
- Make regeneration feel quick and iterative
- Don't penalize users for trying multiple regenerations

### Correction Quality

- Users might write unclear corrections
- AI should handle vague corrections gracefully
- Consider adding examples/templates
- Future: AI could suggest corrections based on low-confidence transcript segments

### Performance

- Guidance adds minimal latency (just text prepending)
- Auto-save should be debounced (500ms)
- No significant performance impact

## Success Criteria

- [ ] Story is generated automatically after transcription
- [ ] Corrections field is visible next to generated story
- [ ] Users can type corrections (with auto-save)
- [ ] Corrections are saved to Firestore with debounce
- [ ] Users can click "Regenerate Story" to apply corrections
- [ ] AI correctly applies user corrections (tested with examples)
- [ ] Regenerated story replaces previous version
- [ ] Regeneration count is tracked in Firestore
- [ ] UI is intuitive with clear two-column layout
- [ ] Feature is optional (users can skip corrections)
- [ ] Documentation includes examples of effective corrections

## Future Enhancements

1. **AI-Suggested Corrections**: Analyze transcript for low-confidence words, suggest corrections
2. **Correction History**: Track all regenerations with their corrections (version history)
3. **Shared Corrections Library**: Reuse corrections across sessions in same campaign
4. **Template System**: Pre-built correction templates for common scenarios
5. **Side-by-Side Diff**: Show changes between original and regenerated story
6. **Smart Learning**: Learn from corrections to improve future story generations
7. **Batch Corrections**: Apply saved corrections to multiple sessions at once
8. **Correction Analytics**: Show which corrections improved story quality most
9. **Undo Regeneration**: Allow reverting to previous story version

## Related Features

- **Ticket 14**: Kanka Integration - Provides campaign entity database
- **Audio Transcription Service**: Source of transcript data
- **Session Story Service**: Consumer of guidance for story generation
- **Firestore Rules**: Must allow users to update their session guidance

## Alternative Approaches Considered

### 1. Pre-Generation Guidance

**Idea**: Let users provide guidance BEFORE story generation

**Pros**: Could get it right on first try

**Cons**:

- Users don't know what needs fixing until they see the story
- Forces users to guess what might be wrong
- More upfront work for uncertain benefit
- Users might skip it entirely

**Decision**: Post-generation corrections are more natural - users see what needs fixing first

### 2. Post-Generation Manual Editing

**Idea**: Rich text editor to manually fix story after generation

**Pros**: Direct control over output

**Cons**:

- More manual work for users
- Doesn't teach the AI what you want
- Each session requires same manual fixes
- Can't iterate/improve the AI output

**Decision**: Corrections + regeneration teaches the AI, allowing iterative improvement

### 3. Automatic Name Detection

**Idea**: AI automatically detects ambiguous names and asks for clarification

**Pros**: Proactive, smart system

**Cons**:

- Complex to implement
- Might interrupt workflow
- False positives would be annoying

**Decision**: Start with manual guidance, consider auto-detection later

## Estimated Scope

- **Complexity**: Low-Medium
- **Files Modified**:
  - `audio-session.component.ts` (two-column UI and regeneration logic)
  - `audio-session.models.ts` (TypeScript interfaces)
  - `session-story.service.ts` (corrections integration)
  - `firestore.rules` (if needed)
- **New Files**: None
- **Components**: 1 component update, 1 service enhancement
- **Testing**: Unit tests for component and service, integration test for regeneration flow
- **Dependencies**: None (uses existing infrastructure)
- **Risk**: Low (non-breaking, additive feature)

## Implementation Summary

**Recommended Approach**: Add two-column layout with story on left and corrections textarea on right. Story generates automatically, user reviews and adds corrections, then regenerates with corrections applied.

**Key Benefits**:

- ✅ Natural workflow - see result first, then refine
- ✅ Simple implementation (mostly UI + prompt engineering)
- ✅ No new dependencies
- ✅ Non-breaking (optional feature)
- ✅ Iterative improvement through regeneration
- ✅ Auto-save with debounce for great UX
- ✅ Complements Kanka integration
- ✅ Extensible for future enhancements

**Main Tasks**:

1. Update Firestore schema and models (add userCorrections fields)
2. Add two-column layout to audio-session component
3. Add corrections textarea with auto-save
4. Implement regenerateStory() method
5. Update session-story service to accept corrections
6. Integrate corrections into AI prompt
7. Track regeneration count in Firestore
8. Test and document

**Estimated Effort**: Low-Medium complexity, ~1-2 development sessions

---

**Status**: Draft  
**Priority**: Medium  
**Created**: 2026-02-02  
**Last Updated**: 2026-02-02  
**Related Tickets**: #14 (Kanka Integration)  
**Workflow**: Post-generation corrections with regeneration
