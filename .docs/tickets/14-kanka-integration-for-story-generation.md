# Ticket 14: Kanka Integration for Story Generation

## Overview

Integrate the mcp-kanka Model Context Protocol server to enable the story generator AI to search and reference accurate campaign data (characters, locations, quests, NPCs) from Kanka, improving the quality and consistency of session recaps.

## Current State

**Session Story Service** (`src/app/audio/session-story.service.ts`):

- Generates session recaps from audio transcripts using Google Gemini
- Receives only the transcript text and basic metadata (title, date)
- No access to campaign context or reference data
- May produce inconsistent character names, location names, or quest details

**Limitations**:

- AI has no knowledge of actual campaign entities
- Character names may be misspelled or inconsistent
- Quest names and plot details may not match campaign records
- Location names may vary between sessions
- No way to cross-reference NPCs, organizations, or creatures

## Problem Statement

When generating session recaps, the AI only has access to what was said in the audio transcript. This can lead to:

1. **Name Inconsistencies**: Player speech may not be clear, leading to incorrect character/NPC names
2. **Lost Context**: AI doesn't know about ongoing quests, faction relationships, or world lore
3. **No Cross-Referencing**: Cannot link session events to existing campaign entities
4. **Poor Quality**: Recaps lack the richness that comes from understanding the broader campaign

## Proposed Solution

Integrate mcp-kanka to provide the story generator with real-time access to campaign data during recap generation.

### What is mcp-kanka?

**Kanka** is a collaborative worldbuilding and campaign management tool for tabletop RPGs. It provides a comprehensive REST API for accessing campaign data.

**Kanka REST API** provides:

- **Entity Management**: Access to characters, locations, organizations, creatures, races, notes, journals, quests
- **Search & Filter**: Query entities by name, type, tags, date
- **CRUD Operations**: Create, read, update, delete campaign entities
- **Posts Management**: Access to entity notes and descriptions
- **Authentication**: Token-based API access per user

**Requirements**:

- Kanka account (free or premium)
- Kanka API token (Personal Access Token from user settings)
- Campaign ID

### Technology Choice: REST API vs MCP

**IMPORTANT: For production deployment to teammates, use the direct REST API, not MCP.**

#### Why REST API is Better for Production:

- ✅ **No Python server dependency** - Pure TypeScript/Angular solution
- ✅ **Direct integration** - Angular HttpClient → Kanka API
- ✅ **Standard web patterns** - No middleware, no extra infrastructure
- ✅ **Per-user authentication** - Each teammate uses their own Kanka token
- ✅ **Simpler deployment** - Just environment config, no additional services
- ✅ **Official & stable** - Well-documented, supported by Kanka team
- ✅ **Better performance** - No middleware layer

#### What is mcp-kanka? (Development Tool Only)

mcp-kanka is an MCP (Model Context Protocol) server designed for **AI assistants during development** (like Cursor, Claude Desktop). It's useful for developers building with AI tools, but **not appropriate for production web applications**. MCP requires a Python server running separately and adds unnecessary complexity for end-user deployment.

**API Documentation**: https://app.kanka.io/api-docs/1.0/overview

### Folder Structure

Kanka integration should be organized as its own feature module:

```
src/app/kanka/
├── kanka.service.ts          # Main service for Kanka API calls
├── kanka.models.ts            # TypeScript interfaces and types
└── kanka.config.ts            # (Optional) Kanka-specific configuration

src/app/audio/
├── session-story.service.ts   # Imports KankaService for story generation
└── ...

src/environments/
└── environment.ts             # Kanka API configuration
```

**Rationale**:

- ✅ Clear separation of concerns
- ✅ Kanka can be reused by other features (not just audio)
- ✅ Easy to test and maintain independently
- ✅ Future features can easily consume Kanka data

### Implementation Approach

#### Phase 1: Kanka REST API Setup

1. **Get Kanka API Token**:

   - Log into Kanka account at https://app.kanka.io
   - Go to Settings → API → Personal Access Tokens
   - Create new token with read access to campaigns
   - Copy token securely

