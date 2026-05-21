import cloudbase from '@cloudbase/js-sdk';
import { normalizeStudentNo } from '@/features/recitation/sessionLogic';

export type QueueStatus = 'waiting' | 'current' | 'done' | 'removed';

export interface Room {
  _id?: string;
  title: string;
  sessionCode: string;
  currentStudentNo: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreatedRoom extends Room {
  teacherPin: string;
}

interface StoredRoom extends Room {
  teacherPin: string;
}

export interface QueueItem {
  _id: string;
  roomCode: string;
  studentNo: string;
  status: QueueStatus;
  createdAt: string;
  updatedAt: string;
}

export interface QueueSnapshot {
  room: Room;
  current: QueueItem | null;
  waiting: QueueItem[];
  activeItems: QueueItem[];
}

interface CloudBaseAppLike {
  database: () => CloudBaseDbLike;
}

interface CloudBaseDbLike {
  command: {
    in: (values: unknown[]) => unknown;
  };
  collection: (name: string) => CloudBaseCollectionLike;
}

interface CloudBaseCollectionLike extends CloudBaseQueryLike {
  doc: (id: string) => CloudBaseDocumentLike;
}

interface CloudBaseDocumentLike {
  get: () => Promise<{ data: unknown }>;
  set: (data: Record<string, unknown>) => Promise<unknown>;
  update: (data: Record<string, unknown>) => Promise<unknown>;
}

interface CloudBaseQueryLike {
  where: (criteria: Record<string, unknown>) => CloudBaseQueryLike;
  orderBy: (field: string, direction: 'asc' | 'desc') => CloudBaseQueryLike;
  limit: (max: number) => CloudBaseQueryLike;
  get: () => Promise<{ data: unknown }>;
  update: (data: Record<string, unknown>) => Promise<{ updated?: number } | unknown>;
  watch?: (options: {
    onChange: (snapshot: { docs?: unknown[] }) => void;
    onError: (error: unknown) => void;
  }) => { close: () => void };
}

export interface CreateCloudBaseServiceOptions {
  envId?: string;
  publishableKey?: string;
  initApp?: (config: { env: string; accessKey: string }) => CloudBaseAppLike;
  now?: () => string;
  codeGenerator?: () => string;
  teacherPinGenerator?: () => string;
}

const ROOM_COLLECTION = 'rooms';
const QUEUE_COLLECTION = 'queueItems';
const ACTIVE_STATUSES: QueueStatus[] = ['waiting', 'current'];
const SESSION_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const SESSION_CODE_LENGTH = 4;
const TEACHER_PIN_CHARS = '0123456789';
const TEACHER_PIN_LENGTH = 4;
const MAX_CODE_ATTEMPTS = 16;

function getEnvId(): string {
  return import.meta.env.VITE_CLOUDBASE_ENV_ID;
}

function getPublishableKey(): string {
  return import.meta.env.VITE_CLOUDBASE_PUBLISHABLE_KEY;
}

function defaultCodeGenerator(): string {
  let code = '';

  for (let index = 0; index < SESSION_CODE_LENGTH; index += 1) {
    code += SESSION_CODE_CHARS[Math.floor(Math.random() * SESSION_CODE_CHARS.length)];
  }

  return code;
}

function defaultTeacherPinGenerator(): string {
  let pin = '';

  for (let index = 0; index < TEACHER_PIN_LENGTH; index += 1) {
    pin += TEACHER_PIN_CHARS[Math.floor(Math.random() * TEACHER_PIN_CHARS.length)];
  }

  return pin;
}

function getDataArray<T>(data: unknown): T[] {
  if (Array.isArray(data)) {
    return data as T[];
  }

  if (data && typeof data === 'object') {
    return [data as T];
  }

  return [];
}

function isDocumentNotFoundError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const errorRecord = error as Record<string, unknown>;
  const message = typeof errorRecord.message === 'string' ? errorRecord.message : '';
  const code = typeof errorRecord.code === 'string' ? errorRecord.code : '';

  return /document\s+not\s+found/i.test(message) || /document.*not.*found/i.test(code);
}

function requireRoom(room: Room | null, sessionCode: string): Room {
  if (!room) {
    throw new Error(`未找到房间 ${sessionCode}`);
  }

  return room;
}

function requireStudentNo(displayNo: string): string {
  const studentNo = normalizeStudentNo(displayNo);

  if (studentNo === null) {
    throw new Error('请输入有效的数字学号');
  }

  return studentNo;
}

