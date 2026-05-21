<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import {
  getRememberedTeacherPin,
  normalizeTeacherPin,
  rememberTeacherPinAuthorization
} from '@/features/recitation/teacherPinAuth';
import {
  callNext,
  clearQueue,
  markDone,
  normalizeSessionCode,
  removeQueueItem,
  repeatCall,
  verifyTeacherPin,
  watchQueue,
  type QueueItem,
  type Room
} from '@/services/cloudbaseService';
import { getErrorMessage } from '@/utils/errorMessage';

type NoticeKind = 'success' | 'warning' | 'info';

const route = useRoute();
const sessionCode = computed(() => normalizeSessionCode(String(route.params.sessionCode ?? '')));
const room = ref<Room | null>(null);
const current = ref<QueueItem | null>(null);
const waiting = ref<QueueItem[]>([]);
const completedQueue = ref<QueueItem[]>([]);
const notice = ref<{ kind: NoticeKind; text: string } | null>(null);
const isBusy = ref(false);
const isWatching = ref(false);
const teacherPinInput = ref('');
const isTeacherAuthorized = ref(false);
let stopWatching: (() => void) | null = null;

const currentStudentNo = computed(() => current.value?.studentNo ?? room.value?.currentStudentNo ?? null);

function showNotice(kind: NoticeKind, text: string) {
  notice.value = { kind, text };
}

async function runAction(action: () => Promise<void>) {
  if (!isTeacherAuthorized.value) {
    showNotice('warning', '请先验证老师 PIN');
    return;
  }

  if (isBusy.value) {
    return;
  }

  isBusy.value = true;
  notice.value = null;

  try {
    await action();
  } catch (error) {
    showNotice('warning', getErrorMessage(error));
  } finally {
    isBusy.value = false;
  }
}

async function startWatching() {
  if (stopWatching) {
    return;
  }

  isWatching.value = true;

  try {
    stopWatching = await watchQueue(
      sessionCode.value,
      (snapshot) => {
        room.value = snapshot.room;
        current.value = snapshot.current;
        waiting.value = snapshot.waiting;
        completedQueue.value = snapshot.completedQueue;
        isWatching.value = false;
      },
      (error) => {
        isWatching.value = false;
        showNotice('warning', getErrorMessage(error));
      }
    );
  } catch (error) {
    isWatching.value = false;
    showNotice('warning', getErrorMessage(error));
  }
}

async function authorizeTeacher() {
  if (isBusy.value) {
    return;
  }

  const normalizedTeacherPin = normalizeTeacherPin(teacherPinInput.value);

  if (!normalizedTeacherPin) {
    showNotice('warning', '请输入老师 PIN');
    return;
  }

  isBusy.value = true;
  notice.value = null;

  try {
    const pinMatched = await verifyTeacherPin(sessionCode.value, normalizedTeacherPin);

    if (!pinMatched) {
      showNotice('warning', '老师 PIN 不正确');
      return;
    }

    isTeacherAuthorized.value = true;
    rememberTeacherPinAuthorization(sessionCode.value, normalizedTeacherPin);
    showNotice('success', '老师 PIN 已验证');
    await startWatching();
  } catch (error) {
    showNotice('warning', getErrorMessage(error));
  } finally {
    isBusy.value = false;
  }
}

async function handleCallNext() {
  await runAction(async () => {
    const next = await callNext(sessionCode.value);
    showNotice('info', `请 ${next.studentNo} 号开始背书`);
  });
}

async function handleMarkDone() {
  await runAction(async () => {
    if (!current.value) {
      showNotice('warning', '当前没有正在背书的学生');
      return;
    }

    const done = await markDone(sessionCode.value, current.value._id);
    showNotice('success', `${done.studentNo} 号已完成`);
  });
}

async function handleRepeatCall() {
  await runAction(async () => {
    if (!currentStudentNo.value) {
      showNotice('warning', '当前没有正在背书的学生');
      return;
    }

    await repeatCall(sessionCode.value);
    showNotice('info', `已重复呼叫 ${currentStudentNo.value} 号`);
  });
}

async function handleRemove(item: QueueItem) {
  await runAction(async () => {
    const removed = await removeQueueItem(item._id);
    showNotice('info', `${removed.studentNo} 号已移除`);
  });
}

