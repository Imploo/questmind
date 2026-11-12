import { inject, Injectable } from '@angular/core';
import { Firestore, QueryConstraint, limit, limitToLast, orderBy } from 'firebase/firestore';
import { FirestoreRepository } from './firestore-repository';
import { ChatConversation, StoredChatMessage } from '../../chat/chat.models';
import { FirebaseService } from '../../core/firebase.service';

/** The conversations of a character, most recently used first. Only the owner can read them. */
export class ChatRepository extends FirestoreRepository<ChatConversation & Record<string, unknown>, 'id'> {
  constructor(firestore: Firestore, characterId: string, private readonly max: number) {
    super(firestore, `characters/${characterId}/chats`, 'id');
  }

  protected override getConstraints(): QueryConstraint[] {
    return [orderBy('updatedAt', 'desc'), limit(this.max)];
  }
}

/** The last `max` messages of one conversation, oldest first. */
export class ChatMessageRepository extends FirestoreRepository<StoredChatMessage & Record<string, unknown>, 'id'> {
  constructor(firestore: Firestore, characterId: string, chatId: string, private readonly max: number) {
    super(firestore, `characters/${characterId}/chats/${chatId}/messages`, 'id');
  }

  protected override getConstraints(): QueryConstraint[] {
    return [orderBy('createdAt', 'asc'), limitToLast(this.max)];
  }
}

@Injectable({ providedIn: 'root' })
export class ChatRepositoryFactory {
  private readonly firestore = inject(FirebaseService).requireFirestore();

  chats(characterId: string, max: number): ChatRepository {
    return new ChatRepository(this.firestore, characterId, max);
  }

  messages(characterId: string, chatId: string, max: number): ChatMessageRepository {
    return new ChatMessageRepository(this.firestore, characterId, chatId, max);
  }
}
