<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { setCurrentRoom } from '@/features/recitation/room';
import { getRoom, normalizeSessionCode } from '@/services/cloudbaseService';
import { getErrorMessage } from '@/utils/errorMessage';

type NoticeKind = 'success' | 'warning' | 'info';

const route = useRoute();
const router = useRouter();
const roomCodeInput = ref('');
const isEntering = ref(false);
const notice = ref<{ kind: NoticeKind; text: string } | null>(null);

function showNotice(kind: NoticeKind, text: string) {
  notice.value = { kind, text };
}

async function enterStudentRoom(roomCodeValue = roomCodeInput.value) {
  if (isEntering.value) {
    return;
  }

  const sessionCode = normalizeSessionCode(roomCodeValue);

  if (!sessionCode) {
    showNotice('warning', '请输入房间码');
    return;
  }

  isEntering.value = true;
  notice.value = null;

  try {
    const room = await getRoom(sessionCode);

    if (!room) {
      showNotice('warning', '未找到该房间');
      return;
    }

    setCurrentRoom(room);
    await router.push({ name: 'recitation-student', params: { sessionCode: room.sessionCode } });
  } catch (error) {
    showNotice('warning', getErrorMessage(error));
  } finally {
    isEntering.value = false;
  }
}

onMounted(() => {
  const queryRoomCode = typeof route.query.roomCode === 'string' ? route.query.roomCode : '';
  const normalizedRoomCode = normalizeSessionCode(queryRoomCode);

  if (!normalizedRoomCode) {
    return;
  }

  roomCodeInput.value = normalizedRoomCode;
  void enterStudentRoom(normalizedRoomCode);
});
</script>

<template>
  <main class="page student-entry-page">
    <section class="create-panel student-entry-panel">
      <p class="eyebrow">学生端</p>
      <h1>欢迎使用博雅背诵排号</h1>

      <form class="student-entry-form" @submit.prevent="enterStudentRoom()">
        <label for="student-entry-room-code">请输入房间码</label>
        <input
          id="student-entry-room-code"
          v-model="roomCodeInput"
          autocomplete="off"
          maxlength="8"
          placeholder="请输入房间码"
          type="text"
          @input="roomCodeInput = normalizeSessionCode(roomCodeInput)"
        />
        <button class="button button--primary" :disabled="isEntering" type="submit">
          {{ isEntering ? '进入中...' : '进入房间' }}
        </button>
      </form>

      <div v-if="notice" class="notice" :class="`notice--${notice.kind}`" role="status">
        {{ notice.text }}
      </div>
    </section>
  </main>
</template>
