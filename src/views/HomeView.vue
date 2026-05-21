<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import {
  getRememberedTeacherPin,
  normalizeTeacherPin,
  rememberTeacherPinAuthorization
} from '@/features/recitation/teacherPinAuth';
import { createRoom, getRoom, normalizeSessionCode, verifyTeacherPin } from '@/services/cloudbaseService';
import { getErrorMessage } from '@/utils/errorMessage';

type JoinRole = 'student' | 'teacher';
type NoticeKind = 'success' | 'warning' | 'info';

const router = useRouter();
const roomTitle = ref('');
const joinCode = ref('');
const teacherPin = ref('');
const joinRole = ref<JoinRole>('student');
const isCreating = ref(false);
const isJoining = ref(false);
const notice = ref<{ kind: NoticeKind; text: string } | null>(null);

function showNotice(kind: NoticeKind, text: string) {
  notice.value = { kind, text };
}

async function createRecitationRoom() {
  if (isCreating.value) {
    return;
  }

  isCreating.value = true;
  notice.value = null;

  try {
    const room = await createRoom(roomTitle.value);
    rememberTeacherPinAuthorization(room.sessionCode, room.teacherPin);
    showNotice('success', `房间 ${room.sessionCode} 已创建`);
    await router.push({ name: 'recitation-teacher', params: { sessionCode: room.sessionCode } });
  } catch (error) {
    showNotice('warning', getErrorMessage(error));
  } finally {
    isCreating.value = false;
  }
}

async function joinRecitationRoom() {
  if (isJoining.value) {
    return;
  }

  const sessionCode = normalizeSessionCode(joinCode.value);

  if (!sessionCode) {
    showNotice('warning', '请输入房间码');
    return;
  }

  isJoining.value = true;
  notice.value = null;

  try {
    const room = await getRoom(sessionCode);

    if (!room) {
      showNotice('warning', `未找到房间 ${sessionCode}`);
      return;
    }

    if (joinRole.value === 'teacher') {
      const normalizedTeacherPin = normalizeTeacherPin(teacherPin.value) || getRememberedTeacherPin(sessionCode);

      if (!normalizedTeacherPin) {
        showNotice('warning', '请输入老师 PIN');
        return;
      }

      const pinMatched = await verifyTeacherPin(sessionCode, normalizedTeacherPin);

      if (!pinMatched) {
        showNotice('warning', '老师 PIN 不正确');
        return;
      }

      rememberTeacherPinAuthorization(sessionCode, normalizedTeacherPin);
    }

    await router.push({
      name: joinRole.value === 'teacher' ? 'recitation-teacher' : 'recitation-student',
      params: { sessionCode: room.sessionCode }
    });
  } catch (error) {
    showNotice('warning', getErrorMessage(error));
  } finally {
    isJoining.value = false;
  }
}
</script>

<template>
  <main class="page home-page">
    <section class="home-hero">
      <div>
        <p class="eyebrow">Classroom Toolkit</p>
        <h1>课堂工具集</h1>
        <p class="hero-copy">创建背书房间后，老师端和学生端通过 CloudBase 实时同步队列。</p>
      </div>
    </section>

    <section class="room-entry-grid" aria-label="背书排号房间入口">
      <form class="create-panel" @submit.prevent="createRecitationRoom">
        <span class="tool-card__tag">创建房间</span>
        <h2>背书排号</h2>
        <label for="room-title">标题</label>
        <input
          id="room-title"
          v-model="roomTitle"
          autocomplete="off"
          placeholder="例如：五年级一班 古诗背诵"
          type="text"
        />
        <button class="button button--primary" :disabled="isCreating" type="submit">
          {{ isCreating ? '创建中...' : '创建并进入老师端' }}
        </button>
      </form>

      <form class="create-panel" @submit.prevent="joinRecitationRoom">
        <span class="tool-card__tag">加入房间</span>
        <h2>输入房间码</h2>
        <label for="join-code">Session Code</label>
        <input
          id="join-code"
          v-model="joinCode"
          autocomplete="off"
          maxlength="4"
          placeholder="A7K2"
          type="text"
          @input="joinCode = normalizeSessionCode(joinCode)"
        />

        <div class="role-toggle" aria-label="选择进入端">
          <label>
            <input v-model="joinRole" name="join-role" type="radio" value="student" />
            学生端
          </label>
          <label>
            <input v-model="joinRole" name="join-role" type="radio" value="teacher" />
            老师端
          </label>
        </div>

        <template v-if="joinRole === 'teacher'">
          <label for="teacher-pin">老师 PIN</label>
          <input
            id="teacher-pin"
            v-model="teacherPin"
            autocomplete="off"
            inputmode="numeric"
            placeholder="创建房间时生成的 PIN"
            type="password"
          />
        </template>

        <button class="button button--secondary" :disabled="isJoining" type="submit">
          {{ isJoining ? '进入中...' : '进入房间' }}
        </button>
      </form>
    </section>

    <div v-if="notice" class="notice" :class="`notice--${notice.kind}`" role="status">
      {{ notice.text }}
    </div>
  </main>
</template>
