// audio.js —— 全局背景音乐控制（支持多首歌、下一首、跨页面续播）

let bgAudio = null;
let isAudioInitialized = false;

// ========== 歌曲列表（按顺序播放） ==========
const SONG_LIST = [
  'audio/bg.mp3',      // 第一首（你已有的）
  'audio/bg1.mp3'      // 第二首（你准备加入的新歌）
];
const DEFAULT_SONG_INDEX = 0;

const VOLUME_KEY = 'gomoku_volume';
const MUTE_KEY = 'gomoku_mute';
const TIME_KEY = 'gomoku_time';
const PLAYING_KEY = 'gomoku_playing';
const SONG_INDEX_KEY = 'gomoku_song_index';

// 获取当前歌曲索引
function getSongIndex() {
  let idx = parseInt(localStorage.getItem(SONG_INDEX_KEY));
  if (isNaN(idx) || idx < 0 || idx >= SONG_LIST.length) {
    idx = DEFAULT_SONG_INDEX;
  }
  return idx;
}

// 设置歌曲索引并保存
function setSongIndex(idx) {
  if (idx < 0) idx = SONG_LIST.length - 1;
  if (idx >= SONG_LIST.length) idx = 0;
  localStorage.setItem(SONG_INDEX_KEY, idx.toString());
  return idx;
}

// 获取当前歌曲URL
function getCurrentSongUrl() {
  return SONG_LIST[getSongIndex()];
}

// 初始化音频对象（不播放）
function initAudio() {
  if (isAudioInitialized) return;
  if (!bgAudio) {
    const songUrl = getCurrentSongUrl();
    bgAudio = new Audio(songUrl);
    bgAudio.loop = false; // 单曲不循环，播完自动停止（或触发下一首）
    bgAudio.volume = getVolume();
    if (localStorage.getItem(MUTE_KEY) === 'true') {
      bgAudio.muted = true;
    }
    // 恢复上次播放进度
    let savedTime = parseFloat(localStorage.getItem(TIME_KEY));
    if (!isNaN(savedTime) && savedTime > 0) {
      bgAudio.currentTime = savedTime;
    }
    // 监听播放结束 → 自动下一首
    bgAudio.addEventListener('ended', function() {
      nextSong();
    });
    // 监听播放进度，定期保存
    bgAudio.addEventListener('timeupdate', function() {
      if (!bgAudio.paused) {
        localStorage.setItem(TIME_KEY, bgAudio.currentTime.toString());
      }
    });
    // 监听播放/暂停状态
    bgAudio.addEventListener('play', function() {
      localStorage.setItem(PLAYING_KEY, 'true');
    });
    bgAudio.addEventListener('pause', function() {
      localStorage.setItem(PLAYING_KEY, 'false');
    });
  }
  isAudioInitialized = true;
}

// 加载指定索引的歌曲（不自动播放）
function loadSong(index) {
  const newIdx = setSongIndex(index);
  const newUrl = SONG_LIST[newIdx];
  if (!bgAudio) {
    initAudio();
    return;
  }
  const wasPlaying = !bgAudio.paused;
  const currentTime = bgAudio.currentTime;
  bgAudio.src = newUrl;
  bgAudio.currentTime = 0;
  // 恢复音量/静音状态
  bgAudio.volume = getVolume();
  if (localStorage.getItem(MUTE_KEY) === 'true') {
    bgAudio.muted = true;
  }
  // 清除旧的进度保存（新歌从头开始）
  localStorage.setItem(TIME_KEY, '0');
  // 如果之前是播放状态，自动播放
  if (wasPlaying) {
    bgAudio.play().catch(() => {});
  }
  updateMusicButtonUI && updateMusicButtonUI();
}

