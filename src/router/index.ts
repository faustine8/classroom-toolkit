import { createRouter, createWebHashHistory } from 'vue-router';
import HomeView from '@/views/HomeView.vue';
import RecitationStudentView from '@/views/RecitationStudentView.vue';
import RecitationTeacherView from '@/views/RecitationTeacherView.vue';
import StudentEntryView from '@/views/StudentEntryView.vue';

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
      redirect: { name: 'home' }
    },
    {
      path: '/student',
      name: 'student-entry',
      component: StudentEntryView,
      meta: { title: '学生端' }
    },
    {
      path: '/student/:joinCode',
      name: 'recitation-student-join',
      component: RecitationStudentView,
      meta: { title: '学生端' }
    },
    {
      path: '/recitation/:sessionCode/student',
      name: 'recitation-student',
      component: RecitationStudentView,
      meta: { title: '学生端' }
    },
    {
      path: '/recitation/:sessionCode/teacher',
      name: 'recitation-teacher',
      component: RecitationTeacherView,
      meta: { title: '老师端' }
    }
  ]
});

router.afterEach((to) => {
  const routeTitle = typeof to.meta.title === 'string' ? `${to.meta.title} - 课堂工具集` : '课堂工具集';
  document.title = routeTitle;
});
