// online-core.js —— 联机版核心逻辑

// ========== 座位管理 ==========
function getSeatOccupant(seatId, lobbySeats) {
    if (seatId === 'black') return lobbySeats.black;
    if (seatId === 'white') return lobbySeats.white;
    if (seatId.startsWith('spec-')) {
        let idx = parseInt(seatId.split('-')[1]);
        return lobbySeats.spectators[idx];
    }
    return null;
}

function setSeat(seatId, pid, lobbySeats) {
    if (seatId === 'black') lobbySeats.black = pid;
    else if (seatId === 'white') lobbySeats.white = pid;
    else if (seatId.startsWith('spec-')) {
        let idx = parseInt(seatId.split('-')[1]);
        if (idx >= 0 && idx < 6) lobbySeats.spectators[idx] = pid;
    }
}

function clearAllSeatsOf(pid, lobbySeats) {
    if (lobbySeats.black === pid) lobbySeats.black = null;
    if (lobbySeats.white === pid) lobbySeats.white = null;
    for (let i = 0; i < 6; i++) {
        if (lobbySeats.spectators[i] === pid) lobbySeats.spectators[i] = null;
    }
}

function findSeatOf(pid, lobbySeats) {
    if (lobbySeats.black === pid) return 'black';
    if (lobbySeats.white === pid) return 'white';
    for (let i = 0; i < 6; i++) {
        if (lobbySeats.spectators[i] === pid) return 'spec-' + i;
    }
    return null;
}

function autoAssignSeat(peerId, lobbySeats) {
    let existing = findSeatOf(peerId, lobbySeats);
    if (existing) return existing;
    if (!lobbySeats.black) return 'black';
    if (!lobbySeats.white) return 'white';
    for (let i = 0; i < 6; i++) {
        if (!lobbySeats.spectators[i]) return 'spec-' + i;
    }
    return null;
}

function handleSeatChange(pid, newSeat, lobbySeats, allMembers, myPeerId, broadcastFn) {
    let occupant = getSeatOccupant(newSeat, lobbySeats);
    if (occupant && occupant !== pid) return null;

    clearAllSeatsOf(pid, lobbySeats);
    setSeat(newSeat, pid, lobbySeats);

    let mem = allMembers.get(pid);
    if (mem) mem.seat = newSeat;

    let mySeat = null;
    if (pid === myPeerId) mySeat = newSeat;

    if (broadcastFn) {
        broadcastFn({ type: 'seatsUpdate', seats: lobbySeats, changedPeer: pid, changedSeat: newSeat });
    }

    return mySeat;
}

