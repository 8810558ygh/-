// online-ui.js —— 联机版通用 UI 渲染函数（支持头像）

// ========== 设置全局引用，供 updateSeatUI 使用 ==========
window._allMembers = new Map();
window._myId = null;

// ========== 工具函数 ==========
function genRoomCode() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function updateConnUI(online) {
    let dot = document.getElementById('statusDot');
    let txt = document.getElementById('statusText');
    if (online) {
        dot.className = 'conn-dot conn-online';
        txt.innerText = '在线';
    } else {
        dot.className = 'conn-dot conn-offline';
        txt.innerText = '离线';
    }
}

function lockNicknameDisplay(myNick) {
    let pBtn = document.getElementById('personalCenterBtn');
    pBtn.innerText = '🧑 ' + myNick;
    pBtn.onclick = null;
    pBtn.style.cursor = 'default';
    pBtn.style.background = 'transparent';
    pBtn.style.border = 'none';
}

// ========== 大厅 UI ==========
function updateLobbyUI(seats, isHost, gameMode) {
    updateSeatUI('black', seats.black);
    updateSeatUI('white', seats.white);
    for (let i = 0; i < 6; i++) updateSeatUI('spec-' + i, seats.spectators[i]);

    let startBtn = document.getElementById('startGameButton');
    if (isHost && seats.black && seats.white) startBtn.classList.add('show');
    else startBtn.classList.remove('show');

    let modeText = gameMode === 'pro' ? '专业模式（禁手规则）' : '业余模式（自由对弈）';
    let modeEl = document.getElementById('lobbyModeBar');
    if (modeEl) modeEl.innerText = '🎮 当前模式：' + modeText;
}

// ===== 核心：更新单个座位（支持头像图片） =====
function updateSeatUI(seatId, occupantId) {
    let isBlack = seatId === 'black', isWhite = seatId === 'white';
    let isSpec = seatId.startsWith('spec-');
    let idx = isSpec ? parseInt(seatId.split('-')[1]) : -1;

    let avatarDiv, nameSpan, statusSpan, cardDiv;
    if (isBlack) {
        avatarDiv = document.getElementById('blackAvatar');
        nameSpan = document.getElementById('blackName');
        statusSpan = document.getElementById('blackStatus');
        cardDiv = document.getElementById('seatBlackCard');
    } else if (isWhite) {
        avatarDiv = document.getElementById('whiteAvatar');
        nameSpan = document.getElementById('whiteName');
        statusSpan = document.getElementById('whiteStatus');
        cardDiv = document.getElementById('seatWhiteCard');
    } else {
        avatarDiv = document.getElementById('specAvatar' + idx);
        nameSpan = document.getElementById('specName' + idx);
        statusSpan = document.getElementById('specStatus' + idx);
        cardDiv = document.getElementById('specCard' + idx);
    }
    if (!avatarDiv) return;

    let myId = window._myId;

    if (occupantId) {
        let member = window._allMembers.get(occupantId);
        let displayName = member ? member.name : '棋客';
        let avatarUrl = member ? member.avatar : null;

        // 头像显示：如果有头像URL则显示图片，否则显示首字母
        if (avatarUrl) {
            avatarDiv.innerHTML = `<img src="${avatarUrl}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`;
            avatarDiv.className = 'seat-avatar';
        } else {
            avatarDiv.innerText = displayName.charAt(0).toUpperCase();
            avatarDiv.className = 'seat-avatar ' + (isBlack ? 'black-avatar' : (isWhite ? 'white-avatar' : 'spec-avatar'));
        }
        nameSpan.innerText = displayName + (occupantId === myId ? ' (我)' : '');
        statusSpan.innerText = '已入座';
        cardDiv.classList.add('occupied-seat');
        if (occupantId === myId) cardDiv.classList.add('is-me-seat');
        else cardDiv.classList.remove('is-me-seat');
    } else {
        // 空座位
        avatarDiv.innerText = '+';
        avatarDiv.className = 'seat-avatar empty-avatar';
        nameSpan.innerText = '空位';
        statusSpan.innerText = '点击入座';
        cardDiv.classList.remove('occupied-seat', 'is-me-seat');
    }
}

function renderSpectators() {
    let container = document.getElementById('specSeatsContainer');
    if (!container) return;
    container.innerHTML = '';
    for (let i = 0; i < 6; i++) {
        let div = document.createElement('div');
        div.className = 'seat-card';
        div.onclick = function() {
            if (typeof window.requestSeatGlobal === 'function') {
                window.requestSeatGlobal('spec-' + i);
            }
        };
        div.id = 'specCard' + i;
        div.innerHTML = `
            <div class="seat-avatar empty-avatar" id="specAvatar${i}">+</div>
            <div class="seat-name" id="specName${i}">空位</div>
            <div class="seat-status" id="specStatus${i}">点击入座</div>
        `;
        container.appendChild(div);
    }
}

