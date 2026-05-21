import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createCloudBaseService, normalizeSessionCode, type QueueSnapshot } from './cloudbaseService';

type DocData = Record<string, unknown>;

class FakeDocRef {
  shouldThrowWhenMissing = false;

  constructor(
    private readonly collection: FakeCollection,
    private readonly id: string
  ) {}

  async get() {
    const data = this.collection.docs.get(this.id);

    if (!data && this.collection.shouldThrowWhenMissing) {
      throw new Error('Document not found');
    }

    return { data: data ? { _id: this.id, ...data } : null };
  }

  async set(data: DocData) {
    this.collection.docs.set(this.id, { ...data });
    return {};
  }

  async update(data: DocData) {
    const existing = this.collection.docs.get(this.id) ?? {};
    this.collection.docs.set(this.id, { ...existing, ...data });
    return {};
  }
}

class FakeQuery {
  private readonly predicates: Array<(item: DocData & { _id: string }) => boolean>;
  private readonly sortField?: string;
  private readonly sortDirection?: 'asc' | 'desc';
  private readonly max?: number;

  constructor(
    private readonly collection: FakeCollection,
    predicates: Array<(item: DocData & { _id: string }) => boolean> = [],
    sortField?: string,
    sortDirection?: 'asc' | 'desc',
    max?: number
  ) {
    this.predicates = predicates;
    this.sortField = sortField;
    this.sortDirection = sortDirection;
    this.max = max;
  }

  where(criteria: Record<string, unknown>) {
    return new FakeQuery(
      this.collection,
      [
        ...this.predicates,
        (item) =>
          Object.entries(criteria).every(([key, expected]) => {
            const value = item[key];
            if (expected && typeof expected === 'object' && '__op' in expected) {
              return (expected as { values: unknown[] }).values.includes(value);
            }
            return value === expected;
          })
      ],
      this.sortField,
      this.sortDirection,
      this.max
    );
  }

  orderBy(field: string, direction: 'asc' | 'desc') {
    return new FakeQuery(this.collection, this.predicates, field, direction, this.max);
  }

  limit(max: number) {
    return new FakeQuery(this.collection, this.predicates, this.sortField, this.sortDirection, max);
  }

  async get() {
    let data = [...this.collection.docs.entries()]
      .map(([id, doc]) => ({ _id: id, ...doc }))
      .filter((item) => this.predicates.every((predicate) => predicate(item)));

    if (this.sortField) {
      data = data.sort((left, right) => {
        const leftValue = String(left[this.sortField!] ?? '');
        const rightValue = String(right[this.sortField!] ?? '');
        return this.sortDirection === 'desc' ? rightValue.localeCompare(leftValue) : leftValue.localeCompare(rightValue);
      });
    }

    return { data: typeof this.max === 'number' ? data.slice(0, this.max) : data };
  }

  async update(data: DocData) {
    const matched = await this.get();

    for (const item of matched.data) {
      const existing = this.collection.docs.get(item._id) ?? {};
      this.collection.docs.set(item._id, { ...existing, ...data });
    }

    return { updated: matched.data.length };
  }

  watch(_options: { onChange: (snapshot: { docs?: unknown[] }) => void; onError: (error: unknown) => void }) {
    return { close: vi.fn() };
  }
}

class FakeCollection {
  readonly docs = new Map<string, DocData>();
  shouldThrowWhenMissing = false;

  doc(id: string) {
    return new FakeDocRef(this, id);
  }

  where(criteria: Record<string, unknown>) {
    return new FakeQuery(this).where(criteria);
  }
}

class FakeDb {
  private readonly collections = new Map<string, FakeCollection>();
  readonly command = {
    in: (values: unknown[]) => ({ __op: 'in', values })
  };

  collection(name: string) {
    const existing = this.collections.get(name);

    if (existing) {
      return existing;
    }

    const created = new FakeCollection();
    this.collections.set(name, created);
    return created;
  }
}

function createFakeService() {
  const db = new FakeDb();
  const service = createCloudBaseService({
    envId: 'test-env',
    publishableKey: 'pk_test',
    initApp: () => ({ database: () => db }),
    now: vi.fn()
      .mockReturnValueOnce('2026-05-21T00:00:00.000Z')
      .mockReturnValueOnce('2026-05-21T00:01:00.000Z')
      .mockReturnValueOnce('2026-05-21T00:02:00.000Z')
      .mockReturnValue('2026-05-21T00:03:00.000Z'),
    codeGenerator: vi.fn().mockReturnValue('A7K2'),
    teacherPinGenerator: vi.fn().mockReturnValue('1357')
  });

  return { db, service };
}