// ========== 消息处理（核心分发器） ==========
function handleOnlineMessage(fromId, data, context) {
    // 心跳
    if (data.type === 'ping') {
        let c = context.state.connections.get(fromId);
        if (c && c.conn && c.conn.open) {
            c.conn.send({ type: 'pong', from: context.state.myPeerId, time: data.time });
        }
        if (c) c.lastSeen = Date.now();
        return;
    }
    if (data.type === 'pong') {
        let c = context.state.connections.get(fromId);
        if (c) c.lastSeen = Date.now();
        return;
    }

    // 广播转发
    if (context.state.isHost && fromId !== context.state.myPeerId) {
        let forwardTypes = ['move', 'chatMsg', 'surrender', 'drawRequest', 'drawAccept'];
        if (forwardTypes.includes(data.type)) {
            context.broadcastToAll(data, fromId);
        }
    }

    // 各类消息处理
    if (data.type === 'joinRequest' && context.state.isHost) {
        let mem = context.state.allMembers.get(data.myId);
        if (!mem) {
            context.state.allMembers.set(data.myId, { name: data.name, seat: null, online: true });
        } else {
            mem.name = data.name;
        }

        let existingSeat = context.state.allMembers.get(data.myId)?.seat;
        if (!existingSeat) {
            let seat = autoAssignSeat(data.myId, context.state.lobbySeats);
            if (seat) {
                let newSeat = handleSeatChange(data.myId, seat, context.state.lobbySeats, context.state.allMembers, context.state.myPeerId, context.broadcastToAll);
                if (newSeat !== null) context.state.mySeat = newSeat;
            }
        }

        let targetConn = context.state.connections.get(data.myId);
        if (targetConn && targetConn.conn.open) {
            let memberList = Array.from(context.state.allMembers.entries()).map(([id, val]) => ({ id: id, name: val.name, seat: val.seat }));
            targetConn.conn.send({
                type: 'fullSync',
                seats: context.state.lobbySeats,
                gameStarted: context.state.gameStarted,
                board: context.state.board,
                currentPlayer: context.state.currentPlayer,
                gameOver: context.state.gameOver,
                winner: context.state.winner,
                moveHistory: context.state.moveHistory,
                members: memberList,
                mySeat: context.state.allMembers.get(data.myId)?.seat,
                gameMode: context.state.roomGameMode
            });
        }
        context.broadcastToAll({ type: 'memberUpdate', peerId: data.myId, name: data.name, seat: context.state.allMembers.get(data.myId)?.seat });
        return;
    }

    if (data.type === 'seatRequest' && context.state.isHost) {
        let newSeat = handleSeatChange(fromId, data.targetSeat, context.state.lobbySeats, context.state.allMembers, context.state.myPeerId, context.broadcastToAll);
        if (newSeat !== null) context.state.mySeat = newSeat;
        context.updateUIFns.updateLobbyUI();
        return;
    }

    if (data.type === 'seatsUpdate' && !context.state.isHost) {
        let oldMySeat = context.state.mySeat;
        context.state.lobbySeats = data.seats;
        if (data.changedPeer === context.state.myPeerId) {
            context.state.mySeat = data.changedSeat;
        } else if (oldMySeat) {
            let stillThere = false;
            if (oldMySeat === 'black' && context.state.lobbySeats.black === context.state.myPeerId) stillThere = true;
            if (oldMySeat === 'white' && context.state.lobbySeats.white === context.state.myPeerId) stillThere = true;
            if (oldMySeat.startsWith('spec-')) {
                let idx = parseInt(oldMySeat.split('-')[1]);
                if (context.state.lobbySeats.spectators[idx] === context.state.myPeerId) stillThere = true;
            }
            if (!stillThere) {
                let newSeat = findSeatOf(context.state.myPeerId, context.state.lobbySeats);
                if (newSeat) context.state.mySeat = newSeat;
            }
        }
        context.updateUIFns.updateLobbyUI();
        if (context.state.gameStarted) context.updateUIFns.updateGameInfoPanel();
        return;
    }

    if (data.type === 'fullSync' && !context.state.isHost) {
        context.state.lobbySeats = data.seats;
        context.state.gameStarted = data.gameStarted;
        context.state.board = data.board;
        context.state.currentPlayer = data.currentPlayer;
        context.state.gameOver = data.gameOver;
        context.state.winner = data.winner;
        context.state.moveHistory = data.moveHistory || [];
        context.state.allMembers.clear();
        data.members.forEach(m => context.state.allMembers.set(m.id, { name: m.name, seat: m.seat, online: true }));
        if (data.mySeat) context.state.mySeat = data.mySeat;
        if (data.gameMode) {
            context.state.roomGameMode = data.gameMode;
            context.state.isProMode = context.state.roomGameMode === 'pro';
        }
        context.updateUIFns.updateLobbyUI();
        if (context.state.gameStarted) context.updateUIFns.updateGameInfoPanel();
        if (context.state.gameStarted) {
            document.getElementById('lobbyScreen').classList.add('hidden');
            document.getElementById('gameScreen').classList.remove('hidden');
            context.drawBoardFn();
            context.updateUIFns.updateGameInfoPanel();
            context.updateUIFns.updateTurnDisplay();
            context.updateUIFns.updateGameButtons();
        } else {
            document.getElementById('lobbyScreen').classList.remove('hidden');
            document.getElementById('gameScreen').classList.add('hidden');
        }
        return;
    }

    if (data.type === 'gameStart' && !context.state.isHost) {
        if (data.gameMode) {
            context.state.roomGameMode = data.gameMode;
            context.state.isProMode = context.state.roomGameMode === 'pro';
        }
        context.state.gameStarted = true;
        context.initBoardDataFn();
        document.getElementById('lobbyScreen').classList.add('hidden');
        document.getElementById('gameScreen').classList.remove('hidden');
        context.drawBoardFn();
        context.updateUIFns.updateGameInfoPanel();
        context.updateUIFns.updateTurnDisplay();
        context.updateUIFns.updateGameButtons();
        context.showToastFn('对局开始！');
        return;
    }

    if (data.type === 'move') {
        applyMoveOnline(data.row, data.col, data.player, data.gameOver, data.winner, data, context);
        return;
    }

    if (data.type === 'boardSync') {
        context.state.board = data.board;
        context.state.currentPlayer = data.currentPlayer;
        context.state.gameOver = data.gameOver;
        context.state.winner = data.winner;
        context.state.moveHistory = data.moveHistory;
        context.drawBoardFn();
        context.updateUIFns.updateGameInfoPanel();
        context.updateUIFns.updateTurnDisplay();
        if (context.state.gameOver) {
            if (context.showWinnerMsgFn) context.showWinnerMsgFn();
        }
        return;
    }

    if (data.type === 'chatMsg') {
        context.addChatMsgFn(data.sender, data.text, 'other');
        return;
    }

    if (data.type === 'returnToLobby' && !context.state.isHost) {
        context.state.gameStarted = false;
        context.state.gameOver = false;
        context.state.winner = null;
        context.initBoardDataFn();
        context.state.lobbySeats = data.seats;
        context.state.allMembers.clear();
        data.members.forEach(m => context.state.allMembers.set(m.id, { name: m.name, seat: m.seat, online: true }));
        let myMem = context.state.allMembers.get(context.state.myPeerId);
        if (myMem && myMem.seat) context.state.mySeat = myMem.seat;

        document.getElementById('gameScreen').classList.add('hidden');
        document.getElementById('lobbyScreen').classList.remove('hidden');
        context.updateUIFns.updateLobbyUI();
        context.updateUIFns.updateTurnDisplay();
        context.showToastFn('已返回房间，准备下一局');
        return;
    }

    if (data.type === 'surrender') {
        if (data.from === context.state.myPeerId) return;
        context.state.gameOver = true;
        context.state.winner = (data.player === 1 ? 2 : 1);
        context.updateUIFns.updateTurnDisplay();
        context.updateUIFns.updateGameInfoPanel();
        if (context.showWinnerMsgFn) context.showWinnerMsgFn();
        context.showToastFn((data.player === 1 ? '黑方' : '白方') + '投降，' + (context.state.winner === 1 ? '黑方' : '白方') + '获胜');
        return;
    }

    if (data.type === 'drawRequest') {
        if (data.from === context.state.myPeerId) return;
        if (context.state.mySeat === 'black' || context.state.mySeat === 'white') {
            if (confirm(data.senderName + ' 提出平局，是否同意？')) {
                context.broadcastToAll({ type: 'drawAccept', from: context.state.myPeerId });
                context.state.gameOver = true;
                context.state.winner = 0;
                context.updateUIFns.updateTurnDisplay();
                context.updateUIFns.updateGameInfoPanel();
                if (context.showWinnerMsgFn) context.showWinnerMsgFn();
                context.showToastFn('双方平局');
            }
        }
        return;
    }

    if (data.type === 'drawAccept') {
        if (data.from === context.state.myPeerId) return;
        context.state.gameOver = true;
        context.state.winner = 0;
        context.updateUIFns.updateTurnDisplay();
        context.updateUIFns.updateGameInfoPanel();
        if (context.showWinnerMsgFn) context.showWinnerMsgFn();
        context.showToastFn('双方平局');
        return;
    }

    if (data.type === 'memberUpdate') {
        context.state.allMembers.set(data.peerId, { name: data.name, seat: data.seat });
        context.updateUIFns.updateLobbyUI();
        context.updateUIFns.updateGameInfoPanel();
    }
}

