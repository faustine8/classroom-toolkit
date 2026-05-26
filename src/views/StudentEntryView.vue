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
    <el-card class="entry-card student-entry-card" shadow="never">
      <template #header>
        <div class="card-header">
          <el-tag effect="light">学生端</el-tag>
          <h1>欢迎使用博雅背诵排号</h1>
        </div>
      </template>

      <el-form label-position="top" @submit.prevent="enterStudentRoom()">
        <el-form-item label="请输入排队码">
          <el-input
            id="student-entry-join-code"
            v-model="joinCodeInput"
            autocomplete="off"
            maxlength="8"
            placeholder="请输入排队码"
            size="large"
            @input="joinCodeInput = normalizeStudentJoinCode(joinCodeInput)"
          />
        </el-form-item>
        <el-button :loading="isEntering" native-type="submit" size="large" type="primary">
          进入房间
        </el-button>
      </el-form>

      <el-alert
        v-if="notice"
        class="entry-notice"
        :closable="false"
        show-icon
        :title="notice.text"
        :type="notice.kind"
      />
    </el-card>
  </main>
</template>
