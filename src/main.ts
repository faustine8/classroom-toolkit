import { createApp } from 'vue';
import { createPinia } from 'pinia';
import ElementPlus from 'element-plus';
import 'element-plus/dist/index.css';
import App from './App.vue';
import { router } from './router';
import { useClassroomStore } from './stores/classroomStore';
import './assets/styles.css';

const app = createApp(App);
const pinia = createPinia();

app.use(pinia);
app.use(ElementPlus);

const classroomStore = useClassroomStore(pinia);
classroomStore.hydrate();

app.use(router);

router.isReady().then(() => {
  app.mount('#app');
});
