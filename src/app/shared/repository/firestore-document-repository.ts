import { Signal, signal } from '@angular/core';
import {
  doc,
  DocumentData,
  DocumentReference,
  Firestore,
  FirestoreError,
  onSnapshot,
  setDoc,
  Unsubscribe,
  updateDoc,
} from 'firebase/firestore';

export abstract class FirestoreDocumentRepository<T extends Record<string, unknown>> {
  private readonly docRef: DocumentReference<DocumentData>;

  private readonly _data = signal<T | null>(null);
  private readonly _loading = signal<boolean>(false);
  private readonly _error = signal<FirestoreError | null>(null);
  private _listening = false;
  private _unsubscribe: Unsubscribe | null = null;
  private _initialized = false;
  private _initResolvers: (() => void)[] = [];

  protected constructor(
    private readonly firestore: Firestore,
    private readonly documentPath: string,
  ) {
    this.docRef = doc(this.firestore, this.documentPath);
  }

  get get(): Signal<T | null> {
    this.ensureListening();
    return this._data.asReadonly();
  }

  get loading(): Signal<boolean> {
    this.ensureListening();
    return this._loading.asReadonly();
  }

  get error(): Signal<FirestoreError | null> {
    this.ensureListening();
    return this._error.asReadonly();
  }

  public async update(data: Partial<T>): Promise<void> {
    await setDoc(this.docRef, data, { merge: true });
  }

  public async patch(data: Record<string, unknown>): Promise<void> {
    await updateDoc(this.docRef, data);
  }

  public destroy(): void {
    if (this._unsubscribe) {
      this._unsubscribe();
      this._unsubscribe = null;
    }
    this._listening = false;
    this._initialized = false;
  }

  public waitForData(): Promise<void> {
    return this.waitForInitialization();
  }

  protected waitForInitialization(): Promise<void> {
    this.ensureListening();
    if (this._initialized) {
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      this._initResolvers.push(resolve);
    });
  }

  protected mapDocToModel(data: DocumentData): T {
    return data as T;
  }

  private ensureListening(): void {
    if (this._listening) {
      return;
    }
    this._listening = true;
    this._loading.set(true);

    this._unsubscribe = onSnapshot(
      this.docRef,
      (snapshot) => {
        if (snapshot.exists()) {
          this._data.set(this.mapDocToModel(snapshot.data()));
        } else {
          this._data.set(null);
        }
        this._loading.set(false);
        this._error.set(null);

        if (!this._initialized) {
          this._initialized = true;
          this._initResolvers.forEach((resolve) => resolve());
          this._initResolvers = [];
        }
      },
      (error: FirestoreError) => {
        this._error.set(error);
        this._loading.set(false);
      },
    );
  }
}