2. **Get Campaign ID**:

   - Open your campaign in Kanka
   - Campaign ID is in the URL: `https://app.kanka.io/campaign/{CAMPAIGN_ID}`
   - Or fetch via API: `GET https://api.kanka.io/1.0/profile`

3. **Configure Environment Variables** in `src/environments/environment.ts`:

   ```typescript
   kanka: {
     apiUrl: 'https://api.kanka.io/1.0',
     token: 'your_kanka_personal_access_token',
     campaignId: 'your_campaign_id'
   }
   ```

4. **Test API Access** (optional):

   ```bash
   curl -H "Authorization: Bearer YOUR_TOKEN" \
        https://api.kanka.io/1.0/campaigns/{CAMPAIGN_ID}
   ```

#### Phase 2: Backend Service Enhancement

**Create Kanka Models** (`src/app/kanka/kanka.models.ts`):

```typescript
export interface KankaEntity {
  id: number;
  name: string;
  type: string;
  entry?: string;
  entry_parsed?: string;
  tags?: Array<{ id: number; name: string }>;
  image?: string;
  is_private?: boolean;
}

export interface KankaApiResponse<T> {
  data: T[];
  links?: any;
  meta?: any;
}

export interface KankaSearchResult {
  characters: KankaEntity[];
  locations: KankaEntity[];
  quests: KankaEntity[];
  organisations: KankaEntity[];
}
```

**Create Kanka Service** (`src/app/kanka/kanka.service.ts`):

```typescript
import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, forkJoin, of } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { environment } from '../../environments/environment';
import { KankaEntity, KankaApiResponse, KankaSearchResult } from './kanka.models';

@Injectable({
  providedIn: 'root',
})
export class KankaService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = environment.kanka.apiUrl;
  private readonly campaignId = environment.kanka.campaignId;

  private get headers(): HttpHeaders {
    return new HttpHeaders({
      Authorization: `Bearer ${environment.kanka.token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    });
  }

  /**
   * Search for entities across multiple types
   */
  searchEntities(query: string, types?: string[]): Observable<KankaSearchResult> {
    const searchTypes = types || ['characters', 'locations', 'quests', 'organisations'];

    const requests = searchTypes.map((type) =>
      this.searchByType(type, query).pipe(catchError(() => of([])))
    );

    return forkJoin(requests).pipe(
      map((results) => ({
        characters: searchTypes.includes('characters')
          ? results[searchTypes.indexOf('characters')]
          : [],
        locations: searchTypes.includes('locations')
          ? results[searchTypes.indexOf('locations')]
          : [],
        quests: searchTypes.includes('quests') ? results[searchTypes.indexOf('quests')] : [],
        organisations: searchTypes.includes('organisations')
          ? results[searchTypes.indexOf('organisations')]
          : [],
      }))
    );
  }

  /**
   * Search entities of a specific type
   */
  private searchByType(type: string, query: string): Observable<KankaEntity[]> {
    const url = `${this.baseUrl}/campaigns/${this.campaignId}/${type}`;
    const params = { name: query };

    return this.http
      .get<KankaApiResponse<KankaEntity>>(url, {
        headers: this.headers,
        params,
      })
      .pipe(map((response) => response.data || []));
  }

  /**
   * Get specific entity details by ID and type
   */
  getEntityDetails(entityId: number, entityType: string): Observable<KankaEntity> {
    const url = `${this.baseUrl}/campaigns/${this.campaignId}/${entityType}/${entityId}`;

    return this.http
      .get<{ data: KankaEntity }>(url, {
        headers: this.headers,
      })
      .pipe(map((response) => response.data));
  }

  /**
   * Get all entities of specific types (for context building)
   */
  getAllEntities(
    types: string[] = ['characters', 'locations', 'quests']
  ): Observable<KankaSearchResult> {
    const requests = types.map((type) => this.getAllByType(type).pipe(catchError(() => of([]))));

    return forkJoin(requests).pipe(
      map((results) => ({
        characters: types.includes('characters') ? results[types.indexOf('characters')] : [],
        locations: types.includes('locations') ? results[types.indexOf('locations')] : [],
        quests: types.includes('quests') ? results[types.indexOf('quests')] : [],
        organisations: types.includes('organisations')
          ? results[types.indexOf('organisations')]
          : [],
      }))
    );
  }

  private getAllByType(type: string): Observable<KankaEntity[]> {
    const url = `${this.baseUrl}/campaigns/${this.campaignId}/${type}`;

    return this.http
      .get<KankaApiResponse<KankaEntity>>(url, {
        headers: this.headers,
      })
      .pipe(map((response) => response.data || []));
  }

  /**
   * Extract potential entity mentions from transcript text
   * Simple implementation - can be enhanced with NLP
   */
  extractEntityMentions(transcript: string): string[] {
    // Extract capitalized words/phrases as potential entity names
    const words = transcript.split(/\s+/);
    const mentions = new Set<string>();

    for (let i = 0; i < words.length; i++) {
      const word = words[i].replace(/[^\w\s]/g, '');

      // Single capitalized word
      if (/^[A-Z][a-z]+$/.test(word)) {
        mentions.add(word);
      }

      // Two-word names
      if (i < words.length - 1) {
        const nextWord = words[i + 1].replace(/[^\w\s]/g, '');
        if (/^[A-Z][a-z]+$/.test(word) && /^[A-Z][a-z]+$/.test(nextWord)) {
          mentions.add(`${word} ${nextWord}`);
        }
      }
    }

    return Array.from(mentions);
  }
}
```

**Enhance Session Story Service** (`src/app/audio/session-story.service.ts`):

```typescript
import { Injectable, inject } from '@angular/core';
import { Observable, from } from 'rxjs';
import { switchMap } from 'rxjs/operators';
import { GoogleGenAI } from '@google/genai';

