<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { getBufferAfterSubmit } from '@/features/recitation/inputBuffer';
import { useClassroomStore } from '@/stores/classroomStore';

const route = useRoute();
const classroomStore = useClassroomStore();
const inputBuffer = ref('');

const sessionId = computed(() => String(route.params.sessionId ?? ''));
const session = computed(() => classroomStore.getSession(sessionId.value));
const currentStudent = computed(() => session.value?.currentStudent ?? null);
const queue = computed(() => session.value?.queue ?? []);
const finishedStudents = computed(() => session.value?.finishedStudents ?? []);
const skippedStudents = computed(() => session.value?.skippedStudents ?? []);

function appendDigit(digit: string) {
  inputBuffer.value += digit;
}

function removeLastDigit() {
  inputBuffer.value = inputBuffer.value.slice(0, -1);
}

function submitBuffer() {
  const result = classroomStore.addStudent(inputBuffer.value);
  inputBuffer.value = getBufferAfterSubmit(inputBuffer.value, result);
}

function finishAndNext() {
  classroomStore.finishAndNext();
}

function skipAndNext() {
  classroomStore.skipAndNext();
}

function resetCurrentSession() {
  const confirmed = window.confirm('确定要重置当前课堂数据吗？当前学生、等待队列、已完成和已跳过列表都会清空。');

  if (confirmed) {
    classroomStore.resetSession(sessionId.value);
    inputBuffer.value = '';
  }
}

function removeFromQueue(studentNo: string) {
  classroomStore.removeFromQueue(studentNo);
}

function handleKeydown(event: KeyboardEvent) {
  if (event.ctrlKey || event.metaKey || event.altKey) {
    return;
  }

  if (/^\d$/.test(event.key)) {
    event.preventDefault();
    appendDigit(event.key);
    return;
  }

  const key = event.key.toLowerCase();

  if (['enter', 'f', 's', 'r'].includes(key) && event.repeat) {
    return;
  }

  if (key === 'backspace') {
    event.preventDefault();
    removeLastDigit();
    return;
  }

  if (key === 'enter') {
    event.preventDefault();
    submitBuffer();
    return;
  }

  if (key === 'f') {
    event.preventDefault();
    finishAndNext();
    return;
  }

  if (key === 's') {
    event.preventDefault();
    skipAndNext();
    return;
  }

  if (key === 'r') {
    event.preventDefault();
    resetCurrentSession();
  }
}

watch(
  sessionId,
  (nextSessionId) => {
    if (nextSessionId) {
      classroomStore.setActiveSession(nextSessionId);
    }
  },
  { immediate: true }
);

onMounted(() => {
  window.addEventListener('keydown', handleKeydown);
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeydown);
});
</script>

<template>
  <main v-if="session" class="page run-page">
    <header class="page-header run-header">
      <div>
        <p class="eyebrow">背书排号</p>
        <h1>{{ session.title }}</h1>
      </div>
      <div class="header-actions">
        <RouterLink class="button button--secondary" to="/">返回首页</RouterLink>
        <RouterLink class="button button--ghost" to="/recitation">新建课堂</RouterLink>
      </div>
    </header>

    <section class="current-panel" :class="{ 'current-panel--empty': !currentStudent }" aria-live="polite">
      <p>当前正在背书</p>
      <strong>{{ currentStudent ? currentStudent.displayNo : '等待老师叫号' }}</strong>
      <span v-if="currentStudent">学号</span>
    </section>

    <section class="operator-panel">
      <div class="input-display">
        <span>当前输入</span>
        <strong>{{ inputBuffer || '无' }}</strong>
      </div>

      <div class="primary-actions">
        <button class="button button--primary" type="button" @click="submitBuffer">加入队列</button>
        <button class="button button--success" type="button" @click="finishAndNext">完成并下一位</button>
        <button class="button button--warning" type="button" @click="skipAndNext">跳过并下一位</button>
        <button class="button button--danger" type="button" @click="resetCurrentSession">重置课堂</button>
      </div>

      <div class="number-pad" aria-label="数字输入区">
        <button v-for="digit in ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0']" :key="digit" type="button" @click="appendDigit(digit)">
          {{ digit }}
        </button>
        <button type="button" @click="removeLastDigit">退格</button>
        <button type="button" @click="inputBuffer = ''">清空</button>
      </div>

      <div v-if="classroomStore.notice" class="notice" :class="`notice--${classroomStore.notice.kind}`" role="status">
        {{ classroomStore.notice.text }}
      </div>
    </section>

    <section class="dashboard-grid">
      <article class="list-panel list-panel--queue">
        <header>
          <h2>等待队列</h2>
          <span>{{ queue.length }} 人</span>
        </header>

        <ol v-if="queue.length" class="queue-list">
          <li v-for="(student, index) in queue" :key="`${student.studentNo}-${student.joinedAt}`">
            <span class="queue-index">{{ index + 1 }}</span>
            <strong>{{ student.displayNo }}</strong>
            <button type="button" @click="removeFromQueue(student.studentNo)">移除</button>
          </li>
        </ol>

        <p v-else class="empty-text">暂无等待学生</p>
      </article>

      <article class="list-panel">
        <header>
          <h2>已完成</h2>
          <span>{{ finishedStudents.length }} 人</span>
        </header>

        <div v-if="finishedStudents.length" class="student-chip-list">
          <span v-for="student in finishedStudents" :key="`${student.studentNo}-${student.joinedAt}-done`">
            {{ student.displayNo }}
          </span>
        </div>

        <p v-else class="empty-text">暂无记录</p>
      </article>

      <article class="list-panel">
        <header>
          <h2>已跳过</h2>
          <span>{{ skippedStudents.length }} 人</span>
        </header>

        <div v-if="skippedStudents.length" class="student-chip-list student-chip-list--skipped">
          <span v-for="student in skippedStudents" :key="`${student.studentNo}-${student.joinedAt}-skipped`">
            {{ student.displayNo }}
          </span>
        </div>

        <p v-else class="empty-text">暂无记录</p>
      </article>
    </section>

    <footer class="shortcut-bar" aria-label="快捷键提示">
      <span>数字键 输入学号</span>
      <span>Enter 加入队列</span>
      <span>F 完成并下一位</span>
      <span>S 跳过并下一位</span>
      <span>R 重置课堂</span>
    </footer>
  </main>

  <main v-else class="page not-found-page">
    <section class="create-panel">
      <p class="eyebrow">背书排号</p>
      <h1>未找到课堂</h1>
      <p>可能是链接失效，或本设备尚未保存该课堂。</p>
      <div class="create-actions">
        <RouterLink class="button button--primary" to="/recitation">创建课堂</RouterLink>
        <RouterLink class="button button--secondary" to="/">返回首页</RouterLink>
      </div>
    </section>
  </main>
</template>