// ========== 应用层操作 ==========
function applyMoveOnline(row, col, player, isGameOver, win, data, context) {
    context.state.board[row][col] = player;
    context.state.moveHistory.push({ row: row, col: col, player: player });

    if (data && data.reason === 'forbidden') {
        context.state.gameOver = true;
        context.state.winner = 2;
        context.state.forbiddenLines = data.forbiddenLines || [];
        context.drawBoardFn(false);
        context.endGameFn(2, 'forbidden');
        return;
    }

    if (isGameOver) {
        context.state.gameOver = true;
        context.state.winner = win;
        if (win === 1 || win === 2) {
            if (data && data.winLines) {
                context.state.winLines = data.winLines;
            } else {
                let line = context.checkWinFn(row, col, player);
                if (line) context.state.winLines = [line];
            }
        }
    } else {
        context.state.currentPlayer = (context.state.currentPlayer === 1 ? 2 : 1);
    }
    context.drawBoardFn();
    context.updateUIFns.updateTurnDisplay();
    context.updateUIFns.updateGameInfoPanel();
    if (context.state.gameOver) context.endGameFn(context.state.winner);
}

function tryPlaceOnline(row, col, context) {
    if (context.state.gameOver || !context.state.gameStarted) return false;

    let myColor = context.state.mySeat === 'black' ? 1 : (context.state.mySeat === 'white' ? 2 : null);
    if (myColor !== context.state.currentPlayer) {
        context.showToastFn('请等待对方落子');
        return false;
    }
    if (context.state.board[row][col] !== 0) return false;

    // 禁手检测（专业模式）
    if (context.state.isProMode && context.state.currentPlayer === 1) {
        context.state.board[row][col] = 1;
        let forbidden = Rules.checkForbidden(row, col, context.state.board, 15);
        context.state.board[row][col] = 0;
        if (forbidden.sanSan || forbidden.siSi || forbidden.overline) {
            context.state.board[row][col] = 1;
            context.state.moveHistory.push({ row: row, col: col, player: 1 });
            context.state.forbiddenLines = forbidden.lines;
            context.drawBoardFn(false);
            context.broadcastToAll({
                type: 'move',
                row: row,
                col: col,
                player: 1,
                gameOver: true,
                winner: 2,
                reason: 'forbidden',
                forbiddenLines: context.state.forbiddenLines
            });
            context.endGameFn(2, 'forbidden');
            return true;
        }
    }

    context.state.board[row][col] = context.state.currentPlayer;
    context.state.moveHistory.push({ row: row, col: col, player: context.state.currentPlayer });

    let winLine = context.checkWinFn(row, col, context.state.currentPlayer);
    let full = Rules.isBoardFull(context.state.board, 15);

    if (winLine) {
        context.state.winLines = [winLine];
        context.state.gameOver = true;
        context.state.winner = context.state.currentPlayer;
        context.broadcastToAll({
            type: 'move',
            row: row,
            col: col,
            player: context.state.currentPlayer,
            gameOver: true,
            winner: context.state.currentPlayer,
            winLines: context.state.winLines
        });
        context.endGameFn(context.state.currentPlayer);
    } else if (full) {
        context.state.gameOver = true;
        context.state.winner = 0;
        context.broadcastToAll({
            type: 'move',
            row: row,
            col: col,
            player: context.state.currentPlayer,
            gameOver: true,
            winner: 0
        });
        context.endGameFn(0);
    } else {
        let placedPlayer = context.state.currentPlayer;
        context.state.currentPlayer = (context.state.currentPlayer === 1 ? 2 : 1);
        context.broadcastToAll({
            type: 'move',
            row: row,
            col: col,
            player: placedPlayer,
            gameOver: false
        });
    }
    context.drawBoardFn();
    context.updateUIFns.updateTurnDisplay();
    context.updateUIFns.updateGameInfoPanel();
    return true;
}

