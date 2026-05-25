<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { STUDENT_NO_VALIDATION_MESSAGE, normalizeStudentNo } from '@/features/recitation/sessionLogic';
import { joinQueue, normalizeSessionCode, watchQueue, type QueueItem, type Room } from '@/services/cloudbaseService';
import { getErrorMessage } from '@/utils/errorMessage';

type NoticeKind = 'success' | 'warning' | 'info';

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
const studentInput = ref('');
const lastDigitsOnlyStudentInput = ref('');
const studentNoInput = ref<HTMLInputElement | null>(null);
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

function showNotice(kind: NoticeKind, text: string) {
  notice.value = { kind, text };
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

function handleStudentNoInput(event: Event) {
  const inputElement = event.target as HTMLInputElement | null;

  if (!inputElement) {
    return;
  }

  if (inputElement.value === '' || STUDENT_NO_DIGITS_PATTERN.test(inputElement.value)) {
    lastDigitsOnlyStudentInput.value = inputElement.value;
    return;
  }

  inputElement.value = lastDigitsOnlyStudentInput.value;
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
    const item = await joinQueue(sessionCode.value, trimmedStudentInput);
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

onMounted(async () => {
  setupSpeechVoices();

  try {
    stopWatching = await watchQueue(
      sessionCode.value,
      (snapshot) => {
        if (!hasReceivedInitialQueueSnapshot) {
          lastAnnouncedCurrentNo.value = snapshot.current?.studentNo ?? snapshot.room.currentStudentNo ?? null;
          lastHandledAnnounceVersion.value = snapshot.room.announceVersion;
          hasReceivedInitialQueueSnapshot = true;
        }

        room.value = snapshot.room;
        current.value = snapshot.current;
        waiting.value = snapshot.waiting;
        isWatching.value = false;
      },
      (error) => {
        isWatching.value = false;
        showNotice('warning', getErrorMessage(error));
      }
    );
  } catch (error) {
    isWatching.value = false;
    showNotice('warning', getErrorMessage(error));
  }
});

onBeforeUnmount(() => {
  stopWatching?.();
  cleanupSpeechVoices();
  window.speechSynthesis?.cancel();
});
</script>

<template>
  <main class="page run-page">
    <header class="page-header run-header">
      <div>
        <p class="eyebrow">学生端 · {{ sessionCode }}</p>
        <h1>{{ room?.title ?? '背书排号' }}</h1>
      </div>
      <div class="header-actions">
        <RouterLink class="button button--secondary" to="/">返回首页</RouterLink>
        <RouterLink class="button button--ghost" :to="{ name: 'recitation-teacher', params: { sessionCode } }">
          老师端
        </RouterLink>
      </div>
    </header>

    <section class="current-panel" :class="{ 'current-panel--empty': !currentStudentNo }" aria-live="polite">
      <p>当前叫到</p>
      <strong>{{ currentStudentNo ?? '等待老师叫号' }}</strong>
      <span v-if="currentStudentNo">学号</span>
    </section>

    <section class="student-join-panel">
      <form class="student-join-panel__form" @submit.prevent="submitStudentNo">
        <label for="student-no">我的学号</label>
        <input
          id="student-no"
          ref="studentNoInput"
          v-model="studentInput"
          autocomplete="off"
          inputmode="numeric"
          pattern="[0-9]*"
          placeholder="例如：7"
          type="text"
          @beforeinput="handleStudentNoBeforeInput"
          @input="handleStudentNoInput"
          @paste="handleStudentNoPaste"
        />
        <button class="button button--primary" :disabled="isJoining" type="submit">
          {{ isJoining ? '加入中...' : '加入队列' }}
        </button>
      </form>

      <div class="student-status" aria-live="polite">
        <span>排队状态</span>
        <strong>{{ ownStatusText }}</strong>
      </div>

      <div v-if="notice" class="notice" :class="`notice--${notice.kind}`" role="status">
        {{ notice.text }}
      </div>
    </section>

    <section class="dashboard-grid dashboard-grid--student">
      <article class="list-panel list-panel--queue">
        <header>
          <h2>当前队列</h2>
          <span>{{ waiting.length }} 人等待</span>
        </header>

        <ol v-if="waiting.length" class="queue-list">
          <li
            v-for="(student, index) in waiting"
            :key="student._id"
            :class="{ 'queue-list__item--self': student.studentNo === ownStudentNo }"
          >
            <span class="queue-index">{{ index + 1 }}</span>
            <strong>{{ student.studentNo }}</strong>
            <span class="queue-note">{{ student.studentNo === ownStudentNo ? '我' : '等待中' }}</span>
          </li>
        </ol>

        <p v-else class="empty-text">{{ isWatching ? '正在连接实时队列...' : '暂无等待学生' }}</p>
      </article>
    </section>

    <section class="voice-settings-panel">
      <div class="voice-settings-status">
        <span>语音播报</span>
        <strong>{{ voiceStatusText }}</strong>
      </div>
      <div class="voice-settings-actions">
        <label class="voice-switch">
          <input v-model="voiceEnabled" type="checkbox" @change="handleVoiceEnabledChange" />
          <span class="voice-switch__track" aria-hidden="true">
            <span class="voice-switch__thumb"></span>
          </span>
          <span class="voice-switch__label">{{ voiceEnabled ? '开启' : '关闭' }}</span>
        </label>
      </div>
    </section>
  </main>
</template>
