import { describe, it, expect, afterAll } from 'vitest';
import { computed } from '@angular/core';
import { deleteApp, initializeApp } from 'firebase/app';
import { Firestore, getFirestore, terminate } from 'firebase/firestore';
import { FirestoreRepository } from './firestore-repository';
import { FirestoreDocumentRepository } from './firestore-document-repository';

// A Firestore of its own that never reaches a server: the listeners only have to start.
const app = initializeApp({ projectId: 'demo-repository-spec', apiKey: 'test' }, 'repository-spec');
const firestore = getFirestore(app);

class ItemRepository extends FirestoreRepository<{ id: string }, 'id'> {
  constructor(db: Firestore) {
    super(db, 'items', 'id');
  }
}

class SettingsRepository extends FirestoreDocumentRepository<{ name: string }> {
  constructor(db: Firestore) {
    super(db, 'settings/one');
  }
}

describe('Firestore repositories', () => {
  afterAll(async () => {
    await terminate(firestore);
    await deleteApp(app);
  });

  // A repository created after the page rendered is first read in a computed or a template (NG0600).
  it('can be read for the first time inside a computed', () => {
    const items = new ItemRepository(firestore);
    const settings = new SettingsRepository(firestore);

    expect(computed(() => items.get().length)()).toBe(0);
    expect(computed(() => settings.get())()).toBeNull();
    expect(items.loading()).toBe(true);
    expect(settings.loading()).toBe(true);

    items.destroy();
    settings.destroy();
  });
});
