<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import {
  normalizeTeacherPin,
  rememberTeacherPinAuthorization
} from '@/features/recitation/teacherPinAuth';
import { setCurrentRoom } from '@/features/recitation/room';
import { createRoom, getRoom, normalizeSessionCode, verifyTeacherPin, type CreatedRoom } from '@/services/cloudbaseService';
import { getErrorMessage } from '@/utils/errorMessage';

type NoticeKind = 'success' | 'warning' | 'info';

const router = useRouter();
const classNameInput = ref('');
const subjectInput = ref('');
const teacherRoomCode = ref('');
const teacherPin = ref('');
const studentRoomCode = ref('');
const createdRoom = ref<CreatedRoom | null>(null);
const isCreating = ref(false);
const isEnteringTeacherRoom = ref(false);
const isEnteringStudentRoom = ref(false);
const notice = ref<{ kind: NoticeKind; text: string } | null>(null);

function showNotice(kind: NoticeKind, text: string) {
  notice.value = { kind, text };
}

function buildTeacherRoomInfo(room: CreatedRoom): string {
  return `固定房间创建成功
班级：${room.className}
科目：${room.subject}
房间码：${room.roomCode}
PIN：${room.pin}
请妥善保存房间码和 PIN。`;
}

async function createRecitationRoom() {
  if (isCreating.value) {
    return;
  }

  const className = classNameInput.value.trim();
  const subject = subjectInput.value.trim();

  if (!className) {
    showNotice('warning', '请输入班级名称');
    return;
  }

  if (!subject) {
    showNotice('warning', '请输入科目');
    return;
  }

  isCreating.value = true;
  notice.value = null;

  try {
    const room = await createRoom({ className, subject });
    createdRoom.value = room;
    rememberTeacherPinAuthorization(room.sessionCode, room.teacherPin);
    showNotice('success', '固定房间创建成功');
  } catch (error) {
    showNotice('warning', getErrorMessage(error));
  } finally {
    isCreating.value = false;
  }
}

async function enterCreatedRoom() {
  if (!createdRoom.value) {
    return;
  }

  setCurrentRoom(createdRoom.value);
  rememberTeacherPinAuthorization(createdRoom.value.sessionCode, createdRoom.value.teacherPin);
  await router.push({ name: 'recitation-teacher', params: { sessionCode: createdRoom.value.sessionCode } });
}

async function copyCreatedRoomInfo() {
  if (!createdRoom.value) {
    return;
  }

  try {
    await navigator.clipboard.writeText(buildTeacherRoomInfo(createdRoom.value));
    showNotice('success', '已复制教师管理信息');
  } catch {
    showNotice('warning', '复制失败，请手动保存房间码和 PIN');
  }
}

async function enterTeacherRoom() {
  if (isEnteringTeacherRoom.value) {
    return;
  }

  const sessionCode = normalizeSessionCode(teacherRoomCode.value);
  const normalizedTeacherPin = normalizeTeacherPin(teacherPin.value);

  if (!sessionCode) {
    showNotice('warning', '请输入房间码');
    return;
  }

  if (!normalizedTeacherPin) {
    showNotice('warning', '请输入 PIN 码');
    return;
  }

  isEnteringTeacherRoom.value = true;
  notice.value = null;

  try {
    const room = await getRoom(sessionCode);

    if (!room) {
      showNotice('warning', '未找到该房间');
      return;
    }

    const pinMatched = await verifyTeacherPin(sessionCode, normalizedTeacherPin);

    if (!pinMatched) {
      showNotice('warning', '房间码或 PIN 不正确');
      return;
    }

    setCurrentRoom(room);
    rememberTeacherPinAuthorization(sessionCode, normalizedTeacherPin);
    await router.push({
      name: 'recitation-teacher',
      params: { sessionCode: room.sessionCode }
    });
  } catch (error) {
    showNotice('warning', getErrorMessage(error));
  } finally {
    isEnteringTeacherRoom.value = false;
  }
}

