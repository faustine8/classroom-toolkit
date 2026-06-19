<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { ArrowRight, Calendar, Clock, Management, Plus, UserFilled } from '@element-plus/icons-vue';
import AppHero from '@/components/AppHero.vue';
import AppTopNav from '@/components/AppTopNav.vue';
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
type NoticeScope = 'create' | 'teacher' | 'student';

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
const createDialogVisible = ref(false);
const teacherDialogVisible = ref(false);
const notice = ref<{ kind: NoticeKind; text: string; scope: NoticeScope } | null>(null);

function showNotice(scope: NoticeScope, kind: NoticeKind, text: string) {
  notice.value = { kind, text, scope };
}

function clearNotice(scope?: NoticeScope) {
  if (!scope || notice.value?.scope === scope) {
    notice.value = null;
  }
}

function openCreateDialog() {
  clearNotice();
  createDialogVisible.value = true;
}

function openTeacherDialog() {
  clearNotice();
  teacherDialogVisible.value = true;
}

function buildTeacherRoomInfo(room: CreatedRoom): string {
  return `班级房间创建成功
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
    showNotice('create', 'warning', '请输入班级名称');
    return;
  }

  if (!subject) {
    showNotice('create', 'warning', '请输入科目');
    return;
  }

  isCreating.value = true;
  clearNotice('create');

  try {
    const room = await createRoom({ className, subject });
    createdRoom.value = room;
    rememberTeacherPinAuthorization(room.sessionCode, room.teacherPin);
    showNotice('create', 'success', '班级房间创建成功');
  } catch (error) {
    showNotice('create', 'warning', getErrorMessage(error));
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
    showNotice('create', 'success', '已复制教师管理信息');
  } catch {
    showNotice('create', 'warning', '复制失败，请手动保存房间码和 PIN');
  }
}

async function enterTeacherRoom() {
  if (isEnteringTeacherRoom.value) {
    return;
  }

  const sessionCode = normalizeSessionCode(teacherRoomCode.value);
  const normalizedTeacherPin = normalizeTeacherPin(teacherPin.value);

  if (!sessionCode) {
    showNotice('teacher', 'warning', '请输入房间码');
    return;
  }

  if (!normalizedTeacherPin) {
    showNotice('teacher', 'warning', '请输入 PIN 码');
    return;
  }

  isEnteringTeacherRoom.value = true;
  clearNotice('teacher');

  try {
    const room = await getRoom(sessionCode);

    if (!room) {
      showNotice('teacher', 'warning', '未找到该房间');
      return;
    }

    const pinMatched = await verifyTeacherPin(sessionCode, normalizedTeacherPin);

    if (!pinMatched) {
      showNotice('teacher', 'warning', '房间码或 PIN 不正确');
      return;
    }

    setCurrentRoom(room);
    rememberTeacherPinAuthorization(sessionCode, normalizedTeacherPin);
    await router.push({
      name: 'recitation-teacher',
      params: { sessionCode: room.sessionCode }
    });
  } catch (error) {
    showNotice('teacher', 'warning', getErrorMessage(error));
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
    showNotice('student', 'warning', '请输入排队码');
    return;
  }

  isEnteringStudentRoom.value = true;
  clearNotice('student');

  try {
    const room = await getRoomByStudentJoinCode(joinCode);

    if (!room) {
      showNotice('student', 'warning', '未找到该排队入口');
      return;
    }

    if (!room.joinEnabled) {
      showNotice('student', 'warning', '当前房间暂未开放排队');
      return;
    }

    setCurrentRoom(room);
    await router.push({ name: 'recitation-student-join', params: { joinCode } });
  } catch (error) {
    showNotice('student', 'warning', getErrorMessage(error));
  } finally {
    isEnteringStudentRoom.value = false;
  }
}
</script>

<template>
  <main class="page home-page">
    <AppTopNav />

    <AppHero
      class="home-hero"
      compact
      eyebrow="Classroom Toolkit"
      title="课堂工具箱"
      subtitle="班级排号、考试计时和更多课堂工具，给一节课留出更清晰的节奏。"
    />

    <section id="teacher-workbench" class="home-workspace" aria-label="课堂工具入口">
      <section class="teacher-workbench" aria-labelledby="teacher-workbench-title">
        <div class="section-heading">
          <p>教师工作台</p>
          <h2 id="teacher-workbench-title">选择今天要用的课堂工具</h2>
        </div>

        <article class="tool-entry-card tool-entry-card--recitation">
          <div class="tool-entry-card__icon" aria-hidden="true">
            <el-icon><Management /></el-icon>
          </div>
          <div class="tool-entry-card__body">
            <h3>班级排号</h3>
            <p>管理学生排队、呼叫和完成状态</p>
          </div>
          <div class="tool-entry-card__actions">
            <el-button type="primary" size="large" @click="openTeacherDialog">
              <el-icon><ArrowRight /></el-icon>
              进入教师端
            </el-button>
            <div class="tool-entry-card__secondary">
              <el-button text @click="openCreateDialog">
                <el-icon><Plus /></el-icon>
                创建班级房间
              </el-button>
              <el-button text @click="openTeacherDialog">管理已有房间</el-button>
            </div>
          </div>
        </article>

        <article class="tool-entry-card tool-entry-card--countdown">
          <div class="tool-entry-card__icon tool-entry-card__icon--time" aria-hidden="true">
            <el-icon><Clock /></el-icon>
          </div>
          <div class="tool-entry-card__body">
            <h3>考试倒计时</h3>
            <p>立即开始或预约考试计时</p>
          </div>
          <div class="tool-entry-card__actions">
            <RouterLink custom :to="{ name: 'exam-countdown-start' }" v-slot="{ navigate }">
              <el-button type="primary" size="large" @click="navigate">
                <el-icon><Clock /></el-icon>
                立即开始
              </el-button>
            </RouterLink>
            <RouterLink custom :to="{ name: 'exam-countdown-manage' }" v-slot="{ navigate }">
              <el-button text class="countdown-secondary-action" @click="navigate">
                <el-icon><Calendar /></el-icon>
                预约 / 管理
              </el-button>
            </RouterLink>
          </div>
        </article>
      </section>

      <aside class="student-join-panel" aria-labelledby="student-join-title">
        <div class="student-join-panel__header">
          <div class="student-join-panel__icon" aria-hidden="true">
            <el-icon><UserFilled /></el-icon>
          </div>
          <div>
            <p>学生加入</p>
            <h2 id="student-join-title">输入排队码</h2>
          </div>
        </div>

        <el-form class="student-join-form" label-position="top" @submit.prevent="enterStudentRoom">
          <el-form-item label="排队码">
            <el-input
              id="student-join-code"
              v-model="studentJoinCode"
              autocomplete="off"
              maxlength="8"
              placeholder="请输入老师提供的排队码"
              size="large"
              @input="studentJoinCode = normalizeStudentJoinCode(studentJoinCode)"
            />
          </el-form-item>
          <el-button :loading="isEnteringStudentRoom" native-type="submit" size="large" type="primary">
            进入学生端
          </el-button>
        </el-form>

        <el-alert
          v-if="notice?.scope === 'student'"
          class="entry-notice"
          :closable="false"
          show-icon
          :title="notice.text"
          :type="notice.kind"
        />
      </aside>
    </section>

    <el-dialog v-model="createDialogVisible" title="创建班级房间" width="min(560px, calc(100vw - 32px))">
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
          创建班级房间
        </el-button>

        <el-alert
          v-if="createdRoom"
          class="room-result"
          :closable="false"
          show-icon
          title="班级房间创建成功"
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

        <el-alert
          v-if="notice?.scope === 'create'"
          class="entry-notice"
          :closable="false"
          show-icon
          :title="notice.text"
          :type="notice.kind"
        />
      </el-form>
    </el-dialog>

    <el-dialog v-model="teacherDialogVisible" title="进入教师端" width="min(520px, calc(100vw - 32px))">
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

        <el-alert
          v-if="notice?.scope === 'teacher'"
          class="entry-notice"
          :closable="false"
          show-icon
          :title="notice.text"
          :type="notice.kind"
        />
      </el-form>
    </el-dialog>
  </main>
</template>
