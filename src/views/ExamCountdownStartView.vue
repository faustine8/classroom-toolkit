<script setup lang="ts">
import { Calendar, Clock } from '@element-plus/icons-vue';
import AppHero from '@/components/AppHero.vue';
import AppTopNav from '@/components/AppTopNav.vue';
</script>

<template>
  <main class="page countdown-page">
    <AppTopNav />

    <AppHero
      compact
      eyebrow="考试倒计时"
      title="准备考试倒计时"
      subtitle="先设置考试名称和时长，倒计时能力会在后续版本接入。"
    >
      <template #actions>
        <RouterLink custom :to="{ name: 'exam-countdown-manage' }" v-slot="{ navigate }">
          <el-button @click="navigate">
            <el-icon><Calendar /></el-icon>
            预约 / 管理
          </el-button>
        </RouterLink>
      </template>
    </AppHero>

    <section class="countdown-shell" aria-labelledby="countdown-start-title">
      <el-card class="section-card countdown-setup-card" shadow="never">
        <template #header>
          <div class="card-header">
            <p>快速设置</p>
            <h2 id="countdown-start-title">立即开始考试计时</h2>
          </div>
        </template>

        <el-form class="countdown-form" label-position="top">
          <el-form-item label="考试名称">
            <el-input placeholder="例如：语文单元检测" size="large" disabled />
          </el-form-item>
          <el-form-item label="考试时长">
            <el-input placeholder="例如：45 分钟" size="large" disabled />
          </el-form-item>
          <el-button type="primary" size="large" disabled>
            <el-icon><Clock /></el-icon>
            开始计时
          </el-button>
        </el-form>
      </el-card>

      <aside class="placeholder-note" aria-label="功能说明">
        <strong>页面骨架已就位</strong>
        <p>这里暂时只提供入口和设置区域，不保存考试安排，也不连接新的后端数据。</p>
      </aside>
    </section>
  </main>
</template>
