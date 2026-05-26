<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { ElMessage, type InputInstance } from 'element-plus';
import { currentRoom, formatRoomTitle, setCurrentRoom } from '@/features/recitation/room';
import { STUDENT_NO_VALIDATION_MESSAGE, normalizeStudentNo } from '@/features/recitation/sessionLogic';
import {
  getRoomByStudentJoinCode,
  joinQueue,
  normalizeSessionCode,
  normalizeStudentJoinCode,
  watchQueue,
  type QueueItem,
  type Room
} from '@/services/cloudbaseService';
import { getErrorMessage } from '@/utils/errorMessage';

type NoticeKind = 'success' | 'warning' | 'info' | 'error';

const VOICE_ENABLED_STORAGE_KEY = 'classroom-toolkit:recitation-voice-enabled';
const LEGACY_CALL_ALERT_STORAGE_KEY = 'classroom-toolkit:recitation-call-alert-enabled';
const STUDENT_NO_DIGITS_PATTERN = /^\d+$/;
const PREFERRED_CHINESE_VOICE_KEYWORDS = [
  'Microsoft Yaoyao',
  'Microsoft Huihui',
  'Microsoft Kangkang',

  // 如果 Edge/系统里有新版自然语音，就优先尝试这些
  'Microsoft Xiaoxiao',
  'Microsoft Xiaoyi',
  'Microsoft Yunxi',
  'Microsoft Yunyang',

  // 兜底关键词
  'Yaoyao',
  'Huihui',
  'Kangkang',
  'Xiaoxiao',
  'Xiaoyi',
  'Yunxi',
  'Yunyang',
  'Chinese',
  '中文',
  '普通话'
]

const route = useRoute();
const sessionCode = computed(() => normalizeSessionCode(String(route.params.sessionCode ?? '')));
const joinCode = computed(() => normalizeStudentJoinCode(String(route.params.joinCode ?? route.query.joinCode ?? '')));
const activeSessionCode = ref('');
const studentInput = ref('');
const lastDigitsOnlyStudentInput = ref('');
const studentNoInput = ref<InputInstance | null>(null);
const ownStudentNo = ref('');
const room = ref<Room | null>(null);
const current = ref<QueueItem | null>(null);
const waiting = ref<QueueItem[]>([]);
const notice = ref<{ kind: NoticeKind; text: string } | null>(null);
const isJoining = ref(false);
const isWatching = ref(true);
const voiceEnabled = ref(readStoredVoiceEnabled());
const lastAnnouncedCurrentNo = ref<string | null>(null);
const lastHandledAnnounceVersion = ref(0);
const preferredChineseVoice = ref<SpeechSynthesisVoice | null>(null);
let stopWatching: (() => void) | null = null;
let hasReceivedInitialQueueSnapshot = false;
let hasShownVoicePlaybackHint = false;
let reminderAudioContext: AudioContext | null = null;
let previousVoicesChangedHandler: SpeechSynthesis['onvoiceschanged'] = null;

const currentStudentNo = computed(() => current.value?.studentNo ?? room.value?.currentStudentNo ?? null);
const nextStudentNo = computed(() => waiting.value[0]?.studentNo ?? null);
const announceVersion = computed(() => room.value?.announceVersion ?? 0);
const roomTitle = computed(() =>
  room.value ? formatRoomTitle(room.value) : currentRoom.roomCode ? formatRoomTitle(currentRoom) : ''
);
const voiceStatusText = computed(() => (voiceEnabled.value ? '语音播报已开启' : '语音播报已关闭'));
const ownWaitingIndex = computed(() =>
  ownStudentNo.value ? waiting.value.findIndex((item) => item.studentNo === ownStudentNo.value) : -1
);
const peopleAhead = computed(() => {
  if (!ownStudentNo.value) {
    return null;
  }

  if (currentStudentNo.value === ownStudentNo.value) {
    return 0;
  }

  if (ownWaitingIndex.value < 0) {
    return null;
  }

  return ownWaitingIndex.value + (currentStudentNo.value ? 1 : 0);
});

