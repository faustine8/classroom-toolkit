<script setup lang="ts">
import { computed, h, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import AppHero from '@/components/AppHero.vue';
import {
  buildCompletionMatrix,
  CLASS_STUDENT_TOTAL,
  getCompletedStudentNumbers
} from '@/features/recitation/completionMatrix';
import { currentRoom, formatRoomTitle, setCurrentRoom } from '@/features/recitation/room';
import {
  getRememberedTeacherPin,
  normalizeTeacherPin,
  rememberTeacherPinAuthorization
} from '@/features/recitation/teacherPinAuth';
import {
  callNext,
  clearQueue,
  disableStudentJoin,
  enableStudentJoin,
  getRoom,
  markDone,
  normalizeSessionCode,
  prioritizeQueueItem,
  refreshStudentJoinCode,
  removeQueueItem,
  repeatCall,
  verifyTeacherPin,
  watchQueue,
  archiveCurrentTask,
  buildDefaultArchiveTaskName,
  listArchivedTasks,
  supplementArchiveTaskCompletion,
  type ArchivedTask,
  type QueueItem,
  type QueueStatus,
  type Room
} from '@/services/cloudbaseService';
import { getErrorMessage } from '@/utils/errorMessage';

type NoticeKind = 'success' | 'warning' | 'info' | 'error';

const route = useRoute();
const sessionCode = computed(() => normalizeSessionCode(String(route.params.sessionCode ?? '')));
const room = ref<Room | null>(null);
const current = ref<QueueItem | null>(null);
const waiting = ref<QueueItem[]>([]);
const completedQueue = ref<QueueItem[]>([]);
const notice = ref<{ kind: NoticeKind; text: string } | null>(null);
const isBusy = ref(false);
const isWatching = ref(false);
const teacherPinInput = ref('');
const roomInfoActiveNames = ref<string[]>([]);
const isTeacherAuthorized = ref(false);
const isArchiveDrawerOpen = ref(false);
const isArchiveHistoryLoading = ref(false);
const archivedTasks = ref<ArchivedTask[]>([]);
const archiveHistoryActiveNames = ref<string[]>([]);
let stopWatching: (() => void) | null = null;

const roomTitle = computed(() => formatRoomTitle(room.value ?? currentRoom));
const currentStudentNo = computed(() => current.value?.studentNo ?? room.value?.currentStudentNo ?? null);
const studentJoinCode = computed(() => room.value?.studentJoinCode ?? '');
const joinStatusText = computed(() => (room.value?.joinEnabled ? '排队已开放' : '排队未开放'));
const completedStudentNumbers = computed(() => getCompletedStudentNumbers(completedQueue.value));
const completedStudentCount = computed(() => completedStudentNumbers.value.size);
const incompleteStudentCount = computed(() => CLASS_STUDENT_TOTAL - completedStudentCount.value);
const matrixStudents = computed(() => buildCompletionMatrix(completedStudentNumbers.value));
const hasArchivableTaskData = computed(
  () => waiting.value.length > 0 || completedQueue.value.length > 0 || current.value !== null || currentStudentNo.value !== null
);

function showNotice(kind: NoticeKind, text: string) {
  notice.value = { kind, text };

  if (kind === 'success') {
    ElMessage.success(text);
    return;
  }

  if (kind === 'error') {
    ElMessage.error(text);
    return;
  }

  if (kind === 'warning') {
    ElMessage.warning(text);
    return;
  }

  ElMessage.info(text);
}

function formatQueueTime(value: string): string {
  if (!value) {
    return '-';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit'
  });
}

