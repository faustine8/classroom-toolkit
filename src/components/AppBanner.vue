<template>
  <header class="app-banner" aria-label="班级横幅">
    <h1>{{ bannerTitle }}</h1>
  </header>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { APP_WELCOME_TITLE, currentRoom, formatRoomTitle } from '@/features/recitation/room';

const route = useRoute();
const isRoomRoute = computed(() => route.name === 'recitation-student' || route.name === 'recitation-teacher');
const bannerTitle = computed(() =>
  isRoomRoute.value && currentRoom.roomCode ? formatRoomTitle(currentRoom) : APP_WELCOME_TITLE
);
</script>

<style scoped>
.app-banner {
  position: relative;
  display: grid;
  place-items: center;
  width: 100%;
  min-width: 0;
  height: var(--app-banner-height);
  overflow: hidden;
  background-image: url("/banner/luoxiaohei-banner.png");
  background-position: center;
  background-size: cover;
}

.app-banner::before {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.28);
  content: "";
}

.app-banner h1 {
  position: relative;
  z-index: 1;
  max-width: calc(100% - 32px);
  margin: 0;
  color: #fffdf7;
  font-size: clamp(2rem, 4.2vw, 3.8rem);
  font-weight: 900;
  letter-spacing: 0.08em;
  line-height: 1.12;
  text-align: center;
  text-shadow:
    0 3px 10px rgba(0, 0, 0, 0.58),
    0 1px 2px rgba(0, 0, 0, 0.88);
}

@media (max-width: 640px) {
  .app-banner h1 {
    max-width: calc(100% - 24px);
    font-size: clamp(1.7rem, 8vw, 2.5rem);
    letter-spacing: 0.05em;
  }
}
</style>