import { KankaService } from '../kanka/kanka.service';
import { KankaSearchResult } from '../kanka/kanka.models';
import { SESSION_STORY_GENERATOR_PROMPT } from '../prompts';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root',
})
export class SessionStoryService {
  private readonly ai: GoogleGenAI;
  private readonly kankaService = inject(KankaService);

  constructor() {
    this.ai = new GoogleGenAI({ apiKey: environment.googleAiApiKey });
  }

  generateStoryFromTranscript(
    transcript: string,
    title: string,
    sessionDate?: string,
    enableKankaLookup: boolean = true
  ): Observable<string> {
    // If Kanka lookup enabled, fetch campaign context first
    if (enableKankaLookup) {
      return this.generateWithKankaContext(transcript, title, sessionDate);
    }

    // Original behavior
    return this.generateStory(transcript, title, sessionDate);
  }

  private generateWithKankaContext(
    transcript: string,
    title: string,
    sessionDate?: string
  ): Observable<string> {
    const mentions = this.kankaService.extractEntityMentions(transcript);

    return this.fetchCampaignContext(mentions).pipe(
      switchMap((context) => this.generateStoryWithContext(transcript, title, sessionDate, context))
    );
  }

  private fetchCampaignContext(mentions: string[]): Observable<KankaSearchResult> {
    // Batch search for all mentioned entities
    return this.kankaService.searchEntities(mentions.join(' '));
  }

