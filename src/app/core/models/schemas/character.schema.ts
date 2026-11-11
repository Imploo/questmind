import { Timestamp } from 'firebase/firestore';
import { DndCharacter } from '../../../shared/models/dnd-character.model';

export interface Character {
  id: string;
  userId: string;
  name: string;
  activeVersionId: string;
  campaignId: string | null;
  isGenerating?: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface CharacterVersion {
  id: string;
  versionNumber: number;
  character: DndCharacter;
  commitMessage: string;
  source: 'ai' | 'restore' | 'manual';
  restoredFromVersionId?: string;
  isDraft?: boolean;
  /** Ability score rule violations the AI could not fix (set on AI drafts). */
  abilityScoreWarnings?: string[];
  /** Derived values (saves, skills, initiative, ...) that were recalculated on an AI draft. */
  derivedStatCorrections?: string[];
  createdAt: Timestamp;
}