async function handleClearQueue() {
  const confirmed = window.confirm('确定要清空等待队列并移除当前叫到的学生吗？');

  if (!confirmed) {
    return;
  }

  await runAction(async () => {
    await clearQueue(sessionCode.value);
    showNotice('info', '等待队列已清空');
  });
}

onMounted(async () => {
  const rememberedTeacherPin = getRememberedTeacherPin(sessionCode.value);

  if (rememberedTeacherPin) {
    teacherPinInput.value = rememberedTeacherPin;
    await authorizeTeacher();
  }
});

onBeforeUnmount(() => {
  stopWatching?.();
});
</script>

<template>
  <main class="page run-page">
    <header class="page-header run-header">
      <div>
        <p class="eyebrow">老师端 · {{ sessionCode }}</p>
        <h1>{{ room?.title ?? '背书排号' }}</h1>
      </div>
      <div class="header-actions">
        <RouterLink class="button button--secondary" to="/">返回首页</RouterLink>
        <RouterLink class="button button--ghost" :to="{ name: 'recitation-student', params: { sessionCode } }">
          学生端
        </RouterLink>
      </div>
    </header>

    <section v-if="!isTeacherAuthorized" class="teacher-auth-panel">
      <form class="student-join-panel__form" @submit.prevent="authorizeTeacher">
        <label for="teacher-pin">老师 PIN</label>
        <input
          id="teacher-pin"
          v-model="teacherPinInput"
          autocomplete="off"
          autofocus
          inputmode="numeric"
          placeholder="输入创建房间时生成的 PIN"
          type="password"
        />
        <button class="button button--primary" :disabled="isBusy" type="submit">
          {{ isBusy ? '验证中...' : '进入管理' }}
        </button>
      </form>

      <div v-if="notice" class="notice" :class="`notice--${notice.kind}`" role="status">
        {{ notice.text }}
      </div>
    </section>

    <template v-else>
    <section class="current-panel" :class="{ 'current-panel--empty': !currentStudentNo }" aria-live="polite">
      <p>当前正在背书</p>
      <strong>{{ currentStudentNo ?? '等待叫号' }}</strong>
      <span v-if="currentStudentNo">学号</span>
    </section>

    <section class="operator-panel teacher-operator-panel">
      <div class="input-display">
        <span>房间码</span>
        <strong>{{ sessionCode }}</strong>
        <span v-if="teacherPinInput">老师 PIN：{{ teacherPinInput }}</span>
      </div>

      <div class="primary-actions">
        <button class="button button--primary" :disabled="isBusy" type="button" @click="handleCallNext">下一位</button>
        <button class="button button--secondary" :disabled="isBusy || !currentStudentNo" type="button" @click="handleRepeatCall">
          重复呼叫
        </button>
        <button class="button button--success" :disabled="isBusy || !current" type="button" @click="handleMarkDone">
          通过/完成
        </button>
        <button v-if="current" class="button button--warning" :disabled="isBusy" type="button" @click="handleRemove(current)">
          移除当前
        </button>
        <button class="button button--danger" :disabled="isBusy" type="button" @click="handleClearQueue">清空队列</button>
      </div>

      <div v-if="notice" class="notice" :class="`notice--${notice.kind}`" role="status">
        {{ notice.text }}
      </div>
    </section>

    <section class="dashboard-grid dashboard-grid--teacher">
      <article class="list-panel list-panel--queue">
        <header>
          <h2>等待队列</h2>
          <span>{{ waiting.length }} 人</span>
        </header>

        <ol v-if="waiting.length" class="queue-list">
          <li v-for="(student, index) in waiting" :key="student._id">
            <span class="queue-index">{{ index + 1 }}</span>
            <strong>{{ student.studentNo }}</strong>
            <button type="button" @click="handleRemove(student)">删除</button>
          </li>
        </ol>

        <p v-else class="empty-text">{{ isWatching ? '正在连接实时队列...' : '暂无等待学生' }}</p>
      </article>

      <article class="list-panel list-panel--completed">
        <header>
          <h2>已通过</h2>
          <span>{{ completedQueue.length }} 人</span>
        </header>

        <ol v-if="completedQueue.length" class="queue-list completed-list">
          <li v-for="(student, index) in completedQueue" :key="student._id">
            <span class="queue-index">{{ index + 1 }}</span>
            <strong>{{ student.studentNo }}</strong>
          </li>
        </ol>

        <p v-else class="empty-text">暂无已通过学生</p>
      </article>
    </section>
    </template>
  </main>
</template>