function formatArchiveTime(value: string): string {
  if (!value) {
    return '-';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  const pad = (part: number) => String(part).padStart(2, '0');

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(
    date.getMinutes()
  )}`;
}

function getArchiveTaskName(task: ArchivedTask): string {
  return task.taskName?.trim() || buildDefaultArchiveTaskName(task.archivedAt);
}

function formatUnfinishedStudents(task: ArchivedTask): string {
  if (task.unfinishedStudentNumbers.length === 0) {
    return '无';
  }

  return task.unfinishedStudentNumbers.map((studentNo) => `${studentNo}号`).join('、');
}

function buildArchivedCompletionMatrix(task: ArchivedTask) {
  const supplementNumbers = (task.supplementCompletedRecords || []).map((r) => Number(r.studentNumber));
  const allCompleted = new Set([...task.completedStudentNumbers.map(Number), ...supplementNumbers]);
  return buildCompletionMatrix(allCompleted);
}

function isSupplementCompleted(task: ArchivedTask, studentNo: number): boolean {
  return (task.supplementCompletedRecords || []).some(
    (record) => Number(record.studentNumber) === Number(studentNo)
  );
}

function getQueueStatusText(status: QueueStatus): string {
  if (status === 'current') {
    return '当前';
  }

  if (status === 'done') {
    return '已完成';
  }

  if (status === 'removed') {
    return '已移除';
  }

  return '等待中';
}

function getQueueStatusTagType(status: QueueStatus) {
  if (status === 'current') {
    return 'warning';
  }

  if (status === 'done') {
    return 'success';
  }

  if (status === 'removed') {
    return 'danger';
  }

  return 'info';
}

async function runAction(action: () => Promise<void>) {
  if (!isTeacherAuthorized.value) {
    showNotice('warning', '请先验证老师 PIN');
    return;
  }

  if (isBusy.value) {
    return;
  }

  isBusy.value = true;
  notice.value = null;

  try {
    await action();
  } catch (error) {
    showNotice('error', getErrorMessage(error));
  } finally {
    isBusy.value = false;
  }
}

async function startWatching() {
  if (stopWatching) {
    return;
  }

  isWatching.value = true;

  try {
    stopWatching = await watchQueue(
      sessionCode.value,
      (snapshot) => {
        room.value = snapshot.room;
        setCurrentRoom(snapshot.room);
        current.value = snapshot.current;
        waiting.value = snapshot.waiting;
        completedQueue.value = snapshot.completedQueue;
        isWatching.value = false;
      },
      (error) => {
        isWatching.value = false;
        showNotice('error', getErrorMessage(error));
      }
    );
  } catch (error) {
    isWatching.value = false;
    showNotice('error', getErrorMessage(error));
  }
}

async function authorizeTeacher() {
  if (isBusy.value) {
    return;
  }

  const normalizedTeacherPin = normalizeTeacherPin(teacherPinInput.value);

  if (!normalizedTeacherPin) {
    showNotice('warning', '请输入 PIN 码');
    return;
  }

  isBusy.value = true;
  notice.value = null;

  try {
    const targetRoom = await getRoom(sessionCode.value);

    if (!targetRoom) {
      showNotice('warning', '未找到该房间');
      return;
    }

    const pinMatched = await verifyTeacherPin(sessionCode.value, normalizedTeacherPin);

    if (!pinMatched) {
      showNotice('warning', '房间码或 PIN 不正确');
      return;
    }

    setCurrentRoom(targetRoom);
    isTeacherAuthorized.value = true;
    teacherPinInput.value = normalizedTeacherPin;
    rememberTeacherPinAuthorization(sessionCode.value, normalizedTeacherPin);
    showNotice('success', '老师 PIN 已验证');
    await startWatching();
  } catch (error) {
    showNotice('warning', getErrorMessage(error));
  } finally {
    isBusy.value = false;
  }
}

async function handleCopyRoomInfo() {
  const pinCode = normalizeTeacherPin(teacherPinInput.value);
  const text = `任务名：${roomTitle.value}
房间号：${sessionCode.value}
PIN 码：${pinCode}
排队码：${studentJoinCode.value}`;

  try {
    await navigator.clipboard.writeText(text);
    showNotice('success', '已复制房间信息');
  } catch {
    showNotice('error', '复制失败，请手动复制');
  }
}

function buildStudentEntryUrl(joinCode: string): string {
  if (typeof window === 'undefined') {
    return '';
  }

  return `${window.location.origin}${window.location.pathname}#/student?joinCode=${encodeURIComponent(joinCode)}`;
}

async function handleCopyStudentEntry() {
  if (!studentJoinCode.value || !room.value?.joinEnabled) {
    showNotice('warning', '请先开启本节课排队');
    return;
  }

  const text = buildStudentEntryUrl(studentJoinCode.value);

  try {
    await navigator.clipboard.writeText(text);
    showNotice('success', '已复制学生入口');
  } catch {
    showNotice('error', '复制失败，请手动复制学生入口');
  }
}

async function handleEnableStudentJoin() {
  await runAction(async () => {
    const updatedRoom = await enableStudentJoin(sessionCode.value);
    room.value = updatedRoom;
    setCurrentRoom(updatedRoom);
    showNotice('success', '本节课排队已开启');
  });
}

