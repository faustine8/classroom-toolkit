<template>
  <section class="app-hero" :class="{ 'app-hero--compact': compact }" :aria-label="ariaLabel">
    <div class="app-hero__content">
      <div class="app-hero__text">
        <slot name="eyebrow">
          <p v-if="eyebrow" class="app-hero__eyebrow">{{ eyebrow }}</p>
        </slot>
        <h1>{{ title }}</h1>
        <p v-if="subtitle" class="app-hero__subtitle">{{ subtitle }}</p>
      </div>

      <div v-if="$slots.actions" class="app-hero__actions">
        <slot name="actions" />
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    title: string;
    subtitle?: string;
    eyebrow?: string;
    ariaLabel?: string;
    compact?: boolean;
  }>(),
  {
    subtitle: '',
    eyebrow: '',
    ariaLabel: '页面头图',
    compact: false
  }
);
</script>

<style scoped>
.app-hero {
  position: relative;
  isolation: isolate;
  display: flex;
  align-items: flex-end;
  min-height: 208px;
  margin-bottom: 28px;
  overflow: hidden;
  border-radius: 8px;
  background-image: url("/luoxiaohei-hero.png");
  background-position: center;
  background-repeat: no-repeat;
  background-size: cover;
  box-shadow: 0 18px 38px rgba(22, 33, 27, 0.12);
}

.app-hero--compact {
  min-height: 188px;
}

.app-hero::before {
  position: absolute;
  inset: 0;
  z-index: -1;
  background:
    linear-gradient(90deg, rgba(10, 17, 13, 0.74) 0%, rgba(10, 17, 13, 0.52) 48%, rgba(10, 17, 13, 0.32) 100%),
    rgba(0, 0, 0, 0.24);
  content: "";
}

.app-hero__content {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 24px;
  width: 100%;
  padding: 28px 32px;
}

.app-hero__text {
  min-width: 0;
}

.app-hero__eyebrow,
.app-hero__subtitle,
.app-hero h1 {
  margin: 0;
  color: #fffdf7;
  text-shadow: 0 2px 10px rgba(0, 0, 0, 0.58);
}

.app-hero__eyebrow {
  margin-bottom: 8px;
  font-size: clamp(0.95rem, 1.2vw, 1.15rem);
  font-weight: 900;
}

.app-hero h1 {
  max-width: 820px;
  font-size: clamp(2.2rem, 5vw, 4.4rem);
  line-height: 1.02;
}

.app-hero__subtitle {
  max-width: 760px;
  margin-top: 10px;
  font-size: clamp(1.05rem, 1.6vw, 1.35rem);
  font-weight: 700;
  line-height: 1.5;
}

.app-hero__actions {
  display: flex;
  flex: 0 0 auto;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 12px;
}

.app-hero__actions :deep(.button),
.app-hero__actions :deep(.el-button) {
  border-color: rgba(255, 255, 255, 0.64);
  background: rgba(255, 255, 255, 0.92);
  color: #173322;
  box-shadow: 0 10px 24px rgba(0, 0, 0, 0.16);
}

.app-hero__actions :deep(.button--primary),
.app-hero__actions :deep(.el-button--primary) {
  border-color: var(--el-color-primary);
  background: var(--el-color-primary);
  color: #ffffff;
}

@media (max-width: 760px) {
  .app-hero,
  .app-hero--compact {
    min-height: 152px;
  }

  .app-hero__content {
    flex-direction: column;
    align-items: stretch;
    gap: 16px;
    padding: 22px;
  }

  .app-hero h1 {
    font-size: clamp(1.8rem, 9vw, 2.8rem);
  }

  .app-hero__actions {
    justify-content: flex-start;
  }
}
</style>
