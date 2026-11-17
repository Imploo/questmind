# Claude Code Rules

## Strict rules
ALWAYS FOLLOW THESE RULES
- In backend Cloud Functions (`functions/src/`), use Sentry for error logging instead of `console.error`. Use `captureFunctionError()` or `captureException()` from `./utils/sentry-error-handler`
- In frontend (`src/`), use `logger.error()` from `shared/logger` instead of `console.error`. It automatically sends to Sentry in production

## Git Workflow

- You may commit and push your changes to your working branch without asking first.
- Pushing to `develop` triggers an automatic deploy to the beta environment (`.github/workflows/firebase-hosting-beta.yml`). When your changes are ready to be tested, you may ask the user whether to merge your branch into `develop` so the changes can be tested on beta. Only merge into `develop` after the user confirms.

## Build Process

**Every code change must be completed by running:**

Run
```bash
npm run build
```
and
```bash
npm run build:backend
```
and
```bash
npm run lint
```
and
```bash
npm run test
```

in parallel with npm subagent runners.

This ensures both the frontend and backend builds are validated before considering the task complete.

### Sub Agents for npm Commands

**Use sub agents with the Haiku model for npm commands** to optimize cost and performance:
- Run npm commands (build, test, install, etc.) using Task tool with `subagent_type: "Bash"` and `model: "haiku"`
- Haiku is faster and more cost-effective for straightforward command execution
- Reserve Sonnet for complex code analysis and generation tasks

## Tickets

### Creating a ticket
When the user asks to create a ticket, create an numbered .md file in the '.docs/tickets' directory with the following format:
- Title
- Created (date)
- Description
- Expected result
- Status (Todo, Done, Won't Fix)
- Technical details
- Other fields you find useful

After the fields, add all details you think are relevant. You can be thorough and include all the information you have.
Keep a ticket to around 300-600 lines.

Ask the user when you don't know certain details. It's better to verify than to guess.

Number the tickets like the existing pattern. Also update 00-TICKET-INDEX.md. Fetch next number from the index file.

### Completing a ticket
**MANDATORY:** When you finish working on a ticket, you MUST do ALL of the following:
1. Move the ticket file from `.docs/tickets/` to `.docs/tickets/done/`
2. Update the ticket's **Status** field to `Done`
3. Update `00-TICKET-INDEX.md`: change the ticket's link path to `./done/` and status to `Done`

This applies whether you just finished the ticket or the user tells you to mark it as done. Never leave a completed ticket in the main tickets folder.

## Angular Best Practices

**Always search for Angular best practices using the MCP server** when working on Angular-related code changes. This ensures adherence to current Angular conventions and recommended patterns.

### TypeScript
- Use strict type checking
- Prefer type inference when the type is obvious
- Avoid the `any` type; use `unknown` when type is uncertain

### Angular Framework
- **Always use standalone components** (default - do NOT set `standalone: true` in decorators)
- Use signals for state management
- Implement lazy loading for feature routes
- Do NOT use `@HostBinding` and `@HostListener` decorators - use the `host` object in decorators instead
- Use `NgOptimizedImage` for all static images (not for inline base64)

### Components
- Keep components small and focused on a single responsibility
- Use `input()` and `output()` functions instead of `@Input()`/`@Output()` decorators
- Use `computed()` for derived state
- Set `changeDetection: ChangeDetectionStrategy.OnPush` in `@Component` decorator
- Prefer inline templates for small components
- Prefer Reactive forms over Template-driven forms
- Do NOT use `ngClass` - use `class` bindings instead
- Do NOT use `ngStyle` - use `style` bindings instead

### State Management
- Use signals for local component state
- Use `computed()` for derived state
- Keep state transformations pure and predictable
- Do NOT use `mutate` on signals - use `update` or `set` instead

### Templates
- Keep templates simple and avoid complex logic
- Use native control flow (`@if`, `@for`, `@switch`) instead of `*ngIf`, `*ngFor`, `*ngSwitch`
- Use the async pipe to handle observables

### Services
- Design services around a single responsibility
- Use `providedIn: 'root'` for singleton services
- Use the `inject()` function instead of constructor injection

## Translations

The app speaks Dutch and English; the user chooses (profile drawer, or the top bar when not signed in). **Never write user-visible text in a template or in TypeScript.**

- Every text has a key in `src/app/core/i18n/translations.ts` (the `Translations` interface: keys only) and a text in both `nl.ts` and `en.ts`. A missing translation or a mistyped key fails `npm run build`.
- A text without values is a `string`. A text with values or a plural is a function with typed parameters. One key is one complete sentence: never build a sentence from fragments in code, never append "s" for a plural.
- Templates use the pipe: `{{ 'nav.signOut' | translate }}`, `{{ 'campaignStory.sessionCount' | translate: count }}`, `[attr.aria-label]="'common.close' | translate"`.
- TypeScript reads the signal when the text is needed: `inject(I18nService).t().chat.renameFailed`. Labels live in a `computed()`; a module-level constant or a plain field with text does not follow a language switch.
- Pure functions outside Angular take the texts they need as a parameter (`t: Translations['play']`); their specs pass `en.play` / `nl.play`.
- Dates and numbers go through `FormattingService` or `I18nService.locale()`. No hardcoded locale, no `DatePipe`, no `number` pipe.
- Errors from Cloud Functions: never show `error.message`. Use `callableErrorMessage(error, i18n.t().errors, fallback)`. A refusal the user can act on carries a `reason` (`functions/src/utils/error-reasons.ts`) with a text under `errors.reasons`.
- The backend sends codes (a progress `stage` or `progressStep`, a `reason`), not sentences; the frontend picks the text.
- **D&D game terms stay English** in both languages and live in `src/app/shared/dnd-terms.ts`. In Dutch the sentence is Dutch and the term English ("Long rest nemen?").
- Not translated: user-written text, AI-generated campaign content (stories, podcasts, transcripts), spell and feature descriptions, the PDF export, and the admin screen (English only).
- A text that is the same in every language (the brand name) gets `data-no-i18n` on its element.
- `npm run lint` runs `scripts/check-hardcoded-text.mjs`, which fails on untranslated text in templates. Text built in TypeScript is not checked by it: watch for it in review.
- Specs run in English unless they provide `provideTestLanguage('nl')`; assert against the texts (`en.auth.emailRequired`) rather than a literal sentence.

## Code Architecture Principles

All code must comply with established software design patterns:

### SOLID Principles
- **S**ingle Responsibility: Each class/component should have one reason to change
- **O**pen/Closed: Open for extension, closed for modification
- **L**iskov Substitution: Derived classes must be substitutable for their base classes
- **I**nterface Segregation: Many specific interfaces are better than one general interface
- **D**ependency Inversion: Depend on abstractions, not concretions

### DRY (Don't Repeat Yourself)
- Avoid code duplication
- Extract reusable logic into services, utilities, or shared components
- Use inheritance or composition when appropriate

### Smart/Dumb Component Pattern

**Smart Components** (Container/Director Components):
- Manage state and business logic
- Interact with services and APIs
- Orchestrate data flow
- More TypeScript code, minimal HTML
- Use `OnPush` change detection when possible
- Located in feature directories

**Dumb Components** (Presentational/Visual Components):
- Focus purely on visual presentation
- Receive data via `input()` signals
- Emit events via `output()` signals
- No direct service dependencies
- More HTML/template code, minimal TypeScript
- Highly reusable across the application
- Located in shared/components directory when reusable