// 播放（自动恢复进度）
function playBgMusic() {
  if (!bgAudio) initAudio();
  // 确保当前歌曲路径正确（可能被切换过）
  const currentUrl = getCurrentSongUrl();
  if (bgAudio.src !== currentUrl) {
    bgAudio.src = currentUrl;
    bgAudio.currentTime = 0;
  }
  if (bgAudio.paused) {
    // 如果有保存的进度，恢复
    let savedTime = parseFloat(localStorage.getItem(TIME_KEY));
    if (!isNaN(savedTime) && savedTime > 0 && bgAudio.currentTime === 0) {
      bgAudio.currentTime = savedTime;
    }
    bgAudio.play().then(() => {
      localStorage.setItem(PLAYING_KEY, 'true');
    }).catch(e => {
      console.log('自动播放被阻止，等待用户手势');
    });
  }
}

// 暂停
function pauseBgMusic() {
  if (bgAudio && !bgAudio.paused) {
    bgAudio.pause();
    localStorage.setItem(PLAYING_KEY, 'false');
  }
}

// 切换播放/暂停
function toggleBgMusic() {
  if (!bgAudio) initAudio();
  if (bgAudio.paused) {
    playBgMusic();
  } else {
    pauseBgMusic();
  }
  updateMusicButtonUI && updateMusicButtonUI();
}

// 下一首
function nextSong() {
  const currentIdx = getSongIndex();
  const nextIdx = (currentIdx + 1) % SONG_LIST.length;
  loadSong(nextIdx);
  // 播放
  playBgMusic();
  // 更新UI
  updateMusicButtonUI && updateMusicButtonUI();
}

// 设置音量
function setBgVolume(value) {
  let vol = Math.min(1, Math.max(0, value));
  if (bgAudio) bgAudio.volume = vol;
  localStorage.setItem(VOLUME_KEY, vol.toString());
  updateVolumeSliderUI && updateVolumeSliderUI(vol);
}

function getVolume() {
  let vol = localStorage.getItem(VOLUME_KEY);
  return vol !== null ? parseFloat(vol) : 0.5;
}

// 切换静音
function toggleMute() {
  if (!bgAudio) initAudio();
  bgAudio.muted = !bgAudio.muted;
  localStorage.setItem(MUTE_KEY, bgAudio.muted.toString());
  updateMuteButtonUI && updateMuteButtonUI(bgAudio.muted);
}

function isMuted() {
  return bgAudio ? bgAudio.muted : (localStorage.getItem(MUTE_KEY) === 'true');
}

// UI更新（由music-player.js覆盖）
function updateVolumeSliderUI(vol) {
  let slider = document.getElementById('volumeSlider');
  if (slider) slider.value = vol * 100;
  let display = document.getElementById('volumeDisplay');
  if (display) display.innerText = Math.round(vol * 100) + '%';
}
function updateMuteButtonUI(muted) {
  let btn = document.getElementById('muteBtn');
  if (btn) btn.innerText = muted ? '🔇' : '🔊';
}
function updateMusicButtonUI() {
  // 由music-player.js自行更新
}

// 页面卸载时保存状态
window.addEventListener('beforeunload', function() {
  if (bgAudio && !bgAudio.paused) {
    localStorage.setItem(TIME_KEY, bgAudio.currentTime.toString());
    localStorage.setItem(PLAYING_KEY, 'true');
    localStorage.setItem(SONG_INDEX_KEY, getSongIndex().toString());
  } else {
    localStorage.setItem(PLAYING_KEY, 'false');
  }
});

// 导出
window.initAudio = initAudio;
window.playBgMusic = playBgMusic;
window.pauseBgMusic = pauseBgMusic;
window.toggleBgMusic = toggleBgMusic;
window.setBgVolume = setBgVolume;
window.getVolume = getVolume;
window.toggleMute = toggleMute;
window.isMuted = isMuted;
window.nextSong = nextSong;
window.loadSong = loadSong;
window.getSongIndex = getSongIndex;
window.SONG_LIST = SONG_LIST;
window.updateVolumeSliderUI = updateVolumeSliderUI;
window.updateMuteButtonUI = updateMuteButtonUI;
window.updateMusicButtonUI = updateMusicButtonUI;