async function enterStudentRoom() {
  if (isEnteringStudentRoom.value) {
    return;
  }

  const sessionCode = normalizeSessionCode(studentRoomCode.value);

  if (!sessionCode) {
    showNotice('warning', '请输入房间码');
    return;
  }

  isEnteringStudentRoom.value = true;
  notice.value = null;

  try {
    const room = await getRoom(sessionCode);

    if (!room) {
      showNotice('warning', '未找到该房间');
      return;
    }

    setCurrentRoom(room);
    await router.push({ name: 'student-entry', query: { roomCode: room.sessionCode } });
  } catch (error) {
    showNotice('warning', getErrorMessage(error));
  } finally {
    isEnteringStudentRoom.value = false;
  }
}
</script>

<template>
  <main class="page home-page">
    <section class="home-hero">
      <div>
        <p class="eyebrow">Classroom Toolkit</p>
        <h1>课堂工具集</h1>
        <p class="hero-copy">固定房间保存班级、科目、房间码和 PIN，老师端和学生端通过 CloudBase 实时同步队列。</p>
      </div>
    </section>

    <section class="room-entry-grid" aria-label="背书排号房间入口">
      <form class="create-panel" @submit.prevent="createRecitationRoom">
        <span class="tool-card__tag">创建固定房间</span>
        <h2>新房间</h2>
        <label for="room-class-name">班级名称</label>
        <input
          id="room-class-name"
          v-model="classNameInput"
          autocomplete="off"
          placeholder="例如：博雅中学初二8班"
          type="text"
        />
        <label for="room-subject">科目</label>
        <input
          id="room-subject"
          v-model="subjectInput"
          autocomplete="off"
          placeholder="例如：语文"
          type="text"
        />
        <button class="button button--primary" :disabled="isCreating" type="submit">
          {{ isCreating ? '创建中...' : '创建固定房间' }}
        </button>

        <div v-if="createdRoom" class="room-result" aria-live="polite">
          <strong>固定房间创建成功</strong>
          <span>班级：{{ createdRoom.className }}</span>
          <span>科目：{{ createdRoom.subject }}</span>
          <span>房间码：{{ createdRoom.roomCode }}</span>
          <span>PIN：{{ createdRoom.pin }}</span>
          <p>请妥善保存房间码和 PIN。</p>
          <div class="create-actions">
            <button class="button button--secondary" type="button" @click="enterCreatedRoom">进入教师端</button>
            <button class="button button--ghost" type="button" @click="copyCreatedRoomInfo">复制教师管理信息</button>
          </div>
        </div>
      </form>

      <form class="create-panel" @submit.prevent="enterTeacherRoom">
        <span class="tool-card__tag">管理已有房间</span>
        <h2>老师端</h2>
        <label for="teacher-room-code">房间码</label>
        <input
          id="teacher-room-code"
          v-model="teacherRoomCode"
          autocomplete="off"
          maxlength="8"
          placeholder="请输入房间码"
          type="text"
          @input="teacherRoomCode = normalizeSessionCode(teacherRoomCode)"
        />

        <label for="teacher-pin">PIN 码</label>
        <input
          id="teacher-pin"
          v-model="teacherPin"
          autocomplete="off"
          inputmode="numeric"
          maxlength="6"
          placeholder="请输入 PIN"
          type="password"
        />

        <button class="button button--secondary" :disabled="isEnteringTeacherRoom" type="submit">
          {{ isEnteringTeacherRoom ? '进入中...' : '进入教师端' }}
        </button>
      </form>

      <form class="create-panel" @submit.prevent="enterStudentRoom">
        <span class="tool-card__tag">学生端</span>
        <h2>加入排队</h2>
        <label for="student-room-code">房间码</label>
        <input
          id="student-room-code"
          v-model="studentRoomCode"
          autocomplete="off"
          maxlength="8"
          placeholder="请输入房间码"
          type="text"
          @input="studentRoomCode = normalizeSessionCode(studentRoomCode)"
        />
        <button class="button button--secondary" :disabled="isEnteringStudentRoom" type="submit">
          {{ isEnteringStudentRoom ? '进入中...' : '进入学生端' }}
        </button>
      </form>
    </section>

    <div v-if="notice" class="notice" :class="`notice--${notice.kind}`" role="status">
      {{ notice.text }}
    </div>
  </main>
</template>