async function handleDisableStudentJoin() {
  await runAction(async () => {
    const updatedRoom = await disableStudentJoin(sessionCode.value);
    room.value = updatedRoom;
    setCurrentRoom(updatedRoom);
    showNotice('info', '排队已关闭');
  });
}

async function handleRefreshStudentJoinCode() {
  await runAction(async () => {
    const updatedRoom = await refreshStudentJoinCode(sessionCode.value);
    room.value = updatedRoom;
    setCurrentRoom(updatedRoom);
    showNotice('success', '学生入口已刷新');
  });
}

async function handleCallNext() {
  await runAction(async () => {
    const next = await callNext(sessionCode.value);
    showNotice('info', `请 ${next.studentNo} 号开始背书`);
  });
}

async function handleMarkDone() {
  await runAction(async () => {
    if (!current.value) {
      showNotice('warning', '当前没有正在背书的学生');
      return;
    }

    const done = await markDone(sessionCode.value, current.value._id);
    showNotice('success', `${done.studentNo} 号已完成`);
  });
}

async function handleRepeatCall() {
  await runAction(async () => {
    if (!currentStudentNo.value) {
      showNotice('warning', '当前没有正在背书的学生');
      return;
    }

    await repeatCall(sessionCode.value);
    showNotice('info', `已重复呼叫 ${currentStudentNo.value} 号`);
  });
}

async function handleRemove(item: QueueItem) {
  await runAction(async () => {
    const removed = await removeQueueItem(sessionCode.value, item._id);
    showNotice('success', `${removed.studentNo} 号已移除`);
  });
}

async function handlePrioritize(item: QueueItem) {
  await runAction(async () => {
    const prioritized = await prioritizeQueueItem(sessionCode.value, item._id);
    showNotice('success', `已将 ${prioritized.studentNo} 号排到最前`);
  });
}

async function handleClearQueue() {
  await runAction(async () => {
    await clearQueue(sessionCode.value);
    showNotice('success', '等待队列已清空');
  });
}

async function handleArchiveCurrentTask() {
  if (!hasArchivableTaskData.value) {
    showNotice('warning', '当前没有可归档的任务');
    return;
  }

  let taskName = '';

  try {
    const result = await ElMessageBox.prompt(
      h('div', { class: 'archive-task-prompt' }, [
        h('p', { class: 'archive-task-prompt__label' }, '任务名称'),
        h(
          'p',
          { class: 'archive-task-prompt__description' },
          '归档后，当前等待队列、当前叫号和已完成记录将被清空，用于开始下一轮背书任务。归档数据会保留，不会直接删除。'
        )
      ]),
      '确认归档当前任务？',
      {
        confirmButtonText: '确认归档',
        cancelButtonText: '取消',
        inputPlaceholder: '例如：第 12 课背诵 / 古诗两首 / 5月27日早读背诵',
        type: 'warning'
      }
    );
    taskName = result.value;
  } catch {
    return;
  }

  await runAction(async () => {
    const defaultTaskName = buildDefaultArchiveTaskName(new Date().toISOString());
    const finalTaskName = taskName.trim() || defaultTaskName;
    const archivedTask = await archiveCurrentTask(sessionCode.value, finalTaskName);
    archivedTasks.value = [archivedTask, ...archivedTasks.value.filter((task) => task.id !== archivedTask.id)];
    showNotice('success', `已归档当前任务，完成 ${archivedTask.completedCount} / ${CLASS_STUDENT_TOTAL} 人`);
  });
}

async function loadArchiveHistory() {
  if (!isTeacherAuthorized.value || isArchiveHistoryLoading.value) {
    return;
  }

  isArchiveHistoryLoading.value = true;

  try {
    archivedTasks.value = await listArchivedTasks(sessionCode.value);
  } catch (error) {
    showNotice('error', getErrorMessage(error));
  } finally {
    isArchiveHistoryLoading.value = false;
  }
}

async function handleOpenArchiveHistory() {
  isArchiveDrawerOpen.value = true;
  await loadArchiveHistory();
}

async function handleSupplementComplete(task: ArchivedTask, studentNo: number) {
  try {
    await ElMessageBox.confirm(
      `确认将 ${studentNo}号 标记为该任务已完成吗？`,
      '确认补标完成？',
      {
        confirmButtonText: '确认完成',
        cancelButtonText: '取消',
        type: 'warning'
      }
    );
  } catch {
    return;
  }

  await runAction(async () => {
    const updatedTask = await supplementArchiveTaskCompletion(
      sessionCode.value,
      task.id,
      studentNo
    );

    const index = archivedTasks.value.findIndex((t) => t.id === task.id);
    if (index !== -1) {
      archivedTasks.value[index] = updatedTask;
    }

    showNotice('success', `已将 ${studentNo}号 标记为完成`);
  });
}

