import { createRouter, createWebHashHistory } from 'vue-router';
import HomeView from '@/views/HomeView.vue';
import RecitationCreateView from '@/views/RecitationCreateView.vue';
import RecitationRunView from '@/views/RecitationRunView.vue';

export const router = createRouter({
  history: createWebHashHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      component: HomeView
    },
    {
      path: '/recitation',
      name: 'recitation-create',
      component: RecitationCreateView
    },
    {
      path: '/recitation/:sessionId',
      name: 'recitation-run',
      component: RecitationRunView
    }
  ]
});

router.afterEach((to) => {
  const routeTitle = typeof to.meta.title === 'string' ? `${to.meta.title} - 课堂工具集` : '课堂工具集';
  document.title = routeTitle;
});
