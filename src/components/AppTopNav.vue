<script setup lang="ts">
import { computed, nextTick } from 'vue';
import { useRoute, useRouter } from 'vue-router';

const route = useRoute();
const router = useRouter();

const isHome = computed(() => route.name === 'home');
const isCountdown = computed(() => String(route.name ?? '').startsWith('exam-countdown'));

async function goHome() {
  await router.push({ name: 'home' });
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function goRecitationTools() {
  await router.push({ name: 'home' });
  await nextTick();
  document.getElementById('teacher-workbench')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
</script>

<template>
  <header class="top-nav" aria-label="主导航">
    <button class="top-nav__brand" type="button" @click="goHome">Classroom Toolkit</button>

    <nav class="top-nav__links" aria-label="课堂工具">
      <button class="top-nav__link" :class="{ 'top-nav__link--active': isHome }" type="button" @click="goHome">
        首页
      </button>
      <button class="top-nav__link" type="button" @click="goRecitationTools">
        班级排号
      </button>
      <RouterLink
        class="top-nav__link"
        :class="{ 'top-nav__link--active': isCountdown }"
        :to="{ name: 'exam-countdown-start' }"
      >
        考试倒计时
      </RouterLink>
    </nav>
  </header>
</template>
