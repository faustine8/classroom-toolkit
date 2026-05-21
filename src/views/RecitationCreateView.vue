<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useClassroomStore } from '@/stores/classroomStore';

const router = useRouter();
const classroomStore = useClassroomStore();
const title = ref('');

function createSession() {
  const sessionId = classroomStore.createSession(title.value);

  if (sessionId) {
    router.push({ name: 'recitation-run', params: { sessionId } });
  }
}

function continueActiveSession() {
  const session = classroomStore.getActiveSession();

  if (session) {
    router.push({ name: 'recitation-run', params: { sessionId: session.id } });
  }
}
</script>

<template>
  <main class="page create-page">
    <header class="page-header">
      <div>
        <p class="eyebrow">背书排号</p>
        <h1>创建课堂</h1>
      </div>
      <RouterLink class="button button--secondary" to="/">返回首页</RouterLink>
    </header>

    <form class="create-panel" @submit.prevent="createSession">
      <label for="session-title">课堂标题</label>
      <input
        id="session-title"
        v-model="title"
        autocomplete="off"
        autofocus
        placeholder="例如：三年级一班 古诗背诵"
        type="text"
      />

      <div v-if="classroomStore.notice" class="notice" :class="`notice--${classroomStore.notice.kind}`">
        {{ classroomStore.notice.text }}
      </div>

      <div class="create-actions">
        <button class="button button--primary" type="submit">创建并进入</button>
        <button
          v-if="classroomStore.getActiveSession()"
          class="button button--secondary"
          type="button"
          @click="continueActiveSession"
        >
          继续当前课堂
        </button>
      </div>
    </form>
  </main>
</template>
