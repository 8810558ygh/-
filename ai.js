// ai.js —— 模仿有经验的棋手（聪明人风格）
// 依赖：rules.js 必须先行加载
(function(global) {
    const BOARD_SIZE = 15;

    // ==================== 增强评分 ====================
    // 识别特殊棋形：跳活三（如 X_XXX）、跳冲四等
    function detectSpecialPatterns(row, col, board, player) {
        const directions = [[1,0], [0,1], [1,1], [1,-1]];
        let bonus = 0;

        for (let d of directions) {
            let cells = [];
            for (let step = -4; step <= 4; step++) {
                let r = row + d[0] * step;
                let c = col + d[1] * step;
                if (r < 0 || r >= BOARD_SIZE || c < 0 || c >= BOARD_SIZE) {
                    cells.push(-1);
                } else {
                    cells.push(board[r][c]);
                }
            }
            // 模拟落子
            cells[4] = player;
            // 检测跳活三：形如 X_XXX（中间隔一个空位）
            let s = cells.join('');
            // 查找模式：玩家棋子 + 0 + 玩家棋子*3 或 玩家棋子*3 + 0 + 玩家棋子
            let p = player === 1 ? '1' : '2';
            let pattern = new RegExp(`${p}0${p}{3}|${p}{3}0${p}`);
            if (pattern.test(s)) {
                bonus += 3000;
            }
            // 检测跳冲四：X_XXXX 或 XXXX_X
            let pattern4 = new RegExp(`${p}0${p}{4}|${p}{4}0${p}`);
            if (pattern4.test(s)) {
                bonus += 8000;
            }
        }
        return bonus;
    }

    // 评估落子价值（进攻 + 防守 + 特殊加成）
    function evaluatePoint(row, col, board, player) {
        if (board[row][col] !== 0) return 0;

        const directions = [[1,0], [0,1], [1,1], [1,-1]];
        let attackScore = 0;
        let defenseScore = 0;

        for (let d of directions) {
            // 进攻线（假设下 player）
            let attackCount = 1;
            let attackOpenEnds = 0;
            for (let step = 1; step < 5; step++) {
                let r = row + d[0] * step;
                let c = col + d[1] * step;
                if (r < 0 || r >= BOARD_SIZE || c < 0 || c >= BOARD_SIZE) break;
                if (board[r][c] === player) attackCount++;
                else if (board[r][c] === 0) { attackOpenEnds++; break; }
                else break;
            }
            for (let step = 1; step < 5; step++) {
                let r = row - d[0] * step;
                let c = col - d[1] * step;
                if (r < 0 || r >= BOARD_SIZE || c < 0 || c >= BOARD_SIZE) break;
                if (board[r][c] === player) attackCount++;
                else if (board[r][c] === 0) { attackOpenEnds++; break; }
                else break;
            }

            // 防守线（假设下 opponent）
            let opponent = player === 1 ? 2 : 1;
            let defCount = 1;
            let defOpenEnds = 0;
            for (let step = 1; step < 5; step++) {
                let r = row + d[0] * step;
                let c = col + d[1] * step;
                if (r < 0 || r >= BOARD_SIZE || c < 0 || c >= BOARD_SIZE) break;
                if (board[r][c] === opponent) defCount++;
                else if (board[r][c] === 0) { defOpenEnds++; break; }
                else break;
            }
            for (let step = 1; step < 5; step++) {
                let r = row - d[0] * step;
                let c = col - d[1] * step;
                if (r < 0 || r >= BOARD_SIZE || c < 0 || c >= BOARD_SIZE) break;
                if (board[r][c] === opponent) defCount++;
                else if (board[r][c] === 0) { defOpenEnds++; break; }
                else break;
            }

            // 进攻打分
            if (attackCount >= 5) attackScore += 100000;
            else if (attackCount === 4 && attackOpenEnds >= 1) attackScore += 8000;
            else if (attackCount === 4) attackScore += 1500;
            else if (attackCount === 3 && attackOpenEnds >= 2) attackScore += 1200;
            else if (attackCount === 3 && attackOpenEnds >= 1) attackScore += 300;
            else if (attackCount === 2 && attackOpenEnds >= 2) attackScore += 80;
            else if (attackCount === 2) attackScore += 15;

            // 防守打分
            if (defCount >= 5) defenseScore += 100000;
            else if (defCount === 4 && defOpenEnds >= 1) defenseScore += 8000;
            else if (defCount === 4) defenseScore += 1500;
            else if (defCount === 3 && defOpenEnds >= 2) defenseScore += 1200;
            else if (defCount === 3 && defOpenEnds >= 1) defenseScore += 300;
            else if (defCount === 2 && defOpenEnds >= 2) defenseScore += 80;
            else if (defCount === 2) defenseScore += 15;
        }

        // 特殊棋形加成
        let specialBonus = detectSpecialPatterns(row, col, board, player);

        // 综合得分：进攻权重稍高，但防守也很重要
        let total = attackScore * 1.2 + defenseScore * 1.0 + specialBonus;
        return total;
    }

    // ==================== 两步威胁预判 ====================
    // 检查如果自己下了某点，对手下一步能否形成五子（必须防）
    function opponentCanWinNext(board, row, col, opponent) {
        // 模拟落子后，检测对手是否有一步获胜点
        board[row][col] = 0; // 先恢复（因为调用时棋盘可能已模拟）
        // 检测对手所有空位是否有一步胜
        for (let r = 0; r < BOARD_SIZE; r++) {
            for (let c = 0; c < BOARD_SIZE; c++) {
                if (board[r][c] !== 0) continue;
                board[r][c] = opponent;
                if (Rules.quickCheckWin(board, opponent, BOARD_SIZE)) {
                    board[r][c] = 0;
                    return true;
                }
                board[r][c] = 0;
            }
        }
        return false;
    }

    // ==================== 候选点生成（增强版） ====================
    function hasNeighbor(board, row, col, dist) {
        for (let i = -dist; i <= dist; i++) {
            for (let j = -dist; j <= dist; j++) {
                if (i === 0 && j === 0) continue;
                let r = row + i;
                let c = col + j;
                if (r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE && board[r][c] !== 0) {
                    return true;
                }
            }
        }
        return false;
    }

    function getCandidates(board, player, isProMode) {
        let candidates = [];
        const opponent = player === 1 ? 2 : 1;

        for (let r = 0; r < BOARD_SIZE; r++) {
            for (let c = 0; c < BOARD_SIZE; c++) {
                if (board[r][c] !== 0) continue;
                if (!hasNeighbor(board, r, c, 2)) continue;

                // 专业模式禁手（黑棋）
                if (isProMode && player === 1) {
                    board[r][c] = 1;
                    let forbidden = Rules.checkForbidden(r, c, board, BOARD_SIZE);
                    board[r][c] = 0;
                    if (forbidden.sanSan || forbidden.siSi || forbidden.overline) continue;
                }

                // 基础进攻防守分
                let attack = evaluatePoint(r, c, board, player);
                let defense = evaluatePoint(r, c, board, opponent);

                // 两步威胁预判：如果下这里，对手下一步能否直接获胜？如果可以，则降低该点分数
                let danger = 0;
                if (defense < 5000) { // 如果防守分不高，说明可能忽略了对对手的防御
                    // 模拟下子后检测
                    board[r][c] = player;
                    if (opponentCanWinNext(board, r, c, opponent)) {
                        danger = -3000; // 严重扣分
                    }
                    board[r][c] = 0;
                }

                // 双收益评估：这个点是否同时能进攻和防守？
                let doubleBenefit = 0;
                if (attack > 800 && defense > 800) {
                    doubleBenefit = 2000; // 很好的点
                } else if (attack > 500 && defense > 500) {
                    doubleBenefit = 1000;
                }

                // 中心偏好（聪明人会注重控制中心）
                let centerDist = Math.abs(r - 7) + Math.abs(c - 7);
                let centerBonus = Math.max(0, (7 - centerDist) * 8);

                // 星位偏好（角星或边星）
                let starBonus = 0;
                const stars = [[3,3],[3,7],[3,11],[7,3],[7,11],[11,3],[11,7],[11,11]];
                for (let s of stars) {
                    if (r === s[0] && c === s[1]) {
                        starBonus = 300;
                        break;
                    }
                }

                let score = attack * 1.2 + defense + doubleBenefit + centerBonus + starBonus + danger;

                candidates.push({ row: r, col: c, score: score, attack: attack, defense: defense });
            }
        }

        candidates.sort((a, b) => b.score - a.score);
        // 取前15个作为候选
        return candidates.slice(0, 15);
    }

    // ==================== 快速找一步必胜/必防 ====================
    function findWinningMove(board, player) {
        for (let r = 0; r < BOARD_SIZE; r++) {
            for (let c = 0; c < BOARD_SIZE; c++) {
                if (board[r][c] !== 0) continue;
                board[r][c] = player;
                if (Rules.quickCheckWin(board, player, BOARD_SIZE)) {
                    board[r][c] = 0;
                    return { row: r, col: c };
                }
                board[r][c] = 0;
            }
        }
        return null;
    }

    // ==================== 开局处理 ====================
    function getOpeningMove(board, moveHistory) {
        if (moveHistory.length === 0) return { row: 7, col: 7 };
        if (moveHistory.length === 1) {
            let first = moveHistory[0];
            if (first.row === 7 && first.col === 7) {
                // 优先选择星位或对称点
                const choices = [[7,8], [8,7], [6,7], [7,6]];
                for (let c of choices) {
                    if (board[c[0]][c[1]] === 0) return { row: c[0], col: c[1] };
                }
                return { row: 7, col: 8 };
            }
            // 对称落子
            let symR = 14 - first.row;
            let symC = 14 - first.col;
            if (board[symR][symC] === 0) return { row: symR, col: symC };
            // 如果对称点被占，选择附近星位
            const stars = [[3,3],[3,7],[3,11],[7,3],[7,11],[11,3],[11,7],[11,11]];
            for (let s of stars) {
                if (board[s[0]][s[1]] === 0) return { row: s[0], col: s[1] };
            }
            return { row: 7, col: 7 };
        }
        return null;
    }

    // ==================== 主入口 ====================
    global.GomokuAI = {
        getMove: function(boardState, moveHistory, isProMode, playerIsBlack, scoreModifier) {
            const aiPlayer = playerIsBlack ? 2 : 1;
            const humanPlayer = playerIsBlack ? 1 : 2;

            // 1. 开局
            let opening = getOpeningMove(boardState, moveHistory);
            if (opening && boardState[opening.row][opening.col] === 0) {
                return { r: opening.row, c: opening.col, score: 99999999 };
            }

            // 2. AI 直接获胜（毫不犹豫）
            let winMove = findWinningMove(boardState, aiPlayer);
            if (winMove) {
                return { r: winMove.row, c: winMove.col, score: 99999999 };
            }

            // 3. 必须堵对手的必胜点（聪明人绝不漏防）
            let blockMove = findWinningMove(boardState, humanPlayer);
            if (blockMove) {
                return { r: blockMove.row, c: blockMove.col, score: 88888888 };
            }

            // 4. 获取候选点并评分
            let candidates = getCandidates(boardState, aiPlayer, isProMode);
            if (candidates.length === 0) {
                return { r: 7, c: 7, score: 0 };
            }

            // 5. 选择策略：在 top3 中按加权随机选（更聪明的人会从几个好点中选，偶尔会选第二好的）
            let top = candidates.slice(0, Math.min(3, candidates.length));
            // 如果最高分远高于第二，则选最高（表明这是明显的必下点）
            if (top.length > 1 && top[0].score - top[1].score > 5000) {
                return { r: top[0].row, c: top[0].col, score: top[0].score };
            }

            // 否则按权重随机（体现人性化）
            let totalWeight = top.reduce((sum, m) => sum + Math.max(m.score, 0), 0);
            if (totalWeight === 0) {
                let pick = top[Math.floor(Math.random() * top.length)];
                return { r: pick.row, c: pick.col, score: 0 };
            }
            let rand = Math.random() * totalWeight;
            let cum = 0;
            for (let move of top) {
                cum += Math.max(move.score, 0);
                if (rand <= cum) {
                    return { r: move.row, c: move.col, score: move.score };
                }
            }
            let last = top[top.length - 1];
            return { r: last.row, c: last.col, score: last.score };
        },

        checkForbidden: function(row, col, boardState) {
            return Rules.checkForbidden(row, col, boardState, BOARD_SIZE);
        }
    };
})(window);