function toRoom(raw: unknown, fallbackId: string): Room | null {
  const [data] = getDataArray<Record<string, unknown>>(raw);

  if (!data) {
    return null;
  }

  return {
    _id: String(data._id ?? fallbackId),
    title: String(data.title ?? ''),
    sessionCode: String(data.sessionCode ?? fallbackId),
    currentStudentNo: typeof data.currentStudentNo === 'string' ? data.currentStudentNo : null,
    createdAt: String(data.createdAt ?? ''),
    updatedAt: String(data.updatedAt ?? '')
  };
}

function toStoredRoom(raw: unknown, fallbackId: string): StoredRoom | null {
  const room = toRoom(raw, fallbackId);
  const [data] = getDataArray<Record<string, unknown>>(raw);

  if (!room || !data || typeof data.teacherPin !== 'string') {
    return null;
  }

  return {
    ...room,
    teacherPin: data.teacherPin
  };
}

function toQueueItem(raw: unknown): QueueItem | null {
  const [data] = getDataArray<Record<string, unknown>>(raw);

  if (!data || typeof data._id !== 'string') {
    return null;
  }

  return {
    _id: data._id,
    roomCode: String(data.roomCode ?? ''),
    studentNo: String(data.studentNo ?? ''),
    status: data.status as QueueStatus,
    createdAt: String(data.createdAt ?? ''),
    updatedAt: String(data.updatedAt ?? '')
  };
}

function toQueueItems(raw: unknown): QueueItem[] {
  return getDataArray<Record<string, unknown>>(raw)
    .map(toQueueItem)
    .filter((item): item is QueueItem => item !== null);
}

function buildQueueItemId(sessionCode: string, studentNo: string): string {
  return `${sessionCode}_${studentNo}`;
}

function buildQueueSnapshot(room: Room, items: QueueItem[]): QueueSnapshot {
  const activeItems = [...items].sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  const current = activeItems.find((item) => item.status === 'current') ?? null;
  const waiting = activeItems.filter((item) => item.status === 'waiting');

  return {
    room: {
      ...room,
      currentStudentNo: current?.studentNo ?? null
    },
    current,
    waiting,
    activeItems
  };
}

export function normalizeSessionCode(value: string): string {
  return value.trim().toUpperCase();
}

