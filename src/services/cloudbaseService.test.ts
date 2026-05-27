import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DUPLICATE_STUDENT_NO_MESSAGE, STUDENT_NO_VALIDATION_MESSAGE } from '../features/recitation/sessionLogic';
import {
  createCloudBaseService,
  normalizeSessionCode,
  normalizeStudentJoinCode,
  type QueueSnapshot
} from './cloudbaseService';

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
    teacherPinGenerator: vi.fn().mockReturnValue('1357'),
    studentJoinCodeGenerator: vi.fn().mockReturnValueOnce('K8P3XQ7A').mockReturnValue('M9R4TQ8B'),
    archiveIdGenerator: vi.fn().mockReturnValueOnce('archive-1').mockReturnValue('archive-2')
  });

  return { db, service };
}

async function createOpenRoom(service: ReturnType<typeof createFakeService>['service']) {
  const room = await service.createRoom('课堂');
  await service.enableStudentJoin(room.sessionCode);
  return room;
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

  it('creates a fixed room with normalized room code and generated pin', async () => {
    const { db, service } = createFakeService();

    const room = await service.createRoom({
      className: ' 博雅中学初二8班 ',
      subject: ' 语文 '
    });

    expect(room).toMatchObject({
      id: 'A7K2',
      className: '博雅中学初二8班',
      subject: '语文',
      roomCode: 'A7K2',
      pin: '1357',
      studentJoinCode: '',
      joinEnabled: false,
      joinCodeUpdatedAt: '',
      title: '博雅中学初二8班 · 语文',
      sessionCode: 'A7K2',
      teacherPin: '1357',
      currentStudentNo: null,
      announceVersion: 0,
      createdAt: '2026-05-21T00:00:00.000Z',
      updatedAt: '2026-05-21T00:00:00.000Z'
    });
    await expect(db.collection('rooms').doc('A7K2').get()).resolves.toMatchObject({
      data: {
        id: 'A7K2',
        className: '博雅中学初二8班',
        subject: '语文',
        roomCode: 'A7K2',
        pin: '1357',
        studentJoinCode: '',
        joinEnabled: false,
        joinCodeUpdatedAt: '',
        title: '博雅中学初二8班 · 语文',
        sessionCode: 'A7K2',
        teacherPin: '1357'
      }
    });
  });

  it('requires class name and subject when creating a fixed room', async () => {
    const { service } = createFakeService();

    await expect(service.createRoom({ className: ' ', subject: '语文' })).rejects.toThrow('请输入班级名称');
    await expect(service.createRoom({ className: '博雅中学初二8班', subject: ' ' })).rejects.toThrow('请输入科目');
  });

  it('treats missing document errors as empty rooms and queue items', async () => {
    const { db, service } = createFakeService();
    db.collection('rooms').shouldThrowWhenMissing = true;
    db.collection('queueItems').shouldThrowWhenMissing = true;

    const room = await createOpenRoom(service);
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
    await expect(service.getRoom('A7K2')).resolves.toMatchObject({ pin: '' });
  });

  it('opens, closes, and refreshes student join codes', async () => {
    const { service } = createFakeService();
    await service.createRoom('课堂');

    await expect(service.joinQueue('A7K2', '7')).rejects.toThrow('当前房间暂未开放排队');

    const openedRoom = await service.enableStudentJoin('A7K2');

    expect(openedRoom).toMatchObject({
      studentJoinCode: 'K8P3XQ7A',
      joinEnabled: true,
      joinCodeUpdatedAt: '2026-05-21T00:01:00.000Z'
    });
    await expect(service.getRoomByStudentJoinCode(' k8p3xq7a ')).resolves.toMatchObject({
      id: 'A7K2',
      joinEnabled: true
    });

    const disabledRoom = await service.disableStudentJoin('A7K2');

    expect(disabledRoom).toMatchObject({ studentJoinCode: 'K8P3XQ7A', joinEnabled: false });
    await expect(service.joinQueue('A7K2', '7')).rejects.toThrow('当前房间暂未开放排队');

    const refreshedRoom = await service.refreshStudentJoinCode('A7K2');

    expect(refreshedRoom).toMatchObject({
      studentJoinCode: 'M9R4TQ8B',
      joinEnabled: true,
      joinCodeUpdatedAt: '2026-05-21T00:03:00.000Z'
    });
  });

  it('invalidates old student join codes after refresh', async () => {
    const db = new FakeDb();
    const service = createCloudBaseService({
      envId: 'test-env',
      publishableKey: 'pk_test',
      initApp: () => ({ database: () => db }),
      now: vi.fn().mockReturnValue('2026-05-21T00:00:00.000Z'),
      codeGenerator: vi.fn().mockReturnValue('A7K2'),
      teacherPinGenerator: vi.fn().mockReturnValue('1357'),
      studentJoinCodeGenerator: vi.fn().mockReturnValueOnce('K8P3XQ7A').mockReturnValueOnce('M9R4TQ8B')
    });

    await service.createRoom('课堂');
    const openedRoom = await service.enableStudentJoin('A7K2');
    const refreshedRoom = await service.refreshStudentJoinCode('A7K2');

    expect(openedRoom.studentJoinCode).toBe('K8P3XQ7A');
    expect(refreshedRoom.studentJoinCode).toBe('M9R4TQ8B');
    await expect(service.getRoomByStudentJoinCode('K8P3XQ7A')).resolves.toBeNull();
    await expect(service.getRoomByStudentJoinCode('M9R4TQ8B')).resolves.toMatchObject({ id: 'A7K2' });
  });

  it('normalizes session codes entered by students and teachers', () => {
    expect(normalizeSessionCode(' a7k2 ')).toBe('A7K2');
    expect(normalizeStudentJoinCode(' k8p3xq7a ')).toBe('K8P3XQ7A');
  });

  it('blocks the same student number when it is already waiting or current', async () => {
    const { service } = createFakeService();
    await createOpenRoom(service);

    const firstJoin = await service.joinQueue('a7k2', '07');
    await expect(service.joinQueue('A7K2', '7')).rejects.toThrow(DUPLICATE_STUDENT_NO_MESSAGE);

    expect(firstJoin).toMatchObject({
      roomId: 'A7K2',
      roomCode: 'A7K2',
      studentNo: '7',
      status: 'waiting'
    });
  });

  it('limits duplicate student checks to the current room id', async () => {
    const { db, service } = createFakeService();
    await createOpenRoom(service);
    await db.collection('queueItems').doc('other-room_7').set({
      roomId: 'other-room',
      roomCode: 'A7K2',
      studentNo: '7',
      status: 'waiting',
      orderKey: '2026-05-21T00:00:30.000Z',
      createdAt: '2026-05-21T00:00:30.000Z',
      updatedAt: '2026-05-21T00:00:30.000Z'
    });

    const joined = await service.joinQueue('A7K2', '7');

    expect(joined).toMatchObject({ _id: 'A7K2_7', roomId: 'A7K2', studentNo: '7', status: 'waiting' });

    const snapshots: QueueSnapshot[] = [];
    const stopWatching = await service.watchQueue('A7K2', (snapshot) => {
      snapshots.push(snapshot);
    });
    stopWatching();

    expect(snapshots[0].waiting.map((item) => item._id)).toEqual(['A7K2_7']);
  });

  it('treats legacy queue items without roomId as current room items', async () => {
    const { db, service } = createFakeService();
    await createOpenRoom(service);
    await db.collection('queueItems').doc('A7K2_7').set({
      roomCode: 'A7K2',
      studentNo: '7',
      status: 'waiting',
      orderKey: '2026-05-21T00:01:00.000Z',
      createdAt: '2026-05-21T00:01:00.000Z',
      updatedAt: '2026-05-21T00:01:00.000Z'
    });

    const snapshots: QueueSnapshot[] = [];
    const stopWatching = await service.watchQueue('A7K2', (snapshot) => {
      snapshots.push(snapshot);
    });
    stopWatching();

    expect(snapshots[0].waiting[0]).toMatchObject({ _id: 'A7K2_7', roomId: 'A7K2', studentNo: '7' });

    const called = await service.callNext('A7K2');

    expect(called).toMatchObject({ _id: 'A7K2_7', roomId: 'A7K2', status: 'current' });
    await expect(db.collection('queueItems').doc('A7K2_7').get()).resolves.toMatchObject({
      data: expect.objectContaining({ roomId: 'A7K2', status: 'current' })
    });
  });

  it('does not call or remove queue items from another room id', async () => {
    const { db, service } = createFakeService();
    await createOpenRoom(service);
    await db.collection('queueItems').doc('other-room_6').set({
      roomId: 'other-room',
      roomCode: 'A7K2',
      studentNo: '6',
      status: 'waiting',
      orderKey: '2026-05-21T00:00:30.000Z',
      createdAt: '2026-05-21T00:00:30.000Z',
      updatedAt: '2026-05-21T00:00:30.000Z'
    });
    const currentRoomStudent = await service.joinQueue('A7K2', '7');

    const called = await service.callNext('A7K2');

    expect(called).toMatchObject({ _id: currentRoomStudent._id, roomId: 'A7K2', studentNo: '7' });
    await expect(service.removeQueueItem('A7K2', 'other-room_6')).rejects.toThrow('未找到该队列记录');
    await expect(db.collection('queueItems').doc('other-room_6').get()).resolves.toMatchObject({
      data: expect.objectContaining({ status: 'waiting' })
    });
  });

  it('rejects invalid student numbers before adding queue items', async () => {
    const { service } = createFakeService();
    await createOpenRoom(service);

    await expect(service.joinQueue('A7K2', '')).rejects.toThrow(STUDENT_NO_VALIDATION_MESSAGE);
    await expect(service.joinQueue('A7K2', '0')).rejects.toThrow(STUDENT_NO_VALIDATION_MESSAGE);
    await expect(service.joinQueue('A7K2', '56')).rejects.toThrow(STUDENT_NO_VALIDATION_MESSAGE);
    await expect(service.joinQueue('A7K2', '-1')).rejects.toThrow(STUDENT_NO_VALIDATION_MESSAGE);
    await expect(service.joinQueue('A7K2', '1.5')).rejects.toThrow(STUDENT_NO_VALIDATION_MESSAGE);
    await expect(service.joinQueue('A7K2', 'abc')).rejects.toThrow(STUDENT_NO_VALIDATION_MESSAGE);
    await expect(service.joinQueue('A7K2', '@')).rejects.toThrow(STUDENT_NO_VALIDATION_MESSAGE);
  });

  it('promotes the earliest waiting student and marks the current student done', async () => {
    const { service } = createFakeService();
    await createOpenRoom(service);
    const first = await service.joinQueue('A7K2', '7');
    await service.joinQueue('A7K2', '8');

    const called = await service.callNext('A7K2');
    expect(called).toMatchObject({ _id: first._id, status: 'current', studentNo: '7' });
    await expect(service.callNext('A7K2')).rejects.toThrow('请先完成当前学生');

    await service.markDone('A7K2', first._id);
    const next = await service.callNext('A7K2');
    expect(next).toMatchObject({ studentNo: '8', status: 'current' });
  });

  it('moves a waiting student to the front without changing the current student or other waiting order', async () => {
    const { service } = createFakeService();
    await createOpenRoom(service);
    const currentStudent = await service.joinQueue('A7K2', '7');
    const firstWaitingStudent = await service.joinQueue('A7K2', '8');
    const prioritizedStudent = await service.joinQueue('A7K2', '9');
    await service.callNext('A7K2');

    const prioritized = await service.prioritizeQueueItem('A7K2', prioritizedStudent._id);

    expect(prioritized).toMatchObject({
      studentNo: '9',
      status: 'waiting',
      createdAt: prioritizedStudent.createdAt
    });
    expect(prioritized.orderKey.localeCompare(firstWaitingStudent.orderKey)).toBeLessThan(0);

    const snapshots: QueueSnapshot[] = [];
    const stopWatching = await service.watchQueue('A7K2', (snapshot) => {
      snapshots.push(snapshot);
    });
    stopWatching();

    expect(snapshots[0].current).toMatchObject({ studentNo: '7', status: 'current' });
    expect(snapshots[0].waiting.map((item) => item.studentNo)).toEqual(['9', '8']);

    await service.markDone('A7K2', currentStudent._id);
    const next = await service.callNext('A7K2');
    expect(next).toMatchObject({ studentNo: '9', status: 'current' });
  });

  it('increments announce version for repeat calls without changing queue state', async () => {
    const { db, service } = createFakeService();
    await createOpenRoom(service);
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
      data: expect.objectContaining({ roomId: 'A7K2', status: 'current', roomCode: 'A7K2', studentNo: '7' })
    });
    await expect(db.collection('rooms').doc('A7K2').get()).resolves.toMatchObject({
      data: expect.objectContaining({ announceVersion: 1, currentStudentNo: '7' })
    });
  });

  it('clears active queue items without touching completed items', async () => {
    const { db, service } = createFakeService();
    await createOpenRoom(service);
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
    await createOpenRoom(service);
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

  it('archives current task snapshots and clears all task records without replacing older archives', async () => {
    const { db, service } = createFakeService();
    await createOpenRoom(service);
    const first = await service.joinQueue('A7K2', '7');
    await service.joinQueue('A7K2', '8');
    await service.joinQueue('A7K2', '9');
    await service.callNext('A7K2');
    await service.markDone('A7K2', first._id);
    await service.callNext('A7K2');

    const archived = await service.archiveCurrentTask('A7K2', ' 第 12 课背诵 ');

    expect(archived).toMatchObject({
      id: 'archive-1',
      roomId: 'A7K2',
      roomCode: 'A7K2',
      taskName: '第 12 课背诵',
      roomTitle: '课堂',
      totalStudents: 50,
      completedCount: 1,
      unfinishedCount: 49,
      completedStudentNumbers: [7],
      currentCallingSnapshot: expect.objectContaining({ studentNo: '8', status: 'current' }),
      waitingQueueSnapshot: [expect.objectContaining({ studentNo: '9', status: 'waiting' })],
      completedRecords: [expect.objectContaining({ studentNo: '7', status: 'done' })]
    });
    expect(archived.unfinishedStudentNumbers).not.toContain(7);
    await expect(db.collection('archivedTasks').doc('archive-1').get()).resolves.toMatchObject({
      data: expect.objectContaining({
        taskName: '第 12 课背诵',
        completedStudentNumbers: [7],
        unfinishedCount: 49
      })
    });

    const clearedItems = await db.collection('queueItems').where({ roomCode: 'A7K2' }).get();
    expect(clearedItems.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ studentNo: '7', status: 'removed' }),
        expect.objectContaining({ studentNo: '8', status: 'removed' }),
        expect.objectContaining({ studentNo: '9', status: 'removed' })
      ])
    );
    await expect(db.collection('rooms').doc('A7K2').get()).resolves.toMatchObject({
      data: expect.objectContaining({
        currentStudentNo: null,
        joinEnabled: false,
        teacherPin: '1357',
        title: '课堂'
      })
    });

    const snapshots: QueueSnapshot[] = [];
    const stopWatching = await service.watchQueue('A7K2', (snapshot) => {
      snapshots.push(snapshot);
    });
    stopWatching();
    expect(snapshots[0]).toMatchObject({
      current: null,
      waiting: [],
      completedQueue: []
    });

    await service.enableStudentJoin('A7K2');
    await service.joinQueue('A7K2', '7');
    const secondArchive = await service.archiveCurrentTask('A7K2');
    const archiveRecords = await db.collection('archivedTasks').where({ roomCode: 'A7K2' }).get();

    expect(secondArchive).toMatchObject({ id: 'archive-2', taskName: '2026-05-21 背书任务', completedCount: 0 });
    expect(archiveRecords.data.map((item) => item._id).sort()).toEqual(['archive-1', 'archive-2']);
  });

  it('rejects archiving when there is no task data', async () => {
    const { db, service } = createFakeService();
    await createOpenRoom(service);

    await expect(service.archiveCurrentTask('A7K2')).rejects.toThrow('当前没有可归档的任务');

    const archiveRecords = await db.collection('archivedTasks').where({ roomCode: 'A7K2' }).get();
    expect(archiveRecords.data).toEqual([]);
  });

  it('lists archived tasks for the current room with newest records first', async () => {
    const { db, service } = createFakeService();

    await db.collection('archivedTasks').doc('old-record').set({
      id: 'old-record',
      roomId: 'A7K2',
      roomCode: 'A7K2',
      archivedAt: '2026-05-21T00:01:00.000Z',
      totalStudents: 50,
      completedCount: 1,
      unfinishedCount: 49,
      completedStudentNumbers: [7],
      unfinishedStudentNumbers: [1, 2, 3]
    });
    await db.collection('archivedTasks').doc('other-room-record').set({
      id: 'other-room-record',
      roomId: 'B8M3',
      roomCode: 'B8M3',
      archivedAt: '2026-05-21T00:03:00.000Z',
      totalStudents: 50,
      completedCount: 50,
      unfinishedCount: 0,
      completedStudentNumbers: [],
      unfinishedStudentNumbers: []
    });
    await db.collection('archivedTasks').doc('new-record').set({
      id: 'new-record',
      roomId: 'A7K2',
      roomCode: 'A7K2',
      taskName: '古诗两首',
      archivedAt: '2026-05-21T00:02:00.000Z',
      totalStudents: 50,
      completedCount: 2,
      unfinishedCount: 48,
      completedStudentNumbers: [7, 8],
      unfinishedStudentNumbers: [1, 2]
    });

    await expect(service.listArchivedTasks('a7k2')).resolves.toMatchObject([
      {
        id: 'new-record',
        roomCode: 'A7K2',
        taskName: '古诗两首',
        completedCount: 2,
        unfinishedStudentNumbers: [1, 2]
      },
      {
        id: 'old-record',
        roomCode: 'A7K2',
        taskName: '2026-05-21 背书任务',
        completedCount: 1,
        unfinishedStudentNumbers: [1, 2, 3]
      }
    ]);
  });
});
