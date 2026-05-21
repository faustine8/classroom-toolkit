<template>
  <main class="page home-page">
    <section class="home-hero">
      <div>
        <p class="eyebrow">Classroom Toolkit</p>
        <h1>课堂工具集</h1>
        <p class="hero-copy">面向教室大屏的轻量课堂辅助工具。</p>
      </div>
    </section>

    <section class="tool-grid" aria-label="可用工具">
      <RouterLink class="tool-card" to="/recitation">
        <span class="tool-card__tag">当前可用</span>
        <h2>背书排号</h2>
        <p>学生输入学号排队，老师按快捷键完成、跳过和叫下一位。</p>
        <span class="tool-card__action">进入工具</span>
      </RouterLink>
    </section>
  </main>
</template>