const ownStatusText = computed(() => {
  if (!ownStudentNo.value) {
    return '输入学号后加入队列';
  }

  if (currentStudentNo.value === ownStudentNo.value) {
    return '已经叫到你了';
  }

  if (typeof peopleAhead.value === 'number') {
    return `你前面还有 ${peopleAhead.value} 人`;
  }

  return '你暂不在等待队列中';
});
const ownPositionText = computed(() => {
  if (!ownStudentNo.value) {
    return '未加入';
  }

  if (currentStudentNo.value === ownStudentNo.value) {
    return '正在背书';
  }

  if (ownWaitingIndex.value >= 0) {
    return `第 ${ownWaitingIndex.value + 1} 位`;
  }

  return '不在等待队列';
});

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

function getStudentQueueRowClass({ row }: { row: QueueItem }) {
  return row.studentNo === ownStudentNo.value ? 'queue-table-row--self' : '';
}

function canUseLocalStorage(): boolean {
  try {
    return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
  } catch {
    return false;
  }
}

function readStoredVoiceEnabled(): boolean {
  if (!canUseLocalStorage()) {
    return true;
  }

  const savedVoiceEnabled = window.localStorage.getItem(VOICE_ENABLED_STORAGE_KEY);

  if (savedVoiceEnabled !== null) {
    return savedVoiceEnabled !== 'false';
  }

  const savedLegacyCallAlertEnabled = window.localStorage.getItem(LEGACY_CALL_ALERT_STORAGE_KEY);

  if (savedLegacyCallAlertEnabled !== null) {
    return savedLegacyCallAlertEnabled === 'true';
  }

  return true;
}

function persistVoiceEnabled() {
  if (!canUseLocalStorage()) {
    return;
  }

  window.localStorage.setItem(VOICE_ENABLED_STORAGE_KEY, String(voiceEnabled.value));
}

function buildAnnouncementText(currentNo: string, nextNo: string | null): string {
  if (nextNo) {
    return `请 ${currentNo} 号来背书，${nextNo} 号请准备`;
  }

  return `请 ${currentNo} 号来背书`;
}

function selectPreferredChineseVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  for (const keyword of PREFERRED_CHINESE_VOICE_KEYWORDS) {
    const matchedVoice = voices.find((voice) => voice.name.toLowerCase().includes(keyword));

    if (matchedVoice) {
      return matchedVoice;
    }
  }

  return (
    voices.find((voice) => voice.lang.toLowerCase() === 'zh-cn') ??
    voices.find((voice) => voice.lang.toLowerCase().startsWith('zh')) ??
    null
  );
}

function syncPreferredChineseVoice() {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    preferredChineseVoice.value = null;
    return;
  }

  preferredChineseVoice.value = selectPreferredChineseVoice(window.speechSynthesis.getVoices());
}

function handleVoicesChanged(event: Event) {
  previousVoicesChangedHandler?.call(window.speechSynthesis, event);
  syncPreferredChineseVoice();
}

function setupSpeechVoices() {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    return;
  }

  syncPreferredChineseVoice();
  previousVoicesChangedHandler = window.speechSynthesis.onvoiceschanged;
  window.speechSynthesis.onvoiceschanged = handleVoicesChanged;
}

function cleanupSpeechVoices() {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    return;
  }

  if (window.speechSynthesis.onvoiceschanged === handleVoicesChanged) {
    window.speechSynthesis.onvoiceschanged = previousVoicesChangedHandler;
  }

  previousVoicesChangedHandler = null;
}