// ========== 游戏内 UI ==========
function updateTurnDisplay(gameStarted, gameOver, winner, currentPlayer, mySeat) {
    let turnText = !gameStarted ? '等待开始' :
                   (gameOver ? (winner === 1 ? '黑方胜' : (winner === 2 ? '白方胜' : '和棋')) :
                   (currentPlayer === 1 ? '⚫ 黑棋回合' : '⚪ 白棋回合'));

    let el = document.getElementById('turnIndicator');
    if (el) el.innerText = turnText;

    let miniBlack = document.getElementById('miniBlack');
    let miniWhite = document.getElementById('miniWhite');
    if (miniBlack) miniBlack.classList.remove('active-black');
    if (miniWhite) miniWhite.classList.remove('active-white');

    if (gameStarted && !gameOver) {
        if (currentPlayer === 1 && miniBlack) miniBlack.classList.add('active-black');
        else if (currentPlayer === 2 && miniWhite) miniWhite.classList.add('active-white');
    }

    let reminder = document.getElementById('turnReminder');
    if (!reminder) return;

    if (!gameStarted) {
        reminder.innerText = '⏳ 等待对局开始...';
        reminder.className = 'turn-reminder waiting';
    } else if (gameOver) {
        reminder.innerText = winner === 0 ? '🤝 平局结束' : (winner === 1 ? '⚫ 黑方获胜' : '⚪ 白方获胜');
        reminder.className = 'turn-reminder waiting';
    } else {
        let myColor = mySeat === 'black' ? 1 : (mySeat === 'white' ? 2 : null);
        if (myColor === null) {
            reminder.innerText = currentPlayer === 1 ? '👁 黑棋回合' : '👁 白棋回合';
            reminder.className = 'turn-reminder opponent-turn';
        } else if (myColor === currentPlayer) {
            reminder.innerText = myColor === 1 ? '⚫ 你的回合 — 请落子' : '⚪ 你的回合 — 请落子';
            reminder.className = 'turn-reminder my-turn';
        } else {
            reminder.innerText = currentPlayer === 1 ? '⚫ 对方回合 — 请等待' : '⚪ 对方回合 — 请等待';
            reminder.className = 'turn-reminder opponent-turn';
        }
    }
}

function updateGameInfoPanel(seats, allMembers, mySeat, gameStarted, gameOver, isProMode) {
    let blackM = seats.black ? (allMembers.get(seats.black)?.name || '棋手') : '空位';
    let whiteM = seats.white ? (allMembers.get(seats.white)?.name || '棋手') : '空位';

    let blackEl = document.getElementById('blackPlayerName');
    let whiteEl = document.getElementById('whitePlayerName');
    if (blackEl) blackEl.innerText = blackM;
    if (whiteEl) whiteEl.innerText = whiteM;

    let roleEl = document.getElementById('myRoleDisplay');
    if (roleEl) {
        let role = mySeat === 'black' ? '黑棋' : (mySeat === 'white' ? '白棋' : '观战');
        roleEl.innerText = role;
    }

    let statusEl = document.getElementById('gameStatus');
    if (statusEl) statusEl.innerText = gameStarted ? (gameOver ? '终局' : '对弈中') : '未开始';

    let modeEl = document.getElementById('gameModeDisplay');
    if (modeEl) modeEl.innerText = isProMode ? '专业模式（禁手规则）' : '业余模式（自由对弈）';
}

function updateGameButtons(mySeat, gameStarted, gameOver) {
    let btnSur = document.getElementById('btnSurrender');
    let btnDraw = document.getElementById('btnDraw');
    let canUse = (mySeat === 'black' || mySeat === 'white') && gameStarted && !gameOver;
    if (btnSur) { btnSur.disabled = !canUse; btnSur.style.opacity = canUse ? '1' : '0.5'; }
    if (btnDraw) { btnDraw.disabled = !canUse; btnDraw.style.opacity = canUse ? '1' : '0.5'; }
}

// ========== 导出到全局 ==========
window.UI = {
    genRoomCode: genRoomCode,
    updateConnUI: updateConnUI,
    lockNicknameDisplay: lockNicknameDisplay,
    updateLobbyUI: updateLobbyUI,
    updateSeatUI: updateSeatUI,
    renderSpectators: renderSpectators,
    updateTurnDisplay: updateTurnDisplay,
    updateGameInfoPanel: updateGameInfoPanel,
    updateGameButtons: updateGameButtons
};