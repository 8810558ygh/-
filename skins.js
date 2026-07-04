// skins.js —— 皮肤定义、渲染与存储管理（经典 + 小狗 + 赛博全息投影）

// ========== 小狗头像绘制函数 ==========
function drawPuppyFace(ctx, x, y, radius, player) {
    const isBlack = (player === 1);
    const r = radius;
    ctx.save();
    ctx.translate(x, y);

    const headColor = isBlack ? '#2a2a2a' : '#f5ede3';
    const earColor = isBlack ? '#1a1a1a' : '#e8d5b8';
    const eyeColor = isBlack ? '#ffffff' : '#1a1a1a';
    const noseColor = '#1a1a1a';

    // 头部阴影
    ctx.shadowColor = 'rgba(0,0,0,0.3)';
    ctx.shadowBlur = 4;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, 2 * Math.PI);
    ctx.fillStyle = headColor;
    ctx.fill();
    ctx.shadowBlur = 0;

    // 耳朵
    ctx.fillStyle = earColor;
    if (isBlack) {
        // 边牧：三角形尖耳朵
        ctx.beginPath();
        ctx.moveTo(-r * 0.5, -r * 0.6);
        ctx.lineTo(-r * 0.9, -r * 1.2);
        ctx.lineTo(-r * 0.2, -r * 0.9);
        ctx.closePath();
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(r * 0.5, -r * 0.6);
        ctx.lineTo(r * 0.9, -r * 1.2);
        ctx.lineTo(r * 0.2, -r * 0.9);
        ctx.closePath();
        ctx.fill();
    } else {
        // 比熊：圆润小耳朵
        ctx.beginPath();
        ctx.arc(-r * 0.6, -r * 0.7, r * 0.3, 0, 2 * Math.PI);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(r * 0.6, -r * 0.7, r * 0.3, 0, 2 * Math.PI);
        ctx.fill();
    }

    // 眼睛
    ctx.fillStyle = eyeColor;
    ctx.beginPath();
    ctx.arc(-r * 0.3, -r * 0.1, r * 0.12, 0, 2 * Math.PI);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(r * 0.3, -r * 0.1, r * 0.12, 0, 2 * Math.PI);
    ctx.fill();

    // 瞳孔/高光
    if (isBlack) {
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(-r * 0.28, -r * 0.08, r * 0.05, 0, 2 * Math.PI);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(r * 0.28, -r * 0.08, r * 0.05, 0, 2 * Math.PI);
        ctx.fill();
    } else {
        ctx.fillStyle = '#1a1a1a';
        ctx.beginPath();
        ctx.arc(-r * 0.28, -r * 0.05, r * 0.07, 0, 2 * Math.PI);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(r * 0.28, -r * 0.05, r * 0.07, 0, 2 * Math.PI);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(-r * 0.30, -r * 0.08, r * 0.03, 0, 2 * Math.PI);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(r * 0.30, -r * 0.08, r * 0.03, 0, 2 * Math.PI);
        ctx.fill();
    }

    // 鼻子
    ctx.fillStyle = noseColor;
    ctx.beginPath();
    ctx.arc(0, r * 0.2, r * 0.12, 0, 2 * Math.PI);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.beginPath();
    ctx.arc(-r * 0.04, r * 0.15, r * 0.04, 0, 2 * Math.PI);
    ctx.fill();

    // 微笑嘴巴
    ctx.strokeStyle = isBlack ? '#ffffff' : '#1a1a1a';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, r * 0.3, r * 0.2, 0.1, Math.PI - 0.1);
    ctx.stroke();

    // 比熊蓬松卷毛
    if (!isBlack) {
        ctx.strokeStyle = '#e8d5b8';
        ctx.lineWidth = 1.2;
        for (let i = 0; i < 12; i++) {
            const angle = Math.random() * 2 * Math.PI;
            const dist = r * 0.9;
            const x1 = dist * Math.cos(angle);
            const y1 = dist * Math.sin(angle);
            ctx.beginPath();
            ctx.arc(x1, y1, r * 0.15, 0, Math.PI * 1.5);
            ctx.stroke();
        }
    }

    ctx.restore();
}

