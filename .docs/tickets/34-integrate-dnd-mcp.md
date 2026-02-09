# Ticket: Integrate D&D 5e Data into Character Chat

**Status:** Open
**Priority:** Medium
**Created:** 2026-02-09

## Context

We want to enhance the Character Chat so the AI can look up official D&D 5e rules, spells, monsters, and equipment instead of relying on its training data alone. The [dnd-mcp](https://github.com/procload/dnd-mcp) project wraps the free [D&D 5e API](https://www.dnd5eapi.co/api) as an MCP server.

## Current Architecture

- `CharacterChatService` runs **client-side** in the Angular app.
- It uses `@google/genai` SDK to call Gemini (`environment.aiModel`) directly from the browser.
- The system prompt is in `character-builder.prompt.ts`.
- AI receives the current `DndCharacter` JSON and returns an `AiResponse` (`thought`, `character`, `response`).
- There is no backend AI layer (no Firebase Function in the chat path).

## Key Finding: dnd-mcp Uses stdio Transport

The `dnd-mcp` server communicates over **stdin/stdout** (stdio), not HTTP or SSE. This means:

- It is designed to be spawned as a **subprocess** by an MCP client (e.g., Claude Desktop, Cursor).
- It **cannot** be deployed to Cloud Run as-is and called over HTTP.
- To use it remotely, the server code would need to be modified to support SSE or HTTP transport.

## dnd-mcp Server Capabilities

### Tools (7)

| Tool                                                    | Description                                             |
| ------------------------------------------------------- | ------------------------------------------------------- |
| `search_all_categories(query)`                          | Search across all D&D 5e categories with fuzzy matching |
| `verify_with_api(statement, category?)`                 | Verify a D&D statement against official API data        |
| `check_api_health()`                                    | Check D&D 5e API status                                 |
| `search_equipment_by_cost(max_cost, cost_unit)`         | Find equipment within a price range                     |
| `filter_spells_by_level(min_level, max_level, school?)` | Filter spells by level and school                       |
| `find_monsters_by_challenge_rating(min_cr, max_cr)`     | Find monsters by CR range                               |
| `get_class_starting_equipment(class_name)`              | Get starting equipment for a class                      |

### Resources (5)

- `resource://dnd/categories` - List all categories
- `resource://dnd/items/{category}` - List items in a category
- `resource://dnd/item/{category}/{index}` - Get item details
- `resource://dnd/search/{category}/{query}` - Search within a category
- `resource://dnd/api_status` - API health check

### Prompts (6)

- `character_concept`, `adventure_hook`, `spell_selection`, `encounter_builder`, `magic_item_finder`, `enforce_api_usage`

### Requirements

- Python >= 3.10, `mcp`, `requests` (uses the free D&D 5e API, **no API keys needed**)

---

## Integration Options

### Option A: Gemini Function Calling + Direct D&D 5e API (Recommended)

**Skip the MCP server entirely.** Replicate the useful tool definitions as Gemini [function declarations](https://ai.google.dev/gemini-api/docs/function-calling) and call the D&D 5e API directly.

**Why this is the best option:**

- No hosting cost or infrastructure to manage.
- No Python sidecar or container needed.
- Works with our existing client-side `@google/genai` architecture.
- Gemini natively supports function calling (tool use).
- The D&D 5e API is free and requires no authentication.

**How it works:**

1. Define function declarations for the tools we need (e.g., `search_spells`, `get_monster`, `get_equipment`).
2. Pass them to `ai.models.generateContent()` via the `tools` config.
3. When Gemini wants D&D data, it returns a `functionCall` instead of text.
4. Our service calls the D&D 5e API (`https://www.dnd5eapi.co/api/...`) with the parameters.
5. We send the API response back to Gemini as a `functionResponse`.
6. Gemini incorporates the real data into its answer.

**Files to change:**

- `src/app/core/services/character-chat.service.ts` - Add function calling loop.
- `src/app/prompts/character-builder.prompt.ts` - Update prompt to tell AI it has tools.
- New: `src/app/core/services/dnd-api.service.ts` - Wrapper around the D&D 5e API.

### Option B: Firebase Function + MCP Client

Move the AI call to a Firebase Function that spawns `dnd-mcp` as a subprocess.

**Downsides:**

- Adds a Python runtime dependency to the backend.
- Adds latency (client -> Function -> subprocess -> D&D API -> back).
- More complex deployment and cold start issues.
- Overkill when the underlying API is free and public.

### Option C: Modify dnd-mcp for SSE + Cloud Run

Fork `dnd-mcp`, change transport from stdio to SSE, containerize, and deploy.

**Downsides:**

- Requires maintaining a fork of an external Python project.
- Cloud Run cost (even if minimal with scale-to-zero).
- Still need an MCP client library in TypeScript.
- More moving parts for marginal benefit over Option A.

---

## Recommended: Option A Implementation Plan

### Tasks

- [ ] Create `DndApiService` - a thin wrapper around `https://www.dnd5eapi.co/api`
  - `searchSpells(query)`, `getSpell(index)`
  - `searchMonsters(query)`, `getMonster(index)`
  - `searchEquipment(query)`, `getEquipment(index)`
  - `getClassInfo(className)`, `getRaceInfo(raceName)`
- [ ] Define Gemini function declarations matching the service methods
- [ ] Update `CharacterChatService.sendMessage()` to:
  - Pass `tools` config to `generateContent()`
  - Handle `functionCall` responses in a loop
  - Call `DndApiService` with the requested parameters
  - Send `functionResponse` back and get final text
- [ ] Update `CHARACTER_BUILDER_PROMPT` to inform the AI it can look up D&D data
- [ ] Test: "What are the components for Fireball?" should trigger a function call and return real data
- [ ] Test: "Make me a level 3 Wizard" should use `getClassInfo` to get accurate hit dice, proficiencies, etc.

## Resources

- D&D 5e API: https://www.dnd5eapi.co/api (free, no auth)
- D&D 5e API Docs: https://5e-bits.github.io/docs/
- dnd-mcp repo (reference): https://github.com/procload/dnd-mcp
- Gemini Function Calling: https://ai.google.dev/gemini-api/docs/function-calling
- MCP Spec: https://modelcontextprotocol.io/
