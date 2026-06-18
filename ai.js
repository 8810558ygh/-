// ai.js —— 五子棋 AI 引擎（引用 rules.js）
// 依赖：rules.js 必须先行加载
(function(global) {
    const BOARD_SIZE = 15;

    const SCORE = {
        FIVE: 100000000,
        FOUR: 10000000,
        BLOCKED_FOUR: 1000000,
        THREE: 100000,
        BLOCKED_THREE: 10000,
        TWO: 1000,
        BLOCKED_TWO: 100,
        ONE: 10
    };

    // ----- 评分函数（内部使用） -----
    function scoreWindow(window, player) {
        let count = window.filter(v => v === player).length;
        let empty = window.filter(v => v === 0).length;
        let opponent = player === 1 ? 2 : 1;
        let blocked = window.filter(v => v === opponent).length;

        if (count === 5) return SCORE.FIVE;
        if (count === 4 && empty === 1) return SCORE.FOUR;
        if (count === 4 && blocked === 1) return SCORE.BLOCKED_FOUR;
        if (count === 3 && empty === 2) return SCORE.THREE;
        if (count === 3 && empty === 1 && blocked === 1) return SCORE.BLOCKED_THREE;
        if (count === 2 && empty === 3) return SCORE.TWO;
        if (count === 2 && empty === 2 && blocked === 1) return SCORE.BLOCKED_TWO;
        return 0;
    }

    function evaluateBoardState(boardState) {
        let blackScore = 0, whiteScore = 0;
        for (let r = 0; r < BOARD_SIZE; r++) {
            for (let c = 0; c <= BOARD_SIZE - 5; c++) {
                let window = [];
                for (let i = 0; i < 5; i++) window.push(boardState[r][c+i]);
                blackScore += scoreWindow(window, 1);
                whiteScore += scoreWindow(window, 2);
            }
        }
        for (let c = 0; c < BOARD_SIZE; c++) {
            for (let r = 0; r <= BOARD_SIZE - 5; r++) {
                let window = [];
                for (let i = 0; i < 5; i++) window.push(boardState[r+i][c]);
                blackScore += scoreWindow(window, 1);
                whiteScore += scoreWindow(window, 2);
            }
        }
        for (let r = 0; r <= BOARD_SIZE - 5; r++) {
            for (let c = 0; c <= BOARD_SIZE - 5; c++) {
                let window1 = [], window2 = [];
                for (let i = 0; i < 5; i++) {
                    window1.push(boardState[r+i][c+i]);
                    window2.push(boardState[r+i][c+4-i]);
                }
                blackScore += scoreWindow(window1, 1); whiteScore += scoreWindow(window1, 2);
                blackScore += scoreWindow(window2, 1); whiteScore += scoreWindow(window2, 2);
            }
        }
        return whiteScore - blackScore;
    }

    // ----- 辅助函数（使用 Rules 提供的基础方法） -----
    function hasNeighbor(r, c, dist, boardState) {
        for (let i = -dist; i <= dist; i++) {
            for (let j = -dist; j <= dist; j++) {
                if (i === 0 && j === 0) continue;
                let nr = r + i, nc = c + j;
                if (nr >= 0 && nr < BOARD_SIZE && nc >= 0 && nc < BOARD_SIZE && boardState[nr][nc] !== 0) return true;
            }
        }
        return false;
    }

    function evaluatePosition(row, col, player, boardState) {
        if (boardState[row][col] !== 0) return -Infinity;
        let total = 0;
        const directions = [[1,0],[0,1],[1,1],[1,-1]];
        for (let [dx, dy] of directions) {
            let line = [];
            for (let i = -4; i <= 4; i++) {
                let r = row + dx * i, c = col + dy * i;
                line.push((r < 0 || r >= BOARD_SIZE || c < 0 || c >= BOARD_SIZE) ? 2 : boardState[r][c]);
            }
            let sim = line.slice();
            sim[4] = player;
            for (let start = 0; start <= 4; start++) {
                let window = sim.slice(start, start + 5);
                total += scoreWindow(window, player);
            }
        }
        return total;
    }

    function countThreats(boardState, player) {
        let threats = 0;
        const directions = [[1,0],[0,1],[1,1],[1,-1]];
        for (let r = 0; r < BOARD_SIZE; r++) {
            for (let c = 0; c < BOARD_SIZE; c++) {
                if (boardState[r][c] !== player) continue;
                for (let [dx, dy] of directions) {
                    let count = 1, emptyEnds = 0;
                    for (let step = 1; step < 5; step++) {
                        let nr = r + dx * step, nc = c + dy * step;
                        if (nr < 0 || nr >= BOARD_SIZE || nc < 0 || nc >= BOARD_SIZE) break;
                        if (boardState[nr][nc] === player) count++;
                        else if (boardState[nr][nc] === 0) { emptyEnds++; break; }
                        else break;
                    }
                    for (let step = 1; step < 5; step++) {
                        let nr = r - dx * step, nc = c - dy * step;
                        if (nr < 0 || nr >= BOARD_SIZE || nc < 0 || nc >= BOARD_SIZE) break;
                        if (boardState[nr][nc] === player) count++;
                        else if (boardState[nr][nc] === 0) { emptyEnds++; break; }
                        else break;
                    }
                    if (count === 4 && emptyEnds >= 1) threats++;
                }
            }
        }
        return threats;
    }

    function getCandidates(boardState, topN, aiPlayer, isProMode, scoreModifier) {
        let list = [];
        for (let r = 0; r < BOARD_SIZE; r++) {
            for (let c = 0; c < BOARD_SIZE; c++) {
                if (boardState[r][c] !== 0) continue;
                if (!hasNeighbor(r, c, 2, boardState)) continue;

                // 专业模式：排除黑棋禁手点
                if (isProMode && aiPlayer === 1) {
                    boardState[r][c] = 1;
                    let forbidden = Rules.checkForbidden(r, c, boardState, BOARD_SIZE);
                    boardState[r][c] = 0;
                    if (forbidden.sanSan || forbidden.siSi || forbidden.overline) continue;
                }

                let attack = evaluatePosition(r, c, aiPlayer, boardState);
                let defense = evaluatePosition(r, c, aiPlayer === 1 ? 2 : 1, boardState);
                let score = attack + defense;

                if (typeof scoreModifier === 'function') {
                    score = scoreModifier(score, r, c);
                }

                let centerBonus = 0;
                let distToCenter = Math.abs(r - 7) + Math.abs(c - 7);
                if (distToCenter <= 3) centerBonus = (4 - distToCenter) * 50;

                list.push({r, c, score: score + centerBonus});
            }
        }
        if (list.length === 0) return [{r: 7, c: 7, score: 0}];
        list.sort((a, b) => b.score - a.score);
        return list.slice(0, topN);
    }

    function minimax(boardState, depth, alpha, beta, isMaximizing, maxDepth, aiPlayer, isProMode, scoreModifier) {
        // 使用 Rules.quickCheckWin
        if (Rules.quickCheckWin(boardState, aiPlayer, BOARD_SIZE)) return 10000000 + depth * 100;
        if (Rules.quickCheckWin(boardState, aiPlayer === 1 ? 2 : 1, BOARD_SIZE)) return -10000000 - depth * 100;
        if (depth === 0) return evaluateBoardState(boardState);

        const candidateCount = isMaximizing ? 16 : 10;
        let candidates = getCandidates(boardState, candidateCount, aiPlayer, isProMode, scoreModifier);

        if (isMaximizing) {
            let maxEval = -Infinity;
            for (let cand of candidates) {
                boardState[cand.r][cand.c] = aiPlayer;
                let evalScore = minimax(boardState, depth - 1, alpha, beta, false, maxDepth, aiPlayer, isProMode, scoreModifier);
                boardState[cand.r][cand.c] = 0;
                maxEval = Math.max(maxEval, evalScore);
                alpha = Math.max(alpha, evalScore);
                if (beta <= alpha) break;
            }
            return maxEval;
        } else {
            let minEval = Infinity;
            for (let cand of candidates) {
                boardState[cand.r][cand.c] = (aiPlayer === 1 ? 2 : 1);
                let evalScore = minimax(boardState, depth - 1, alpha, beta, true, maxDepth, aiPlayer, isProMode, scoreModifier);
                boardState[cand.r][cand.c] = 0;
                minEval = Math.min(minEval, evalScore);
                beta = Math.min(beta, evalScore);
                if (beta <= alpha) break;
            }
            return minEval;
        }
    }

    function findWinningMove(boardState, player) {
        for (let r = 0; r < BOARD_SIZE; r++) {
            for (let c = 0; c < BOARD_SIZE; c++) {
                if (boardState[r][c] !== 0) continue;
                boardState[r][c] = player;
                let won = Rules.quickCheckWin(boardState, player, BOARD_SIZE);
                boardState[r][c] = 0;
                if (won) return {r, c};
            }
        }
        return null;
    }

    function findRushFour(boardState, player) {
        let moves = [];
        for (let r = 0; r < BOARD_SIZE; r++) {
            for (let c = 0; c < BOARD_SIZE; c++) {
                if (boardState[r][c] !== 0) continue;
                boardState[r][c] = player;
                let threats = countThreats(boardState, player);
                boardState[r][c] = 0;
                if (threats >= 2) moves.push({r, c, score: SCORE.FOUR * 2});
            }
        }
        return moves;
    }

    function getOpeningMove(boardState, moveHistory, aiPlayer, playerIsBlack) {
        let playerNum = playerIsBlack ? 1 : 2;
        if (moveHistory.length === 0) return {r: 7, c: 7, score: 99999999};
        if (moveHistory.length === 1) {
            let first = moveHistory[0];
            if (first.row === 7 && first.col === 7) return {r: 7, c: 8, score: 99999999};
            let symR = 14 - first.row, symC = 14 - first.col;
            if (boardState[symR][symC] === 0) return {r: symR, c: symC, score: 99999999};
            return {r: 7, c: 7, score: 99999999};
        }
        if (moveHistory.length === 2) {
            let stars = [[3,3],[3,11],[11,3],[11,11],[7,3],[7,11],[3,7],[11,7]];
            for (let [r, c] of stars) {
                if (boardState[r][c] === 0) return {r, c, score: 99999999};
            }
        }
        return null;
    }

    // ----- 对外接口 -----
    global.GomokuAI = {
        getMove: function(boardState, moveHistory, isProMode, playerIsBlack, scoreModifier) {
            const aiPlayer = playerIsBlack ? 2 : 1;
            const playerNum = playerIsBlack ? 1 : 2;

            let opening = getOpeningMove(boardState, moveHistory, aiPlayer, playerIsBlack);
            if (opening) return opening;

            let winMove = findWinningMove(boardState, aiPlayer);
            if (winMove) return {r: winMove.r, c: winMove.c, score: 99999999};

            let blockMove = findWinningMove(boardState, playerNum);
            if (blockMove) return {r: blockMove.r, c: blockMove.c, score: 88888888};

            let rushMoves = findRushFour(boardState, aiPlayer);
            if (rushMoves.length > 0) return rushMoves[0];

            let blockRush = findRushFour(boardState, playerNum);
            if (blockRush.length > 0) return blockRush[0];

            const DEPTH = 4;
            const CANDIDATE_COUNT = 16;
            let candidates = getCandidates(boardState, CANDIDATE_COUNT, aiPlayer, isProMode, scoreModifier);
            let bestScore = -Infinity;
            let bestMoves = [];

            for (let cand of candidates) {
                boardState[cand.r][cand.c] = aiPlayer;
                let score = minimax(boardState, DEPTH - 1, -Infinity, Infinity, false, DEPTH, aiPlayer, isProMode, scoreModifier);
                boardState[cand.r][cand.c] = 0;

                if (score > bestScore) {
                    bestScore = score;
                    bestMoves = [{r: cand.r, c: cand.c, score}];
                } else if (score === bestScore) {
                    bestMoves.push({r: cand.r, c: cand.c, score});
                }
            }

            return bestMoves[Math.floor(Math.random() * bestMoves.length)];
        },

        // 为了兼容旧代码，保留 checkForbidden 的引用（但实际调用 Rules）
        checkForbidden: function(row, col, boardState) {
            return Rules.checkForbidden(row, col, boardState, BOARD_SIZE);
        }
    };
})(window);