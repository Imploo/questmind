import { inject, Injectable } from '@angular/core';
import { httpsCallable } from 'firebase/functions';
import { FirebaseService } from '../../../core/firebase.service';
import { ChatAttachment } from '../../../shared/utils/build-character-context';

/**
 * Brings a character in from outside: a copy of a shared QuestMind character by its
 * link, or a character sheet PDF that the chat of a new character reads in.
 */
@Injectable({ providedIn: 'root' })
export class CharacterImportService {
  private readonly firebase = inject(FirebaseService);
  private pendingPdf: { characterId: string; attachment: ChatAttachment } | null = null;

  /** Copy the character behind a share link to this account. Resolves to the new character's id. */
  async importFromLink(link: string): Promise<string> {
    const fn = httpsCallable<{ link: string }, { characterId: string }>(
      this.firebase.requireFunctions(),
      'importCharacter'
    );
    const result = await fn({ link });
    return result.data.characterId;
  }

  /** Keep a PDF ready for the chat of a character that is about to be opened. */
  queuePdf(characterId: string, attachment: ChatAttachment): void {
    this.pendingPdf = { characterId, attachment };
  }

  /** The PDF waiting for this character, handed out once. */
  takePdf(characterId: string): ChatAttachment | null {
    if (this.pendingPdf?.characterId !== characterId) return null;
    const { attachment } = this.pendingPdf;
    this.pendingPdf = null;
    return attachment;
  }
}
