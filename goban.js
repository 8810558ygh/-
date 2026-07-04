// goban.js —— 五子棋通用棋盘绘制模块（支持场景皮肤）
const Goban = {
    drawBoard: function(ctx, board, options = {}) {
        const boardSize = options.boardSize || 15;
        const margin = options.margin || 40;
        const canvasSize = ctx.canvas.width;
        const gridSize = canvasSize - margin * 2;
        const cellSize = gridSize / (boardSize - 1);
        const stoneRadius = options.stoneRadius || cellSize * 0.42;
        const lastMove = options.lastMove || null;
        const winLines = options.winLines || [];
        const forbiddenLines = options.forbiddenLines || [];
        const drawLastMark = (options.drawLastMark !== undefined) ? options.drawLastMark : true;

        const stoneSkin = options.stoneSkin || window.STONE_SKINS?.classic || {};
        const boardSkin = options.boardSkin || window.BOARD_SKINS?.classic || {};

        // ===== 背景 =====
        ctx.clearRect(0, 0, canvasSize, canvasSize);
        ctx.fillStyle = boardSkin.bgColor || '#eedbbc';
        ctx.fillRect(0, 0, canvasSize, canvasSize);

        // ===== 装饰纹理（场景元素） =====
        if (boardSkin.drawDecor && typeof boardSkin.drawDecor === 'function') {
            boardSkin.drawDecor(ctx, canvasSize, canvasSize);
        }

        // ===== 边框 =====
        ctx.strokeStyle = boardSkin.borderColor || '#5c3a1e';
        ctx.lineWidth = 2;
        ctx.strokeRect(margin - 2, margin - 2, gridSize + 4, gridSize + 4);

        // ===== 网格 =====
        if (typeof boardSkin.drawGrid === 'function') {
            boardSkin.drawGrid(ctx, margin, gridSize, boardSize, cellSize);
        } else {
            ctx.strokeStyle = boardSkin.gridColor || '#6b4c2c';
            ctx.lineWidth = 1.5;
            for (let i = 0; i < boardSize; i++) {
                let pos = margin + i * cellSize;
                ctx.beginPath();
                ctx.moveTo(margin, pos);
                ctx.lineTo(margin + gridSize, pos);
                ctx.stroke();
                ctx.beginPath();
                ctx.moveTo(pos, margin);
                ctx.lineTo(pos, margin + gridSize);
                ctx.stroke();
            }
        }

        // ===== 星标 =====
        // 只有没有自定义网格时才绘制星标，或者如果自定义网格没有绘制星标，我们可以保留此逻辑
        // 但简单起见，如果 drawGrid 存在，我们假设它已经处理了星标，所以此处跳过
        if (typeof boardSkin.drawGrid !== 'function') {
            const stars = [[3,3],[3,7],[3,11],[7,3],[7,7],[7,11],[11,3],[11,7],[11,11]];
            ctx.fillStyle = boardSkin.starColor || '#4a3a28';
            const starSize = boardSkin.starSize || 4;
            for (let [r, c] of stars) {
                let x = margin + c * cellSize, y = margin + r * cellSize;
                ctx.beginPath();
                ctx.arc(x, y, starSize, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        // ===== 棋子 =====
        for (let r = 0; r < boardSize; r++) {
            for (let c = 0; c < boardSize; c++) {
                if (board[r][c] === 0) continue;
                let x = margin + c * cellSize, y = margin + r * cellSize;
                this.drawStone(ctx, x, y, board[r][c], stoneRadius, stoneSkin);
            }
        }

        // ===== 最后一手标记 =====
        if (drawLastMark && lastMove) {
            let x = margin + lastMove.col * cellSize;
            let y = margin + lastMove.row * cellSize;
            ctx.strokeStyle = '#d64531';
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.rect(x - stoneRadius - 3, y - stoneRadius - 3, (stoneRadius + 3) * 2, (stoneRadius + 3) * 2);
            ctx.stroke();
        }

        // ===== 胜利/禁手线 =====
        if (winLines.length > 0) {
            this._drawLines(ctx, winLines, '#d64531', margin, cellSize);
        }
        if (forbiddenLines.length > 0) {
            this._drawLines(ctx, forbiddenLines, '#d64531', margin, cellSize);
        }
    },

    drawStone: function(ctx, x, y, player, radius, skin) {
        if (!radius) radius = 14;
        if (!skin) skin = {};

        if (typeof skin.drawStoneFn === 'function') {
            skin.drawStoneFn(ctx, x, y, radius, player);
            return;
        }

        // 默认渐变绘制
        ctx.beginPath();
        ctx.arc(x + 2, y + 2, radius, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.fill();

        let grad = ctx.createRadialGradient(
            x - radius * 0.3, y - radius * 0.3, radius * 0.1,
            x, y, radius
        );

        let colors;
        if (player === 1) {
            colors = skin.blackGradient || ['#6d5a4a', '#3d2e1f', '#1a120a'];
        } else {
            colors = skin.whiteGradient || ['#ffffff', '#f0e6d3', '#c8bca6'];
        }
        if (colors.length >= 3) {
            grad.addColorStop(0, colors[0]);
            grad.addColorStop(0.3, colors[1]);
            grad.addColorStop(1, colors[2]);
        } else {
            grad.addColorStop(0, player === 1 ? '#6d5a4a' : '#ffffff');
            grad.addColorStop(1, player === 1 ? '#1a120a' : '#c8bca6');
        }

        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fillStyle = grad;
        ctx.fill();

        // 高光
        ctx.beginPath();
        ctx.arc(x - radius * 0.25, y - radius * 0.25, radius * 0.35, 0, Math.PI * 2);
        const hl = player === 1 ? (skin.highlightBlack || 'rgba(255,255,255,0.08)')
                                : (skin.highlightWhite || 'rgba(255,255,255,0.6)');
        ctx.fillStyle = hl;
        ctx.fill();

        // 普通图案（如果有）
        if (skin.pattern && typeof skin.pattern === 'function') {
            skin.pattern(ctx, x, y, radius);
        }
    },

    drawLinesProgress: function(ctx, lines, progress, margin, cellSize, color = '#d64531') {
        if (progress <= 0 || lines.length === 0) return;
        ctx.save();
        ctx.strokeStyle = color;
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.shadowColor = color;
        ctx.shadowBlur = 8;

        for (let line of lines) {
            if (line.length < 2) continue;
            let startX = margin + line[0].c * cellSize;
            let startY = margin + line[0].r * cellSize;
            let endX = margin + line[line.length - 1].c * cellSize;
            let endY = margin + line[line.length - 1].r * cellSize;
            let curX = startX + (endX - startX) * progress;
            let curY = startY + (endY - startY) * progress;
            ctx.beginPath();
            ctx.moveTo(startX, startY);
            ctx.lineTo(curX, curY);
            ctx.stroke();
        }
        ctx.restore();
    },

    _drawLines: function(ctx, lines, color, margin, cellSize) {
        ctx.save();
        ctx.strokeStyle = color;
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.shadowColor = color;
        ctx.shadowBlur = 8;
        for (let line of lines) {
            if (line.length < 2) continue;
            let startX = margin + line[0].c * cellSize;
            let startY = margin + line[0].r * cellSize;
            let endX = margin + line[line.length - 1].c * cellSize;
            let endY = margin + line[line.length - 1].r * cellSize;
            ctx.beginPath();
            ctx.moveTo(startX, startY);
            ctx.lineTo(endX, endY);
            ctx.stroke();
        }
        ctx.restore();
    }
};