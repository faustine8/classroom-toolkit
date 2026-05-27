import cloudbase from '@cloudbase/js-sdk';
import {
  DUPLICATE_STUDENT_NO_MESSAGE,
  STUDENT_NO_VALIDATION_MESSAGE,
  normalizeStudentNo
} from '@/features/recitation/sessionLogic';
import { CLASS_STUDENT_TOTAL } from '@/features/recitation/completionMatrix';
import { defaultRoom, formatRoomTitle } from '@/features/recitation/room';

export type QueueStatus = 'waiting' | 'current' | 'done' | 'removed';

export interface Room {
  _id?: string;
  id: string;
  className: string;
  subject: string;
  roomCode: string;
  pin: string;
  studentJoinCode: string;
  joinEnabled: boolean;
  joinCodeUpdatedAt: string;
  title: string;
  sessionCode: string;
  currentStudentNo: string | null;
  announceVersion: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreatedRoom extends Room {
  teacherPin: string;
}

export interface CreateRoomInput {
  className: string;
  subject: string;
}

interface StoredRoom extends Room {
  teacherPin: string;
}

export interface QueueItem {
  _id: string;
  roomId: string;
  roomCode: string;
  studentNo: string;
  status: QueueStatus;
  orderKey: string;
  createdAt: string;
  updatedAt: string;
}

export interface QueueSnapshot {
  room: Room;
  current: QueueItem | null;
  waiting: QueueItem[];
  completedQueue: QueueItem[];
  activeItems: QueueItem[];
}

export interface ArchivedTask {
  id: string;
  roomId: string;
  roomCode: string;
  roomTitle?: string;
  archivedAt: string;
  totalStudents: number;
  completedCount: number;
  unfinishedCount: number;
  completedStudentNumbers: number[];
  unfinishedStudentNumbers: number[];
  completedRecords: QueueItem[];
  waitingQueueSnapshot: QueueItem[];
  currentCallingSnapshot: QueueItem | null;
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
  studentJoinCodeGenerator?: () => string;
  archiveIdGenerator?: (room: Room, archivedAt: string) => string;
}

const ROOM_COLLECTION = 'rooms';
const QUEUE_COLLECTION = 'queueItems';
const ARCHIVED_TASK_COLLECTION = 'archivedTasks';
const ACTIVE_STATUSES: QueueStatus[] = ['waiting', 'current'];
const SNAPSHOT_STATUSES: QueueStatus[] = ['waiting', 'current', 'done'];
const SESSION_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const SESSION_CODE_LENGTH = 6;
const TEACHER_PIN_CHARS = '0123456789';
const TEACHER_PIN_LENGTH = 4;
const STUDENT_JOIN_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const STUDENT_JOIN_CODE_LENGTH = 8;
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

function defaultStudentJoinCodeGenerator(): string {
  let code = '';

  for (let index = 0; index < STUDENT_JOIN_CODE_LENGTH; index += 1) {
    code += STUDENT_JOIN_CODE_CHARS[Math.floor(Math.random() * STUDENT_JOIN_CODE_CHARS.length)];
  }

  return code;
}

function defaultArchiveIdGenerator(room: Room, archivedAt: string): string {
  const timestamp = archivedAt.replace(/[^0-9]/g, '');
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${room.id}_${timestamp}_${suffix}`;
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
    throw new Error(STUDENT_NO_VALIDATION_MESSAGE);
  }

  return studentNo;
}

function normalizeCreateRoomInput(input: CreateRoomInput | string): { className: string; subject: string; title: string } {
  if (typeof input === 'string') {
    const trimmedTitle = input.trim();

    if (!trimmedTitle) {
      throw new Error('请输入标题');
    }

    return {
      className: defaultRoom.className,
      subject: defaultRoom.subject,
      title: trimmedTitle
    };
  }

  const className = input.className.trim();
  const subject = input.subject.trim();

  if (!className) {
    throw new Error('请输入班级名称');
  }

  if (!subject) {
    throw new Error('请输入科目');
  }

  return {
    className,
    subject,
    title: formatRoomTitle({ className, subject })
  };
}

function toNonNegativeInteger(value: unknown): number {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }

  return Math.trunc(parsed);
}

function toRoom(raw: unknown, fallbackId: string): Room | null {
  const [data] = getDataArray<Record<string, unknown>>(raw);

  if (!data) {
    return null;
  }

  const sessionCode = normalizeSessionCode(String(data.sessionCode ?? data.roomCode ?? fallbackId));
  const className = String(data.className ?? defaultRoom.className);
  const subject = String(data.subject ?? defaultRoom.subject);

  return {
    _id: normalizeSessionCode(String(data._id ?? fallbackId)),
    id: String(data.id ?? data._id ?? sessionCode),
    className,
    subject,
    roomCode: normalizeSessionCode(String(data.roomCode ?? sessionCode)),
    pin: '',
    studentJoinCode: normalizeStudentJoinCode(String(data.studentJoinCode ?? '')),
    joinEnabled: data.joinEnabled === true,
    joinCodeUpdatedAt: String(data.joinCodeUpdatedAt ?? ''),
    title: String(data.title ?? formatRoomTitle({ className, subject })),
    sessionCode,
    currentStudentNo: typeof data.currentStudentNo === 'string' ? data.currentStudentNo : null,
    announceVersion: toNonNegativeInteger(data.announceVersion),
    createdAt: String(data.createdAt ?? ''),
    updatedAt: String(data.updatedAt ?? '')
  };
}

function toStoredRoom(raw: unknown, fallbackId: string): StoredRoom | null {
  const room = toRoom(raw, fallbackId);
  const [data] = getDataArray<Record<string, unknown>>(raw);
  const pin =
    data && typeof data.teacherPin === 'string'
      ? data.teacherPin
      : data && typeof data.pin === 'string'
        ? data.pin
        : '';

  if (!room || !data || !pin) {
    return null;
  }

  return {
    ...room,
    pin,
    teacherPin: pin
  };
}

function toQueueItem(raw: unknown, fallbackRoomId = ''): QueueItem | null {
  const [data] = getDataArray<Record<string, unknown>>(raw);

  if (!data || typeof data._id !== 'string') {
    return null;
  }

  return {
    _id: data._id,
    roomId: String(data.roomId ?? fallbackRoomId),
    roomCode: normalizeSessionCode(String(data.roomCode ?? '')),
    studentNo: String(data.studentNo ?? ''),
    status: data.status as QueueStatus,
    orderKey: String(data.orderKey ?? data.createdAt ?? ''),
    createdAt: String(data.createdAt ?? ''),
    updatedAt: String(data.updatedAt ?? '')
  };
}

function toQueueItems(raw: unknown, fallbackRoomId = ''): QueueItem[] {
  return getDataArray<Record<string, unknown>>(raw)
    .map((item) => toQueueItem(item, fallbackRoomId))
    .filter((item): item is QueueItem => item !== null);
}

function buildQueueItemId(roomId: string, studentNo: string): string {
  return `${roomId}_${studentNo}`;
}

function isQueueItemInRoom(item: QueueItem, room: Room): boolean {
  return item.roomId === room.id && item.roomCode === room.roomCode;
}

function compareQueueItems(left: QueueItem, right: QueueItem): number {
  const orderResult = left.orderKey.localeCompare(right.orderKey);

  if (orderResult !== 0) {
    return orderResult;
  }

  const createdResult = left.createdAt.localeCompare(right.createdAt);

  if (createdResult !== 0) {
    return createdResult;
  }

  return left._id.localeCompare(right._id);
}

function createQueueOrderBefore(orderKey: string): string {
  const timestamp = Date.parse(orderKey);

  if (Number.isFinite(timestamp)) {
    return new Date(timestamp - 1).toISOString();
  }

  return `!${orderKey}`;
}

function buildQueueSnapshot(room: Room, items: QueueItem[]): QueueSnapshot {
  const sortedItems = items.filter((item) => isQueueItemInRoom(item, room)).sort(compareQueueItems);
  const activeItems = sortedItems.filter((item) => ACTIVE_STATUSES.includes(item.status));
  const current = activeItems.find((item) => item.status === 'current') ?? null;
  const waiting = activeItems.filter((item) => item.status === 'waiting');
  const completedQueue = sortedItems.filter((item) => item.status === 'done');

  return {
    room: {
      ...room,
      currentStudentNo: current?.studentNo ?? null
    },
    current,
    waiting,
    completedQueue,
    activeItems
  };
}

function getSortedCompletedStudentNumbers(completedRecords: QueueItem[]): number[] {
  const completedNumbers = new Set<number>();

  for (const item of completedRecords) {
    const studentNo = normalizeStudentNo(item.studentNo);

    if (studentNo !== null) {
      completedNumbers.add(Number(studentNo));
    }
  }

  return [...completedNumbers].sort((left, right) => left - right);
}

function getUnfinishedStudentNumbers(completedStudentNumbers: number[]): number[] {
  const completedSet = new Set(completedStudentNumbers);

  return Array.from({ length: CLASS_STUDENT_TOTAL }, (_, index) => index + 1).filter(
    (studentNo) => !completedSet.has(studentNo)
  );
}

function buildArchivedTask(room: Room, snapshot: QueueSnapshot, archivedAt: string, id: string): ArchivedTask {
  const completedStudentNumbers = getSortedCompletedStudentNumbers(snapshot.completedQueue);
  const unfinishedStudentNumbers = getUnfinishedStudentNumbers(completedStudentNumbers);

  return {
    id,
    roomId: room.id,
    roomCode: room.roomCode,
    roomTitle: room.title,
    archivedAt,
    totalStudents: CLASS_STUDENT_TOTAL,
    completedCount: completedStudentNumbers.length,
    unfinishedCount: unfinishedStudentNumbers.length,
    completedStudentNumbers,
    unfinishedStudentNumbers,
    completedRecords: snapshot.completedQueue.map((item) => ({ ...item })),
    waitingQueueSnapshot: snapshot.waiting.map((item) => ({ ...item })),
    currentCallingSnapshot: snapshot.current ? { ...snapshot.current } : null
  };
}

export function normalizeSessionCode(value: string): string {
  return value.trim().toUpperCase();
}

export function normalizeStudentJoinCode(value: string): string {
  return value.trim().toUpperCase();
}

export function createCloudBaseService(options: CreateCloudBaseServiceOptions = {}) {
  let runtimePromise: Promise<{ app: CloudBaseAppLike; db: CloudBaseDbLike }> | null = null;
  const now = options.now ?? (() => new Date().toISOString());
  const codeGenerator = options.codeGenerator ?? defaultCodeGenerator;
  const teacherPinGenerator = options.teacherPinGenerator ?? defaultTeacherPinGenerator;
  const studentJoinCodeGenerator = options.studentJoinCodeGenerator ?? defaultStudentJoinCodeGenerator;
  const archiveIdGenerator = options.archiveIdGenerator ?? defaultArchiveIdGenerator;
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

  async function getRoomByStudentJoinCode(studentJoinCode: string): Promise<Room | null> {
    const db = await getDb();
    const normalizedJoinCode = normalizeStudentJoinCode(studentJoinCode);

    if (!normalizedJoinCode) {
      return null;
    }

    const result = await db
      .collection(ROOM_COLLECTION)
      .where({ studentJoinCode: normalizedJoinCode })
      .limit(1)
      .get();

    return toRoom(result.data, normalizedJoinCode);
  }

  async function createUniqueStudentJoinCode(): Promise<string> {
    for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt += 1) {
      const studentJoinCode = normalizeStudentJoinCode(studentJoinCodeGenerator());
      if (!studentJoinCode) {
        continue;
      }
      const existingRoom = await getRoomByStudentJoinCode(studentJoinCode);

      if (!existingRoom) {
        return studentJoinCode;
      }
    }

    throw new Error('学生排队码生成失败，请重试');
  }

  async function enableStudentJoin(sessionCode: string): Promise<Room> {
    const db = await getDb();
    const code = normalizeSessionCode(sessionCode);
    const room = requireRoom(await getRoom(code), code);
    const timestamp = now();
    const studentJoinCode = room.studentJoinCode || (await createUniqueStudentJoinCode());
    const updatedRoom: Room = {
      ...room,
      studentJoinCode,
      joinEnabled: true,
      joinCodeUpdatedAt: room.studentJoinCode && room.joinCodeUpdatedAt ? room.joinCodeUpdatedAt : timestamp,
      updatedAt: timestamp
    };

    await db.collection(ROOM_COLLECTION).doc(code).update({
      studentJoinCode: updatedRoom.studentJoinCode,
      joinEnabled: updatedRoom.joinEnabled,
      joinCodeUpdatedAt: updatedRoom.joinCodeUpdatedAt,
      updatedAt: updatedRoom.updatedAt
    });

    return updatedRoom;
  }

  async function disableStudentJoin(sessionCode: string): Promise<Room> {
    const db = await getDb();
    const code = normalizeSessionCode(sessionCode);
    const room = requireRoom(await getRoom(code), code);
    const timestamp = now();
    const updatedRoom: Room = {
      ...room,
      joinEnabled: false,
      updatedAt: timestamp
    };

    await db.collection(ROOM_COLLECTION).doc(code).update({
      joinEnabled: false,
      updatedAt: timestamp
    });

    return updatedRoom;
  }

  async function refreshStudentJoinCode(sessionCode: string): Promise<Room> {
    const db = await getDb();
    const code = normalizeSessionCode(sessionCode);
    const room = requireRoom(await getRoom(code), code);
    const timestamp = now();
    const studentJoinCode = await createUniqueStudentJoinCode();
    const updatedRoom: Room = {
      ...room,
      studentJoinCode,
      joinEnabled: true,
      joinCodeUpdatedAt: timestamp,
      updatedAt: timestamp
    };

    await db.collection(ROOM_COLLECTION).doc(code).update({
      studentJoinCode,
      joinEnabled: true,
      joinCodeUpdatedAt: timestamp,
      updatedAt: timestamp
    });

    return updatedRoom;
  }

  async function getQueueItem(queueItemId: string, room?: Room): Promise<QueueItem | null> {
    const db = await getDb();

    try {
      const result = await db.collection(QUEUE_COLLECTION).doc(queueItemId).get();
      const item = toQueueItem(result.data, room?.id);

      if (!item || (room && !isQueueItemInRoom(item, room))) {
        return null;
      }

      return item;
    } catch (error) {
      if (isDocumentNotFoundError(error)) {
        return null;
      }

      throw error;
    }
  }

  async function getActiveQueueItemForStudent(room: Room, studentNo: string): Promise<QueueItem | null> {
    const db = await getDb();
    const result = await db
      .collection(QUEUE_COLLECTION)
      .where({
        roomCode: room.roomCode,
        status: db.command.in(ACTIVE_STATUSES)
      })
      .get();

    return (
      toQueueItems(result.data, room.id).find(
        (item) => isQueueItemInRoom(item, room) && item.studentNo === studentNo
      ) ?? null
    );
  }

  async function getCurrentItem(room: Room): Promise<QueueItem | null> {
    const db = await getDb();
    const result = await db
      .collection(QUEUE_COLLECTION)
      .where({ roomCode: room.roomCode, status: 'current' })
      .get();

    return toQueueItems(result.data, room.id).filter((item) => isQueueItemInRoom(item, room))[0] ?? null;
  }

  async function getWaitingItems(room: Room): Promise<QueueItem[]> {
    const db = await getDb();
    const result = await db
      .collection(QUEUE_COLLECTION)
      .where({ roomCode: room.roomCode, status: 'waiting' })
      .orderBy('createdAt', 'asc')
      .get();

    return toQueueItems(result.data, room.id).filter((item) => isQueueItemInRoom(item, room)).sort(compareQueueItems);
  }

  async function getSnapshotItems(room: Room): Promise<QueueItem[]> {
    const db = await getDb();
    const result = await db
      .collection(QUEUE_COLLECTION)
      .where({
        roomCode: room.roomCode,
        status: db.command.in(SNAPSHOT_STATUSES)
      })
      .orderBy('createdAt', 'asc')
      .get();

    return toQueueItems(result.data, room.id).filter((item) => isQueueItemInRoom(item, room));
  }

  async function getActiveItems(room: Room): Promise<QueueItem[]> {
    const db = await getDb();
    const result = await db
      .collection(QUEUE_COLLECTION)
      .where({
        roomCode: room.roomCode,
        status: db.command.in(ACTIVE_STATUSES)
      })
      .orderBy('createdAt', 'asc')
      .get();

    return toQueueItems(result.data, room.id).filter((item) => isQueueItemInRoom(item, room));
  }

  async function createRoom(input: CreateRoomInput | string): Promise<CreatedRoom> {
    const roomInput = normalizeCreateRoomInput(input);
    const db = await getDb();

    for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt += 1) {
      const sessionCode = normalizeSessionCode(codeGenerator());
      const existingRoom = await getRoom(sessionCode);

      if (existingRoom) {
        continue;
      }

      const timestamp = now();
      const teacherPin = teacherPinGenerator();
      const room: CreatedRoom = {
        _id: sessionCode,
        id: sessionCode,
        className: roomInput.className,
        subject: roomInput.subject,
        roomCode: sessionCode,
        pin: teacherPin,
        studentJoinCode: '',
        joinEnabled: false,
        joinCodeUpdatedAt: '',
        title: roomInput.title,
        sessionCode,
        teacherPin,
        currentStudentNo: null,
        announceVersion: 0,
        createdAt: timestamp,
        updatedAt: timestamp
      };

      await db.collection(ROOM_COLLECTION).doc(sessionCode).set({
        id: room.id,
        className: room.className,
        subject: room.subject,
        roomCode: room.roomCode,
        pin: room.pin,
        studentJoinCode: room.studentJoinCode,
        joinEnabled: room.joinEnabled,
        joinCodeUpdatedAt: room.joinCodeUpdatedAt,
        title: room.title,
        sessionCode: room.sessionCode,
        teacherPin: room.teacherPin,
        currentStudentNo: room.currentStudentNo,
        announceVersion: room.announceVersion,
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
    const room = requireRoom(await getRoom(code), code);

    if (!room.joinEnabled) {
      throw new Error('当前房间暂未开放排队');
    }

    const studentNo = requireStudentNo(displayNo);
    const queueItemId = buildQueueItemId(room.id, studentNo);
    const existingItem = await getActiveQueueItemForStudent(room, studentNo);

    if (existingItem && ACTIVE_STATUSES.includes(existingItem.status)) {
      throw new Error(DUPLICATE_STUDENT_NO_MESSAGE);
    }

    const timestamp = now();
    const item: QueueItem = {
      _id: queueItemId,
      roomId: room.id,
      roomCode: room.roomCode,
      studentNo,
      status: 'waiting',
      orderKey: timestamp,
      createdAt: timestamp,
      updatedAt: timestamp
    };

    await db.collection(QUEUE_COLLECTION).doc(queueItemId).set({
      roomId: item.roomId,
      roomCode: item.roomCode,
      studentNo: item.studentNo,
      status: item.status,
      orderKey: item.orderKey,
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
    const currentItem = await getCurrentItem(room);

    if (room.currentStudentNo || currentItem) {
      throw new Error('请先完成当前学生，再叫下一位');
    }

    const nextItem = (await getWaitingItems(room))[0];

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
      roomId: room.id,
      status: updatedItem.status,
      updatedAt: updatedItem.updatedAt
    });
    await db.collection(ROOM_COLLECTION).doc(code).update({
      currentStudentNo: updatedItem.studentNo,
      updatedAt: timestamp
    });

    return updatedItem;
  }

  async function prioritizeQueueItem(sessionCode: string, queueItemId: string): Promise<QueueItem> {
    const db = await getDb();
    const code = normalizeSessionCode(sessionCode);
    const room = requireRoom(await getRoom(code), code);

    const waitingItems = await getWaitingItems(room);
    const firstWaitingItem = waitingItems[0];
    const targetItem = waitingItems.find((item) => item._id === queueItemId);

    if (!targetItem) {
      throw new Error('只能置顶等待队列中的学生');
    }

    if (firstWaitingItem?._id === queueItemId) {
      return targetItem;
    }

    const timestamp = now();
    const prioritizedItem: QueueItem = {
      ...targetItem,
      orderKey: createQueueOrderBefore(firstWaitingItem?.orderKey ?? targetItem.orderKey),
      updatedAt: timestamp
    };

    await db.collection(QUEUE_COLLECTION).doc(queueItemId).update({
      roomId: room.id,
      orderKey: prioritizedItem.orderKey,
      updatedAt: prioritizedItem.updatedAt
    });
    await db.collection(ROOM_COLLECTION).doc(code).update({ updatedAt: timestamp });

    return prioritizedItem;
  }

  async function markDone(sessionCode: string, queueItemId: string): Promise<QueueItem> {
    const db = await getDb();
    const code = normalizeSessionCode(sessionCode);
    const room = requireRoom(await getRoom(code), code);
    const item = await getQueueItem(queueItemId, room);

    if (!item) {
      throw new Error('未找到该队列记录');
    }

    const timestamp = now();
    const doneItem: QueueItem = {
      ...item,
      status: 'done',
      updatedAt: timestamp
    };

    await db.collection(QUEUE_COLLECTION).doc(queueItemId).update({
      roomId: room.id,
      status: doneItem.status,
      updatedAt: doneItem.updatedAt
    });
    await db.collection(ROOM_COLLECTION).doc(code).update({
      currentStudentNo: room.currentStudentNo === item.studentNo ? null : room.currentStudentNo,
      updatedAt: timestamp
    });

    return doneItem;
  }

  async function repeatCall(sessionCode: string): Promise<Room> {
    const db = await getDb();
    const code = normalizeSessionCode(sessionCode);
    const room = requireRoom(await getRoom(code), code);
    const currentItem = await getCurrentItem(room);
    const currentStudentNo = room.currentStudentNo ?? currentItem?.studentNo ?? null;

    if (!currentStudentNo) {
      throw new Error('当前没有正在背书的学生');
    }

    const timestamp = now();
    const updatedRoom: Room = {
      ...room,
      currentStudentNo,
      announceVersion: room.announceVersion + 1,
      updatedAt: timestamp
    };

    await db.collection(ROOM_COLLECTION).doc(code).update({
      currentStudentNo: updatedRoom.currentStudentNo,
      announceVersion: updatedRoom.announceVersion,
      updatedAt: updatedRoom.updatedAt
    });

    return updatedRoom;
  }

  async function removeQueueItem(sessionCode: string, queueItemId: string): Promise<QueueItem> {
    const db = await getDb();
    const code = normalizeSessionCode(sessionCode);
    const room = requireRoom(await getRoom(code), code);
    const item = await getQueueItem(queueItemId, room);

    if (!item) {
      throw new Error('未找到该队列记录');
    }

    const timestamp = now();
    const removedItem: QueueItem = {
      ...item,
      status: 'removed',
      updatedAt: timestamp
    };

    await db.collection(QUEUE_COLLECTION).doc(queueItemId).update({
      roomId: room.id,
      status: removedItem.status,
      updatedAt: removedItem.updatedAt
    });

    if (room.currentStudentNo === item.studentNo) {
      await db.collection(ROOM_COLLECTION).doc(code).update({
        currentStudentNo: null,
        updatedAt: timestamp
      });
    } else {
      await db.collection(ROOM_COLLECTION).doc(code).update({ updatedAt: timestamp });
    }

    return removedItem;
  }

  async function clearQueue(sessionCode: string): Promise<number> {
    const db = await getDb();
    const code = normalizeSessionCode(sessionCode);
    const room = requireRoom(await getRoom(code), code);

    const timestamp = now();
    const activeItems = await getActiveItems(room);

    await Promise.all(
      activeItems.map((item) =>
        db.collection(QUEUE_COLLECTION).doc(item._id).update({
          roomId: room.id,
          status: 'removed',
          updatedAt: timestamp
        })
      )
    );

    await db.collection(ROOM_COLLECTION).doc(code).update({
      currentStudentNo: null,
      updatedAt: timestamp
    });

    return activeItems.length;
  }

  async function archiveCurrentTask(sessionCode: string): Promise<ArchivedTask> {
    const db = await getDb();
    const code = normalizeSessionCode(sessionCode);
    const room = requireRoom(await getRoom(code), code);
    const snapshot = buildQueueSnapshot(room, await getSnapshotItems(room));
    const taskItems = [...snapshot.waiting, ...snapshot.completedQueue, ...(snapshot.current ? [snapshot.current] : [])];

    if (taskItems.length === 0) {
      throw new Error('当前没有可归档的任务');
    }

    const timestamp = now();
    const archivedTask = buildArchivedTask(room, snapshot, timestamp, archiveIdGenerator(room, timestamp));

    await db.collection(ARCHIVED_TASK_COLLECTION).doc(archivedTask.id).set({ ...archivedTask });

    await Promise.all(
      taskItems.map((item) =>
        db.collection(QUEUE_COLLECTION).doc(item._id).update({
          roomId: room.id,
          status: 'removed',
          updatedAt: timestamp
        })
      )
    );

    await db.collection(ROOM_COLLECTION).doc(code).update({
      currentStudentNo: null,
      joinEnabled: false,
      updatedAt: timestamp
    });

    return archivedTask;
  }

  async function watchQueue(
    sessionCode: string,
    callback: (snapshot: QueueSnapshot) => void,
    onError: (error: unknown) => void = console.error
  ): Promise<() => void> {
    const db = await getDb();
    const code = normalizeSessionCode(sessionCode);

    async function emitSnapshot(rawItems?: unknown[]) {
      const latestRoom = requireRoom(await getRoom(code), code);
      const items = rawItems ? toQueueItems(rawItems, latestRoom.id) : await getSnapshotItems(latestRoom);
      callback(buildQueueSnapshot(latestRoom, items));
    }

    await emitSnapshot();

    const queueListener = db
      .collection(QUEUE_COLLECTION)
      .where({
        roomCode: code,
        status: db.command.in(SNAPSHOT_STATUSES)
      })
      .orderBy('createdAt', 'asc')
      .watch?.({
        onChange: async (snapshot) => {
          try {
            await emitSnapshot(snapshot.docs ?? []);
          } catch (error) {
            onError(error);
          }
        },
        onError
      });

    const roomListener = db
      .collection(ROOM_COLLECTION)
      .where({ sessionCode: code })
      .limit(1)
      .watch?.({
        onChange: async () => {
          try {
            await emitSnapshot();
          } catch (error) {
            onError(error);
          }
        },
        onError
      });

    if (!queueListener || !roomListener) {
      queueListener?.close();
      roomListener?.close();
      throw new Error('当前 CloudBase SDK 不支持实时监听');
    }

    return () => {
      queueListener.close();
      roomListener.close();
    };
  }

  return {
    initCloudBase,
    createRoom,
    getRoom,
    verifyTeacherPin,
    getRoomByStudentJoinCode,
    enableStudentJoin,
    disableStudentJoin,
    refreshStudentJoinCode,
    joinQueue,
    watchQueue,
    callNext,
    prioritizeQueueItem,
    markDone,
    repeatCall,
    removeQueueItem,
    clearQueue,
    archiveCurrentTask
  };
}

const defaultService = createCloudBaseService();

export const initCloudBase = defaultService.initCloudBase;
export const createRoom = defaultService.createRoom;
export const getRoom = defaultService.getRoom;
export const verifyTeacherPin = defaultService.verifyTeacherPin;
export const getRoomByStudentJoinCode = defaultService.getRoomByStudentJoinCode;
export const enableStudentJoin = defaultService.enableStudentJoin;
export const disableStudentJoin = defaultService.disableStudentJoin;
export const refreshStudentJoinCode = defaultService.refreshStudentJoinCode;
export const joinQueue = defaultService.joinQueue;
export const watchQueue = defaultService.watchQueue;
export const callNext = defaultService.callNext;
export const prioritizeQueueItem = defaultService.prioritizeQueueItem;
export const markDone = defaultService.markDone;
export const repeatCall = defaultService.repeatCall;
export const removeQueueItem = defaultService.removeQueueItem;
export const clearQueue = defaultService.clearQueue;
export const archiveCurrentTask = defaultService.archiveCurrentTask;