  private generateStoryWithContext(
    transcript: string,
    title: string,
    sessionDate: string | undefined,
    context: KankaSearchResult
  ): Observable<string> {
    const contextPrompt = this.buildContextPrompt(context);

    return from(
      this.ai.models.generateContent({
        model: environment.aiModel,
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: `${SESSION_STORY_GENERATOR_PROMPT}

CAMPAIGN CONTEXT:
${contextPrompt}

SESSION TITLE: ${title}
SESSION DATE: ${sessionDate || 'Unknown'}

TRANSCRIPT:
${transcript}

Write the recap in markdown, using the campaign context to ensure accuracy of names, locations, and quest details.`,
              },
            ],
          },
        ],
        config: {
          maxOutputTokens: 4096,
          temperature: 0.7,
          topP: 0.95,
          topK: 40,
        },
      })
    ).pipe(/* error handling */);
  }

  private buildContextPrompt(context: KankaSearchResult): string {
    let prompt = '';

    if (context.characters?.length) {
      prompt += '\nCHARACTERS:\n';
      context.characters.forEach((c) => {
        prompt += `- ${c.name}: ${c.entry || 'No description'}\n`;
      });
    }

    if (context.locations?.length) {
      prompt += '\nLOCATIONS:\n';
      context.locations.forEach((l) => {
        prompt += `- ${l.name}: ${l.entry || 'No description'}\n`;
      });
    }

    if (context.quests?.length) {
      prompt += '\nACTIVE QUESTS:\n';
      context.quests.forEach((q) => {
        prompt += `- ${q.name}: ${q.entry || 'No description'}\n`;
      });
    }

    return prompt;
  }
}
```

#### Phase 3: UI Enhancement

**Update Audio Session Component** (`src/app/audio/audio-session.component.ts`):

Add toggle for Kanka integration:

```typescript
kankaEnabled = signal(true);

toggleKankaIntegration() {
  this.kankaEnabled.update(v => !v);
}
```

Add UI toggle in template:

```html
<label class="flex items-center gap-2">
  <input type="checkbox" [checked]="kankaEnabled()" (change)="toggleKankaIntegration()" />
  <span>Use Kanka campaign context for story generation</span>
