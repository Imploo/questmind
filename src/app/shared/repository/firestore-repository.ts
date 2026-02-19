import { Signal, signal } from '@angular/core';
import {
  addDoc,
  collection,
  CollectionReference,
  deleteDoc,
  doc,
  DocumentData,
  DocumentReference,
  Firestore,
  FirestoreError,
  onSnapshot,
  query,
  Query,
  QueryConstraint,
  setDoc,
  Unsubscribe,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';

export abstract class FirestoreRepository<
  T extends Record<string, unknown>,
  K extends string & keyof T,
> {
  private readonly collectionRef: CollectionReference<DocumentData>;

  private readonly _data = signal<T[]>([]);
  private readonly _loading = signal<boolean>(false);
  private readonly _error = signal<FirestoreError | null>(null);
  private _listening = false;
  private _unsubscribe: Unsubscribe | null = null;
  private _initialized = false;
  private _initResolvers: (() => void)[] = [];

  protected constructor(
    private readonly firestore: Firestore,
    private readonly collectionPath: string,
    private readonly keyProp: K,
  ) {
    this.collectionRef = collection(this.firestore, this.collectionPath);
  }

  get get(): Signal<T[]> {
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

  public async getByKey(key: T[K]): Promise<T | null> {
    await this.waitForInitialization();
    return this._data().find((item) => item[this.keyProp] === key) ?? null;
  }

  public async update(item: T): Promise<void> {
    const key = item[this.keyProp] as string;
    if (key) {
      const docRef = this.getDocRef(key);
      await setDoc(docRef, item, { merge: true });
    } else {
      const docRef = await addDoc(this.collectionRef, item);
      const itemWithKey = { ...item, [this.keyProp]: docRef.id };
      await setDoc(docRef, itemWithKey, { merge: true });
    }
  }

  public async set(items: T[]): Promise<void> {
    const batch = writeBatch(this.firestore);
    items.forEach((item) => {
      const key = item[this.keyProp] as string;
      const docRef = this.getDocRef(key);
      batch.set(docRef, item, { merge: true });
    });
    await batch.commit();
  }

  public async patch(key: T[K], data: Record<string, unknown>): Promise<void> {
    const docRef = this.getDocRef(key as string);
    await updateDoc(docRef, data);
  }

  public async delete(key: T[K]): Promise<void> {
    const docRef = this.getDocRef(key as string);
    await deleteDoc(docRef);
  }

  protected buildQuery(
    ref: CollectionReference,
  ): Query {
    return ref;
  }

  protected getConstraints(): QueryConstraint[] {
    return [];
  }

  protected mapDocToModel(docSnap: { data: () => DocumentData }): T {
    return docSnap.data() as T;
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

  private getDocRef(key: string): DocumentReference {
    return doc(this.firestore, `${this.collectionPath}/${key}`);
  }

  private ensureListening(): void {
    if (this._listening) {
      return;
    }
    this._listening = true;
    this._loading.set(true);

    const constraints = this.getConstraints();
    const q =
      constraints.length > 0
        ? query(this.collectionRef, ...constraints)
        : this.buildQuery(this.collectionRef);

    this._unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const items = snapshot.docs.map(
          (d) => ({ ...this.mapDocToModel(d), [this.keyProp]: d.id }) as T,
        );
        this._data.set(items);
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
