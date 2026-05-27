const CALL_AUDIO_BASE_DIR = 'audio/call';
const MIN_CALL_NO = 1;

let playbackToken = 0;
let activeAudio: HTMLAudioElement | null = null;
let activeResolve: (() => void) | null = null;

function getAudioUrl(fileName: string): string {
  const base = import.meta.env.BASE_URL || '/';
  return `${base.replace(/\/$/, '')}/${CALL_AUDIO_BASE_DIR}/${fileName}`;
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

  if (normalizedCurrentNo === null) {
    return [];
  }

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

function logPlaybackError(fileName: string, audioUrl: string, details: Record<string, unknown>): void {
  const mediaError = activeAudio?.error;
  const merged: Record<string, unknown> = {
    fileName,
    audioUrl,
    ...details
  };

  if (mediaError) {
    merged.mediaErrorCode = mediaError.code;
    merged.mediaErrorMessage = mediaError.message || '';
  }

  const errorName = typeof details.errorName === 'string' ? details.errorName : '';

  if (errorName === 'NotAllowedError') {
    merged.hint = '浏览器自动播放限制：请先点击"测试声音"按钮解除限制';
  } else if (mediaError && (mediaError.code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED || mediaError.code === 4)) {
    merged.hint = '音频格式不支持或文件缺失，请检查 Network 面板确认文件 404';
  } else if (mediaError && mediaError.code === MediaError.MEDIA_ERR_NETWORK) {
    merged.hint = '音频文件加载失败(网络错误)，请检查 Network 面板确认文件路径是否正确';
  } else {
    merged.hint = '请检查 DevTools Network 面板确认音频文件是否正常加载';
  }

  console.warn('[call-audio] Audio playback failed', merged);
}

function playAudioSegment(fileName: string, token: number): Promise<void> {
  if (typeof window === 'undefined' || typeof window.Audio === 'undefined') {
    console.warn('[call-audio] Audio playback is unavailable in this environment.');
    return Promise.resolve();
  }

  const audioUrl = getAudioUrl(fileName);

  return new Promise((resolve, reject) => {
    const audio = new window.Audio(audioUrl);
    let isSettled = false;

    function handleEnded() {
      settle(true);
    }

    function handleError() {
      const mediaError = audio.error;
      logPlaybackError(fileName, audioUrl, {
        context: 'error event',
        mediaErrorCode: mediaError?.code,
        mediaErrorMessage: mediaError?.message || ''
      });
      settle(false);
    }

    function settle(ok: boolean) {
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

      if (ok) {
        resolve();
      } else {
        reject(new Error(`Audio playback failed: ${fileName}`));
      }
    }

    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('error', handleError);
    activeAudio = audio;
    activeResolve = () => settle(false);

    try {
      const playResult = audio.play();

      if (playResult !== undefined) {
        playResult.catch((error: unknown) => {
          const errorName = error instanceof DOMException ? error.name : (error instanceof Error ? error.name : 'Unknown');
          const errorMessage = error instanceof DOMException ? error.message : (error instanceof Error ? error.message : String(error));
          logPlaybackError(fileName, audioUrl, {
            context: 'play() rejected',
            errorName,
            errorMessage
          });
          settle(false);
        });
      }
    } catch (error) {
      const errorName = error instanceof DOMException ? error.name : (error instanceof Error ? error.name : 'Unknown');
      const errorMessage = error instanceof DOMException ? error.message : (error instanceof Error ? error.message : String(error));
      logPlaybackError(fileName, audioUrl, {
        context: 'play() threw',
        errorName,
        errorMessage
      });
      settle(false);
    }

    if (token !== playbackToken) {
      audio.pause();
      settle(false);
    }
  });
}

async function playAudioSources(fileNames: string[]): Promise<void> {
  stopCallAudio();

  const token = ++playbackToken;

  for (const fileName of fileNames) {
    if (token !== playbackToken) {
      return;
    }

    try {
      await playAudioSegment(fileName, token);
    } catch {
      // Continue to next segment even if one fails
    }
  }
}

export async function playCallAudio(currentNo: number, nextNo?: number | null): Promise<void> {
  await playAudioSources(buildCallAudioFileNames(currentNo, nextNo));
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

export async function playTestAudio(): Promise<boolean> {
  const fileNames = ['01_please.mp3', 'num_1.mp3', '02_come.mp3'];

  stopCallAudio();

  const token = ++playbackToken;
  let hasError = false;

  for (const fileName of fileNames) {
    if (token !== playbackToken) {
      return false;
    }

    try {
      await playAudioSegment(fileName, token);
    } catch {
      hasError = true;
    }
  }

  return !hasError;
}