describe('cloudbaseService', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('initializes CloudBase 3.x with a client publishable key as accessKey', async () => {
    const db = new FakeDb();
    const signInAnonymously = vi.fn();
    const initApp = vi.fn(() => ({
      auth: () => ({ signInAnonymously }),
      database: () => db
    }));
    const service = createCloudBaseService({
      envId: 'test-env',
      publishableKey: 'pk_test',
      initApp
    });

    await service.initCloudBase();

    expect(initApp).toHaveBeenCalledWith({
      env: 'test-env',
      accessKey: 'pk_test'
    });
    expect(signInAnonymously).not.toHaveBeenCalled();
  });

  it('requires a publishable key for browser initialization', async () => {
    const db = new FakeDb();
    const service = createCloudBaseService({
      envId: 'test-env',
      publishableKey: '',
      initApp: () => ({ database: () => db })
    });

    await expect(service.initCloudBase()).rejects.toThrow('请在 .env 中配置 VITE_CLOUDBASE_PUBLISHABLE_KEY');
  });

  it('creates a room with a normalized four-character session code', async () => {
    const { db, service } = createFakeService();

    const room = await service.createRoom(' 五年级背书 ');

    expect(room).toMatchObject({
      title: '五年级背书',
      sessionCode: 'A7K2',
      teacherPin: '1357',
      currentStudentNo: null,
      announceVersion: 0,
      createdAt: '2026-05-21T00:00:00.000Z',
      updatedAt: '2026-05-21T00:00:00.000Z'
    });
    await expect(db.collection('rooms').doc('A7K2').get()).resolves.toMatchObject({
      data: { title: '五年级背书', sessionCode: 'A7K2', teacherPin: '1357' }
    });
  });

  it('treats missing document errors as empty rooms and queue items', async () => {
    const { db, service } = createFakeService();
    db.collection('rooms').shouldThrowWhenMissing = true;
    db.collection('queueItems').shouldThrowWhenMissing = true;

    const room = await service.createRoom('课堂');
    const joined = await service.joinQueue(room.sessionCode, '7');

    expect(room.sessionCode).toBe('A7K2');
    expect(joined).toMatchObject({ studentNo: '7', status: 'waiting' });
  });

  it('verifies teacher pins without exposing them through getRoom', async () => {
    const { service } = createFakeService();
    await service.createRoom('课堂');

    await expect(service.verifyTeacherPin('a7k2', '1357')).resolves.toBe(true);
    await expect(service.verifyTeacherPin('A7K2', '0000')).resolves.toBe(false);
    await expect(service.getRoom('A7K2')).resolves.not.toHaveProperty('teacherPin');
  });

  it('normalizes session codes entered by students and teachers', () => {
    expect(normalizeSessionCode(' a7k2 ')).toBe('A7K2');
  });

  it('blocks the same student number when it is already waiting or current', async () => {
    const { service } = createFakeService();
    await service.createRoom('课堂');

    const firstJoin = await service.joinQueue('a7k2', '07');
    await expect(service.joinQueue('A7K2', '7')).rejects.toThrow('7 号已经在当前学生或等待队列中');

    expect(firstJoin).toMatchObject({
      roomCode: 'A7K2',
      studentNo: '7',
      status: 'waiting'
    });
  });

  it('promotes the earliest waiting student and marks the current student done', async () => {
    const { service } = createFakeService();
    await service.createRoom('课堂');
    const first = await service.joinQueue('A7K2', '7');
    await service.joinQueue('A7K2', '8');

    const called = await service.callNext('A7K2');
    expect(called).toMatchObject({ _id: first._id, status: 'current', studentNo: '7' });
    await expect(service.callNext('A7K2')).rejects.toThrow('请先完成当前学生');

    await service.markDone('A7K2', first._id);
    const next = await service.callNext('A7K2');
    expect(next).toMatchObject({ studentNo: '8', status: 'current' });
  });

  it('increments announce version for repeat calls without changing queue state', async () => {
    const { db, service } = createFakeService();
    await service.createRoom('课堂');
    const first = await service.joinQueue('a7k2', '7');
    await service.callNext('A7K2');

    const room = await service.repeatCall(' a7k2 ');

    expect(room).toMatchObject({
      sessionCode: 'A7K2',
      currentStudentNo: '7',
      announceVersion: 1,
      updatedAt: '2026-05-21T00:03:00.000Z'
    });
    await expect(db.collection('queueItems').doc(first._id).get()).resolves.toMatchObject({
      data: expect.objectContaining({ status: 'current', roomCode: 'A7K2', studentNo: '7' })
    });
    await expect(db.collection('rooms').doc('A7K2').get()).resolves.toMatchObject({
      data: expect.objectContaining({ announceVersion: 1, currentStudentNo: '7' })
    });
  });

  it('clears active queue items without touching completed items', async () => {
    const { db, service } = createFakeService();
    await service.createRoom('课堂');
    const first = await service.joinQueue('A7K2', '7');
    await service.callNext('A7K2');
    await service.markDone('A7K2', first._id);
    await service.joinQueue('A7K2', '8');

    await service.clearQueue('A7K2');

    const items = await db.collection('queueItems').where({ roomCode: 'A7K2' }).get();
    expect(items.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ studentNo: '7', status: 'done' }),
        expect.objectContaining({ studentNo: '8', status: 'removed' })
      ])
    );
  });

  it('includes completed students in queue snapshots', async () => {
    const { service } = createFakeService();
    await service.createRoom('课堂');
    const first = await service.joinQueue('A7K2', '7');
    await service.joinQueue('A7K2', '8');
    await service.callNext('A7K2');
    await service.markDone('A7K2', first._id);

    const snapshots: QueueSnapshot[] = [];
    const stopWatching = await service.watchQueue('A7K2', (snapshot) => {
      snapshots.push(snapshot);
    });
    stopWatching();

    expect(snapshots[0]).toMatchObject({
      current: null,
      waiting: [expect.objectContaining({ studentNo: '8', status: 'waiting' })],
      completedQueue: [expect.objectContaining({ studentNo: '7', status: 'done' })]
    });
  });
});
