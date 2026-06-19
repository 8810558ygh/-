// music-player.js - 音乐播放器（顶栏嵌入式，支持多个顶栏）

let panelOpen = false;

function initMusicPlayer() {
  if (document.querySelector('.music-player')) return;

  // 找到所有顶栏的 .top-right 容器
  const topRights = document.querySelectorAll('.top-right');
  if (!topRights || topRights.length === 0) {
    setTimeout(initMusicPlayer, 500);
    return;
  }

  // 遍历所有 .top-right，每个都插入音乐播放器
  topRights.forEach((topRight, index) => {
    // 如果这个顶栏已经有音乐播放器了，跳过
    if (topRight.querySelector('.music-player')) return;

    // 创建播放器容器
    const container = document.createElement('div');
    container.className = 'music-player';
    container.id = index === 0 ? 'musicPlayer' : 'musicPlayer_' + index;
    container.style.position = 'relative';

    // ---- 主按钮 ----
    const toggleBtn = document.createElement('button');
    toggleBtn.className = 'music-toggle';
    toggleBtn.innerHTML = '🎵';
    toggleBtn.title = '音乐控制';
    const dot = document.createElement('span');
    dot.className = 'status-dot paused';
    toggleBtn.appendChild(dot);
    container.appendChild(toggleBtn);

    // ---- 展开面板 ----
    const panel = document.createElement('div');
    panel.className = 'music-panel';
    panel.id = 'musicPanel_' + index;

    // 控制行
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

    // 工具栏
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

    // 插入到顶栏的 .top-right 中（放在"设置"按钮前面）
    const settingsBtn = topRight.querySelector('.settings-btn');
    if (settingsBtn) {
      topRight.insertBefore(container, settingsBtn);
    } else {
      topRight.appendChild(container);
    }

    // ---- 事件绑定（只绑定一次，但多个实例共享同一个音频对象） ----
    // 只有第一个实例绑定事件，其他实例只负责UI同步
    if (index === 0) {
      bindEvents(container, toggleBtn, panel, playBtn, progressSlider, timeLabel, volSlider, volIcon, nextBtn);
    } else {
      // 其他实例只同步UI
      const updateUI = function() {
        updatePlayerUI(playBtn, toggleBtn, dot);
      };
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
      }
      // 展开/折叠
      toggleBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        // 关闭其他面板
        document.querySelectorAll('.music-panel').forEach(p => {
          if (p.id !== panel.id) p.classList.remove('open');
        });
        panelOpen = !panelOpen;
        panel.classList.toggle('open', panelOpen);
        toggleBtn.title = panelOpen ? '收起音乐控制' : '音乐控制';
      });
      // 播放/暂停
      playBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        toggleBgMusic();
        setTimeout(() => {
          document.querySelectorAll('.play-btn').forEach(btn => {
            if (bgAudio && !bgAudio.paused) {
              btn.innerHTML = '⏸️';
              btn.classList.add('playing');
            } else {
              btn.innerHTML = '▶️';
              btn.classList.remove('playing');
            }
          });
        }, 50);
      });
      // 进度条（简版）
      progressSlider.addEventListener('pointerdown', function() { isDragging = true; });
      progressSlider.addEventListener('pointerup', function() {
        isDragging = false;
        if (bgAudio) {
          const pct = progressSlider.value / 100;
          bgAudio.currentTime = pct * bgAudio.duration;
          localStorage.setItem(TIME_KEY, bgAudio.currentTime.toString());
        }
      });
      // 音量
      volSlider.addEventListener('input', function() {
        setBgVolume(this.value / 100);
        if (this.value == 0) volIcon.textContent = '🔇';
        else if (this.value < 50) volIcon.textContent = '🔉';
        else volIcon.textContent = '🔊';
      });
      // 下一首
      nextBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        if (typeof nextSong === 'function') {
          nextSong();
          setTimeout(() => {
            document.querySelectorAll('.play-btn').forEach(btn => {
              if (bgAudio && !bgAudio.paused) {
                btn.innerHTML = '⏸️';
                btn.classList.add('playing');
              } else {
                btn.innerHTML = '▶️';
                btn.classList.remove('playing');
              }
            });
          }, 50);
        }
      });
      // 点击面板外关闭
      document.addEventListener('click', function(e) {
        if (panelOpen && !container.contains(e.target)) {
          panelOpen = false;
          panel.classList.remove('open');
          toggleBtn.title = '音乐控制';
        }
      });
      // 初始UI
      updatePlayerUI(playBtn, toggleBtn, dot);
    }
  });
}

// 绑定事件（只执行一次）
let isDragging = false;

function bindEvents(container, toggleBtn, panel, playBtn, progressSlider, timeLabel, volSlider, volIcon, nextBtn) {
  // 主按钮
  toggleBtn.addEventListener('click', function(e) {
    e.stopPropagation();
    // 关闭其他面板
    document.querySelectorAll('.music-panel').forEach(p => {
      if (p.id !== panel.id) p.classList.remove('open');
    });
    panelOpen = !panelOpen;
    panel.classList.toggle('open', panelOpen);
    toggleBtn.title = panelOpen ? '收起音乐控制' : '音乐控制';
  });

  // 播放/暂停
  playBtn.addEventListener('click', function(e) {
    e.stopPropagation();
    toggleBgMusic();
    updateAllUI();
  });

  // 进度条
  progressSlider.addEventListener('pointerdown', function() { isDragging = true; });
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
        const mins = Math.floor(newTime / 60);
        const secs = Math.floor(newTime % 60);
        timeLabel.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;
      }
    }
  });

  // 音量
  volSlider.addEventListener('input', function() {
    setBgVolume(this.value / 100);
    if (this.value == 0) volIcon.textContent = '🔇';
    else if (this.value < 50) volIcon.textContent = '🔉';
    else volIcon.textContent = '🔊';
  });

  // 下一首
  nextBtn.addEventListener('click', function(e) {
    e.stopPropagation();
    if (typeof nextSong === 'function') {
      nextSong();
      setTimeout(updateAllUI, 50);
    }
  });

  // 点击面板外关闭
  document.addEventListener('click', function(e) {
    if (panelOpen && !container.contains(e.target)) {
      panelOpen = false;
      panel.classList.remove('open');
      toggleBtn.title = '音乐控制';
    }
  });

  // 音频事件
  if (bgAudio) {
    bgAudio.addEventListener('play', updateAllUI);
    bgAudio.addEventListener('pause', updateAllUI);
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
  }

  // 初始化UI
  updateAllUI();

  // 自动恢复播放
  const wasPlaying = localStorage.getItem('gomoku_playing') === 'true';
  if (wasPlaying) {
    playBgMusic();
    console.log('🎵 尝试自动续播...');
  }
}

// 更新所有UI实例
function updateAllUI() {
  document.querySelectorAll('.play-btn').forEach(btn => {
    if (bgAudio && !bgAudio.paused) {
      btn.innerHTML = '⏸️';
      btn.classList.add('playing');
    } else {
      btn.innerHTML = '▶️';
      btn.classList.remove('playing');
    }
  });
  document.querySelectorAll('.music-toggle').forEach(toggle => {
    if (bgAudio && !bgAudio.paused) {
      toggle.classList.add('playing');
      const dot = toggle.querySelector('.status-dot');
      if (dot) dot.className = 'status-dot';
    } else {
      toggle.classList.remove('playing');
      const dot = toggle.querySelector('.status-dot');
      if (dot) dot.className = 'status-dot paused';
    }
  });
}

// 单个UI更新（用于副本）
function updatePlayerUI(playBtn, toggleBtn, dot) {
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