// music-player.js - 折叠式音乐播放器（左下角）

let panelOpen = false;

function initMusicPlayer() {
  if (document.querySelector('.music-player')) return;

  const container = document.createElement('div');
  container.className = 'music-player';
  container.id = 'musicPlayer';

  // ---- 主按钮（折叠触发器） ----
  const toggleBtn = document.createElement('button');
  toggleBtn.className = 'music-toggle';
  toggleBtn.innerHTML = '🎵';
  toggleBtn.title = '展开音乐控制';
  // 状态小圆点
  const dot = document.createElement('span');
  dot.className = 'status-dot paused';
  toggleBtn.appendChild(dot);
  container.appendChild(toggleBtn);

  // ---- 展开面板 ----
  const panel = document.createElement('div');
  panel.className = 'music-panel';
  panel.id = 'musicPanel';

  // 控制行：播放/暂停 + 进度条
  const controlsRow = document.createElement('div');
  controlsRow.className = 'controls-row';

  const playBtn = document.createElement('button');
  playBtn.className = 'play-btn';
  playBtn.innerHTML = '▶️';
  playBtn.title = '播放/暂停';
  controlsRow.appendChild(playBtn);

  const progressWrap = document.createElement('div');
  progressWrap.className = 'progress-wrap';
  const progressSlider = document.createElement('input');
  progressSlider.type = 'range';
  progressSlider.min = 0;
  progressSlider.max = 100;
  progressSlider.value = 0;
  progressSlider.title = '播放进度';
  progressWrap.appendChild(progressSlider);
  const timeLabel = document.createElement('span');
  timeLabel.className = 'time-label';
  timeLabel.textContent = '0:00';
  progressWrap.appendChild(timeLabel);
  controlsRow.appendChild(progressWrap);

  panel.appendChild(controlsRow);

  // 工具栏：音量 + 下一首
  const toolbarRow = document.createElement('div');
  toolbarRow.className = 'toolbar-row';

  const volControl = document.createElement('div');
  volControl.className = 'volume-control';
  const volIcon = document.createElement('span');
  volIcon.className = 'vol-icon';
  volIcon.textContent = '🔊';
  volControl.appendChild(volIcon);
  const volSlider = document.createElement('input');
  volSlider.type = 'range';
  volSlider.min = 0;
  volSlider.max = 100;
  volSlider.value = getVolume() * 100;
  volSlider.title = '音量';
  volControl.appendChild(volSlider);
  toolbarRow.appendChild(volControl);

  const nextBtn = document.createElement('button');
  nextBtn.className = 'next-btn';
  nextBtn.innerHTML = '⏭';
  nextBtn.title = '下一首';
  toolbarRow.appendChild(nextBtn);

  panel.appendChild(toolbarRow);
  container.appendChild(panel);
  document.body.appendChild(container);

  // ---- 事件绑定 ----

  // 主按钮点击：展开/折叠面板
  toggleBtn.addEventListener('click', function(e) {
    e.stopPropagation();
    panelOpen = !panelOpen;
    panel.classList.toggle('open', panelOpen);
    toggleBtn.title = panelOpen ? '收起音乐控制' : '展开音乐控制';
  });

  // 播放/暂停
  playBtn.addEventListener('click', function(e) {
    e.stopPropagation();
    toggleBgMusic();
    updateUI();
  });

  // 进度条拖动（用户交互）
  let isDragging = false;
  progressSlider.addEventListener('pointerdown', function() {
    isDragging = true;
  });
  progressSlider.addEventListener('pointerup', function() {
    isDragging = false;
    if (bgAudio) {
      const pct = progressSlider.value / 100;
      bgAudio.currentTime = pct * bgAudio.duration;
      localStorage.setItem(TIME_KEY, bgAudio.currentTime.toString());
    }
  });
  progressSlider.addEventListener('input', function() {
    if (bgAudio && bgAudio.duration) {
      const pct = progressSlider.value / 100;
      const newTime = pct * bgAudio.duration;
      if (!isNaN(newTime)) {
        // 预览时只更新显示，不真正 seek（避免卡顿），等松开时再 seek
        const mins = Math.floor(newTime / 60);
        const secs = Math.floor(newTime % 60);
        timeLabel.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;
      }
    }
  });

  // 音量滑块
  volSlider.addEventListener('input', function() {
    setBgVolume(this.value / 100);
    // 更新图标（可选）
    if (this.value == 0) volIcon.textContent = '🔇';
    else if (this.value < 50) volIcon.textContent = '🔉';
    else volIcon.textContent = '🔊';
  });

  // 下一首
  nextBtn.addEventListener('click', function(e) {
    e.stopPropagation();
    if (typeof nextSong === 'function') {
      nextSong();
      updateUI();
    }
  });

  // ---- 初始化UI ----
  updateUI();

  // 监听音频事件，更新UI
  if (bgAudio) {
    bgAudio.addEventListener('play', updateUI);
    bgAudio.addEventListener('pause', updateUI);
    bgAudio.addEventListener('timeupdate', function() {
      if (!isDragging && bgAudio.duration) {
        const pct = (bgAudio.currentTime / bgAudio.duration) * 100;
        progressSlider.value = pct;
        const mins = Math.floor(bgAudio.currentTime / 60);
        const secs = Math.floor(bgAudio.currentTime % 60);
        timeLabel.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;
      }
    });
    bgAudio.addEventListener('volumechange', function() {
      volSlider.value = bgAudio.volume * 100;
    });
    bgAudio.addEventListener('ended', function() {
      // 由audio.js的ended事件处理下一首
      // 但UI需要更新
      setTimeout(updateUI, 100);
    });
  }

  // 同步音量滑块初始值
  window.updateVolumeSliderUI = function(vol) {
    volSlider.value = vol * 100;
  };

  // 外部点击面板外部不关闭（保留，但不强制）

  // ---- 自动恢复播放 ----
  const wasPlaying = localStorage.getItem('gomoku_playing') === 'true';
  if (wasPlaying) {
    playBgMusic();
    console.log('🎵 尝试自动续播...');
  }
}

function updateUI() {
  const playBtn = document.querySelector('.controls-row .play-btn');
  const toggleBtn = document.querySelector('.music-toggle');
  const dot = document.querySelector('.status-dot');
  if (!playBtn) return;
  if (bgAudio && !bgAudio.paused) {
    playBtn.innerHTML = '⏸️';
    playBtn.classList.add('playing');
    toggleBtn.classList.add('playing');
    dot.className = 'status-dot';
  } else {
    playBtn.innerHTML = '▶️';
    playBtn.classList.remove('playing');
    toggleBtn.classList.remove('playing');
    dot.className = 'status-dot paused';
  }
}

document.addEventListener('DOMContentLoaded', function() {
  if (typeof initAudio === 'function') {
    initAudio();
  }
  initMusicPlayer();
});