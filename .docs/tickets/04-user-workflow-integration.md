# User Workflow Integration Spec Plan

## Overview
Integrate all modules (Chat, Character Form, PDF Export) into a seamless user workflow:
- Chat → Refine with AI/Rulebook → Finalize → Export PDF
- Ensure data consistency between modules using Angular Signals
- Implement navigation between workflow steps

## Key Requirements
1. **Workflow Sequence**
   - Chat module for initial character description
   - Character form for refinement and validation
   - PDF export as final step

2. **Technical Integration**
   - Use Angular Signals to share character data between modules
   - Implement routing between `Chat`, `Character Form`, and `PDF Export` components
   - Add workflow progress indicator (e.g., "Step 1 of 3: Chat")

3. **User Experience**
   - Enable navigation between workflow steps
   - Display character data consistently across modules
   - Provide feedback on AI suggestions during refinement

## Technical Implementation
- Update `app-routing.module.ts` with routes:
  ```ts
  const routes: Routes = [
    { path: 'chat', component: ChatComponent },
    { path: 'character', component: CharacterFormComponent },
    { path: 'pdf', component: PdfExportComponent }
  ];
  ```
- Share character data using Signals:
  ```ts
  // In chat.service.ts
  export const characterSignal = signal<Character | null>(null);

  // In form.service.ts
  effect(() => {
    const character = characterSignal();
    if (character) {
      // Update form with latest character data
    }
  });
  ```
- Add workflow progress component:
  ```ts
  // workflow-progress.component.ts
  interface WorkflowStep {
    label: string;
    completed: boolean;
  }
  ```

## Mock Development
- Implement placeholder routing between modules
- Use mock character data to test signal sharing
- Create visual workflow progress indicator