// ========== 赛博全息投影棋子绘制函数 ==========
function drawCyberStone(ctx, x, y, radius, player) {
    const isBlack = (player === 1);
    ctx.save();
    ctx.translate(x, y);

    // 基础发光颜色
    const color1 = isBlack ? '#00b4ff' : '#00ffe0';
    const color2 = isBlack ? '#6a00ff' : '#80ffaa';

    // ---- 外发光光晕 ----
    const grad = ctx.createRadialGradient(0, 0, radius * 0.1, 0, 0, radius * 1.4);
    grad.addColorStop(0, color1 + '40');
    grad.addColorStop(0.4, color1 + '20');
    grad.addColorStop(1, color1 + '00');
    ctx.shadowColor = 'transparent';
    ctx.beginPath();
    ctx.arc(0, 0, radius * 1.4, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();

    // ---- 主体圆（半透明渐变） ----
    const bodyGrad = ctx.createRadialGradient(
        -radius * 0.3, -radius * 0.3, radius * 0.1,
        0, 0, radius
    );
    bodyGrad.addColorStop(0, isBlack ? '#cceeff' : '#ffffff');
    bodyGrad.addColorStop(0.3, isBlack ? '#80c8ff' : '#b0ffea');
    bodyGrad.addColorStop(0.7, isBlack ? '#3a7acc' : '#40ccaa');
    bodyGrad.addColorStop(1, isBlack ? '#0a1a3a' : '#003322');
    ctx.shadowColor = color1;
    ctx.shadowBlur = 20;
    ctx.beginPath();
    ctx.arc(0, 0, radius * 0.9, 0, Math.PI * 2);
    ctx.fillStyle = bodyGrad;
    ctx.fill();

    // ---- 发光边缘环 ----
    ctx.shadowBlur = 30;
    ctx.shadowColor = color2;
    ctx.strokeStyle = color1;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(0, 0, radius * 0.85, 0, Math.PI * 2);
    ctx.stroke();

    // ---- 内圈高光线 ----
    ctx.shadowBlur = 15;
    ctx.shadowColor = color2;
    ctx.strokeStyle = color2;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, 0, radius * 0.6, 0, Math.PI * 2);
    ctx.stroke();

    // ---- 中心亮点 ----
    ctx.shadowBlur = 0;
    const hlGrad = ctx.createRadialGradient(
        -radius * 0.15, -radius * 0.3, radius * 0.05,
        -radius * 0.1, -radius * 0.2, radius * 0.4
    );
    hlGrad.addColorStop(0, '#ffffff');
    hlGrad.addColorStop(1, '#ffffff00');
    ctx.fillStyle = hlGrad;
    ctx.beginPath();
    ctx.arc(0, 0, radius * 0.4, 0, Math.PI * 2);
    ctx.fill();

    // ---- 扫描线效果（横线） ----
    ctx.shadowBlur = 0;
    ctx.strokeStyle = color1 + '30';
    ctx.lineWidth = 1;
    for (let i = -0.6; i <= 0.6; i += 0.3) {
        const yPos = i * radius;
        ctx.beginPath();
        ctx.moveTo(-radius * 0.7, yPos);
        ctx.lineTo(radius * 0.7, yPos);
        ctx.stroke();
    }

    // ---- 动态像素点（装饰） ----
    ctx.fillStyle = color2 + '60';
    for (let i = 0; i < 8; i++) {
        const angle = (i / 8) * Math.PI * 2;
        const dist = radius * 0.75;
        const px = dist * Math.cos(angle);
        const py = dist * Math.sin(angle);
        ctx.beginPath();
        ctx.arc(px, py, radius * 0.04, 0, Math.PI * 2);
        ctx.fill();
    }

    ctx.restore();
}

