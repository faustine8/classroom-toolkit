<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import AppHero from '@/components/AppHero.vue';
import {
  normalizeTeacherPin,
  rememberTeacherPinAuthorization
} from '@/features/recitation/teacherPinAuth';
import { setCurrentRoom } from '@/features/recitation/room';
import {
  createRoom,
  getRoom,
  getRoomByStudentJoinCode,
  normalizeSessionCode,
  normalizeStudentJoinCode,
  verifyTeacherPin,
  type CreatedRoom
} from '@/services/cloudbaseService';
import { getErrorMessage } from '@/utils/errorMessage';

type NoticeKind = 'success' | 'warning' | 'info';

const router = useRouter();
const classNameInput = ref('');
const subjectInput = ref('');
const teacherRoomCode = ref('');
const teacherPin = ref('');
const studentJoinCode = ref('');
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

  const joinCode = normalizeStudentJoinCode(studentJoinCode.value);

  if (!joinCode) {
    showNotice('warning', '请输入排队码');
    return;
  }

  isEnteringStudentRoom.value = true;
  notice.value = null;

  try {
    const room = await getRoomByStudentJoinCode(joinCode);

    if (!room) {
      showNotice('warning', '未找到该排队入口');
      return;
    }

    if (!room.joinEnabled) {
      showNotice('warning', '当前房间暂未开放排队');
      return;
    }

    setCurrentRoom(room);
    await router.push({ name: 'recitation-student-join', params: { joinCode } });
  } catch (error) {
    showNotice('warning', getErrorMessage(error));
  } finally {
    isEnteringStudentRoom.value = false;
  }
}
</script>

<template>
  <main class="page home-page">
    <AppHero
      eyebrow="Classroom Toolkit"
      title="班级背诵排号系统"
      subtitle="固定房间保存班级、科目、房间码和 PIN，老师端和学生端通过 CloudBase 实时同步队列。"
    />

    <section class="room-entry-grid" aria-label="背书排号房间入口">
      <el-card class="entry-card" shadow="never">
        <template #header>
          <div class="card-header">
            <el-tag type="success" effect="light">创建固定房间</el-tag>
            <h2>新房间</h2>
          </div>
        </template>

        <el-form label-position="top" @submit.prevent="createRecitationRoom">
          <el-form-item label="班级名称">
            <el-input
              id="room-class-name"
              v-model="classNameInput"
              autocomplete="off"
              placeholder="例如：博雅中学初二8班"
              size="large"
            />
          </el-form-item>
          <el-form-item label="科目">
            <el-input
              id="room-subject"
              v-model="subjectInput"
              autocomplete="off"
              placeholder="例如：语文"
              size="large"
            />
          </el-form-item>
          <el-button :loading="isCreating" native-type="submit" size="large" type="primary">
            创建固定房间
          </el-button>

          <el-alert
            v-if="createdRoom"
            class="room-result"
            :closable="false"
            show-icon
            title="固定房间创建成功"
            type="success"
          >
            <div class="room-result__content" aria-live="polite">
              <span>班级：{{ createdRoom.className }}</span>
              <span>科目：{{ createdRoom.subject }}</span>
              <span>房间码：{{ createdRoom.roomCode }}</span>
              <span>PIN：{{ createdRoom.pin }}</span>
              <p>请妥善保存房间码和 PIN。</p>
            </div>
          </el-alert>

          <div v-if="createdRoom" class="create-actions">
            <el-button size="large" type="primary" @click="enterCreatedRoom">进入教师端</el-button>
            <el-button size="large" @click="copyCreatedRoomInfo">复制教师管理信息</el-button>
          </div>
        </el-form>
      </el-card>

      <el-card class="entry-card" shadow="never">
        <template #header>
          <div class="card-header">
            <el-tag type="warning" effect="light">管理已有房间</el-tag>
            <h2>老师端</h2>
          </div>
        </template>

        <el-form label-position="top" @submit.prevent="enterTeacherRoom">
          <el-form-item label="房间码">
            <el-input
              id="teacher-room-code"
              v-model="teacherRoomCode"
              autocomplete="off"
              maxlength="8"
              placeholder="请输入房间码"
              size="large"
              @input="teacherRoomCode = normalizeSessionCode(teacherRoomCode)"
            />
          </el-form-item>

          <el-form-item label="PIN 码">
            <el-input
              id="teacher-pin"
              v-model="teacherPin"
              autocomplete="off"
              inputmode="numeric"
              maxlength="6"
              placeholder="请输入 PIN"
              show-password
              size="large"
              type="password"
            />
          </el-form-item>

          <el-button :loading="isEnteringTeacherRoom" native-type="submit" size="large" type="primary">
            进入教师端
          </el-button>
        </el-form>
      </el-card>

      <el-card class="entry-card" shadow="never">
        <template #header>
          <div class="card-header">
            <el-tag effect="light">学生端</el-tag>
            <h2>加入排队</h2>
          </div>
        </template>

        <el-form label-position="top" @submit.prevent="enterStudentRoom">
          <el-form-item label="排队码">
            <el-input
              id="student-join-code"
              v-model="studentJoinCode"
              autocomplete="off"
              maxlength="8"
              placeholder="请输入排队码"
              size="large"
              @input="studentJoinCode = normalizeStudentJoinCode(studentJoinCode)"
            />
          </el-form-item>
          <el-button :loading="isEnteringStudentRoom" native-type="submit" size="large" type="primary">
            进入学生端
          </el-button>
        </el-form>
      </el-card>
    </section>

    <el-alert v-if="notice" :closable="false" show-icon :title="notice.text" :type="notice.kind" />
  </main>
</template>
