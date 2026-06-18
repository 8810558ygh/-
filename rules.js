// rules.js —— 五子棋通用规则（禁手、胜负、棋盘工具）

const Rules = {
    BOARD_SIZE: 15,

    // ---------- 禁手检测 ----------
    checkForbidden: function(row, col, boardState, boardSize) {
        boardSize = boardSize || this.BOARD_SIZE;
        const directions = [[1,0],[0,1],[1,1],[1,-1]];
        let liveThreeCount = 0, fourCount = 0, overline = false, lines = [];

        for (let [dx, dy] of directions) {
            let cells = [];
            for (let i = -4; i <= 4; i++) {
                let r = row + dx * i, c = col + dy * i;
                if (r < 0 || r >= boardSize || c < 0 || c >= boardSize) cells.push(2);
                else cells.push(boardState[r][c]);
            }
            let count = 1;
            for (let i = 1; i <= 4; i++) { if (cells[4+i] === 1) count++; else break; }
            for (let i = 1; i <= 4; i++) { if (cells[4-i] === 1) count++; else break; }
            if (count > 5) overline = true;
            if (this._hasLiveThree(cells)) liveThreeCount++;
            if (this._hasFour(cells)) fourCount++;
        }

        if (liveThreeCount >= 2 || fourCount >= 2 || overline) {
            lines = this._collectForbiddenLines(row, col, boardState, boardSize);
        }

        return {
            sanSan: liveThreeCount >= 2,
            siSi: fourCount >= 2,
            overline: overline,
            lines: lines
        };
    },

    _collectForbiddenLines: function(row, col, boardState, boardSize) {
        const directions = [[1,0],[0,1],[1,1],[1,-1]];
        let lines = [];
        for (let [dx, dy] of directions) {
            let cells = [], positions = [];
            for (let i = -4; i <= 4; i++) {
                let r = row + dx * i, c = col + dy * i;
                if (r < 0 || r >= boardSize || c < 0 || c >= boardSize) {
                    cells.push(2);
                    positions.push(null);
                } else {
                    cells.push(boardState[r][c]);
                    positions.push({r, c});
                }
            }
            if (this._hasLiveThree(cells)) {
                let line = this._extractLine(cells, positions, 1, 3);
                if (line.length >= 3) lines.push(line);
            }
            if (this._hasFour(cells)) {
                let line = this._extractLine(cells, positions, 1, 4);
                if (line.length >= 4) lines.push(line);
            }
            let count = 1;
            for (let i = 1; i <= 4; i++) { if (cells[4+i] === 1) count++; else break; }
            for (let i = 1; i <= 4; i++) { if (cells[4-i] === 1) count++; else break; }
            if (count > 5) {
                let line = [];
                for (let i = -4; i <= 4; i++) {
                    if (cells[4+i] === 1 && positions[4+i]) line.push(positions[4+i]);
                }
                if (line.length > 5) lines.push(line);
            }
        }
        return lines;
    },

    _extractLine: function(cells, positions, targetVal, targetCount) {
        for (let start = 0; start <= 4; start++) {
            let win = cells.slice(start, start + 5);
            let pos = positions.slice(start, start + 5);
            let count = 0, line = [];
            for (let i = 0; i < 5; i++) {
                if (win[i] === targetVal) {
                    count++;
                    if (pos[i]) line.push(pos[i]);
                }
            }
            if (count === targetCount && line.length === targetCount) return line;
        }
        return [];
    },

    _hasLiveThree: function(cells) {
        for (let start = 0; start <= 4; start++) {
            let win = cells.slice(start, start + 5);
            let idx = 4 - start;
            if (idx < 0 || idx >= 5 || win[idx] !== 1) continue;
            let blackPos = [], emptyPos = [];
            for (let i = 0; i < 5; i++) {
                if (win[i] === 1) blackPos.push(i);
                else if (win[i] === 0) emptyPos.push(i);
            }
            if (blackPos.length !== 3 || emptyPos.length !== 2) continue;
            if (blackPos[1] - blackPos[0] > 2 || blackPos[2] - blackPos[1] > 2) continue;
            if (emptyPos.includes(0) && emptyPos.includes(4)) return true;
        }
        return false;
    },

    _hasFour: function(cells) {
        for (let start = 0; start <= 4; start++) {
            let win = cells.slice(start, start + 5);
            let idx = 4 - start;
            if (idx < 0 || idx >= 5 || win[idx] !== 1) continue;
            let blackCount = 0, emptyCount = 0;
            for (let i = 0; i < 5; i++) {
                if (win[i] === 1) blackCount++;
                else if (win[i] === 0) emptyCount++;
            }
            if (blackCount === 4 && emptyCount === 1) return true;
        }
        return false;
    },

    // ---------- 胜负检测 ----------
    checkWinWithLine: function(row, col, player, boardState, boardSize) {
        boardSize = boardSize || this.BOARD_SIZE;
        if (boardState[row][col] !== player) return null;
        const directions = [[1,0],[0,1],[1,1],[1,-1]];
        for (let d of directions) {
            let count = 1;
            const [dx, dy] = d;
            let line = [{r: row, c: col}];
            for (let step = 1; step < 5; step++) {
                const nr = row + dx * step, nc = col + dy * step;
                if (nr < 0 || nr >= boardSize || nc < 0 || nc >= boardSize || boardState[nr][nc] !== player) break;
                count++; line.push({r: nr, c: nc});
            }
            for (let step = 1; step < 5; step++) {
                const nr = row - dx * step, nc = col - dy * step;
                if (nr < 0 || nr >= boardSize || nc < 0 || nc >= boardSize || boardState[nr][nc] !== player) break;
                count++; line.unshift({r: nr, c: nc});
            }
            if (count >= 5) return line;
        }
        return null;
    },

    // ---------- 快速胜负检测（仅布尔值，用于搜索） ----------
    quickCheckWin: function(boardState, player, boardSize) {
        boardSize = boardSize || this.BOARD_SIZE;
        for (let r = 0; r < boardSize; r++) {
            for (let c = 0; c < boardSize; c++) {
                if (boardState[r][c] !== player) continue;
                const dirs = [[1,0],[0,1],[1,1],[1,-1]];
                for (let [dx, dy] of dirs) {
                    let count = 1;
                    for (let step = 1; step < 5; step++) {
                        let nr = r + dx * step, nc = c + dy * step;
                        if (nr < 0 || nr >= boardSize || nc < 0 || nc >= boardSize || boardState[nr][nc] !== player) break;
                        count++;
                    }
                    if (count >= 5) return true;
                }
            }
        }
        return false;
    },

    // ---------- 工具 ----------
    isBoardFull: function(boardState, boardSize) {
        boardSize = boardSize || this.BOARD_SIZE;
        for (let r = 0; r < boardSize; r++) {
            for (let c = 0; c < boardSize; c++) {
                if (boardState[r][c] === 0) return false;
            }
        }
        return true;
    },

    // ---------- 初始化棋盘 ----------
    initBoard: function(boardSize) {
        boardSize = boardSize || this.BOARD_SIZE;
        return Array(boardSize).fill().map(() => Array(boardSize).fill(0));
    }
};