// ========== 棋子皮肤（经典 + 小狗 + 赛博） ==========
const STONE_SKINS = {
    classic: {
        name: '经典木纹',
        blackGradient: ['#6d5a4a', '#3d2e1f', '#1a120a'],
        whiteGradient: ['#ffffff', '#f0e6d3', '#c8bca6'],
        highlightBlack: 'rgba(255,255,255,0.08)',
        highlightWhite: 'rgba(255,255,255,0.6)'
    },
    puppy: {
        name: '小狗狗 🐾',
        blackGradient: ['#2a2a2a', '#1a1a1a', '#0a0a0a'],
        whiteGradient: ['#f5ede3', '#f0e0d0', '#dcc8b0'],
        highlightBlack: 'rgba(255,215,0,0.2)',
        highlightWhite: 'rgba(255,255,255,0.7)',
        drawStoneFn: drawPuppyFace
    },
    cyber: {
        name: '赛博全息 🤖',
        drawStoneFn: drawCyberStone,
        blackGradient: ['#00b4ff', '#3a7acc', '#0a1a3a'],
        whiteGradient: ['#00ffe0', '#40ccaa', '#003322'],
        highlightBlack: 'rgba(0,180,255,0.5)',
        highlightWhite: 'rgba(0,255,224,0.5)'
    }
};
STONE_SKINS.default = STONE_SKINS.classic;

