// app-navigation.js - Shared in-app navigation for all Gomoku screens.
(function () {
    'use strict';

    const HTML_ROUTE = /^[^?#]+\.html(?:[?#].*)?$/i;
    const EXTERNAL_URL = /^(?:[a-z]+:)?\/\//i;
    let shell = null;

    function syncHostAudio() {
        // The hall owns the only music instance while child pages are displayed.
        if (typeof bgAudio === 'undefined') return;
        if (!bgAudio && typeof initAudio === 'function') initAudio();
        if (!bgAudio) return;

        if (bgAudio.paused && localStorage.getItem('gomoku_playing') === 'true') {
            bgAudio.play().catch(function () {
                // Browsers may require a user gesture before playback can resume.
            });
        }
    }

    function navigatePage(url, options) {
        if (!url) return;

        options = options || {};

        if (shell) {
            shell.navigate(url, options);
            return;
        }

        if (window.parent !== window) {
            try {
                if (window.parent.GomokuNavigation) {
                    window.parent.GomokuNavigation.navigate(url, options);
                    return;
                }
            } catch (e) {
                // Local file pages can have an opaque origin, so direct parent access may fail.
            }

            try {
                window.parent.postMessage({
                    type: 'gomoku:navigate',
                    route: url,
                    options: { replace: !!options.replace }
                }, '*');
                return;
            } catch (e) {
                console.warn('GomokuNavigation: could not contact the app shell', e);
            }
        }

        if (EXTERNAL_URL.test(url)) {
            if (options.newTab) window.open(url, '_blank', 'noopener');
            else window.location.href = url;
            return;
        }

        if (options.replace) window.location.replace(url);
        else window.location.href = url;
    }

    function installShell(config) {
        const container = document.getElementById(config.containerId);
        const viewHost = document.getElementById(config.viewsId);
        if (!container || !viewHost) {
            console.warn('GomokuNavigation: app shell elements were not found');
            return;
        }

        const titles = config.titles || {};
        const homeTitle = config.homeTitle || document.title;
        const views = new Map();
        let currentRoute = '';
        let activeFrame = null;

        function routeFromHash() {
            let route = window.location.hash.startsWith('#/')
                ? window.location.hash.slice(2)
                : '';

            try {
                route = decodeURI(route);
            } catch (e) {
                // Keep the raw hash if it contains malformed escaping.
            }

            return route;
        }

        function isHomeRoute(route) {
            return !route || route === 'index.html' || route.startsWith('index.html?');
        }

        function embeddedRoute(route) {
            const separator = route.includes('?') ? '&' : '?';
            return route + separator + 'embedded=1';
        }

        function ensureView(route) {
            if (views.has(route)) return views.get(route);

            const frame = document.createElement('iframe');
            frame.className = 'app-shell-frame';
            frame.title = titles[route.split(/[?#]/)[0]] || '东南五子应用页面';
            frame.setAttribute('allow', 'microphone; clipboard-write; autoplay; fullscreen');
            frame.dataset.route = route;
            frame.src = embeddedRoute(route);

            frame.addEventListener('load', function () {
                if (activeFrame !== frame) return;
                try {
                    const childTitle = frame.contentDocument && frame.contentDocument.title;
                    if (childTitle) document.title = childTitle;
                } catch (e) {
                    // The configured route title remains available for file-origin pages.
                }
            });

            viewHost.appendChild(frame);
            const view = { frame: frame, route: route };
            views.set(route, view);
            return view;
        }

        function showView(view) {
            views.forEach(function (item) {
                item.frame.classList.toggle('active', item === view);
                item.frame.setAttribute('aria-hidden', item === view ? 'false' : 'true');
            });
            activeFrame = view.frame;
        }

        function render(route) {
            route = route || '';
            currentRoute = isHomeRoute(route) ? '' : route;
            syncHostAudio();

            if (!currentRoute) {
                views.forEach(function (item) {
                    item.frame.classList.remove('active');
                    item.frame.setAttribute('aria-hidden', 'true');
                });
                activeFrame = null;
                container.classList.add('hidden');
                container.setAttribute('aria-hidden', 'true');
                document.body.classList.remove('app-shell-active');
                document.title = homeTitle;
                window.dispatchEvent(new CustomEvent('gomoku:routechange', {
                    detail: { route: 'index.html' }
                }));
                return;
            }

            const view = ensureView(currentRoute);
            showView(view);
            container.classList.remove('hidden');
            container.setAttribute('aria-hidden', 'false');
            document.body.classList.add('app-shell-active');
            document.title = titles[currentRoute.split(/[?#]/)[0]] || homeTitle;
        }

        function updateRoute(route, replace) {
            const hash = '#/' + encodeURI(route);
            if (window.location.hash !== hash) {
                if (replace) {
                    window.history.replaceState(null, '', hash);
                } else {
                    window.history.pushState(null, '', hash);
                }
            }
            render(route);
        }

        function navigate(url, options) {
            options = options || {};
            if (!url) return;

            if (EXTERNAL_URL.test(url)) {
                if (options.newTab) window.open(url, '_blank', 'noopener');
                else window.location.href = url;
                return;
            }

            let route = String(url).replace(/^\.\//, '');
            if (route.startsWith('index.html') || route === '' || route === '#/') {
                updateRoute('', options.replace);
                return;
            }

            if (!HTML_ROUTE.test(route) && !route.startsWith('五子棋')) {
                window.location.href = route;
                return;
            }

            updateRoute(route, options.replace);
        }

        function resetViews() {
            views.forEach(function (item) {
                item.frame.remove();
            });
            views.clear();
            activeFrame = null;
            if (currentRoute) render(currentRoute);
        }

        function preload(routes) {
            (routes || []).forEach(function (route) {
                if (route && !isHomeRoute(route)) ensureView(route);
            });
        }

        shell = { navigate: navigate, preload: preload, resetViews: resetViews };

        window.addEventListener('popstate', function () {
            render(routeFromHash());
        });
        window.addEventListener('hashchange', function () {
            render(routeFromHash());
        });
        window.addEventListener('message', function (event) {
            if (!event.data || !activeFrame || event.source !== activeFrame.contentWindow) return;
            if (event.data.type === 'gomoku:navigate' && event.data.route) {
                navigate(event.data.route, event.data.options);
            }
        });

        render(routeFromHash());
    }

    // Internal links without a dedicated handler still stay inside the app shell.
    document.addEventListener('click', function (event) {
        const link = event.target.closest('a[href]');
        if (!link || link.target === '_blank' || event.defaultPrevented) return;

        const href = link.getAttribute('href');
        if (!href || href.startsWith('#') || /^(?:mailto:|tel:|javascript:)/i.test(href)) return;

        try {
            const target = new URL(href, window.location.href);
            if (target.origin !== window.location.origin) return;
            if (!/\.html$/i.test(target.pathname)) return;
            event.preventDefault();
            navigatePage(target.pathname.split('/').pop() + target.search + target.hash);
        } catch (e) {
            // Let the browser handle malformed URLs.
        }
    });

    window.GomokuNavigation = {
        navigate: navigatePage,
        installShell: installShell,
        preload: function (routes) {
            if (shell && shell.preload) shell.preload(routes);
        },
        resetViews: function () {
            if (shell && shell.resetViews) shell.resetViews();
        }
    };
    window.navigatePage = navigatePage;
})();
