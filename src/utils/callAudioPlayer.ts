const CALL_AUDIO_BASE_PATH = '/audio/call';
const MIN_CALL_NO = 1;

let playbackToken = 0;
let activeAudio: HTMLAudioElement | null = null;
let activeResolve: (() => void) | null = null;

function buildCallAudioUrl(fileName: string): string {
  return `${CALL_AUDIO_BASE_PATH}/${fileName}`;
}

function normalizeCallNo(value: number): number | null {
  if (!Number.isInteger(value) || value < MIN_CALL_NO) {
    console.warn(`[call-audio] Invalid student number: ${value}`);
    return null;
  }

  return value;
}

function buildCallAudioSources(currentNo: number, nextNo?: number | null): string[] {
  const normalizedCurrentNo = normalizeCallNo(currentNo);

  if (normalizedCurrentNo === null) {
    return [];
  }

  const sources = [
    buildCallAudioUrl('01_please.mp3'),
    buildCallAudioUrl(`num_${normalizedCurrentNo}.mp3`),
    buildCallAudioUrl('02_come.mp3')
  ];

  if (nextNo !== undefined && nextNo !== null) {
    const normalizedNextNo = normalizeCallNo(nextNo);

    if (normalizedNextNo !== null) {
      sources.push(buildCallAudioUrl(`num_${normalizedNextNo}.mp3`), buildCallAudioUrl('03_wait.mp3'));
    }
  }

  return sources;
}

function playAudioSegment(src: string, token: number): Promise<void> {
  if (typeof window === 'undefined' || typeof window.Audio === 'undefined') {
    console.warn('[call-audio] Audio playback is unavailable in this environment.');
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    const audio = new window.Audio(src);
    let isSettled = false;

    function handleEnded() {
      settle();
    }

    function handleError() {
      console.warn(`[call-audio] Failed to load or play audio segment: ${src}`);
      settle();
    }

    function settle() {
      if (isSettled) {
        return;
      }

      isSettled = true;
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('error', handleError);

      if (activeAudio === audio) {
        activeAudio = null;
        activeResolve = null;
      }

      resolve();
    }

    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('error', handleError);
    activeAudio = audio;
    activeResolve = settle;

    try {
      const playResult = audio.play();

      if (playResult !== undefined) {
        playResult.catch((error: unknown) => {
          console.warn(`[call-audio] Failed to play audio segment: ${src}`, error);
          settle();
        });
      }
    } catch (error) {
      console.warn(`[call-audio] Failed to play audio segment: ${src}`, error);
      settle();
    }

    if (token !== playbackToken) {
      audio.pause();
      settle();
    }
  });
}

async function playAudioSources(sources: string[]): Promise<void> {
  stopCallAudio();

  const token = ++playbackToken;

  for (const source of sources) {
    if (token !== playbackToken) {
      return;
    }

    await playAudioSegment(source, token);
  }
}

export async function playCallAudio(currentNo: number, nextNo?: number | null): Promise<void> {
  await playAudioSources(buildCallAudioSources(currentNo, nextNo));
}

export function stopCallAudio(): void {
  playbackToken += 1;

  if (activeAudio) {
    activeAudio.pause();

    try {
      activeAudio.currentTime = 0;
    } catch {
      // Some browsers disallow seeking an audio element before metadata is available.
    }

    activeAudio = null;
  }

  activeResolve?.();
  activeResolve = null;
}

export async function playTestAudio(): Promise<void> {
  await playAudioSources([
    buildCallAudioUrl('01_please.mp3'),
    buildCallAudioUrl('num_1.mp3'),
    buildCallAudioUrl('02_come.mp3')
  ]);
}
