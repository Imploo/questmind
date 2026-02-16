import { Timestamp } from 'firebase/firestore';
import { DndCharacter } from '../../../shared/models/dnd-character.model';

export interface Character {
  id: string;
  userId: string;
  name: string;
  activeVersionId: string;
  campaignId: string | null;
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
  createdAt: Timestamp;
}
