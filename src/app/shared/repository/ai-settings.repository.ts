import { Injectable } from '@angular/core';
import { FirestoreDocumentRepository } from './firestore-document-repository';
import { AiSettings } from '../../core/services/ai-settings.service';

@Injectable({ providedIn: 'root' })
export class AiSettingsRepository extends FirestoreDocumentRepository<AiSettings & Record<string, unknown>> {
  constructor() {
    super('settings/ai');
  }
}
