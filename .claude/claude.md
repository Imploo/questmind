# Claude Code Rules

## Strict rules
ALWAYS FOLLOW THESE RULES
- Never commit without explicit command from user
- In backend Cloud Functions (`functions/src/`), use Sentry for error logging instead of `console.error`. Use `captureFunctionError()` or `captureException()` from `./utils/sentry-error-handler`
- In frontend (`src/`), use `logger.error()` from `shared/logger` instead of `console.error`. It automatically sends to Sentry in production

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

### Working on a ticket
When you finished working on a ticket, move it to the subfolder 'done' and mark the status as Done.

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