export function createCloudBaseService(options: CreateCloudBaseServiceOptions = {}) {
  let runtimePromise: Promise<{ app: CloudBaseAppLike; db: CloudBaseDbLike }> | null = null;
  const now = options.now ?? (() => new Date().toISOString());
  const codeGenerator = options.codeGenerator ?? defaultCodeGenerator;
  const teacherPinGenerator = options.teacherPinGenerator ?? defaultTeacherPinGenerator;
  const initApp =
    options.initApp ??
    ((config: { env: string; accessKey: string }) => cloudbase.init(config) as unknown as CloudBaseAppLike);

  async function initCloudBase() {
    if (runtimePromise) {
      return runtimePromise;
    }

    runtimePromise = (async () => {
      const envId = options.envId ?? getEnvId();

      if (!envId) {
        throw new Error('请在 .env 中配置 VITE_CLOUDBASE_ENV_ID');
      }

      const publishableKey = options.publishableKey ?? getPublishableKey();

      if (!publishableKey) {
        throw new Error('请在 .env 中配置 VITE_CLOUDBASE_PUBLISHABLE_KEY');
      }

      const app = initApp({
        env: envId,
        accessKey: publishableKey
      });

      return {
        app,
        db: app.database()
      };
    })();

    return runtimePromise;
  }

  async function getDb() {
    const runtime = await initCloudBase();
    return runtime.db;
  }

  async function getRoom(sessionCode: string): Promise<Room | null> {
    const db = await getDb();
    const code = normalizeSessionCode(sessionCode);

    try {
      const result = await db.collection(ROOM_COLLECTION).doc(code).get();
      return toRoom(result.data, code);
    } catch (error) {
      if (isDocumentNotFoundError(error)) {
        return null;
      }

      throw error;
    }
  }

  async function getStoredRoom(sessionCode: string): Promise<StoredRoom | null> {
    const db = await getDb();
    const code = normalizeSessionCode(sessionCode);

    try {
      const result = await db.collection(ROOM_COLLECTION).doc(code).get();
      return toStoredRoom(result.data, code);
    } catch (error) {
      if (isDocumentNotFoundError(error)) {
        return null;
      }

      throw error;
    }
  }

  async function verifyTeacherPin(sessionCode: string, teacherPin: string): Promise<boolean> {
    const storedRoom = await getStoredRoom(sessionCode);

    return storedRoom?.teacherPin === teacherPin.trim();
  }

  async function getQueueItem(queueItemId: string): Promise<QueueItem | null> {
    const db = await getDb();

    try {
      const result = await db.collection(QUEUE_COLLECTION).doc(queueItemId).get();
      return toQueueItem(result.data);
    } catch (error) {
      if (isDocumentNotFoundError(error)) {
        return null;
      }

      throw error;
    }
  }

  async function getCurrentItem(sessionCode: string): Promise<QueueItem | null> {
    const db = await getDb();
    const result = await db
      .collection(QUEUE_COLLECTION)
      .where({ roomCode: normalizeSessionCode(sessionCode), status: 'current' })
      .limit(1)
      .get();

    return toQueueItems(result.data)[0] ?? null;
  }

  async function getActiveItems(sessionCode: string): Promise<QueueItem[]> {
    const db = await getDb();
    const result = await db
      .collection(QUEUE_COLLECTION)
      .where({
        roomCode: normalizeSessionCode(sessionCode),
        status: db.command.in(ACTIVE_STATUSES)
      })
      .orderBy('createdAt', 'asc')
      .get();

    return toQueueItems(result.data);
  }

  async function createRoom(title: string): Promise<CreatedRoom> {
    const trimmedTitle = title.trim();

    if (!trimmedTitle) {
      throw new Error('请输入标题');
    }

    const db = await getDb();

    for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt += 1) {
      const sessionCode = normalizeSessionCode(codeGenerator());
      const existingRoom = await getRoom(sessionCode);

      if (existingRoom) {
        continue;
      }

      const timestamp = now();
      const room: CreatedRoom = {
        _id: sessionCode,
        title: trimmedTitle,
        sessionCode,
        teacherPin: teacherPinGenerator(),
        currentStudentNo: null,
        createdAt: timestamp,
        updatedAt: timestamp
      };

      await db.collection(ROOM_COLLECTION).doc(sessionCode).set({
        title: room.title,
        sessionCode: room.sessionCode,
        teacherPin: room.teacherPin,
        currentStudentNo: room.currentStudentNo,
        createdAt: room.createdAt,
        updatedAt: room.updatedAt
      });

      return room;
    }

    throw new Error('房间码生成失败，请重试');
  }

  async function joinQueue(sessionCode: string, displayNo: string): Promise<QueueItem> {
    const db = await getDb();
    const code = normalizeSessionCode(sessionCode);
    requireRoom(await getRoom(code), code);

    const studentNo = requireStudentNo(displayNo);
    const queueItemId = buildQueueItemId(code, studentNo);
    const existingItem = await getQueueItem(queueItemId);

    if (existingItem && ACTIVE_STATUSES.includes(existingItem.status)) {
      throw new Error(`${studentNo} 号已经在当前学生或等待队列中`);
    }

    const timestamp = now();
    const item: QueueItem = {
      _id: queueItemId,
      roomCode: code,
      studentNo,
      status: 'waiting',
      createdAt: timestamp,
      updatedAt: timestamp
    };

    await db.collection(QUEUE_COLLECTION).doc(queueItemId).set({
      roomCode: item.roomCode,
      studentNo: item.studentNo,
      status: item.status,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt
    });
    await db.collection(ROOM_COLLECTION).doc(code).update({ updatedAt: timestamp });

    return item;
  }

  async function callNext(sessionCode: string): Promise<QueueItem> {
    const db = await getDb();
    const code = normalizeSessionCode(sessionCode);
    const room = requireRoom(await getRoom(code), code);
    const currentItem = await getCurrentItem(code);

    if (room.currentStudentNo || currentItem) {
      throw new Error('请先完成当前学生，再叫下一位');
    }

    const result = await db
      .collection(QUEUE_COLLECTION)
      .where({ roomCode: code, status: 'waiting' })
      .orderBy('createdAt', 'asc')
      .limit(1)
      .get();
    const nextItem = toQueueItems(result.data)[0];

    if (!nextItem) {
      throw new Error('等待队列为空，暂无可叫号学生');
    }

    const timestamp = now();
    const updatedItem: QueueItem = {
      ...nextItem,
      status: 'current',
      updatedAt: timestamp
    };

    await db.collection(QUEUE_COLLECTION).doc(nextItem._id).update({
      status: updatedItem.status,
      updatedAt: updatedItem.updatedAt
    });
    await db.collection(ROOM_COLLECTION).doc(code).update({
      currentStudentNo: updatedItem.studentNo,
      updatedAt: timestamp
    });

    return updatedItem;
  }

  async function markDone(sessionCode: string, queueItemId: string): Promise<QueueItem> {
    const db = await getDb();
    const code = normalizeSessionCode(sessionCode);
    const room = requireRoom(await getRoom(code), code);
    const item = await getQueueItem(queueItemId);

    if (!item || item.roomCode !== code) {
      throw new Error('未找到该队列记录');
    }

    const timestamp = now();
    const doneItem: QueueItem = {
      ...item,
      status: 'done',
      updatedAt: timestamp
    };

    await db.collection(QUEUE_COLLECTION).doc(queueItemId).update({
      status: doneItem.status,
      updatedAt: doneItem.updatedAt
    });
    await db.collection(ROOM_COLLECTION).doc(code).update({
      currentStudentNo: room.currentStudentNo === item.studentNo ? null : room.currentStudentNo,
      updatedAt: timestamp
    });

    return doneItem;
  }

  async function removeQueueItem(queueItemId: string): Promise<QueueItem> {
    const db = await getDb();
    const item = await getQueueItem(queueItemId);

    if (!item) {
      throw new Error('未找到该队列记录');
    }

    const room = await getRoom(item.roomCode);
    const timestamp = now();
    const removedItem: QueueItem = {
      ...item,
      status: 'removed',
      updatedAt: timestamp
    };

    await db.collection(QUEUE_COLLECTION).doc(queueItemId).update({
      status: removedItem.status,
      updatedAt: removedItem.updatedAt
    });

    if (room?.currentStudentNo === item.studentNo) {
      await db.collection(ROOM_COLLECTION).doc(item.roomCode).update({
        currentStudentNo: null,
        updatedAt: timestamp
      });
    } else if (room) {
      await db.collection(ROOM_COLLECTION).doc(item.roomCode).update({ updatedAt: timestamp });
    }

    return removedItem;
  }

  async function clearQueue(sessionCode: string): Promise<number> {
    const db = await getDb();
    const code = normalizeSessionCode(sessionCode);
    requireRoom(await getRoom(code), code);

    const timestamp = now();
    const result = await db
      .collection(QUEUE_COLLECTION)
      .where({
        roomCode: code,
        status: db.command.in(ACTIVE_STATUSES)
      })
      .update({
        status: 'removed',
        updatedAt: timestamp
      });

    await db.collection(ROOM_COLLECTION).doc(code).update({
      currentStudentNo: null,
      updatedAt: timestamp
    });

    return typeof result === 'object' && result !== null && 'updated' in result && typeof result.updated === 'number'
      ? result.updated
      : 0;
  }

  async function watchQueue(
    sessionCode: string,
    callback: (snapshot: QueueSnapshot) => void,
    onError: (error: unknown) => void = console.error
  ): Promise<() => void> {
    const db = await getDb();
    const code = normalizeSessionCode(sessionCode);
    const room = requireRoom(await getRoom(code), code);

    callback(buildQueueSnapshot(room, await getActiveItems(code)));

    const listener = db
      .collection(QUEUE_COLLECTION)
      .where({
        roomCode: code,
        status: db.command.in(ACTIVE_STATUSES)
      })
      .orderBy('createdAt', 'asc')
      .watch?.({
        onChange: async (snapshot) => {
          try {
            const latestRoom = requireRoom(await getRoom(code), code);
            callback(buildQueueSnapshot(latestRoom, toQueueItems(snapshot.docs ?? [])));
          } catch (error) {
            onError(error);
          }
        },
        onError
      });

    if (!listener) {
      throw new Error('当前 CloudBase SDK 不支持实时监听');
    }

    return () => listener.close();
  }

  return {
    initCloudBase,
    createRoom,
    getRoom,
    verifyTeacherPin,
    joinQueue,
    watchQueue,
    callNext,
    markDone,
    removeQueueItem,
    clearQueue
  };
}

const defaultService = createCloudBaseService();

export const initCloudBase = defaultService.initCloudBase;
export const createRoom = defaultService.createRoom;
export const getRoom = defaultService.getRoom;
export const verifyTeacherPin = defaultService.verifyTeacherPin;
export const joinQueue = defaultService.joinQueue;
export const watchQueue = defaultService.watchQueue;
export const callNext = defaultService.callNext;
export const markDone = defaultService.markDone;
export const removeQueueItem = defaultService.removeQueueItem;
export const clearQueue = defaultService.clearQueue;
