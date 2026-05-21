<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { normalizeStudentNo } from '@/features/recitation/sessionLogic';
import { joinQueue, watchQueue, type QueueItem, type Room } from '@/services/cloudbaseService';
import { getErrorMessage } from '@/utils/errorMessage';

type NoticeKind = 'success' | 'warning' | 'info';

const route = useRoute();
const sessionCode = computed(() => String(route.params.sessionCode ?? '').toUpperCase());
const studentInput = ref('');
const ownStudentNo = ref('');
const room = ref<Room | null>(null);
const current = ref<QueueItem | null>(null);
const waiting = ref<QueueItem[]>([]);
const notice = ref<{ kind: NoticeKind; text: string } | null>(null);
const isJoining = ref(false);
const isWatching = ref(true);
let stopWatching: (() => void) | null = null;

const currentStudentNo = computed(() => current.value?.studentNo ?? room.value?.currentStudentNo ?? null);
const ownWaitingIndex = computed(() =>
  ownStudentNo.value ? waiting.value.findIndex((item) => item.studentNo === ownStudentNo.value) : -1
);
const peopleAhead = computed(() => {
  if (!ownStudentNo.value) {
    return null;
  }

  if (currentStudentNo.value === ownStudentNo.value) {
    return 0;
  }

  if (ownWaitingIndex.value < 0) {
    return null;
  }

  return ownWaitingIndex.value + (currentStudentNo.value ? 1 : 0);
});

const ownStatusText = computed(() => {
  if (!ownStudentNo.value) {
    return '输入学号后加入队列';
  }

  if (currentStudentNo.value === ownStudentNo.value) {
    return '已经叫到你了';
  }

  if (typeof peopleAhead.value === 'number') {
    return `你前面还有 ${peopleAhead.value} 人`;
  }

  return '你暂不在等待队列中';
});

function showNotice(kind: NoticeKind, text: string) {
  notice.value = { kind, text };
}

async function submitStudentNo() {
  if (isJoining.value) {
    return;
  }

  const normalizedStudentNo = normalizeStudentNo(studentInput.value);

  if (normalizedStudentNo === null) {
    showNotice('warning', '请输入有效的数字学号');
    return;
  }

  isJoining.value = true;
  notice.value = null;

  try {
    const item = await joinQueue(sessionCode.value, studentInput.value);
    ownStudentNo.value = item.studentNo;
    studentInput.value = item.studentNo;
    showNotice('success', `${item.studentNo} 号已加入等待队列`);
  } catch (error) {
    ownStudentNo.value = normalizedStudentNo;
    showNotice('warning', getErrorMessage(error));
  } finally {
    isJoining.value = false;
  }
}

onMounted(async () => {
  try {
    stopWatching = await watchQueue(
      sessionCode.value,
      (snapshot) => {
        room.value = snapshot.room;
        current.value = snapshot.current;
        waiting.value = snapshot.waiting;
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
});

onBeforeUnmount(() => {
  stopWatching?.();
});
</script>

<template>
  <main class="page run-page">
    <header class="page-header run-header">
      <div>
        <p class="eyebrow">学生端 · {{ sessionCode }}</p>
        <h1>{{ room?.title ?? '背书排号' }}</h1>
      </div>
      <div class="header-actions">
        <RouterLink class="button button--secondary" to="/">返回首页</RouterLink>
        <RouterLink class="button button--ghost" :to="{ name: 'recitation-teacher', params: { sessionCode } }">
          老师端
        </RouterLink>
      </div>
    </header>

    <section class="current-panel" :class="{ 'current-panel--empty': !currentStudentNo }" aria-live="polite">
      <p>当前叫到</p>
      <strong>{{ currentStudentNo ?? '等待老师叫号' }}</strong>
      <span v-if="currentStudentNo">学号</span>
    </section>

    <section class="student-join-panel">
      <form class="student-join-panel__form" @submit.prevent="submitStudentNo">
        <label for="student-no">我的学号</label>
        <input
          id="student-no"
          v-model="studentInput"
          autocomplete="off"
          inputmode="numeric"
          placeholder="例如：7"
          type="text"
        />
        <button class="button button--primary" :disabled="isJoining" type="submit">
          {{ isJoining ? '加入中...' : '加入队列' }}
        </button>
      </form>

      <div class="student-status" aria-live="polite">
        <span>排队状态</span>
        <strong>{{ ownStatusText }}</strong>
      </div>

      <div v-if="notice" class="notice" :class="`notice--${notice.kind}`" role="status">
        {{ notice.text }}
      </div>
    </section>

    <section class="dashboard-grid dashboard-grid--student">
      <article class="list-panel list-panel--queue">
        <header>
          <h2>当前队列</h2>
          <span>{{ waiting.length }} 人等待</span>
        </header>

        <ol v-if="waiting.length" class="queue-list">
          <li
            v-for="(student, index) in waiting"
            :key="student._id"
            :class="{ 'queue-list__item--self': student.studentNo === ownStudentNo }"
          >
            <span class="queue-index">{{ index + 1 }}</span>
            <strong>{{ student.studentNo }}</strong>
            <span class="queue-note">{{ student.studentNo === ownStudentNo ? '我' : '等待中' }}</span>
          </li>
        </ol>

        <p v-else class="empty-text">{{ isWatching ? '正在连接实时队列...' : '暂无等待学生' }}</p>
      </article>
    </section>
  </main>
</template>
