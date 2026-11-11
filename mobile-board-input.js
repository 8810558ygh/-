// mobile-board-input.js - Safer touch input and landscape support for board games.
(function () {
    'use strict';

    const coarsePointer = window.matchMedia
        ? window.matchMedia('(pointer: coarse)')
        : { matches: false };

    function isTouchDevice() {
        return coarsePointer.matches || navigator.maxTouchPoints > 0;
    }

    function eventUsesTouch(event, lastPointerType) {
        const pointerType = (event && event.pointerType) || lastPointerType;
        if (pointerType) return pointerType === 'touch';

        if (event && event.sourceCapabilities
            && typeof event.sourceCapabilities.firesTouchEvents === 'boolean') {
            return event.sourceCapabilities.firesTouchEvents;
        }

        // Fallback for older browsers without pointer events.
        return coarsePointer.matches && navigator.maxTouchPoints > 0;
    }

    function getBoardPoint(canvas, event, margin, cellSize, boardSize) {
        const rect = canvas.getBoundingClientRect();
        if (!rect.width || !rect.height) return null;

        const x = (event.clientX - rect.left) * (canvas.width / rect.width);
        const y = (event.clientY - rect.top) * (canvas.height / rect.height);
        const col = Math.round((x - margin) / cellSize);
        const row = Math.round((y - margin) / cellSize);

        if (row < 0 || row >= boardSize || col < 0 || col >= boardSize) {
            return { row: null, col: null, valid: false, outsideBoard: true };
        }

        const targetX = margin + col * cellSize;
        const targetY = margin + row * cellSize;
        const distance = Math.hypot(x - targetX, y - targetY);

        return {
            row: row,
            col: col,
            valid: distance <= cellSize * 0.46,
            outsideBoard: false
        };
    }

    function attach(options) {
        const canvas = options.canvas;
        const wrap = canvas.parentElement;
        if (!canvas || !wrap) {
            throw new Error('MobileBoardInput requires a canvas inside a board wrapper');
        }

        wrap.classList.add('touch-board-wrap');

        const preview = document.createElement('div');
        preview.className = 'board-tap-preview';
        preview.setAttribute('aria-hidden', 'true');

        const tip = document.createElement('div');
        tip.className = 'board-tap-tip';
        tip.textContent = '再点同一交叉点确认落子';
        tip.setAttribute('aria-hidden', 'true');

        wrap.appendChild(preview);
        wrap.appendChild(tip);

        let selected = null;
        let lastPointerType = '';

        canvas.addEventListener('pointerdown', function (event) {
            lastPointerType = event.pointerType || '';
        }, { passive: true });

        function clearPreview() {
            selected = null;
            preview.classList.remove('show');
            tip.classList.remove('show');
        }

        function positionPreview(row, col) {
            const canvasRect = canvas.getBoundingClientRect();
            const wrapRect = wrap.getBoundingClientRect();
            if (!canvasRect.width || !canvasRect.height) return;

            const x = (options.margin + col * options.cellSize) / canvas.width;
            const y = (options.margin + row * options.cellSize) / canvas.height;
            const size = Math.max(24, (options.cellSize / canvas.width) * canvasRect.width * 0.86);

            preview.style.width = size + 'px';
            preview.style.height = size + 'px';
            preview.style.left = (canvasRect.left - wrapRect.left + x * canvasRect.width) + 'px';
            preview.style.top = (canvasRect.top - wrapRect.top + y * canvasRect.height) + 'px';
            preview.classList.add('show');
            tip.classList.add('show');
        }

        function place(row, col) {
            const result = options.onPlace(row, col);
            if (result !== false) clearPreview();
        }

        function handleClick(event) {
            const canSelect = !options.canSelect || options.canSelect();
            if (!canSelect) {
                clearPreview();
                if (options.onNotReady) options.onNotReady();
                return;
            }

            const point = getBoardPoint(
                canvas,
                event,
                options.margin,
                options.cellSize,
                options.boardSize || 15
            );

            if (!point || !point.valid) {
                clearPreview();
                if (point && !point.outsideBoard && options.onMiss) options.onMiss();
                return;
            }

            if (options.canPlace && !options.canPlace(point.row, point.col)) {
                clearPreview();
                if (options.onBlocked) options.onBlocked(point.row, point.col);
                return;
            }

            if (!eventUsesTouch(event, lastPointerType)) {
                place(point.row, point.col);
                return;
            }

            if (selected && selected.row === point.row && selected.col === point.col) {
                place(point.row, point.col);
                return;
            }

            selected = point;
            positionPreview(point.row, point.col);
            if (options.onPreview) options.onPreview(point.row, point.col);
        }

        function reposition() {
            if (selected) positionPreview(selected.row, selected.col);
        }

        window.addEventListener('resize', reposition);
        window.addEventListener('orientationchange', function () {
            setTimeout(reposition, 120);
        });

        return {
            handleClick: handleClick,
            clear: clearPreview,
            isTouchDevice: isTouchDevice
        };
    }

    window.MobileBoardInput = {
        attach: attach,
        getBoardPoint: getBoardPoint,
        isTouchDevice: isTouchDevice
    };
})();
