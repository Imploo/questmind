# QuestMind - D&D 5e Character Creation Assistant

An AI-powered web application for creating D&D 5e characters with natural language assistance.

## Features

### ✨ AI-Powered Chat Interface (Implemented)

- **Natural Language Input**: Describe your character in plain English (e.g., "Create a wizard with Tasha's Telekinesis")
- **D&D 5e Expert**: AI assistant trained on official D&D 5e rules including:
  - Player's Handbook (2014 edition)
  - Tasha's Cauldron of Everything
  - Xanathar's Guide to Everything
- **Smart Conversation**: Maintains context throughout your character creation session
- **Real-time Responses**: Powered by Google's Gemini AI API
- **Beautiful UI**: Modern, responsive chat interface with loading states and error handling

### 🎯 Technical Implementation

- **Angular 20**: Built with the latest Angular using signals for reactive state management
- **Zoneless Change Detection**: Optimized performance with Angular's new zoneless architecture
- **Inline Templates**: Component templates are embedded in TypeScript for better maintainability
- **Google Gemini API**: Direct integration with Google's generative AI
- **HttpClient**: Fetch-based HTTP client for API communication
- **Conversation History**: Maintains chat context for natural, flowing conversations

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- A Google AI API key (free tier available)

### Setup

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd questmind
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure Google AI API Key**
   
   Get your free API key from [Google AI Studio](https://aistudio.google.com/app/apikey)
   
   Then update `src/environments/environment.ts`:
   ```typescript
   export const environment = {
     production: false,
     googleAiApiKey: 'YOUR_ACTUAL_API_KEY_HERE'
   };
   ```

4. **Run the development server**
   ```bash
   npm start
   ```
   
   Navigate to `http://localhost:4200/`

## Usage

1. Open the application in your browser
2. Type your character creation request in natural language
3. The AI will guide you through the process, suggesting:
   - Race and class combinations
   - Ability score distributions
   - Spell selections
   - Equipment choices
   - Rules clarifications

### Example Prompts

- "I want to create a wizard character"
- "What spells should a 1st level wizard take?"
- "Explain how Tasha's Custom Origin rules work"
- "Create a half-elf ranger with the Outlander background"
- "What's the difference between a warlock and a sorcerer?"

## Project Structure

```
src/
├── app/
│   ├── chat/
│   │   ├── chat.component.ts    # Main chat UI component (with inline template)
│   │   └── chat.service.ts      # AI service with Gemini API integration
│   ├── app.ts                   # Root component
│   ├── app.config.ts            # Application configuration
│   └── app.routes.ts            # Routing configuration
├── environments/
│   └── environment.ts           # Environment configuration
└── main.ts                      # Application bootstrap
```

## Architecture Decisions

### Why Inline Templates?

- **Better Developer Experience**: No context switching between files
- **Type Safety**: Template and component logic in one file enables better IDE support
- **Easier Refactoring**: Moving components is simpler with everything in one place
- **Component Cohesion**: Templates and logic are tightly coupled anyway

### Why Signals?

- **Reactive by Default**: Automatic change detection with minimal overhead
- **Performance**: Fine-grained reactivity without zone.js
- **Future-Proof**: Angular's recommended pattern going forward
- **Simpler Code**: Less boilerplate than traditional RxJS-heavy approaches

### Why Direct API Integration?

- **Simplicity**: No backend required for MVP
- **Low Latency**: Direct API calls are faster
- **Free Tier**: Google's Gemini API is generous with free usage
- **Flexibility**: Easy to swap providers or add backend later

## API Integration

The chat service uses Google's Gemini Pro model via the Generative Language API:

- **Endpoint**: `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent`
- **Authentication**: API key passed as query parameter
- **Request Format**: JSON with conversation history
- **Response Format**: JSON with generated text candidates

### Conversation Context

The service maintains conversation history to provide contextual responses:
- System prompt sets D&D 5e expert persona
- User messages and AI responses are tracked
- Last 10 exchanges are kept for context (plus system prompt)
- History is automatically pruned to manage token limits

### Error Handling

Comprehensive error handling for:
- Network failures
- Invalid API keys
- Rate limiting
- Blocked content
- Malformed responses

## Roadmap

### Phase 2: Dynamic Character Form
- Form builder for character attributes
- Real-time validation against D&D 5e rules
- Equipment and spell selection interfaces

### Phase 3: PDF Generation
- Export complete character sheets
- Official 5e character sheet format
- Printable layouts

### Phase 4: User Accounts
- Save multiple characters
- Character versioning
- Share characters with DMs

## Development

### Build

```bash
npm run build
```

### Test

```bash
npm test
```

### Code Style

This project uses Angular's official style guide and Prettier for formatting:
- 100 character line width
- Single quotes for TypeScript
- Angular HTML parser for templates

## Contributing

Contributions are welcome! Please ensure:
- Code follows Angular style guide
- Components use signals for state
- Templates are inline unless >100 lines
- Error handling is comprehensive
- D&D 5e rules accuracy is maintained

## License

[Your License Here]

## Acknowledgments

- D&D 5e rules © Wizards of the Coast
- Powered by Google Gemini AI
- Built with Angular
