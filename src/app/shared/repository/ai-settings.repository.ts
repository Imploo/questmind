import { Injectable, inject } from '@angular/core';
import { FirestoreDocumentRepository } from './firestore-document-repository';
import { AiSettings } from '../../core/services/ai-settings.service';
import { FirebaseService } from '../../core/firebase.service';

@Injectable({ providedIn: 'root' })
export class AiSettingsRepository extends FirestoreDocumentRepository<AiSettings & Record<string, unknown>> {
  constructor() {
    super(inject(FirebaseService).requireFirestore(), 'settings/ai');
  }
}
