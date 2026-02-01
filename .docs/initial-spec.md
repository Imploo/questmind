# Angular Character Builder App Plan (D&D 5e Ruleset with AI Integration)  
*Angular v17+ Best Practices | D&D 5e (2014 Ruleset) | AI Web Search Integration*  

---

## 🚀 **Tech Stack & Best Practices (Angular v17+)**  
- **Frontend**: Angular 17+ (with Signals for state management, not NgRx)  
- **AI Integration**: OpenAPI or third-party API (e.g., Google Programmable Search Engine, DuckDuckGo API) for web searches  
- **PDF Generation**: [pdfMake](https://github.com/bpampuch/pdfmake) (Angular v17+ friendly, no need for external libraries like pdf-lib)  
- **State Management**: Angular Signals (instead of RxJS or NgRx for simplicity and performance)  
- **UI Library**: [Angular Material](https://material.angular.io/) (latest v17 version) for consistency  
- **Backend** (optional): Node.js/Express or Firebase Cloud Functions (for AI API proxying and security)  
- **Build Tool**: Angular CLI v17+ with Ivy compiler  

---

## 🎯 **Core Features & Requirements**  
### ✅ **Features**  
1. **AI-Powered Chat Interface (D&D 5e-Specific)**:  
   - Users describe characters (e.g., "Create a wizard with Tasha's Cauldron of Everything features").  
   - AI provides suggestions based on:  
     - **D&D 5e Rules** (2014 official ruleset)  
     - **Additional Sources**: *Tasha's Cauldron of Everything*, *Xanathar's Guide to Everything*  
   - AI can perform **web search** for rules or canon sources (e.g., "How does Tasha's Telekinesis work?").  

2. **Dynamic Character Form Builder (D&D 5e)**:  
   - Fields for race, class, subclass, ability scores, background, equipment, spell slots, class features, etc.  
   - Rule-based validation (e.g., "Strength modifier must be at least +1 for a fighter").  

3. **PDF Character Sheet Generator**:  
   - Export to PDF using a **D&D 5e character sheet template** (e.g., [https://www.dndbeyond.com/character-sheets](https://www.dndbeyond.com/character-sheets)).  
   - Support for:  
     - Stat blocks with modifiers.  
     - Spell lists (from *Player's Handbook*, *Xanathar's Guide*).  
     - Equipment and magic items.  

4. **User Workflow**:  
   - Chat → Refine with AI/Rulebook → Finalize → Export PDF.  

---

## 🧱 **App Structure & Components**  
### 🔧 Folder Structure (Angular v17+ Best Practices)  
```
src/
├── app/
│   ├── chat/              // AI Chat Module
│   │   ├── chat.component.ts
│   │   ├── chat.service.ts (uses Signals for state)
│   │   └── chat.html
│   ├── character/         // Character Form Module
│   │   ├── form.component.ts (uses Angular Signals)
│   │   ├── form.service.ts (stores character data with Signals)
│   │   └── form.html
│   ├── pdf/               // PDF Generation Module
│   │   ├── generator.service.ts (uses pdfMake)
│   │   └── pdf.component.html
│   ├── shared/            // Shared Components & Models
│   │   ├── models.ts (Character, ChatMessage, D&D Classes)
│   │   └── chat-message.component.ts
│   ├── app-routing.module.ts (Routing between modules)
│   └── app.component.ts
├── assets/
│   ├── pdf-templates/     // JSON templates for D&D 5e character sheets
│   └── icons/             // Chat, export buttons (SVGs preferred)
├── environments/
│   ├── environment.ts     // API keys for AI and backend
└── ...
```

---

## 🛠️ **Development Plan**  

### 🔧 Phase 1: Setup & Dependencies  
1. **Initialize Angular Project (v17+)**:  
   ```bash
   ng new character-builder-app --style=scss --routing --strict --no-ivy
   ```
2. **Install Dependencies**:  
   ```bash
   npm install pdfmake @types/pdfmake rxjs
   # AI API (e.g., Google Programmable Search Engine)
   npm install axios
   ```
3. **Set Up Routing**:  
   Define routes for `Chat`, `Character Form`, and `PDF Export` in `app-routing.module.ts`.

---

### 🔍 Phase 2: AI Chat Module (Web Search)  
1. **Chat Interface**:  
   - Create a `ChatComponent` with:  
     - Input field for user messages.  
     - Display area for chat history (user + AI).  
     - "Send" button to trigger API calls.  

2. **AI Integration (Web Search + Rulebook Logic)**:  
   - Create `ChatService` with methods like:  
     ```ts
     sendQuery(prompt: string): Observable<string> {
       return this.http.post('/api/chat', { prompt }).pipe(
         map(response => response['response'])
       );
     }
     ```
   - Backend (Node.js/Express) acts as a proxy for:  
     - **AI API**: Handles web search (e.g., Google Search) using a proxy like [DuckDuckGo API](https://api.duckduckgo.com/).  
     - **Rulebook Logic**: Pulls from D&D 5e sources (e.g., *Xanathar's Guide*) manually if needed.  

3. **Mock AI for Development**:  
   - Use a mock service to simulate responses until the backend is ready.

---

### 🧾 Phase 3: Character Form Builder (D&D 5e Rules)  
1. **Define Character Model (D&D 5e-Specific)**:  
   ```ts
   interface Character {
     name: string;
     race: string;
     class: string; // e.g., "Wizard"
     subclass: string; // e.g., "School of Evocation"
     stats: {
       strength: number;
       dexterity: number;
       constitution: number;
       intelligence: number;
       wisdom: number;
       charisma: number;
     };
     background: string; // e.g., "Acolyte"
     equipment: string[];
     spellSlots: number[]; // e.g., [3, 2, 1] for wizard level 5
     classFeatures: string[];
   }
   ```

2. **Dynamic Form (Reactive Forms with Signals)**:  
   - Use Angular Reactive Forms for input validation.  
   - Example: Ability score sliders with modifiers (e.g., "Strength Modifier = Floor((17-10)/2) = +3").  

3. **Rule Validation**:  
   - Ensure stats follow D&D 5e rules (e.g., "Strength must be at least 8 for a fighter").  
   - AI can suggest adjustments if the form is invalid.  

---

### 📄 Phase 4: PDF Generation (D&D 5e Character Sheet)  
1. **Template Design**:  
   - Use a D&D 5e character sheet template (e.g., [https://www.dndbeyond.com/character-sheets](https://www.dndbeyond.com/character-sheets)).  
   - Define JSON templates in `assets/pdf-templates/dnd5e-character.json`:  
     ```json
     {
       "header": "Character Name: {{character.name}}",
       "race": "{{character.race}}",
       "class": "{{character.class}} ({{character.subclass}})",
       "statsTable": [
         ["Strength", "{{character.stats.strength | modifier}}"],
         // ...
       ],
       "spellSlots": {
         "Level 1": "{{character.spellSlots[0]}}",
         "Level 2": "{{character.spellSlots[1]}}"
       }
     }
     ```

2. **PDF Generator Service (pdfMake)**:  
   - Use Angular Signals to pass character data to the PDF generator.  
   ```ts
   generatePDF(character: Character): void {
     const docDefinition = {
       content: [
         { text: 'Character Sheet', style: 'header' },
         { text: `Name: ${character.name}`, style: 'subheader' },
         // Add tables, lists, etc.
       ],
       styles: {
         header: { fontSize: 20, bold: true },
         subheader: { fontSize: 14 }
       }
     };
     pdfMake.createPdf(docDefinition).open();
   }
   ```

3. **Export Button**:  
   - Add a button in the character form to trigger `generatePDF()`.  

---

### 🧪 Phase 5: Integration & Testing  
1. **Link Chat and Form**:  
   - Allow users to ask AI questions about D&D 5e rules (e.g., "What class features does a warlock get?").  
   - AI can pull from web search or rulebook logic.  

2. **State Management**:  
   - Use Angular Signals to share character data between the chat and form modules.  

3. **Testing**:  
   - Unit tests for services and components (Jest or Karma).  
   - End-to-end tests with [Cypress](https://www.cypress.io/) or [Protractor](https://www.protractortest.org/).  
   - Test PDF generation with sample D&D 5e characters.  

---

### 📦 Phase 6: Deployment  
1. **Frontend**:  
   - Build Angular app:  
     ```bash
     ng build --prod
     ```
   - Host on [Vercel](https://vercel.com/), [Netlify](https://www.netlify.com/), or Firebase Hosting.  

2. **Backend (if needed)**:  
   - Deploy Node.js backend to [Render](https://render.com/) or [Heroku](https://devcenter.heroku.com/).  

3. **AI API Keys**:  
   - Store in `.env` files (never hardcode).  

---

## 🔄 Optional Enhancements  
- **User Accounts**: Add Firebase Auth or a backend for saving characters.  
- **Versioning**: Allow users to save multiple drafts of their character (e.g., "NPC-1", "Player-2").  
- **Custom Templates**: Let users choose between D&D 5e, *Xanathar's Guide*, or homebrew rules.  
- **AI Improvements**: Fine-tune a custom model for D&D 5e rulebook logic (e.g., "What spells can a wizard prepare?").  

---

## 🔄 Example Workflow  
1. User opens app, types: "Create a wizard with Tasha's Telekinesis and Evocation subclass."  
2. AI suggests: "Tasha’s Telekinesis allows you to lift and move objects up to 10 feet per level. Are you using the *Player's Handbook* or *Tasha's Cauldron* for spell lists?"  
3. User selects "Tasha’s" and specifies stats. AI fills in suggestions for spells (e.g., *Fireball*, *Telekinesis*).  
4. User completes the form, clicks "Export PDF," and downloads a formatted D&D 5e character sheet.  

---

## 📌 Notes  
- **D&D 5e Rulebook**: All logic must align with the 2014 ruleset, with explicit references to *Xanathar's Guide* and *Tasha’s Cauldron*.  
- **AI Search**: Use APIs like [Google Programmable Search Engine](https://programmablesearchengine.google.com/) to fetch canon sources.  
- **Performance**: Use Angular Signals for fast, reactive updates (no need for RxJS in most cases).  

---  
*This plan adheres to Angular 17+ best practices and ensures full compatibility with D&D 5e (2014) rules.*