// ========== 棋盘皮肤（经典 + 小狗 + 赛博） ==========
const BOARD_SKINS = {
    classic: {
        name: '经典木纹',
        bgColor: '#eedbbc',
        gridColor: '#6b4c2c',
        starColor: '#4a3a28',
        starSize: 4,
        borderColor: '#5c3a1e',
        drawDecor: function(ctx, w, h) {
            ctx.save();
            ctx.globalAlpha = 0.08;
            for (let i = 0; i < 20; i++) {
                const y = Math.random() * h;
                ctx.strokeStyle = '#5a3a1a';
                ctx.lineWidth = 1 + Math.random() * 2;
                ctx.beginPath();
                ctx.moveTo(0, y);
                for (let x = 0; x < w; x += 20) {
                    ctx.lineTo(x, y + Math.sin(x * 0.03 + i) * 8 + Math.random() * 4 - 2);
                }
                ctx.stroke();
            }
            ctx.restore();
        }
    },
    puppy: {
        name: '狗狗乐园',
        bgColor: '#f5ede3',
        gridColor: '#c4a88a',
        starColor: '#e8a0a0',
        starSize: 5,
        borderColor: '#b89878',
        drawDecor: function(ctx, w, h) {
            ctx.save();
            const drawPaw = (cx, cy, size, alpha) => {
                ctx.globalAlpha = alpha;
                ctx.fillStyle = '#dbb8a0';
                ctx.shadowColor = '#dbb8a0';
                ctx.shadowBlur = 4;
                ctx.beginPath();
                ctx.ellipse(cx, cy + size * 0.2, size * 0.4, size * 0.5, 0, 0, 2 * Math.PI);
                ctx.fill();
                const offsets = [
                    [-0.35, -0.3], [0.35, -0.3], [-0.2, -0.5], [0.2, -0.5]
                ];
                for (let [dx, dy] of offsets) {
                    ctx.beginPath();
                    ctx.arc(cx + dx * size, cy + dy * size, size * 0.18, 0, 2 * Math.PI);
                    ctx.fill();
                }
            };
            for (let i = 0; i < 25; i++) {
                const x = 20 + Math.random() * (w - 40);
                const y = 20 + Math.random() * (h - 40);
                const size = 10 + Math.random() * 25;
                const alpha = 0.06 + Math.random() * 0.12;
                drawPaw(x, y, size, alpha);
            }
            ctx.restore();
        }
    },
    cyber_board: {
        name: '赛博全息 🌐',
        bgColor: '#0a0e1a',
        gridColor: '#00b4ff',
        starColor: '#00ffe0',
        starSize: 0,
        borderColor: '#00b4ff',
        drawDecor: function(ctx, w, h) {
            ctx.save();
            // 背景光晕
            const grad = ctx.createRadialGradient(w*0.5, h*0.5, 0, w*0.5, h*0.5, w*0.7);
            grad.addColorStop(0, 'rgba(0,180,255,0.06)');
            grad.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, w, h);

            // 浮点粒子
            for (let i = 0; i < 50; i++) {
                const x = Math.random() * w;
                const y = Math.random() * h;
                const size = 1 + Math.random() * 2;
                const alpha = 0.2 + Math.random() * 0.5;
                const hue = Math.random() > 0.5 ? 200 : 180;
                ctx.fillStyle = `hsla(${hue}, 100%, 70%, ${alpha})`;
                ctx.shadowColor = `hsla(${hue}, 100%, 70%, 0.4)`;
                ctx.shadowBlur = 6;
                ctx.beginPath();
                ctx.arc(x, y, size, 0, Math.PI * 2);
                ctx.fill();
            }

            // 角落科技感线条
            ctx.shadowBlur = 10;
            ctx.shadowColor = '#00b4ff';
            ctx.strokeStyle = 'rgba(0,180,255,0.15)';
            ctx.lineWidth = 1;
            const corners = [
                [10, 10, 30, 10, 10, 30],
                [w-10, 10, w-30, 10, w-10, 30],
                [10, h-10, 30, h-10, 10, h-30],
                [w-10, h-10, w-30, h-10, w-10, h-30]
            ];
            for (let [x1, y1, x2, y2, x3, y3] of corners) {
                ctx.beginPath();
                ctx.moveTo(x1, y1);
                ctx.lineTo(x2, y2);
                ctx.stroke();
                ctx.beginPath();
                ctx.moveTo(x1, y1);
                ctx.lineTo(x3, y3);
                ctx.stroke();
            }
            ctx.restore();
        },
        drawGrid: function(ctx, margin, gridSize, boardSize, cellSize) {
            ctx.save();
            ctx.shadowBlur = 8;
            ctx.shadowColor = '#00b4ff';
            ctx.strokeStyle = 'rgba(0,180,255,0.5)';
            ctx.lineWidth = 1.2;

            for (let i = 0; i < boardSize; i++) {
                const pos = margin + i * cellSize;
                ctx.beginPath();
                ctx.moveTo(margin, pos);
                ctx.lineTo(margin + gridSize, pos);
                ctx.stroke();
                ctx.beginPath();
                ctx.moveTo(pos, margin);
                ctx.lineTo(pos, margin + gridSize);
                ctx.stroke();
            }

            ctx.shadowBlur = 4;
            ctx.strokeStyle = 'rgba(0,180,255,0.15)';
            ctx.lineWidth = 0.5;
            for (let i = 0; i < boardSize; i += 0.5) {
                if (i % 1 === 0) continue;
                const pos = margin + i * cellSize;
                ctx.beginPath();
                ctx.moveTo(margin, pos);
                ctx.lineTo(margin + gridSize, pos);
                ctx.stroke();
                ctx.beginPath();
                ctx.moveTo(pos, margin);
                ctx.lineTo(pos, margin + gridSize);
                ctx.stroke();
            }

            const stars = [[3,3],[3,7],[3,11],[7,3],[7,7],[7,11],[11,3],[11,7],[11,11]];
            ctx.shadowBlur = 15;
            ctx.shadowColor = '#00ffe0';
            ctx.strokeStyle = '#00ffe0';
            ctx.lineWidth = 1.5;
            for (const [r, c] of stars) {
                const x = margin + c * cellSize;
                const y = margin + r * cellSize;
                const size = 6;
                ctx.beginPath();
                ctx.moveTo(x, y - size);
                ctx.lineTo(x + size, y);
                ctx.lineTo(x, y + size);
                ctx.lineTo(x - size, y);
                ctx.closePath();
                ctx.stroke();
                ctx.fillStyle = '#00ffe0';
                ctx.shadowBlur = 20;
                ctx.beginPath();
                ctx.arc(x, y, 2, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.restore();
        }
    }
};
BOARD_SKINS.default = BOARD_SKINS.classic;

// ========== 工具函数 ==========
function getStoneSkin() {
    const stored = localStorage.getItem('stoneSkin');
    return (stored && STONE_SKINS[stored]) ? stored : 'classic';
}

function getBoardSkin() {
    const stored = localStorage.getItem('boardSkin');
    return (stored && BOARD_SKINS[stored]) ? stored : 'classic';
}

function setStoneSkin(name) {
    if (STONE_SKINS[name]) {
        localStorage.setItem('stoneSkin', name);
        return true;
    }
    return false;
}

function setBoardSkin(name) {
    if (BOARD_SKINS[name]) {
        localStorage.setItem('boardSkin', name);
        return true;
    }
    return false;
}

// ========== UI 渲染 ==========
const SkinUI = {
    init() {
        this.renderStoneSkins();
        this.renderBoardSkins();
        this.highlightSelected();
        this.bindModalEvents();
    },

    bindModalEvents() {
        const modal = document.getElementById('previewModal');
        if (!modal) return;
        modal.addEventListener('click', (e) => {
            if (e.target === modal) this.closePreview();
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') this.closePreview();
        });
    },

    // ---------- 棋子皮肤 ----------
    renderStoneSkins() {
        const container = document.getElementById('stoneSkinGrid');
        if (!container) return;
        const current = getStoneSkin();
        let html = '';
        for (const [key, skin] of Object.entries(STONE_SKINS)) {
            if (key === 'default') continue;
            const isSelected = key === current;
            html += `
                <div class="skin-card ${isSelected ? 'selected' : ''}" data-skin-key="${key}" data-type="stone">
                    <div class="skin-thumb">
                        <canvas class="stone-thumb-canvas" width="60" height="60" data-skin="${key}"></canvas>
                    </div>
                    <div class="skin-name">${skin.name}</div>
                    <div class="skin-check"></div>
                </div>
            `;
        }
        container.innerHTML = html;

        container.querySelectorAll('.stone-thumb-canvas').forEach(canvas => {
            const key = canvas.dataset.skin;
            const skin = STONE_SKINS[key];
            if (!skin) return;
            const ctx = canvas.getContext('2d');
            this.drawStoneThumb(ctx, canvas.width, canvas.height, skin);
        });

        container.querySelectorAll('.skin-card[data-type="stone"]').forEach(card => {
            card.addEventListener('click', () => {
                const key = card.dataset.skinKey;
                this.openStonePreview(key);
            });
        });
    },

    drawStoneThumb(ctx, w, h, skin) {
        const r = Math.min(w, h) * 0.3;
        const cx = w / 2, cy = h / 2;
        ctx.clearRect(0, 0, w, h);

        const drawOne = (x, y, player) => {
            if (skin.drawStoneFn) {
                // 直接调用自定义绘制函数，传递正确的半径
                ctx.save();
                skin.drawStoneFn(ctx, x, y, r * 0.9, player);
                ctx.restore();
                return;
            }
            // 默认渐变绘制
            const grad = ctx.createRadialGradient(
                x - r * 0.3, y - r * 0.3, r * 0.1,
                x, y, r
            );
            const colors = player === 1 ?
                (skin.blackGradient || ['#6d5a4a', '#3d2e1f', '#1a120a']) :
                (skin.whiteGradient || ['#ffffff', '#f0e6d3', '#c8bca6']);
            grad.addColorStop(0, colors[0]);
            grad.addColorStop(0.3, colors[1]);
            grad.addColorStop(1, colors[2]);
            ctx.beginPath();
            ctx.arc(x, y, r, 0, Math.PI * 2);
            ctx.fillStyle = grad;
            ctx.fill();
            ctx.beginPath();
            ctx.arc(x - r * 0.25, y - r * 0.25, r * 0.3, 0, Math.PI * 2);
            const hl = player === 1 ?
                (skin.highlightBlack || 'rgba(255,255,255,0.08)') :
                (skin.highlightWhite || 'rgba(255,255,255,0.6)');
            ctx.fillStyle = hl;
            ctx.fill();
        };
        drawOne(cx - w * 0.2, cy, 1);
        drawOne(cx + w * 0.2, cy, 2);
    },

    openStonePreview(key) {
        const skin = STONE_SKINS[key];
        if (!skin) return;
        this._currentPreviewKey = key;
        this._currentPreviewType = 'stone';
        const modal = document.getElementById('previewModal');
        const title = document.getElementById('previewTitle');
        const canvas = document.getElementById('previewCanvas');
        const applyBtn = document.getElementById('previewApplyBtn');

        title.innerText = '预览：' + skin.name;
        applyBtn.innerText = '选择此皮肤';
        applyBtn.style.display = 'inline-block';

        const ctx = canvas.getContext('2d');
        const w = canvas.width, h = canvas.height;
        ctx.clearRect(0, 0, w, h);

        const r = Math.min(w, h) * 0.25;
        const cx = w / 2, cy = h / 2;
        const drawOne = (x, y, player) => {
            if (skin.drawStoneFn) {
                ctx.save();
                skin.drawStoneFn(ctx, x, y, r, player);
                ctx.restore();
                return;
            }
            const grad = ctx.createRadialGradient(
                x - r * 0.3, y - r * 0.3, r * 0.1,
                x, y, r
            );
            const colors = player === 1 ?
                (skin.blackGradient || ['#6d5a4a', '#3d2e1f', '#1a120a']) :
                (skin.whiteGradient || ['#ffffff', '#f0e6d3', '#c8bca6']);
            grad.addColorStop(0, colors[0]);
            grad.addColorStop(0.3, colors[1]);
            grad.addColorStop(1, colors[2]);
            ctx.shadowColor = 'rgba(0,0,0,0.2)';
            ctx.shadowBlur = 10;
            ctx.shadowOffsetX = 3;
            ctx.shadowOffsetY = 3;
            ctx.beginPath();
            ctx.arc(x, y, r, 0, Math.PI * 2);
            ctx.fillStyle = grad;
            ctx.fill();
            ctx.shadowBlur = 0;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 0;
            ctx.beginPath();
            ctx.arc(x - r * 0.25, y - r * 0.25, r * 0.3, 0, Math.PI * 2);
            const hl = player === 1 ?
                (skin.highlightBlack || 'rgba(255,255,255,0.08)') :
                (skin.highlightWhite || 'rgba(255,255,255,0.6)');
            ctx.fillStyle = hl;
            ctx.fill();
        };
        drawOne(cx - w * 0.22, cy, 1);
        drawOne(cx + w * 0.22, cy, 2);

        const current = getStoneSkin();
        if (current === key) {
            applyBtn.innerText = '✅ 已使用';
            applyBtn.disabled = true;
        } else {
            applyBtn.disabled = false;
        }
        modal.classList.add('show');
    },

    // ---------- 棋盘皮肤 ----------
    renderBoardSkins() {
        const container = document.getElementById('boardSkinGrid');
        if (!container) return;
        const current = getBoardSkin();
        let html = '';
        for (const [key, skin] of Object.entries(BOARD_SKINS)) {
            if (key === 'default') continue;
            const isSelected = key === current;
            html += `
                <div class="skin-card ${isSelected ? 'selected' : ''}" data-skin-key="${key}" data-type="board">
                    <div class="skin-thumb">
                        <canvas class="board-thumb-canvas" width="100" height="100" data-skin="${key}"></canvas>
                    </div>
                    <div class="skin-name">${skin.name}</div>
                    <div class="skin-check"></div>
                </div>
            `;
        }
        container.innerHTML = html;

        container.querySelectorAll('.board-thumb-canvas').forEach(canvas => {
            const key = canvas.dataset.skin;
            const skin = BOARD_SKINS[key];
            if (!skin) return;
            const ctx = canvas.getContext('2d');
            this.drawBoardThumb(ctx, canvas.width, canvas.height, skin);
        });

        container.querySelectorAll('.skin-card[data-type="board"]').forEach(card => {
            card.addEventListener('click', () => {
                const key = card.dataset.skinKey;
                this.openBoardPreview(key);
            });
        });
    },

    drawBoardThumb(ctx, w, h, skin) {
        const boardSize = 5;
        const margin = 8;
        const gridSize = w - margin * 2;
        const cellSize = gridSize / (boardSize - 1);
        ctx.clearRect(0, 0, w, h);
        ctx.fillStyle = skin.bgColor || '#eedbbc';
        ctx.fillRect(0, 0, w, h);

        if (skin.drawDecor) {
            ctx.save();
            skin.drawDecor(ctx, w, h);
            ctx.restore();
        }

        if (skin.drawGrid) {
            skin.drawGrid(ctx, margin, gridSize, boardSize, cellSize);
        } else {
            ctx.strokeStyle = skin.gridColor || '#6b4c2c';
            ctx.lineWidth = 1;
            for (let i = 0; i < boardSize; i++) {
                const pos = margin + i * cellSize;
                ctx.beginPath();
                ctx.moveTo(margin, pos);
                ctx.lineTo(margin + gridSize, pos);
                ctx.stroke();
                ctx.beginPath();
                ctx.moveTo(pos, margin);
                ctx.lineTo(pos, margin + gridSize);
                ctx.stroke();
            }
            const starPos = [[2,2]];
            ctx.fillStyle = skin.starColor || '#4a3a28';
            for (const [r, c] of starPos) {
                const x = margin + c * cellSize;
                const y = margin + r * cellSize;
                ctx.beginPath();
                ctx.arc(x, y, 2, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    },

    openBoardPreview(key) {
        const skin = BOARD_SKINS[key];
        if (!skin) return;
        this._currentPreviewKey = key;
        this._currentPreviewType = 'board';
        const modal = document.getElementById('previewModal');
        const title = document.getElementById('previewTitle');
        const canvas = document.getElementById('previewCanvas');
        const applyBtn = document.getElementById('previewApplyBtn');

        title.innerText = '预览：' + skin.name;
        applyBtn.innerText = '选择此皮肤';

        const ctx = canvas.getContext('2d');
        const w = canvas.width, h = canvas.height;

        // 使用 Goban 绘制完整预览棋盘（9x9）
        const boardSize = 9;
        const board = Array(boardSize).fill().map(() => Array(boardSize).fill(0));
        const sample = [[3,3,1],[4,4,2],[5,3,1],[3,5,2],[4,6,1],[6,4,2],[5,5,1]];
        for (const [r,c,p] of sample) {
            if (r < boardSize && c < boardSize) board[r][c] = p;
        }

        const margin = 30;
        const gridSize = Math.min(w, h) - margin * 2;
        const cellSize = gridSize / (boardSize - 1);
        const stoneRadius = cellSize * 0.4;

        // 使用当前选中的棋子皮肤
        const stoneSkinName = getStoneSkin();
        const stoneSkin = STONE_SKINS[stoneSkinName] || STONE_SKINS.classic;

        // 先手动填充背景色（确保不会出现黄色底）
        ctx.clearRect(0, 0, w, h);
        ctx.fillStyle = skin.bgColor || '#eedbbc';
        ctx.fillRect(0, 0, w, h);

        // 调用 Goban 绘制棋盘
        Goban.drawBoard(ctx, board, {
            lastMove: null,
            winLines: [],
            forbiddenLines: [],
            drawLastMark: false,
            boardSize: boardSize,
            margin: margin,
            stoneRadius: stoneRadius,
            stoneSkin: stoneSkin,
            boardSkin: skin
        });

        const current = getBoardSkin();
        if (current === key) {
            applyBtn.innerText = '✅ 已使用';
            applyBtn.disabled = true;
        } else {
            applyBtn.disabled = false;
        }
        modal.classList.add('show');
    },

    closePreview() {
        document.getElementById('previewModal').classList.remove('show');
    },

    applyPreviewSkin() {
        const type = this._currentPreviewType;
        const key = this._currentPreviewKey;
        if (type === 'stone') {
            if (setStoneSkin(key)) {
                this.highlightSelected();
                this.showToast('棋子皮肤已切换为：' + STONE_SKINS[key].name);
                this.renderStoneSkins();
            }
        } else if (type === 'board') {
            if (setBoardSkin(key)) {
                this.highlightSelected();
                this.showToast('棋盘皮肤已切换为：' + BOARD_SKINS[key].name);
                this.renderBoardSkins();
            }
        }
        this.closePreview();
    },

    highlightSelected() {
        // 由渲染完成
    },

    showToast(msg) {
        const t = document.getElementById('toast');
        if (!t) return;
        t.innerText = msg;
        t.classList.add('show');
        clearTimeout(t._hideTimer);
        t._hideTimer = setTimeout(() => t.classList.remove('show'), 2500);
    }
};

// 导出到全局
window.SkinUI = SkinUI;
window.STONE_SKINS = STONE_SKINS;
window.BOARD_SKINS = BOARD_SKINS;
window.getStoneSkin = getStoneSkin;
window.getBoardSkin = getBoardSkin;
window.setStoneSkin = setStoneSkin;
window.setBoardSkin = setBoardSkin;
window.drawPuppyFace = drawPuppyFace;
window.drawCyberStone = drawCyberStone;