function addChatMessageOnline(sender, text, type) {
    let container = document.getElementById('chatMessagesArea');
    let div = document.createElement('div');
    div.className = 'chat-msg ' + type;
    div.innerText = type === 'system' ? text : sender + ': ' + text;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
}

function sendChatMsgOnline(context) {
    let inp = document.getElementById('chatMsgInput');
    let txt = inp.value.trim();
    if (!txt) return;
    addChatMessageOnline(context.myNick, txt, 'me');
    context.broadcastToAll({ type: 'chatMsg', sender: context.myNick, text: txt });
    inp.value = '';
}

function sendSurrenderOnline(context) {
    if (!context.state.gameStarted || context.state.gameOver) return;
    if (context.state.mySeat !== 'black' && context.state.mySeat !== 'white') return;
    if (!confirm('你是否确定要投降？')) return;

    let myColor = context.state.mySeat === 'black' ? 1 : 2;
    context.broadcastToAll({ type: 'surrender', from: context.state.myPeerId, player: myColor, senderName: context.myNick });
    context.state.gameOver = true;
    context.state.winner = (myColor === 1 ? 2 : 1);
    context.updateUIFns.updateTurnDisplay();
    context.updateUIFns.updateGameInfoPanel();
    if (context.showWinnerMsgFn) context.showWinnerMsgFn();
    context.showToastFn('你已投降');
}

