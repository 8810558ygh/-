// sw.js —— Service Worker 离线缓存（优化版）
// 核心缓存版本
const CORE_CACHE = 'gomoku-core-v5';
// 音频缓存版本（独立，不随核心更新）
const AUDIO_CACHE = 'gomoku-audio-v1';

// 核心文件（不含音频）
const coreUrls = [
  'index.html',
  '五子棋.html',
  '五子棋AI.html',
  '五子棋P2P.html',
  '五子棋supabase.html',
  '五子棋战绩.html',
  'style.css',
  'goban.js',
  'rules.js',
  'ai.js',
  'online-ui.js',
  'online-core.js',
  'online-p2p.js',
  'online-supabase.js',
  'audio.js',
  'music-player.css',
  'music-player.js',
  'icons/apple-touch-icon.png',
  'icons/launchericon-72x72.png',
  'icons/launchericon-96x96.png',
  'icons/launchericon-144x144.png',
  'icons/launchericon-192x192.png',
  'icons/launchericon-512x512.png'
];

// 安装时只缓存核心文件（不含音频）
self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CORE_CACHE)
      .then(function(cache) {
        console.log('📦 缓存核心文件...');
        return cache.addAll(coreUrls);
      })
      .then(function() {
        console.log('✅ 核心文件缓存完成');
        return self.skipWaiting();
      })
      .catch(function(err) {
        console.warn('⚠️ 核心文件缓存失败:', err);
      })
  );
});

// 激活时清理旧缓存
self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(cacheNames) {
      return Promise.all(
        cacheNames.map(function(cacheName) {
          // 保留当前核心缓存和音频缓存，删除其他所有旧缓存
          if (cacheName !== CORE_CACHE && cacheName !== AUDIO_CACHE) {
            console.log('🗑️ 删除旧缓存:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(function() {
      console.log('✅ Service Worker 激活完成');
      return self.clients.claim();
    })
  );
});

// 拦截请求
self.addEventListener('fetch', function(event) {
  const url = event.request.url;

  // 1. 音频文件：按需缓存（首次请求时下载并缓存）
  if (url.match(/\.(mp3|wav|ogg|m4a)$/i)) {
    event.respondWith(
      caches.open(AUDIO_CACHE).then(function(cache) {
        return caches.match(event.request).then(function(cached) {
          if (cached) {
            // 缓存命中，直接返回
            return cached;
          }
          // 缓存未命中，从网络获取并缓存
          return fetch(event.request).then(function(response) {
            if (response && response.status === 200) {
              cache.put(event.request, response.clone());
              console.log('🎵 音频文件已缓存:', url.split('/').pop());
            }
            return response;
          }).catch(function() {
            // 网络失败，尝试返回缓存的 index.html（兜底）
            return caches.match('index.html');
          });
        });
      })
    );
    return;
  }

  // 2. HTML 文件：优先从网络获取（确保总是最新），网络失败时用缓存
  if (url.endsWith('.html')) {
    event.respondWith(
      fetch(event.request)
        .then(function(response) {
          // 网络成功，缓存最新版本
          if (response && response.status === 200) {
            caches.open(CORE_CACHE).then(function(cache) {
              cache.put(event.request, response.clone());
            });
          }
          return response;
        })
        .catch(function() {
          // 网络失败，从缓存获取
          return caches.match(event.request).then(function(cached) {
            if (cached) {
              return cached;
            }
            // 缓存也没有，返回首页
            return caches.match('index.html');
          });
        })
    );
    return;
  }

  // 3. 其他资源（JS、CSS、图标等）：优先缓存，缓存没有则联网
  event.respondWith(
    caches.match(event.request)
      .then(function(response) {
        if (response) {
          return response;
        }
        return fetch(event.request).then(function(response) {
          if (!response || response.status !== 200 || response.type !== 'basic') {
            return response;
          }
          var responseToCache = response.clone();
          caches.open(CORE_CACHE).then(function(cache) {
            cache.put(event.request, responseToCache);
          });
          return response;
        });
      })
      .catch(function() {
        // 完全离线时，返回首页
        return caches.match('index.html');
      })
  );
});