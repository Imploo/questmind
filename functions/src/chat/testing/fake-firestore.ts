import { FieldValue, Timestamp } from 'firebase-admin/firestore';

/**
 * In-memory stand-in for the admin Firestore, for the chat tests: documents by path,
 * `create`/`set`/`update`/`get`, simple collection queries and transactions. It keeps
 * a log of every write, so a test can also check what was written along the way.
 */

type Data = Record<string, unknown>;

export interface FakeWrite {
  path: string;
  op: 'create' | 'set' | 'update' | 'delete';
  data?: Data;
}

const ALREADY_EXISTS = 6;
const NOT_FOUND = 5;

const firestoreError = (code: number, message: string): Error => Object.assign(new Error(message), { code });

const millis = (value: unknown): number => (value instanceof Timestamp ? value.toMillis() : Number(value));

export class FakeFirestore {
  readonly docs = new Map<string, Data>();
  readonly writes: FakeWrite[] = [];
  private autoId = 0;

  /** Seed a document without it showing up in the write log. */
  seed(path: string, data: Data): void {
    this.docs.set(path, { ...data });
  }

  data(path: string): Data | undefined {
    return this.docs.get(path);
  }

  writesTo(path: string): FakeWrite[] {
    return this.writes.filter(write => write.path === path);
  }

  doc(path: string): FakeDocRef {
    return new FakeDocRef(this, path);
  }

  collection(path: string): FakeCollectionRef {
    return new FakeCollectionRef(this, path);
  }

  async runTransaction<T>(run: (tx: FakeTransaction) => Promise<T>): Promise<T> {
    const tx = new FakeTransaction();
    const result = await run(tx);
    for (const apply of tx.pending) await apply();
    return result;
  }

  async recursiveDelete(ref: FakeDocRef): Promise<void> {
    for (const path of [...this.docs.keys()]) {
      if (path === ref.path || path.startsWith(`${ref.path}/`)) {
        this.docs.delete(path);
        this.writes.push({ path, op: 'delete' });
      }
    }
  }

  nextId(): string {
    return `auto-${++this.autoId}`;
  }

  /** Server timestamps become the current time, like the real thing. */
  resolve(data: Data): Data {
    return Object.fromEntries(
      Object.entries(data).map(([key, value]) => [key, value instanceof FieldValue ? Timestamp.now() : value])
    );
  }
}

export class FakeSnapshot {
  constructor(readonly ref: FakeDocRef, private readonly stored: Data | undefined) {}

  get id(): string {
    return this.ref.id;
  }

  get exists(): boolean {
    return this.stored !== undefined;
  }

  data(): Data | undefined {
    return this.stored ? { ...this.stored } : undefined;
  }

  get(field: string): unknown {
    return this.stored?.[field];
  }
}

export class FakeDocRef {
  constructor(private readonly db: FakeFirestore, readonly path: string) {}

  get id(): string {
    return this.path.split('/').pop() as string;
  }

  get firestore(): FakeFirestore {
    return this.db;
  }

  collection(name: string): FakeCollectionRef {
    return new FakeCollectionRef(this.db, `${this.path}/${name}`);
  }

  async get(): Promise<FakeSnapshot> {
    return new FakeSnapshot(this, this.db.docs.get(this.path));
  }

  async create(data: Data): Promise<void> {
    if (this.db.docs.has(this.path)) {
      throw firestoreError(ALREADY_EXISTS, `ALREADY_EXISTS: ${this.path}`);
    }
    const resolved = this.db.resolve(data);
    this.db.docs.set(this.path, resolved);
    this.db.writes.push({ path: this.path, op: 'create', data: resolved });
  }

  async set(data: Data): Promise<void> {
    const resolved = this.db.resolve(data);
    this.db.docs.set(this.path, resolved);
    this.db.writes.push({ path: this.path, op: 'set', data: resolved });
  }

  async update(data: Data): Promise<void> {
    const current = this.db.docs.get(this.path);
    if (!current) {
      throw firestoreError(NOT_FOUND, `NOT_FOUND: ${this.path}`);
    }
    const resolved = this.db.resolve(data);
    this.db.docs.set(this.path, { ...current, ...resolved });
    this.db.writes.push({ path: this.path, op: 'update', data: resolved });
  }
}

export class FakeCollectionRef {
  private filter: { field: string; value: unknown } | null = null;
  private order: { field: string; direction: 'asc' | 'desc' } | null = null;
  private max = Number.POSITIVE_INFINITY;

  constructor(private readonly db: FakeFirestore, readonly path: string) {}

  doc(id?: string): FakeDocRef {
    return new FakeDocRef(this.db, `${this.path}/${id ?? this.db.nextId()}`);
  }

  /** Only `>` is supported, which is all the chat code asks for. */
  where(field: string, _op: '>', value: unknown): FakeCollectionRef {
    const next = this.clone();
    next.filter = { field, value };
    return next;
  }

  orderBy(field: string, direction: 'asc' | 'desc' = 'asc'): FakeCollectionRef {
    const next = this.clone();
    next.order = { field, direction };
    return next;
  }

  limit(max: number): FakeCollectionRef {
    const next = this.clone();
    next.max = max;
    return next;
  }

  async get(): Promise<{ empty: boolean; docs: FakeSnapshot[] }> {
    let rows = [...this.db.docs.entries()].filter(([path]) =>
      path.startsWith(`${this.path}/`) && !path.slice(this.path.length + 1).includes('/')
    );
    const { filter, order } = this;
    if (filter) {
      rows = rows.filter(([, data]) => millis(data[filter.field]) > millis(filter.value));
    }
    if (order) {
      const sign = order.direction === 'desc' ? -1 : 1;
      rows.sort(([, a], [, b]) => sign * (millis(a[order.field]) - millis(b[order.field])));
    }
    const docs = rows.slice(0, this.max).map(([path, data]) => new FakeSnapshot(new FakeDocRef(this.db, path), data));
    return { empty: docs.length === 0, docs };
  }

  private clone(): FakeCollectionRef {
    const next = new FakeCollectionRef(this.db, this.path);
    next.filter = this.filter;
    next.order = this.order;
    next.max = this.max;
    return next;
  }
}

/** Reads happen at once, writes are applied when the transaction function returns. */
export class FakeTransaction {
  readonly pending: (() => Promise<void>)[] = [];

  get(ref: FakeDocRef): Promise<FakeSnapshot> {
    return ref.get();
  }

  create(ref: FakeDocRef, data: Data): void {
    this.pending.push(() => ref.create(data));
  }

  set(ref: FakeDocRef, data: Data): void {
    this.pending.push(() => ref.set(data));
  }

  update(ref: FakeDocRef, data: Data): void {
    this.pending.push(() => ref.update(data));
  }
}
