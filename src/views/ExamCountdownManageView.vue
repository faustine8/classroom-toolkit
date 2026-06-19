<script setup lang="ts">
import { Clock } from '@element-plus/icons-vue';
import AppHero from '@/components/AppHero.vue';
import AppTopNav from '@/components/AppTopNav.vue';
</script>

<template>
  <main class="page countdown-page">
    <AppTopNav />

    <AppHero
      compact
      eyebrow="考试倒计时"
      title="考试安排"
      subtitle="预约考试计时、查看即将开始的考试。完整能力会在后续版本补齐。"
    >
      <template #actions>
        <RouterLink custom :to="{ name: 'exam-countdown-start' }" v-slot="{ navigate }">
          <el-button type="primary" @click="navigate">
            <el-icon><Clock /></el-icon>
            立即开始
          </el-button>
        </RouterLink>
      </template>
    </AppHero>

    <section class="countdown-shell" aria-labelledby="countdown-manage-title">
      <el-card class="section-card countdown-setup-card" shadow="never">
        <template #header>
          <div class="card-header">
            <p>预约 / 管理</p>
            <h2 id="countdown-manage-title">考试倒计时安排</h2>
          </div>
        </template>

        <div class="empty-state">
          <span aria-hidden="true">00:00</span>
          <h3>还没有考试安排</h3>
          <p>后续会在这里预约考试时间、查看即将开始的倒计时，并进入对应考试。</p>
        </div>
      </el-card>

      <aside class="placeholder-note placeholder-note--warning" aria-label="功能说明">
        <strong>先保留入口</strong>
        <p>当前版本不新增数据模型和后端接口，避免影响现有班级排号流程。</p>
      </aside>
    </section>
  </main>
</template>
