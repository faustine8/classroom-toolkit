const CALL_AUDIO_BASE_DIR = 'audio/call';
const MIN_CALL_NO = 1;

// Segment scheduling: set to a small negative value (ms) for slight overlap
// to compensate for mp3 files with leading/trailing silence.
const SEGMENT_GAP_MS = -200;

const COMMON_FILE_NAMES = ['01_please.mp3', '02_come.mp3', '03_wait.mp3'];
const NUM_FILE_NAMES = Array.from({ length: 50 }, (_, i) => `num_${i + 1}.mp3`);
const ALL_FILE_NAMES = [...COMMON_FILE_NAMES, ...NUM_FILE_NAMES];

let audioContext: AudioContext | null = null;
const audioBufferCache = new Map<string, AudioBuffer>();
let activeSourceNodes: AudioBufferSourceNode[] = [];
let playbackToken = 0;
let activeResolve: (() => void) | null = null;

function getAudioUrl(fileName: string): string {
  const base = import.meta.env.BASE_URL || '/';
  return `${base.replace(/\/$/, '')}/${CALL_AUDIO_BASE_DIR}/${fileName}`;
}

function getOrCreateAudioContext(): AudioContext {
  if (!audioContext || audioContext.state === 'closed') {
    audioContext = new AudioContext();
  }
  return audioContext;
}

function normalizeCallNo(value: number): number | null {
  if (!Number.isInteger(value) || value < MIN_CALL_NO) {
    console.warn(`[call-audio] Invalid student number: ${value}`);
    return null;
  }
  return value;
}

function buildCallAudioFileNames(currentNo: number, nextNo?: number | null): string[] {
  const normalizedCurrentNo = normalizeCallNo(currentNo);
  if (normalizedCurrentNo === null) return [];

  const fileNames = [
    '01_please.mp3',
    `num_${normalizedCurrentNo}.mp3`,
    '02_come.mp3'
  ];

  if (nextNo !== undefined && nextNo !== null) {
    const normalizedNextNo = normalizeCallNo(nextNo);
    if (normalizedNextNo !== null) {
      fileNames.push(`num_${normalizedNextNo}.mp3`, '03_wait.mp3');
    }
  }

  return fileNames;
}

async function preloadOneFile(fileName: string): Promise<AudioBuffer> {
  const cached = audioBufferCache.get(fileName);
  if (cached) return cached;

  const audioUrl = getAudioUrl(fileName);
  const response = await fetch(audioUrl);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${audioUrl}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const ctx = getOrCreateAudioContext();
  const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
  audioBufferCache.set(fileName, audioBuffer);
  return audioBuffer;
}

function stopAllSources(): void {
  for (const source of activeSourceNodes) {
    try {
      source.stop();
      source.disconnect();
    } catch {
      // Already stopped or never started
    }
  }
  activeSourceNodes = [];
}

async function schedulePlayback(fileNames: string[], token: number): Promise<void> {
  const ctx = getOrCreateAudioContext();

  if (ctx.state === 'suspended') {
    try {
      await ctx.resume();
    } catch {
      console.warn('[call-audio] Cannot resume AudioContext (autoplay blocked)');
      return;
    }
  }

  const now = ctx.currentTime;
  let nextStartTime = now;

  for (const fileName of fileNames) {
    if (token !== playbackToken) return;

    const buffer = audioBufferCache.get(fileName);
    if (!buffer) {
      console.warn(`[call-audio] Buffer not cached for ${fileName}, skipping. Click "测试声音" to preload.`);
      continue;
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.start(nextStartTime);
    activeSourceNodes.push(source);

    nextStartTime += buffer.duration + SEGMENT_GAP_MS / 1000;
  }
}

// --- Public API ---

export async function preloadCommonAudio(
  onProgress?: (loaded: number, total: number) => void
): Promise<void> {
  let loaded = 0;
  const total = ALL_FILE_NAMES.length;

  await Promise.allSettled(
    ALL_FILE_NAMES.map(async (fileName) => {
      try {
        await preloadOneFile(fileName);
      } catch (err) {
        console.warn(`[call-audio] Failed to preload ${fileName}`, err);
      } finally {
        loaded += 1;
        onProgress?.(loaded, total);
      }
    })
  );
}

export function isAudioPreloaded(): boolean {
  return ALL_FILE_NAMES.every((name) => audioBufferCache.has(name));
}

export async function playCallAudio(currentNo: number, nextNo?: number | null): Promise<void> {
  stopCallAudio();
  const token = ++playbackToken;
  await schedulePlayback(buildCallAudioFileNames(currentNo, nextNo), token);
}

export function stopCallAudio(): void {
  playbackToken += 1;
  stopAllSources();
  activeResolve?.();
  activeResolve = null;
}

export async function playTestAudio(): Promise<boolean> {
  const fileNames = ['01_please.mp3', 'num_1.mp3', '02_come.mp3'];

  // Ensure test files are preloaded
  try {
    await Promise.all(fileNames.map((f) => preloadOneFile(f)));
  } catch {
    return false;
  }

  stopCallAudio();
  const token = ++playbackToken;
  await schedulePlayback(fileNames, token);
  return true;
}
