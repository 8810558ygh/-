// goban.js —— 五子棋通用棋盘绘制模块
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

        ctx.clearRect(0, 0, canvasSize, canvasSize);
        ctx.fillStyle = '#eedbbc';
        ctx.fillRect(0, 0, canvasSize, canvasSize);

        ctx.strokeStyle = '#5c3a1e';
        ctx.lineWidth = 2;
        ctx.strokeRect(margin - 2, margin - 2, gridSize + 4, gridSize + 4);

        ctx.strokeStyle = '#6b4c2c';
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

        const stars = [[3,3],[3,7],[3,11],[7,3],[7,7],[7,11],[11,3],[11,7],[11,11]];
        ctx.fillStyle = '#4a3a28';
        for (let [r, c] of stars) {
            let x = margin + c * cellSize, y = margin + r * cellSize;
            ctx.beginPath();
            ctx.arc(x, y, 4, 0, Math.PI * 2);
            ctx.fill();
        }

        for (let r = 0; r < boardSize; r++) {
            for (let c = 0; c < boardSize; c++) {
                if (board[r][c] === 0) continue;
                let x = margin + c * cellSize, y = margin + r * cellSize;
                this.drawStone(ctx, x, y, board[r][c], stoneRadius);
            }
        }

        if (drawLastMark && lastMove) {
            let x = margin + lastMove.col * cellSize;
            let y = margin + lastMove.row * cellSize;
            ctx.strokeStyle = '#d64531';
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.rect(x - stoneRadius - 3, y - stoneRadius - 3, (stoneRadius + 3) * 2, (stoneRadius + 3) * 2);
            ctx.stroke();
        }

        if (winLines.length > 0) {
            this._drawLines(ctx, winLines, '#d64531', margin, cellSize);
        }
        if (forbiddenLines.length > 0) {
            this._drawLines(ctx, forbiddenLines, '#d64531', margin, cellSize);
        }
    },

    drawStone: function(ctx, x, y, player, radius) {
        if (!radius) radius = 14;
        ctx.beginPath();
        ctx.arc(x + 2, y + 2, radius, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.fill();

        let grad = ctx.createRadialGradient(
            x - radius * 0.3, y - radius * 0.3, radius * 0.1,
            x, y, radius
        );
        if (player === 1) {
            grad.addColorStop(0, '#6d5a4a');
            grad.addColorStop(0.3, '#3d2e1f');
            grad.addColorStop(1, '#1a120a');
        } else {
            grad.addColorStop(0, '#ffffff');
            grad.addColorStop(0.3, '#f0e6d3');
            grad.addColorStop(1, '#c8bca6');
        }
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fillStyle = grad;
        ctx.fill();

        ctx.beginPath();
        ctx.arc(x - radius * 0.25, y - radius * 0.25, radius * 0.35, 0, Math.PI * 2);
        ctx.fillStyle = player === 1 ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.6)';
        ctx.fill();
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