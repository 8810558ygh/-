// sw.js —— Service Worker 离线缓存

const CACHE_NAME = 'gomoku-v2';

// 所有需要离线缓存的文件列表（按你的实际文件名调整）
const urlsToCache = [
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
 'icons/apple-touch-icon.png',
  'icons/launchericon-72x72.png',
  'icons/launchericon-96x96.png',
  'icons/launchericon-144x144.png',
  'icons/launchericon-192x192.png',
  'icons/launchericon-512x512.png'
];

// 安装时缓存所有资源
self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(function(cache) {
        return cache.addAll(urlsToCache);
      })
      .then(function() {
        return self.skipWaiting();
      })
  );
});

// 激活时清理旧缓存
self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(cacheNames) {
      return Promise.all(
        cacheNames.map(function(cacheName) {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

// 拦截请求：先走缓存，缓存没有再联网
self.addEventListener('fetch', function(event) {
  event.respondWith(
    caches.match(event.request)
      .then(function(response) {
        if (response) {
          return response; // 缓存命中，直接返回
        }
        return fetch(event.request).then(function(response) {
          // 联网请求成功后，缓存一份副本
          if (!response || response.status !== 200 || response.type !== 'basic') {
            return response;
          }
          var responseToCache = response.clone();
          caches.open(CACHE_NAME).then(function(cache) {
            cache.put(event.request, responseToCache);
          });
          return response;
        });
      })
      .catch(function() {
        // 离线时返回首页
        return caches.match('index.html');
      })
  );
});