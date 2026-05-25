<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { setCurrentRoom } from '@/features/recitation/room';
import {
  getRoomByStudentJoinCode,
  normalizeStudentJoinCode
} from '@/services/cloudbaseService';
import { getErrorMessage } from '@/utils/errorMessage';

type NoticeKind = 'success' | 'warning' | 'info';

const route = useRoute();
const router = useRouter();
const joinCodeInput = ref('');
const isEntering = ref(false);
const notice = ref<{ kind: NoticeKind; text: string } | null>(null);

function showNotice(kind: NoticeKind, text: string) {
  notice.value = { kind, text };
}

async function enterStudentRoom(joinCodeValue = joinCodeInput.value) {
  if (isEntering.value) {
    return;
  }

  const joinCode = normalizeStudentJoinCode(joinCodeValue);

  if (!joinCode) {
    showNotice('warning', '请输入排队码');
    return;
  }

  isEntering.value = true;
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
    isEntering.value = false;
  }
}

onMounted(() => {
  const queryJoinCode = typeof route.query.joinCode === 'string' ? route.query.joinCode : '';
  const normalizedJoinCode = normalizeStudentJoinCode(queryJoinCode);

  if (!normalizedJoinCode) {
    return;
  }

  joinCodeInput.value = normalizedJoinCode;
  void enterStudentRoom(normalizedJoinCode);
});
</script>

<template>
  <main class="page student-entry-page">
    <section class="create-panel student-entry-panel">
      <p class="eyebrow">学生端</p>
      <h1>欢迎使用博雅背诵排号</h1>

      <form class="student-entry-form" @submit.prevent="enterStudentRoom()">
        <label for="student-entry-join-code">请输入排队码</label>
        <input
          id="student-entry-join-code"
          v-model="joinCodeInput"
          autocomplete="off"
          maxlength="8"
          placeholder="请输入排队码"
          type="text"
          @input="joinCodeInput = normalizeStudentJoinCode(joinCodeInput)"
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