function sendDrawRequestOnline(context) {
    if (!context.state.gameStarted || context.state.gameOver) return;
    if (context.state.mySeat !== 'black' && context.state.mySeat !== 'white') return;
    context.broadcastToAll({ type: 'drawRequest', from: context.state.myPeerId, senderName: context.myNick });
    context.showToastFn('已发送平局申请');
}

function exitToLobbyOnline(context) {
    document.getElementById('gameEndOverlay').classList.remove('show');
    context.state.gameStarted = false;
    context.state.gameOver = false;
    context.state.winner = null;
    context.initBoardDataFn();

    document.getElementById('gameScreen').classList.add('hidden');
    document.getElementById('lobbyScreen').classList.remove('hidden');
    context.updateUIFns.updateLobbyUI();

    let startBtn = document.getElementById('startGameButton');
    if (context.state.isHost && context.state.lobbySeats.black && context.state.lobbySeats.white) {
        startBtn.classList.add('show');
    } else {
        startBtn.classList.remove('show');
    }

    if (context.state.isHost) {
        context.broadcastToAll({
            type: 'returnToLobby',
            seats: context.state.lobbySeats,
            members: Array.from(context.state.allMembers.entries()).map(([id, val]) => ({ id: id, name: val.name, seat: val.seat }))
        });
    }

    context.updateUIFns.updateTurnDisplay();
    context.showToastFn('已返回房间，准备下一局');
}

// ========== 导出到全局 ==========
window.Core = {
    getSeatOccupant: getSeatOccupant,
    setSeat: setSeat,
    clearAllSeatsOf: clearAllSeatsOf,
    findSeatOf: findSeatOf,
    autoAssignSeat: autoAssignSeat,
    handleSeatChange: handleSeatChange,
    handleOnlineMessage: handleOnlineMessage,
    applyMoveOnline: applyMoveOnline,
    tryPlaceOnline: tryPlaceOnline,
    addChatMessageOnline: addChatMessageOnline,
    sendChatMsgOnline: sendChatMsgOnline,
    sendSurrenderOnline: sendSurrenderOnline,
    sendDrawRequestOnline: sendDrawRequestOnline,
    exitToLobbyOnline: exitToLobbyOnline
};