function getAudioContextConstructor(): typeof AudioContext | undefined {
  if (typeof window === 'undefined') {
    return undefined;
  }

  return (
    window.AudioContext ??
    (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  );
}

async function unlockReminderAudio() {
  const AudioContextConstructor = getAudioContextConstructor();

  if (!AudioContextConstructor) {
    return;
  }

  try {
    if (!reminderAudioContext || reminderAudioContext.state === 'closed') {
      reminderAudioContext = new AudioContextConstructor();
    }

    if (reminderAudioContext.state === 'suspended') {
      await reminderAudioContext.resume();
    }
  } catch {
    // Some browsers still block audio contexts until a fresh user gesture.
  }
}

async function playReminderBeep() {
  await unlockReminderAudio();

  if (!reminderAudioContext || reminderAudioContext.state !== 'running') {
    return;
  }

  try {
    const startedAt = reminderAudioContext.currentTime;
    const endedAt = startedAt + 3;
    const oscillator = reminderAudioContext.createOscillator();
    const gain = reminderAudioContext.createGain();

    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(880, startedAt);
    oscillator.connect(gain);
    gain.connect(reminderAudioContext.destination);
    gain.gain.setValueAtTime(0, startedAt);
    gain.gain.linearRampToValueAtTime(0.14, startedAt + 0.08);
    gain.gain.setValueAtTime(0.14, endedAt - 0.2);
    gain.gain.linearRampToValueAtTime(0, endedAt);
    oscillator.start(startedAt);
    oscillator.stop(endedAt);
  } catch {
    // If the fallback sound cannot be started, keep the UI state unchanged.
  }
}

function speakAnnouncement(text: string) {
  if (typeof window === 'undefined' || !('speechSynthesis' in window) || !('SpeechSynthesisUtterance' in window)) {
    showVoicePlaybackHint();
    void playReminderBeep();
    return;
  }

  try {
    const utterance = new SpeechSynthesisUtterance(text);
    syncPreferredChineseVoice();

    utterance.lang = preferredChineseVoice.value?.lang ?? 'zh-CN';
    utterance.rate = 0.9;
    utterance.pitch = 1.12;
    utterance.volume = 1;
    utterance.voice = preferredChineseVoice.value;
    utterance.onerror = () => {
      showVoicePlaybackHint();
      void playReminderBeep();
    };

    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  } catch {
    showVoicePlaybackHint();
    void playReminderBeep();
  }
}

function announceCall(currentNo: string, nextNo: string | null) {
  speakAnnouncement(buildAnnouncementText(currentNo, nextNo));
}

function showVoicePlaybackHint() {
  if (hasShownVoicePlaybackHint) {
    return;
  }

  hasShownVoicePlaybackHint = true;
  showNotice('info', '浏览器暂未允许自动播报，可尝试关闭后重新开启语音播报。');
}

function handleVoiceEnabledChange() {
  persistVoiceEnabled();
  lastAnnouncedCurrentNo.value = currentStudentNo.value;
  lastHandledAnnounceVersion.value = announceVersion.value;

  if (voiceEnabled.value) {
    void unlockReminderAudio();
    showNotice('success', '语音播报已开启');
  } else {
    window.speechSynthesis?.cancel();
    showNotice('info', '语音播报已关闭');
  }
}

function handleStudentNoBeforeInput(event: Event) {
  const inputEvent = event as InputEvent;

  if (inputEvent.isComposing || inputEvent.data === null || inputEvent.data === '') {
    return;
  }

  if (!STUDENT_NO_DIGITS_PATTERN.test(inputEvent.data)) {
    event.preventDefault();
    showNotice('warning', STUDENT_NO_VALIDATION_MESSAGE);
  }
}

function handleStudentNoPaste(event: Event) {
  const clipboardEvent = event as ClipboardEvent;
  const pastedText = clipboardEvent.clipboardData?.getData('text') ?? '';

  if (pastedText && !STUDENT_NO_DIGITS_PATTERN.test(pastedText)) {
    event.preventDefault();
    showNotice('warning', STUDENT_NO_VALIDATION_MESSAGE);
  }
}

function handleStudentNoInput(value: string) {
  if (value === '' || STUDENT_NO_DIGITS_PATTERN.test(value)) {
    lastDigitsOnlyStudentInput.value = value;
    return;
  }

  studentInput.value = lastDigitsOnlyStudentInput.value;
  showNotice('warning', STUDENT_NO_VALIDATION_MESSAGE);
}

async function submitStudentNo() {
  if (isJoining.value) {
    return;
  }

  const trimmedStudentInput = studentInput.value.trim();
  const normalizedStudentNo = normalizeStudentNo(trimmedStudentInput);

  if (normalizedStudentNo === null) {
    showNotice('warning', STUDENT_NO_VALIDATION_MESSAGE);
    return;
  }

  isJoining.value = true;
  notice.value = null;

  try {
    if (!activeSessionCode.value) {
      showNotice('warning', '未找到该排队入口');
      return;
    }

    const item = await joinQueue(activeSessionCode.value, trimmedStudentInput);
    ownStudentNo.value = item.studentNo;
    studentInput.value = '';
    lastDigitsOnlyStudentInput.value = '';
    showNotice('success', `${item.studentNo} 号已加入等待队列`);
    await nextTick();
    studentNoInput.value?.focus();
  } catch (error) {
    ownStudentNo.value = normalizedStudentNo;
    showNotice('warning', getErrorMessage(error));
  } finally {
    isJoining.value = false;
  }
}

watch([currentStudentNo, nextStudentNo, announceVersion], ([newCurrentNo, newNextNo, newAnnounceVersion]) => {
  if (!hasReceivedInitialQueueSnapshot || !newCurrentNo) {
    return;
  }

  const currentChanged = newCurrentNo !== lastAnnouncedCurrentNo.value;
  const announceVersionChanged = newAnnounceVersion !== lastHandledAnnounceVersion.value;

  if (!currentChanged && !announceVersionChanged) {
    return;
  }

  lastAnnouncedCurrentNo.value = newCurrentNo;
  lastHandledAnnounceVersion.value = newAnnounceVersion;

  if (!voiceEnabled.value) {
    return;
  }

  announceCall(newCurrentNo, newNextNo);
});

async function resolveStudentRoom(): Promise<string | null> {
  if (!joinCode.value) {
    return sessionCode.value || null;
  }

  const targetRoom = await getRoomByStudentJoinCode(joinCode.value);

  if (!targetRoom) {
    showNotice('warning', '未找到该排队入口');
    return null;
  }

  if (!targetRoom.joinEnabled) {
    showNotice('warning', '当前房间暂未开放排队');
    return null;
  }

  room.value = targetRoom;
  setCurrentRoom(targetRoom);
  return targetRoom.sessionCode;
}

onMounted(async () => {
  setupSpeechVoices();

  try {
    const resolvedSessionCode = await resolveStudentRoom();

    if (!resolvedSessionCode) {
      isWatching.value = false;
      return;
    }

    activeSessionCode.value = resolvedSessionCode;
    stopWatching = await watchQueue(
      resolvedSessionCode,
      (snapshot) => {
        if (!hasReceivedInitialQueueSnapshot) {
          lastAnnouncedCurrentNo.value = snapshot.current?.studentNo ?? snapshot.room.currentStudentNo ?? null;
          lastHandledAnnounceVersion.value = snapshot.room.announceVersion;
          hasReceivedInitialQueueSnapshot = true;
        }

        room.value = snapshot.room;
        setCurrentRoom(snapshot.room);
        current.value = snapshot.current;
        waiting.value = snapshot.waiting;
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
});

onBeforeUnmount(() => {
  stopWatching?.();
  cleanupSpeechVoices();
  window.speechSynthesis?.cancel();
});
</script>

<template>
  <main class="page run-page queue-page">
    <el-card class="section-card" shadow="never">
      <template #header>
        <div class="card-header card-header--split">
          <div>
            <el-tag effect="light">学生端</el-tag>
            <h1>{{ roomTitle || '学生排号' }}</h1>
            <p>学生排号</p>
          </div>
          <RouterLink custom :to="{ name: 'student-entry' }" v-slot="{ navigate }">
            <el-button @click="navigate">更换房间</el-button>
          </RouterLink>
        </div>
      </template>

      <el-alert
        v-if="currentStudentNo === ownStudentNo"
        :closable="false"
        show-icon
        title="已经叫到你了，请准备背书"
        type="success"
      />
      <el-alert
        v-else-if="!ownStudentNo"
        :closable="false"
        show-icon
        title="你还没有加入队列"
        type="info"
      />

      <el-row class="status-grid" :gutter="16">
        <el-col :xs="24" :sm="8">
          <div class="metric-panel" aria-live="polite">
            <span>当前叫到</span>
            <strong>{{ currentStudentNo ?? '等待叫号' }}</strong>
          </div>
        </el-col>
        <el-col :xs="24" :sm="8">
          <div class="metric-panel" aria-live="polite">
            <span>我的学号</span>
            <strong>{{ ownStudentNo || '未填写' }}</strong>
          </div>
        </el-col>
        <el-col :xs="24" :sm="8">
          <div class="metric-panel" aria-live="polite">
            <span>我的位置</span>
            <strong>{{ ownPositionText }}</strong>
            <small v-if="typeof peopleAhead === 'number'">前面还有 {{ peopleAhead }} 人</small>
          </div>
        </el-col>
      </el-row>

      <el-form class="join-form" label-position="top" @submit.prevent="submitStudentNo">
        <el-form-item label="请输入你的学号排队">
          <el-input
            id="student-no"
            ref="studentNoInput"
            v-model="studentInput"
            autocomplete="off"
            inputmode="numeric"
            pattern="[0-9]*"
            placeholder="例如：7"
            size="large"
            @beforeinput="handleStudentNoBeforeInput"
            @input="handleStudentNoInput"
            @paste="handleStudentNoPaste"
          />
        </el-form-item>
        <el-button :loading="isJoining" native-type="submit" size="large" type="primary">加入队列</el-button>
      </el-form>

      <el-alert
        v-if="notice"
        class="entry-notice"
        :closable="false"
        show-icon
        :title="notice.text"
        :type="notice.kind"
      />
    </el-card>

    <el-card class="section-card" shadow="never">
      <template #header>
        <div class="card-header card-header--split">
          <h2>当前队列</h2>
          <el-tag type="info" effect="plain">{{ waiting.length }} 人等待</el-tag>
        </div>
      </template>

      <el-table
        v-if="waiting.length"
        class="queue-table"
        :data="waiting"
        :row-class-name="getStudentQueueRowClass"
      >
        <el-table-column label="序号" width="80">
          <template #default="{ $index }">{{ $index + 1 }}</template>
        </el-table-column>
        <el-table-column label="学号" min-width="120" prop="studentNo" />
        <el-table-column label="状态" min-width="120">
          <template #default="{ row }">
            <el-tag :type="row.studentNo === ownStudentNo ? 'success' : 'info'" effect="light">
              {{ row.studentNo === ownStudentNo ? '我 · 等待中' : '等待中' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="加入时间" min-width="120">
          <template #default="{ row }">{{ formatQueueTime(row.createdAt) }}</template>
        </el-table-column>
      </el-table>

      <el-empty v-else :description="isWatching ? '正在连接实时队列...' : '暂无等待学生'" />
    </el-card>

    <el-card class="section-card" shadow="never">
      <div class="voice-settings-row">
        <div>
          <h2>语音播报</h2>
          <p>{{ voiceStatusText }}</p>
        </div>
        <el-switch
          v-model="voiceEnabled"
          active-text="开启"
          inactive-text="关闭"
          @change="handleVoiceEnabledChange"
        />
      </div>
    </el-card>
  </main>
</template>