onMounted(async () => {
  const rememberedTeacherPin = getRememberedTeacherPin(sessionCode.value);

  if (rememberedTeacherPin) {
    teacherPinInput.value = rememberedTeacherPin;
    await authorizeTeacher();
  }
});

onBeforeUnmount(() => {
  stopWatching?.();
});
</script>

<template>
  <main class="page run-page queue-page">
    <AppHero
      compact
      :eyebrow="`老师端 · ${sessionCode}`"
      :title="isTeacherAuthorized ? roomTitle : '教师管理'"
      :subtitle="isTeacherAuthorized ? '当前叫号与队列管理' : '请输入老师 PIN 后进入管理'"
    >
      <template #actions>
        <RouterLink custom to="/" v-slot="{ navigate }">
          <el-button @click="navigate">返回首页</el-button>
        </RouterLink>
        <RouterLink custom :to="{ name: 'student-entry' }" v-slot="{ navigate }">
          <el-button @click="navigate">学生端</el-button>
        </RouterLink>
      </template>
    </AppHero>

    <el-card class="section-card" shadow="never">
      <el-form v-if="!isTeacherAuthorized" class="join-form" label-position="top" @submit.prevent="authorizeTeacher">
        <el-form-item label="老师 PIN">
          <el-input
            id="teacher-pin"
            v-model="teacherPinInput"
            autocomplete="off"
            autofocus
            inputmode="numeric"
            maxlength="6"
            placeholder="输入创建房间时生成的 PIN"
            show-password
            size="large"
            type="password"
          />
        </el-form-item>
        <el-button :loading="isBusy" native-type="submit" size="large" type="primary">进入管理</el-button>
      </el-form>

      <template v-else>
        <el-space class="action-row" wrap>
          <el-tag :type="room?.joinEnabled ? 'success' : 'info'" effect="light">{{ joinStatusText }}</el-tag>
          <el-button type="success" :disabled="isBusy" @click="handleEnableStudentJoin">开启本节课排队</el-button>
          <el-button type="warning" :disabled="isBusy" @click="handleDisableStudentJoin">关闭排队</el-button>
          <el-popconfirm
            width="260"
            title="刷新后旧的学生入口将失效，是否继续？"
            confirm-button-text="刷新"
            confirm-button-type="danger"
            cancel-button-text="取消"
            @confirm="handleRefreshStudentJoinCode"
          >
            <template #reference>
              <el-button type="danger" :disabled="isBusy">刷新学生入口</el-button>
            </template>
          </el-popconfirm>
          <el-button @click="handleCopyStudentEntry">复制学生入口</el-button>
        </el-space>
      </template>

      <el-alert
        v-if="notice"
        class="entry-notice"
        :closable="false"
        show-icon
        :title="notice.text"
        :type="notice.kind"
      />
    </el-card>

    <template v-if="isTeacherAuthorized">
      <el-card class="section-card" shadow="never">
        <template #header>
          <div class="card-header card-header--split">
            <h2>当前叫号状态</h2>
            <el-tag :type="currentStudentNo ? 'success' : 'info'" effect="light">
              {{ currentStudentNo ? '进行中' : '暂无' }}
            </el-tag>
          </div>
        </template>

        <el-row class="status-grid" :gutter="16">
          <el-col :xs="24" :md="12">
            <div class="metric-panel metric-panel--large" aria-live="polite">
              <span>当前正在背书</span>
              <strong>{{ currentStudentNo ?? '暂无' }}</strong>
            </div>
          </el-col>
          <el-col :xs="24" :md="12">
            <div class="teacher-actions" role="group" aria-label="当前叫号操作">
              <div class="teacher-actions__main">
                <el-button
                  class="call-action-button"
                  type="primary"
                  size="large"
                  :loading="isBusy"
                  @click="handleCallNext"
                >
                  下一位
                </el-button>
                <el-button
                  class="call-action-button"
                  size="large"
                  :disabled="isBusy || !currentStudentNo"
                  @click="handleRepeatCall"
                >
                  重复呼叫
                </el-button>
                <el-button
                  class="call-action-button"
                  type="success"
                  size="large"
                  :disabled="isBusy || !current"
                  @click="handleMarkDone"
                >
                  通过/完成
                </el-button>
              </div>

              <div class="teacher-actions__danger-zone">
                <el-popconfirm
                    v-if="current"
                    width="260"
                    title="确定要移除当前学生吗？"
                    confirm-button-text="移除"
                    cancel-button-text="取消"
                    @confirm="handleRemove(current)"
                >
                  <template #reference>
                    <el-button class="call-action-button" type="danger" size="large" :disabled="isBusy">
                      移除当前
                    </el-button>
                  </template>
                </el-popconfirm>
                <el-popconfirm
                  width="260"
                  title="确定要清空等待队列并移除当前叫到的学生吗？"
                  confirm-button-text="清空"
                  cancel-button-text="取消"
                  @confirm="handleClearQueue"
                >
                  <template #reference>
                    <el-button class="call-action-button" type="danger" size="large" :disabled="isBusy">
                      清空队列
                    </el-button>
                  </template>
                </el-popconfirm>
              </div>
            </div>
          </el-col>
        </el-row>
      </el-card>

      <el-card class="section-card completion-matrix-card" shadow="never">
        <template #header>
          <div class="card-header card-header--split">
            <h2>任务完成情况</h2>
            <div class="completion-summary" aria-label="完成统计">
              <el-tag type="success" effect="plain">已完成 {{ completedStudentCount }} / {{ CLASS_STUDENT_TOTAL }}</el-tag>
              <el-tag type="danger" effect="plain">未完成 {{ incompleteStudentCount }}</el-tag>
              <el-button :disabled="isBusy" @click="handleOpenArchiveHistory">历史归档</el-button>
              <el-button
                type="warning"
                :disabled="isBusy || !hasArchivableTaskData"
                :loading="isBusy"
                @click="handleArchiveCurrentTask"
              >
                归档当前任务
              </el-button>
            </div>
          </div>
        </template>

        <div class="completion-legend" aria-label="图例">
          <span><i class="completion-legend__swatch completion-legend__swatch--done"></i>已完成</span>
          <span><i class="completion-legend__swatch completion-legend__swatch--pending"></i>未完成</span>
        </div>

        <div class="completion-matrix" aria-label="1到50号学生背书完成情况">
          <div v-for="(row, rowIndex) in matrixStudents" :key="rowIndex" class="completion-matrix__row">
            <span
              v-for="student in row"
              :key="student.studentNo"
              class="completion-matrix__cell"
              :class="{
                'completion-matrix__cell--done': student.isCompleted,
                'completion-matrix__cell--pending': !student.isCompleted
              }"
            >
              {{ student.label }}
            </span>
          </div>
        </div>
      </el-card>

      <el-drawer
        v-model="isArchiveDrawerOpen"
        class="archive-history-drawer"
        title="历史归档记录"
        size="min(720px, 92vw)"
        @open="loadArchiveHistory"
      >
        <div v-loading="isArchiveHistoryLoading" class="archive-history">
          <el-empty
            v-if="!isArchiveHistoryLoading && archivedTasks.length === 0"
            description="暂无历史归档记录"
          />

          <el-collapse v-else v-model="archiveHistoryActiveNames" class="archive-history__collapse">
            <el-collapse-item v-for="task in archivedTasks" :key="task.id" :name="task.id">
              <template #title>
                <div class="archive-record__title">
                  <strong>{{ getArchiveTaskName(task) }} - {{ formatArchiveTime(task.archivedAt) }}</strong>
                </div>
              </template>

              <div class="archive-record">
                <div class="archive-record__summary">
                  <p>已完成 {{ task.completedCount }} / {{ task.totalStudents }}，未完成 {{ task.unfinishedCount }} 人</p>
                </div>

                <div class="completion-matrix completion-matrix--archive" aria-label="历史归档完成情况">
                  <div
                    v-for="(row, rowIndex) in buildArchivedCompletionMatrix(task)"
                    :key="`${task.id}-${rowIndex}`"
                    class="completion-matrix__row"
                  >
                    <span
                      v-for="student in row"
                      :key="student.studentNo"
                      class="completion-matrix__cell"
                      :class="{
                        'completion-matrix__cell--done': student.isCompleted,
                        'completion-matrix__cell--pending': !student.isCompleted,
                        'completion-matrix__cell--supplement': student.isCompleted && isSupplementCompleted(task, student.studentNo)
                      }"
                      :title="!student.isCompleted ? '点击补标完成' : ''"
                      @click="!student.isCompleted && handleSupplementComplete(task, student.studentNo)"
                    >
                      {{ student.label }}
                    </span>
                  </div>
                </div>
              </div>
            </el-collapse-item>
          </el-collapse>
        </div>
      </el-drawer>

      <el-card class="section-card" shadow="never">
        <template #header>
          <div class="card-header card-header--split">
            <h2>队列管理</h2>
            <el-tag type="info" effect="plain">{{ waiting.length }} 人</el-tag>
          </div>
        </template>

        <el-table v-if="waiting.length" class="queue-table" :data="waiting">
          <el-table-column label="排名" width="80">
            <template #default="{ $index }">{{ $index + 1 }}</template>
          </el-table-column>
          <el-table-column label="学号" min-width="120" prop="studentNo" />
          <el-table-column label="状态" min-width="110">
            <template #default="{ row }">
              <el-tag :type="getQueueStatusTagType(row.status)" effect="light">
                {{ getQueueStatusText(row.status) }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="加入时间" min-width="120">
            <template #default="{ row }">{{ formatQueueTime(row.createdAt) }}</template>
          </el-table-column>
          <el-table-column label="操作" min-width="210" fixed="right">
            <template #default="{ row, $index }">
              <el-space wrap>
                <el-popconfirm
                  width="260"
                  title="确定要将该学生排到最前吗？"
                  confirm-button-text="置顶"
                  cancel-button-text="取消"
                  @confirm="handlePrioritize(row)"
                >
                  <template #reference>
                    <el-button size="small" type="warning" :disabled="isBusy || $index === 0">置顶</el-button>
                  </template>
                </el-popconfirm>
                <el-popconfirm
                  width="260"
                  title="确定要移除该学生吗？"
                  confirm-button-text="移除"
                  cancel-button-text="取消"
                  @confirm="handleRemove(row)"
                >
                  <template #reference>
                    <el-button size="small" type="danger" :disabled="isBusy">移除</el-button>
                  </template>
                </el-popconfirm>
              </el-space>
            </template>
          </el-table-column>
        </el-table>

        <el-empty v-else :description="isWatching ? '正在连接实时队列...' : '暂无等待学生'" />
      </el-card>

      <el-card class="section-card" shadow="never">
        <template #header>
          <div class="card-header card-header--split">
            <h2>已通过</h2>
            <el-tag type="success" effect="plain">{{ completedQueue.length }} 人</el-tag>
          </div>
        </template>

        <el-table v-if="completedQueue.length" class="queue-table" :data="completedQueue">
          <el-table-column label="序号" width="80">
            <template #default="{ $index }">{{ $index + 1 }}</template>
          </el-table-column>
          <el-table-column label="学号" min-width="120" prop="studentNo" />
          <el-table-column label="状态" min-width="110">
            <template #default="{ row }">
              <el-tag :type="getQueueStatusTagType(row.status)" effect="light">
                {{ getQueueStatusText(row.status) }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="完成时间" min-width="120">
            <template #default="{ row }">{{ formatQueueTime(row.updatedAt) }}</template>
          </el-table-column>
        </el-table>

        <el-empty v-else description="暂无已通过学生" />
      </el-card>

      <el-card class="section-card" shadow="never">
        <el-collapse v-model="roomInfoActiveNames">
          <el-collapse-item title="房间基本信息" name="room-info">
            <el-descriptions :column="1" border>
              <el-descriptions-item label="房间标题">{{ roomTitle }}</el-descriptions-item>
              <el-descriptions-item label="房间号">{{ sessionCode }}</el-descriptions-item>
              <el-descriptions-item label="PIN 码">{{ teacherPinInput }}</el-descriptions-item>
              <el-descriptions-item label="学生入口">
                <el-tag :type="room?.joinEnabled ? 'success' : 'info'" effect="light">{{ joinStatusText }}</el-tag>
              </el-descriptions-item>
              <el-descriptions-item v-if="studentJoinCode" label="排队码">{{ studentJoinCode }}</el-descriptions-item>
            </el-descriptions>

            <div class="room-info-actions">
              <el-button type="primary" @click="handleCopyRoomInfo">复制房间信息</el-button>
            </div>
          </el-collapse-item>
        </el-collapse>
      </el-card>
    </template>
  </main>
</template>