</label>
```

#### Phase 4: Prompt Enhancement

**Update Story Generator Prompt** (`src/app/prompts/session-story-generator.prompt.ts`):

```typescript
export const SESSION_STORY_GENERATOR_PROMPT = `You are an experienced D&D 5e session recorder.
Your task is to turn session transcripts into a coherent, readable session recap IN DUTCH.

WHEN CAMPAIGN CONTEXT IS PROVIDED:
- Cross-reference character names with the provided character list
- Use official location names from the campaign context
- Link session events to active quests when relevant
- Reference NPC descriptions to add depth
- Maintain consistency with campaign lore

INCLUDE:
- Combat encounters with key rolls and outcomes
- Character decisions and development
- Plot progress and quest updates
- Important NPC interactions (use correct names from context)
- Loot and rewards
- Notable skill checks and saving throws

EXCLUDE:
- Rules arguments or meta-game discussion
- Breaks and off-topic chatter
- Technical interruptions
- Repeated or corrected statements

FORMAT:
- Write the entire recap in Dutch (Nederlands)
- Use narrative third person where possible
- Preserve character names (corrected to match campaign context)
- Organize in sections with descriptive headers
- Use Markdown for headings and emphasis
- Add Kanka entity links where appropriate (if applicable)`;
```

## Technical Architecture

### Option A: Direct REST API Integration (Recommended for Team Deployment)

**Architecture**:

```
Angular App (HttpClient) → Kanka REST API
```

**Pros**:

- Simple, direct integration
- No middleware or Python dependencies
- Standard Angular HttpClient patterns
- Environment-based configuration
- Easy to deploy and maintain
- Each user can use their own API token

**Cons**:

- API token in environment config (use per-user tokens)
- CORS must be configured (Kanka API supports CORS)
- Rate limiting per user (Kanka handles this)

**Best for**: Production deployment to teammates

### Option B: Server-Side Proxy (Optional for Advanced Use Cases)

**Architecture**:

```
Angular App → Cloud Function/Backend API → Kanka REST API
```

**Pros**:

- Secure central API token storage
- Server-side caching of entities
- Rate limiting control
- Can aggregate/transform data

**Cons**:

- Additional infrastructure (Cloud Functions or backend server)
- More complex deployment
- Added latency from proxy layer

**Best for**: If you need centralized caching, rate limiting, or token management

### Option C: Client-Side with User Tokens (Best for Multi-User)

**Architecture**:

```
Angular App (user's Kanka token) → Kanka REST API
```

**Pros**:

- Each user uses their own Kanka token
- No shared token security concerns
- Per-user rate limits
- Users control their own access

**Implementation**:

- Users enter their Kanka token in app settings
- Token stored in browser localStorage or Firebase user profile
- Token sent with each Kanka API request

**Best for**: Multi-user deployment where users have their own Kanka accounts

## Implementation Steps

### Step 1: Kanka API Setup

- [ ] Obtain Kanka API token from account settings (https://app.kanka.io/settings/api)
- [ ] Get Campaign ID from Kanka URL or API
- [ ] Configure environment variables in `src/environments/environment.ts`
- [ ] Test API access with curl or Postman
- [ ] Document API endpoints being used (characters, locations, quests, etc.)

### Step 2: Create Kanka Module and Service

- [ ] Create `src/app/kanka/` folder
- [ ] Create `src/app/kanka/kanka.service.ts`
- [ ] Create `src/app/kanka/kanka.models.ts` for TypeScript interfaces
- [ ] Implement entity search methods
- [ ] Implement entity detail fetching
- [ ] Add transcript parsing for entity mentions
- [ ] Add error handling and retry logic
- [ ] Write unit tests

### Step 3: Enhance Session Story Service

- [ ] Inject KankaService into SessionStoryService
- [ ] Add optional Kanka context parameter to generate method
- [ ] Implement context fetching workflow
- [ ] Build context prompt from Kanka data
- [ ] Update AI prompt to include campaign context
- [ ] Test with real transcripts
- [ ] Write integration tests

### Step 4: Update UI

- [ ] Add Kanka toggle to audio-session.component
- [ ] Add loading state for context fetching
- [ ] Display fetched context summary (optional)
- [ ] Add error handling for Kanka API failures
- [ ] Update user documentation

### Step 5: Prompt Optimization

- [ ] Update session-story-generator.prompt.ts
- [ ] Test prompt with various context sizes
- [ ] Optimize context format for best results
- [ ] Handle missing or incomplete context gracefully

### Step 6: Testing & Validation

- [ ] Test with Kanka integration enabled
- [ ] Test with Kanka integration disabled (fallback)
- [ ] Test with various entity types (characters, locations, quests)
- [ ] Validate name consistency in generated recaps
- [ ] Compare quality with/without Kanka context
- [ ] Test rate limiting and error scenarios

### Step 7: Documentation

- [ ] Document Kanka setup process
- [ ] Add configuration guide for API token
- [ ] Update README with Kanka features
- [ ] Create user guide for Kanka integration
- [ ] Document troubleshooting steps

## Configuration

### Environment Variables

Add to `src/environments/environment.ts`:

```typescript
export const environment = {
  // ... existing config
  kanka: {
    enabled: true,
    apiUrl: 'https://api.kanka.io/1.0',
    token: 'YOUR_KANKA_PERSONAL_ACCESS_TOKEN',
    campaignId: 'YOUR_CAMPAIGN_ID',
    maxContextEntities: 20,
    cacheTimeout: 300000, // 5 minutes
  },
};
```

### Feature Flags

Allow users to enable/disable Kanka integration:

- Global setting in app config
- Per-session toggle in UI
- Fallback to non-Kanka mode if API unavailable

## Benefits

1. **Name Accuracy**: Character, NPC, and location names will be consistent and correct
2. **Richer Context**: AI understands quest progression and faction relationships
3. **Better Quality**: Recaps are more detailed and campaign-aligned
4. **Cross-Reference**: Session events link to campaign entities automatically
5. **Reduced Manual Editing**: Less need to fix names and details post-generation

## Considerations

### Performance

- Kanka API calls add latency (1-3 seconds)
- Consider caching frequently accessed entities
- Implement timeout/fallback for slow API responses

### Rate Limiting

- Kanka API has rate limits
- Batch entity lookups when possible
- Cache results between sessions

### Error Handling

- Graceful fallback if Kanka unavailable
- Don't block story generation if context fetch fails
- Log errors for debugging

### Privacy

- Kanka API token must be secured
- Campaign data should not be logged
- User consent for external API usage

### Token Limits

- Campaign context adds tokens to the prompt
- Balance context richness vs. token budget
- Prioritize most relevant entities

## Success Criteria

- [ ] Story generator can search Kanka for entities
- [ ] Entity names in recaps match Kanka records
- [ ] Quest progression accurately reflects campaign state
- [ ] Integration is optional and can be disabled
- [ ] Performance impact is acceptable (<3s additional latency)
- [ ] Errors are handled gracefully with fallback behavior
- [ ] User documentation is complete

## Future Enhancements

1. **Auto-Update Kanka**: After session, auto-create journal entry in Kanka
2. **Entity Linking**: Add Kanka entity links in markdown recap
3. **Smart Context**: Use AI to select most relevant entities (instead of all matches)
4. **Multi-Campaign**: Support multiple campaigns with campaign selection
5. **Offline Cache**: Cache campaign data for offline story generation
6. **Quest Updates**: Automatically mark quests as completed based on recap
7. **Session Timeline**: Create timeline entries in Kanka from session events

## Related Documentation

- [Kanka API Documentation](https://app.kanka.io/api-docs/1.0/overview)
- [Kanka API Setup Guide](https://app.kanka.io/api-docs/1.0/setup)
- [Kanka Entities API](https://app.kanka.io/api-docs/1.0/entities)
- [Session Story Generator Prompt](../src/app/prompts/session-story-generator.prompt.ts)
- [Audio Session Component](../src/app/audio/audio-session.component.ts)

## Team Deployment Considerations

### For Your Teammates

When deploying to teammates, you have two authentication options:

**Option 1: Shared Campaign Token (Simplest)**

- Use one Kanka API token for the whole team
- Token configured in environment variables
- Good for: Small teams, single campaign

**Option 2: Per-User Tokens (Most Flexible)**

- Each teammate creates their own Kanka API token
- Token entered in app settings UI
- Stored in user's Firebase profile or browser storage
- Good for: Larger teams, multiple campaigns, security

### Getting a Kanka API Token

1. Log into Kanka: https://app.kanka.io
2. Go to Settings → API → Personal Access Tokens
3. Click "Create New Token"
4. Give it a name (e.g., "QuestMind Story Generator")
5. Copy the token (only shown once!)

### CORS Configuration

The Kanka API supports CORS, so browser-based requests will work. If you encounter CORS issues:

1. Verify your API token is valid
2. Check that you're using `https://api.kanka.io` (not `app.kanka.io`)
3. Ensure the `Authorization` header is properly set

## Estimated Scope

- **Complexity**: Medium
- **New Module**: `src/app/kanka/` with KankaService and models
- **Components**: 1 new service (KankaService), 1 service enhancement (SessionStoryService), 1 component update, 1 prompt update
- **Testing**: Unit tests for KankaService, integration tests with mocked Kanka API
- **Dependencies**: Angular HttpClient (already available), Kanka API token
- **Risk**: Low-Medium (external API dependency, but with graceful fallback)

## Implementation Summary

**Recommended Approach**: Direct REST API integration using Angular HttpClient

**Key Benefits**:

- ✅ No Python/MCP dependencies
- ✅ Simple Angular service implementation
- ✅ Easy deployment to teammates
- ✅ Per-user authentication option
- ✅ Standard web development patterns

**Architecture Decision**:

- Kanka integration lives in `src/app/kanka/` (separate module)
- Not in `src/app/audio/` - Kanka is a reusable service
- Audio features import and use KankaService
- Clean separation of concerns

**Main Tasks**:

1. Create `/kanka` folder with KankaService and models
2. Implement API calls using HttpClient
3. Enhance SessionStoryService to fetch campaign context
4. Update prompt to use campaign context
5. Add UI toggle for Kanka integration
6. Test and deploy

**Timeline Estimate**: Medium complexity, ~2-3 development sessions

---

**Status**: Draft  
**Priority**: Medium  
**Created**: 2026-02-02  
**Last Updated**: 2026-02-02  
**Approach**: REST API (not MCP - see "Technology Choice" section)
