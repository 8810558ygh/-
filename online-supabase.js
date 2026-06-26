// online-supabase.js —— 纯 P2P 联机 + Supabase 后台存盘
// 所有实时通信走 P2P，Supabase 只在后台默默存盘，不参与实时广播
// 当 P2P 断开时自动降级到 Supabase Realtime（备胎）

(function(global) {
    const SUPABASE_URL = 'https://txgemtxikpieaqcohglr.supabase.co';
    const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR4Z2VtdHhpa3BpZWFxY29oZ2xyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk4MDY1NTIsImV4cCI6MjA5NTM4MjU1Mn0.I0PHUfWmiDpBnfjmTBJ1u6ybzZzhsTG0uaLbKBrcN1c';

    let supabaseClient = null;
    let realtimeChannel = null;
    let heartbeatTimer = null;
    let currentUser = null;

    // ---------- P2P 核心 ----------
    let peer = null;
    let p2pConnections = new Map();  // peerId -> { conn, lastSeen }
    let p2pActive = false;
    let seqCounter = 0;
    let lastReceivedSeq = -1;
    let isDegraded = false;          // P2P 断开降级到 Supabase

    // ---------- 本地状态 ----------
    let localState = null;

    const ICE_SERVERS = [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
        { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' }
    ];

    // ---------- 工具 ----------
    function genRoomCode() {
        return Math.random().toString(36).substring(2, 8).toUpperCase();
    }
    function log(msg) { console.log('[P2P] ' + msg); }
    function logError(msg) { console.error('[P2P] ' + msg); }

    // ---------- 同步全局状态 ----------
    function syncGlobalState(state) {
        window.GAME = state;
        window._allMembers = state.allMembers;
        window._myId = state.myUserId;
        localState = state;
        global._gobangState = state;
    }

    // ---------- Supabase 客户端 ----------
    function createSupabaseClient() {
        if (!window.supabase) {
            console.error('Supabase 库未加载');
            return null;
        }
        supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
        return supabaseClient;
    }

    async function getCurrentUser() {
        if (!supabaseClient) return null;
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (session) {
            currentUser = session.user;
            return currentUser;
        }
        return null;
    }

    // ============================================================
    // P2P 核心函数（参照 online-p2p.js）
    // ============================================================

    // ---------- P2P 初始化 ----------
    function initPeer(peerId, onOpen) {
        return new Promise((resolve, reject) => {
            if (peer) {
                try { peer.destroy(); } catch(e) {}
                peer = null;
            }
            peer = new Peer(peerId, {
                host: '0.peerjs.com',
                port: 443,
                secure: true,
                config: { iceServers: ICE_SERVERS }
            });
            peer.on('open', (id) => {
                log('✅ Peer 已就绪: ' + id);
                p2pActive = true;
                isDegraded = false;
                if (onOpen) onOpen(id);
                resolve(peer);
            });
            peer.on('error', (err) => {
                logError('Peer 错误: ' + err.message);
                p2pActive = false;
                // 不 reject，只是标记降级
                resolve(null);
            });
            // 超时降级
            setTimeout(() => {
                if (!p2pActive) {
                    log('⚠️ P2P 超时，使用云端备份');
                    p2pActive = false;
                    isDegraded = true;
                    resolve(null);
                }
            }, 8000);
        });
    }

    function getPeer() { return peer; }

    // ---------- P2P 连接设置 ----------
    function setupP2PConnection(conn, context, isJoiner) {
        const peerId = conn.peer;
        log('📡 设置 P2P 连接: ' + peerId);

        conn.on('open', () => {
            log('✅ P2P 已建立: ' + peerId);
            p2pConnections.set(peerId, { conn, lastSeen: Date.now() });
            p2pActive = true;
            isDegraded = false;

            // 发送身份信息
            conn.send({
                type: 'identity',
                userId: context.userId,
                nickname: context.nickname,
                peerId: context.userId
            });

            // 房主发送全量同步
            let state = window.GAME;
            if (state && state.isHost) {
                sendFullSync(conn);
            }
        });

        conn.on('data', (data) => {
            handleP2PMessage(peerId, data, context);
        });

        conn.on('close', () => {
            log('P2P 断开: ' + peerId);
            p2pConnections.delete(peerId);
            if (p2pConnections.size === 0) {
                p2pActive = false;
                // 非房主尝试重连
                let state = window.GAME;
                if (state && !state.isHost) {
                    attemptReconnect(context);
                } else {
                    degradeToSupabase(context);
                }
            }
        });

        conn.on('error', (err) => {
            logError('P2P 连接错误 (' + peerId + '): ' + err.message);
            p2pConnections.delete(peerId);
            if (p2pConnections.size === 0) {
                p2pActive = false;
                if (window.GAME && !window.GAME.isHost) {
                    attemptReconnect(context);
                } else {
                    degradeToSupabase(context);
                }
            }
        });
    }

    // ---------- 重连 ----------
    function attemptReconnect(context) {
        let state = window.GAME;
        if (!state || state.isHost || !peer || peer.destroyed) {
            degradeToSupabase(context);
            return;
        }
        // 找房主的 peerId
        const hostUserId = state.lobbySeats.black;
        if (!hostUserId) { degradeToSupabase(context); return; }
        const hostMember = state.allMembers.get(hostUserId);
        const hostPeerId = hostMember ? hostMember.peerId : null;
        if (!hostPeerId) { degradeToSupabase(context); return; }

        log('🔄 尝试重连房主: ' + hostPeerId);
        try {
            const conn = peer.connect(hostPeerId, { reliable: true, serialization: 'json' });
            setupP2PConnection(conn, context, true);
            conn.on('open', () => {
                log('✅ 重连成功！');
                p2pActive = true;
                isDegraded = false;
                context.showToastFn?.('✅ P2P 已恢复');
            });
            conn.on('error', () => { degradeToSupabase(context); });
            conn.on('close', () => { degradeToSupabase(context); });
        } catch (e) {
            logError('重连异常: ' + e.message);
            degradeToSupabase(context);
        }
    }

    // ---------- 降级 ----------
    function degradeToSupabase(context) {
        if (isDegraded) return;
        log('📡 降级到云端模式（P2P 不可用）');
        isDegraded = true;
        p2pActive = false;
        context.showToastFn?.('📡 P2P 不可用，已切换至云端模式');
        // 刷新状态
        if (window.GAME) {
            refreshFromSupabase(context);
        }
    }

    // ---------- P2P 消息处理 ----------
    function handleP2PMessage(fromId, msg, context) {
        // 身份消息
        if (msg.type === 'identity') {
            let state = window.GAME;
            if (state) {
                const { userId, nickname, peerId } = msg;
                // 检查是否已存在（去重）
                if (!state.allMembers.has(userId)) {
                    state.allMembers.set(userId, {
                        name: nickname,
                        seat: null,
                        peerId: peerId,
                        online: true
                    });
                    // 房主自动分配座位
                    if (state.isHost) {
                        assignSeatToMember(userId, context);
                    }
                } else {
                    // 更新在线状态
                    let member = state.allMembers.get(userId);
                    member.online = true;
                    member.peerId = peerId;
                }
                syncGlobalState(state);
                window.UI.updateLobbyUI(state.lobbySeats, state.isHost, state.roomGameMode);
            }
            return;
        }

        // seq 去重
        if (msg.seq !== undefined) {
            if (msg.seq <= lastReceivedSeq) return;
            lastReceivedSeq = msg.seq;
        }

        let state = window.GAME;
        if (!state) return;

        // 处理各种消息
        switch (msg.type) {
            case 'move':
                applyP2PMove(msg, context);
                break;
            case 'gameStart':
                handleGameStart(msg, context);
                break;
            case 'gameOver':
                handleGameOver(msg, context);
                break;
            case 'chatMsg':
                context.addChatMsgFn?.(msg.sender, msg.text, 'other');
                break;
            case 'seatChange':
                updateSeatFromP2P(msg.userId, msg.seat, context);
                break;
            case 'fullSync':
                applyFullSync(msg, context);
                break;
            case 'returnToLobby':
                handleReturnToLobby(context);
                break;
            case 'ping':
                let conn = p2pConnections.get(fromId)?.conn;
                if (conn && conn.open) {
                    try { conn.send({ type: 'pong', from: context.userId, time: Date.now() }); } catch(e) {}
                }
                break;
            case 'pong':
                if (p2pConnections.has(fromId)) {
                    p2pConnections.get(fromId).lastSeen = Date.now();
                }
                break;
            default:
                log('未知消息类型: ' + msg.type);
        }
    }

    // ---------- 应用 P2P 消息 ----------
    function applyP2PMove(msg, context) {
        let state = window.GAME;
        if (!state) return;
        const { row, col, player, gameOver, winner, winLines, forbiddenLines } = msg;
        if (state.board[row][col] !== 0) return; // 防重
        state.board[row][col] = player;
        state.moveHistory.push({ row, col, player });
        if (gameOver) {
            state.gameOver = true;
            state.winner = winner;
            state.winLines = winLines || [];
            state.forbiddenLines = forbiddenLines || [];
        } else {
            state.currentPlayer = (state.currentPlayer === 1 ? 2 : 1);
        }
        syncGlobalState(state);
        context.drawBoardFn?.();
        context.updateUIFns?.updateTurnDisplay();
        context.updateUIFns?.updateGameInfoPanel();
        // 后台存盘（不阻塞）
        saveStateToSupabase(state);
    }

    function handleGameStart(msg, context) {
        let state = window.GAME;
        if (!state) return;
        state.gameStarted = true;
        state.board = msg.board || Rules.initBoard(15);
        state.currentPlayer = msg.currentPlayer || 1;
        state.moveHistory = msg.moveHistory || [];
        syncGlobalState(state);

        // 切换到游戏界面
        document.getElementById('lobbyScreen').classList.add('hidden');
        document.getElementById('gameScreen').classList.remove('hidden');
        context.drawBoardFn?.();
        context.updateUIFns?.updateGameInfoPanel();
        context.updateUIFns?.updateTurnDisplay();
        context.updateUIFns?.updateGameButtons();
        context.showToastFn?.('⚔️ 对局开始！');
        // 后台存盘
        saveStateToSupabase(state);
    }

    function handleGameOver(msg, context) {
        let state = window.GAME;
        if (!state) return;
        state.gameOver = true;
        state.winner = msg.winner;
        state.winLines = msg.winLines || [];
        state.forbiddenLines = msg.forbiddenLines || [];
        syncGlobalState(state);
        context.endGameFn?.(msg.winner, msg.reason);
        // 后台存盘
        saveStateToSupabase(state);
    }

    function handleReturnToLobby(context) {
        let state = window.GAME;
        if (!state) return;
        state.gameStarted = false;
        state.gameOver = false;
        state.winner = null;
        state.board = Rules.initBoard(15);
        state.moveHistory = [];
        state.winLines = [];
        state.forbiddenLines = [];
        syncGlobalState(state);

        document.getElementById('gameScreen').classList.add('hidden');
        document.getElementById('lobbyScreen').classList.remove('hidden');
        context.updateUIFns?.updateLobbyUI();
        context.updateUIFns?.updateTurnDisplay();
        context.showToastFn?.('已返回房间');
    }

    function updateSeatFromP2P(userId, seat, context) {
        let state = window.GAME;
        if (!state) return;

        // 清除旧座位
        for (let key in state.lobbySeats) {
            if (key === 'spectators') {
                state.lobbySeats.spectators = state.lobbySeats.spectators.map(id => id === userId ? null : id);
            } else if (state.lobbySeats[key] === userId) {
                state.lobbySeats[key] = null;
            }
        }
        // 分配新座位
        if (seat === 'black') state.lobbySeats.black = userId;
        else if (seat === 'white') state.lobbySeats.white = userId;
        else if (seat.startsWith('spec-')) {
            let idx = parseInt(seat.split('-')[1]);
            if (idx >= 0 && idx < 6) state.lobbySeats.spectators[idx] = userId;
        }
        if (state.allMembers.has(userId)) {
            state.allMembers.get(userId).seat = seat;
        }
        if (userId === state.myUserId) state.mySeat = seat;
        syncGlobalState(state);

        window.UI.updateLobbyUI(state.lobbySeats, state.isHost, state.roomGameMode);

        // 后台存盘
        (async () => {
            try {
                await supabaseClient.from('room_players')
                    .update({ seat: seat })
                    .eq('room_code', state.roomId)
                    .eq('user_id', userId);
            } catch (e) {}
        })();
    }

    function assignSeatToMember(userId, context) {
        let state = window.GAME;
        if (!state) return;
        if (state.allMembers.get(userId)?.seat) return;

        let seat;
        if (!state.lobbySeats.black) seat = 'black';
        else if (!state.lobbySeats.white) seat = 'white';
        else {
            let idx = state.lobbySeats.spectators.indexOf(null);
            if (idx === -1) idx = 0;
            seat = 'spec-' + idx;
        }
        state.allMembers.get(userId).seat = seat;
        if (seat === 'black') state.lobbySeats.black = userId;
        else if (seat === 'white') state.lobbySeats.white = userId;
        else if (seat.startsWith('spec-')) {
            let idx = parseInt(seat.split('-')[1]);
            state.lobbySeats.spectators[idx] = userId;
        }
        syncGlobalState(state);

        // P2P 广播座位变更
        broadcastToAll({ type: 'seatChange', userId, seat }, context);
        window.UI.updateLobbyUI(state.lobbySeats, state.isHost, state.roomGameMode);

        // 后台存盘
        (async () => {
            try {
                await supabaseClient.from('room_players')
                    .update({ seat: seat })
                    .eq('room_code', state.roomId)
                    .eq('user_id', userId);
            } catch (e) {}
        })();
    }

    // ---------- 全量同步 ----------
    function sendFullSync(conn) {
        let state = window.GAME;
        if (!state) return;
        const members = Array.from(state.allMembers.entries()).map(([id, val]) => ({
            id, name: val.name, seat: val.seat, peerId: val.peerId
        }));
        conn.send({
            type: 'fullSync',
            board: state.board,
            currentPlayer: state.currentPlayer,
            gameOver: state.gameOver,
            winner: state.winner,
            moveHistory: state.moveHistory,
            winLines: state.winLines,
            forbiddenLines: state.forbiddenLines,
            seats: state.lobbySeats,
            members: members,
            gameStarted: state.gameStarted
        });
    }

    function applyFullSync(msg, context) {
        let state = window.GAME;
        if (!state) return;
        state.board = msg.board;
        state.currentPlayer = msg.currentPlayer;
        state.gameOver = msg.gameOver;
        state.winner = msg.winner;
        state.moveHistory = msg.moveHistory;
        state.winLines = msg.winLines || [];
        state.forbiddenLines = msg.forbiddenLines || [];
        state.lobbySeats = msg.seats;
        state.gameStarted = msg.gameStarted;
        if (msg.members) {
            state.allMembers.clear();
            msg.members.forEach(m => {
                state.allMembers.set(m.id, { name: m.name, seat: m.seat, peerId: m.peerId, online: true });
            });
        }
        syncGlobalState(state);
        context.drawBoardFn?.();
        context.updateUIFns?.updateTurnDisplay();
        context.updateUIFns?.updateGameInfoPanel();
        window.UI.updateLobbyUI(state.lobbySeats, state.isHost, state.roomGameMode);
    }

    // ---------- 广播消息（纯 P2P） ----------
    function broadcastToAll(msg, context, exceptId) {
        let state = window.GAME;
        if (!state) return;

        // 通过 P2P 发送
        if (p2pActive && p2pConnections.size > 0) {
            let sent = false;
            p2pConnections.forEach((val, peerId) => {
                if (peerId !== exceptId && val.conn && val.conn.open) {
                    try {
                        val.conn.send({ ...msg, seq: ++seqCounter });
                        sent = true;
                    } catch (e) {
                        logError('发送到 ' + peerId + ' 失败: ' + e.message);
                    }
                }
            });
            if (sent) {
                // 后台存盘（不阻塞）
                saveStateToSupabase(state);
                return;
            }
        }

        // P2P 不可用，走 Supabase 降级
        log('⚠️ P2P 广播失败，切换到云端');
        degradeToSupabase(context);
        // 通过 Supabase Realtime 发送
        sendViaSupabase(msg, context);
    }

    // ---------- Supabase 存盘和降级 ----------
    async function saveStateToSupabase(state) {
        if (!supabaseClient || !state || !state.roomId) return;
        try {
            // 只存盘，不阻塞
            await supabaseClient.from('rooms')
                .update({
                    board_state: state.board,
                    current_player: state.currentPlayer,
                    move_history: state.moveHistory,
                    game_over: state.gameOver,
                    winner: state.winner,
                    win_lines: state.winLines,
                    forbidden_lines: state.forbiddenLines,
                    game_started: state.gameStarted
                })
                .eq('room_code', state.roomId);
        } catch (e) {
            // 存盘失败不影响游戏
        }
    }

    function sendViaSupabase(msg, context) {
        let state = window.GAME;
        if (!state) return;
        // 通过更新 rooms 表触发 Realtime 广播（降级通道）
        if (msg.type === 'move' || msg.type === 'gameStart' || msg.type === 'gameOver') {
            saveStateToSupabase(state);
        } else if (msg.type === 'chatMsg') {
            if (supabaseClient) {
                supabaseClient.from('messages').insert({
                    room_code: state.roomId,
                    sender_name: msg.sender || context.myNick,
                    text: msg.text
                }).catch(e => {});
            }
        }
        // seatChange 通过 room_players 表已更新
    }

    async function refreshFromSupabase(context) {
        let state = window.GAME;
        if (!state || !state.roomId) return;
        try {
            const { data: room } = await supabaseClient
                .from('rooms')
                .select('*')
                .eq('room_code', state.roomId)
                .single();
            if (room) {
                state.board = room.board_state || Rules.initBoard(15);
                state.currentPlayer = room.current_player || 1;
                state.gameOver = room.game_over || false;
                state.winner = room.winner;
                state.moveHistory = room.move_history || [];
                state.winLines = room.win_lines || [];
                state.forbiddenLines = room.forbidden_lines || [];
                state.gameStarted = room.game_started || false;
                syncGlobalState(state);
                context.drawBoardFn?.();
                context.updateUIFns?.updateTurnDisplay();
                context.updateUIFns?.updateGameInfoPanel();
            }
        } catch (e) {
            logError('从 Supabase 刷新失败: ' + e.message);
        }
    }

    // ============================================================
    // Supabase Realtime 订阅（降级时使用）
    // ============================================================
    function setupSupabaseSubscription(context, state) {
        if (realtimeChannel) {
            supabaseClient.removeChannel(realtimeChannel);
        }
        realtimeChannel = supabaseClient
            .channel('room:' + state.roomId)
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'room_players',
                filter: 'room_code=eq.' + state.roomId
            }, () => {
                // 降级时同步成员
                if (isDegraded || !p2pActive) {
                    refreshMembersFromSupabase(state);
                    window.UI.updateLobbyUI(state.lobbySeats, state.isHost, state.roomGameMode);
                    context.updateUIFns?.updateGameInfoPanel();
                }
            })
            .on('postgres_changes', {
                event: 'UPDATE',
                schema: 'public',
                table: 'rooms',
                filter: 'room_code=eq.' + state.roomId
            }, (payload) => {
                // 降级时同步房间状态
                if (isDegraded || !p2pActive) {
                    handleRoomUpdateFromSupabase(payload.new, context);
                }
            })
            .subscribe((status) => {
                context.updateConnUI?.(status === 'SUBSCRIBED');
            });
    }

    async function refreshMembersFromSupabase(state) {
        if (!supabaseClient) return;
        try {
            const { data: players } = await supabaseClient
                .from('room_players')
                .select('*')
                .eq('room_code', state.roomId);
            if (players) {
                const myUserId = state.myUserId;
                players.forEach(p => {
                    const userId = p.user_id;
                    const existing = state.allMembers.get(userId);
                    if (existing) {
                        if (userId === myUserId) {
                            // 自己的座位不覆盖
                            existing.online = p.is_online && (new Date() - new Date(p.last_seen) < 60000);
                        } else {
                            existing.name = p.nickname;
                            existing.seat = p.seat;
                            existing.peerId = p.peer_id;
                            existing.online = p.is_online && (new Date() - new Date(p.last_seen) < 60000);
                        }
                    } else {
                        state.allMembers.set(userId, {
                            name: p.nickname,
                            seat: p.seat,
                            peerId: p.peer_id,
                            online: p.is_online && (new Date() - new Date(p.last_seen) < 60000)
                        });
                    }
                });
                // 重建 lobbySeats
                state.lobbySeats = { black: null, white: null, spectators: Array(6).fill(null) };
                state.allMembers.forEach((member, uid) => {
                    if (member.seat === 'black') state.lobbySeats.black = uid;
                    else if (member.seat === 'white') state.lobbySeats.white = uid;
                    else if (member.seat && member.seat.startsWith('spec-')) {
                        let idx = parseInt(member.seat.split('-')[1]);
                        if (idx >= 0 && idx < 6) state.lobbySeats.spectators[idx] = uid;
                    }
                });
                if (state.myUserId && state.allMembers.has(state.myUserId)) {
                    state.mySeat = state.allMembers.get(state.myUserId).seat;
                }
                syncGlobalState(state);
            }
        } catch (e) {
            logError('刷新成员失败: ' + e.message);
        }
    }

    function handleRoomUpdateFromSupabase(newRow, context) {
        let state = window.GAME;
        if (!state) return;
        // 只在降级时应用
        if (isDegraded || !p2pActive) {
            // 如果有 seq，检查是否已处理
            state.board = newRow.board_state || state.board;
            state.currentPlayer = newRow.current_player || state.currentPlayer;
            state.gameOver = newRow.game_over || false;
            state.winner = newRow.winner;
            state.moveHistory = newRow.move_history || [];
            state.winLines = newRow.win_lines || [];
            state.forbiddenLines = newRow.forbidden_lines || [];
            state.gameStarted = newRow.game_started || false;
            syncGlobalState(state);
            context.drawBoardFn?.();
            context.updateUIFns?.updateTurnDisplay();
            context.updateUIFns?.updateGameInfoPanel();
        }
    }

    // ---------- 心跳 ----------
    function startHeartbeat(context, state) {
        if (heartbeatTimer) clearInterval(heartbeatTimer);
        heartbeatTimer = setInterval(async () => {
            // Supabase 心跳
            if (supabaseClient && state && state.roomId) {
                await supabaseClient.from('room_players')
                    .update({ last_seen: new Date().toISOString(), is_online: true })
                    .eq('room_code', state.roomId)
                    .eq('user_id', state.myUserId);
            }
            // P2P 心跳
            if (p2pActive) {
                p2pConnections.forEach((val) => {
                    if (val.conn && val.conn.open) {
                        try { val.conn.send({ type: 'ping', from: state.myUserId, time: Date.now() }); } catch(e) {}
                    }
                });
            }
        }, 5000);
    }

    // ============================================================
    // 对外接口
    // ============================================================

    // ---------- 创建房间 ----------
    async function createRoom(context) {
        if (!supabaseClient) {
            supabaseClient = createSupabaseClient();
        }

        const roomCode = genRoomCode();
        const { userId, nickname, gameMode, showToastFn } = context;
        const isProMode = gameMode === 'pro';

        // 立即构建本地状态
        const state = {
            roomId: roomCode,
            isHost: true,
            myUserId: userId,
            myNick: nickname,
            mySeat: 'black',
            lobbySeats: { black: userId, white: null, spectators: Array(6).fill(null) },
            allMembers: new Map(),
            board: Rules.initBoard(15),
            currentPlayer: 1,
            gameOver: false,
            winner: null,
            moveHistory: [],
            winLines: [],
            forbiddenLines: [],
            gameStarted: false,
            isProMode: isProMode,
            roomGameMode: gameMode,
            drawRequestHandled: false
        };
        state.allMembers.set(userId, { name: nickname, seat: 'black', peerId: userId, online: true });
        syncGlobalState(state);

        // 立即切换 UI
        document.getElementById('entryScreen').classList.add('hidden');
        document.getElementById('lobbyScreen').classList.remove('hidden');
        document.getElementById('roomCodeDisplay').innerText = roomCode;
        document.getElementById('gameRoomCode').innerText = roomCode;
        window.UI.renderSpectators();
        window.UI.updateLobbyUI(state.lobbySeats, state.isHost, state.roomGameMode);
        window.UI.lockNicknameDisplay(context.myNick);
        showToastFn('🎯 房间已创建：' + roomCode);

        // 后台初始化 Supabase 和 P2P
        (async () => {
            try {
                // 写入 Supabase
                await supabaseClient.from('rooms').insert({
                    room_code: roomCode,
                    host_id: userId,
                    mode: gameMode || 'casual',
                    status: 'waiting',
                    board_state: null,
                    current_player: 1,
                    game_started: false,
                    game_over: false,
                    winner: null,
                    move_history: [],
                    win_lines: [],
                    forbidden_lines: [],
                    draw_request_by: null,
                    end_reason: null,
                    p2p_peer_id: userId
                });
                await supabaseClient.from('room_players').insert({
                    room_code: roomCode,
                    user_id: userId,
                    nickname: nickname,
                    seat: 'black',
                    peer_id: userId,
                    is_online: true,
                    last_seen: new Date().toISOString()
                });

                // 初始化 P2P
                try {
                    await initPeer(userId);
                    if (peer) {
                        peer.on('connection', (conn) => {
                            handleP2PConnection(conn, context);
                        });
                        log('✅ P2P 已就绪，等待玩家加入');
                    }
                } catch (e) {
                    log('⚠️ P2P 不可用，使用云端模式');
                    p2pActive = false;
                    isDegraded = true;
                }

                // 订阅 Supabase（降级时使用）
                setupSupabaseSubscription(context, state);
                startHeartbeat(context, state);
                localStorage.setItem('gobang_current_room', roomCode);

            } catch (e) {
                console.error('后台初始化失败:', e);
            }
        })();

        return state;
    }

    // ---------- 加入房间 ----------
    async function joinRoom(context, code) {
        if (!supabaseClient) {
            supabaseClient = createSupabaseClient();
            if (!supabaseClient) {
                context.showToastFn('Supabase 加载失败');
                return null;
            }
        }

        const roomCode = code.toUpperCase();
        const { userId, nickname, showToastFn } = context;

        // 检查是否已在此房间中
        try {
            const { data: existing } = await supabaseClient
                .from('room_players')
                .select('user_id')
                .eq('room_code', roomCode)
                .eq('user_id', userId)
                .maybeSingle();
            if (existing) {
                showToastFn('您已在该房间中，请勿重复加入');
                return null;
            }
        } catch (e) {}

        // 初始化 Peer
        try {
            await initPeer(userId);
        } catch (e) {}

        // 获取房间信息
        let room;
        try {
            const { data, error } = await supabaseClient
                .from('rooms')
                .select('*')
                .eq('room_code', roomCode)
                .single();
            if (error || !data) {
                showToastFn('房间不存在');
                return null;
            }
            if (data.status === 'closed') {
                showToastFn('房间已关闭');
                return null;
            }
            room = data;
        } catch (e) {
            showToastFn('获取房间信息失败');
            return null;
        }

        // 构建本地状态
        const state = {
            roomId: roomCode,
            isHost: false,
            myUserId: userId,
            myNick: nickname,
            mySeat: null,
            lobbySeats: { black: null, white: null, spectators: Array(6).fill(null) },
            allMembers: new Map(),
            board: room.board_state || Rules.initBoard(15),
            currentPlayer: room.current_player || 1,
            gameOver: room.game_over || false,
            winner: room.winner,
            moveHistory: room.move_history || [],
            winLines: room.win_lines || [],
            forbiddenLines: room.forbidden_lines || [],
            gameStarted: room.game_started || false,
            isProMode: room.mode === 'pro',
            roomGameMode: room.mode || 'casual',
            drawRequestHandled: false
        };
        syncGlobalState(state);

        // 立即切换 UI
        document.getElementById('entryScreen').classList.add('hidden');
        document.getElementById('lobbyScreen').classList.remove('hidden');
        document.getElementById('roomCodeDisplay').innerText = roomCode;
        document.getElementById('gameRoomCode').innerText = roomCode;
        window.UI.renderSpectators();
        window.UI.updateLobbyUI(state.lobbySeats, state.isHost, state.roomGameMode);
        window.UI.lockNicknameDisplay(context.myNick);
        showToastFn('🎯 已加入房间：' + roomCode);

        // 后台注册和连接
        (async () => {
            try {
                await supabaseClient.from('room_players').upsert({
                    room_code: roomCode,
                    user_id: userId,
                    nickname: nickname,
                    seat: null,
                    peer_id: userId,
                    is_online: true,
                    last_seen: new Date().toISOString()
                }, { onConflict: 'room_code,user_id' });
            } catch (e) {}

            // 自动分配座位
            await autoAssignSeat(context, roomCode);
            if (window.GAME) {
                window.UI.updateLobbyUI(window.GAME.lobbySeats, window.GAME.isHost, window.GAME.roomGameMode);
            }

            setupSupabaseSubscription(context, state);
            startHeartbeat(context, state);
            localStorage.setItem('gobang_current_room', roomCode);

            // 尝试 P2P 连接房主
            try {
                const hostPeerId = room.p2p_peer_id;
                if (hostPeerId && hostPeerId !== userId && peer) {
                    const conn = peer.connect(hostPeerId, {
                        reliable: true,
                        serialization: 'json'
                    });
                    setupP2PConnection(conn, context, true);
                    log('📡 P2P 连接中...');
                }
            } catch (e) {
                log('⚠️ P2P 连接失败，使用云端模式');
                p2pActive = false;
                isDegraded = true;
            }
        })();

        return state;
    }

    // ---------- 自动分配座位 ----------
    async function autoAssignSeat(context, roomCode) {
        try {
            const { data: players } = await supabaseClient
                .from('room_players')
                .select('seat')
                .eq('room_code', roomCode);
            let hasBlack = false, hasWhite = false;
            let maxSpec = -1;
            if (players) {
                for (let p of players) {
                    if (p.seat === 'black') hasBlack = true;
                    else if (p.seat === 'white') hasWhite = true;
                    else if (p.seat && p.seat.startsWith('spec-')) {
                        let idx = parseInt(p.seat.split('-')[1]);
                        if (idx > maxSpec) maxSpec = idx;
                    }
                }
            }
            let targetSeat;
            if (!hasBlack) targetSeat = 'black';
            else if (!hasWhite) targetSeat = 'white';
            else targetSeat = 'spec-' + Math.min(maxSpec + 1, 5);

            if (targetSeat) {
                await supabaseClient.from('room_players')
                    .update({ seat: targetSeat })
                    .eq('room_code', roomCode)
                    .eq('user_id', context.userId);
                let state = window.GAME;
                if (state) {
                    state.mySeat = targetSeat;
                    state.allMembers.set(context.userId, {
                        name: context.nickname,
                        seat: targetSeat,
                        peerId: context.userId,
                        online: true
                    });
                    if (targetSeat === 'black') state.lobbySeats.black = context.userId;
                    else if (targetSeat === 'white') state.lobbySeats.white = context.userId;
                    else if (targetSeat.startsWith('spec-')) {
                        let idx = parseInt(targetSeat.split('-')[1]);
                        if (idx >= 0 && idx < 6) state.lobbySeats.spectators[idx] = context.userId;
                    }
                    syncGlobalState(state);
                }
            }
        } catch (e) {}
    }

    // ---------- 请求换座 ----------
    async function requestSeat(context, targetSeat) {
        const state = window.GAME;
        if (!state || !state.roomId) {
            context.showToastFn('请先创建或加入房间');
            return;
        }
        if (state.mySeat === targetSeat) return;

        const userId = state.myUserId;

        // 乐观更新
        for (let key in state.lobbySeats) {
            if (key === 'spectators') {
                state.lobbySeats.spectators = state.lobbySeats.spectators.map(id => id === userId ? null : id);
            } else if (state.lobbySeats[key] === userId) {
                state.lobbySeats[key] = null;
            }
        }
        if (targetSeat === 'black') state.lobbySeats.black = userId;
        else if (targetSeat === 'white') state.lobbySeats.white = userId;
        else if (targetSeat.startsWith('spec-')) {
            let idx = parseInt(targetSeat.split('-')[1]);
            if (idx >= 0 && idx < 6) state.lobbySeats.spectators[idx] = userId;
        }
        state.mySeat = targetSeat;
        if (state.allMembers.has(userId)) {
            state.allMembers.get(userId).seat = targetSeat;
        }
        syncGlobalState(state);

        // 立即更新 UI
        window.UI.updateLobbyUI(state.lobbySeats, state.isHost, state.roomGameMode);

        // P2P 广播
        broadcastToAll({ type: 'seatChange', userId, seat: targetSeat }, context);

        // 后台存盘
        (async () => {
            try {
                await supabaseClient.from('room_players')
                    .update({ seat: null })
                    .eq('room_code', state.roomId)
                    .eq('user_id', userId);
                await supabaseClient.from('room_players')
                    .update({ seat: targetSeat })
                    .eq('room_code', state.roomId)
                    .eq('user_id', userId);
            } catch (e) {}
        })();
    }

    // ---------- 开始游戏 ----------
    async function requestStartGame(context) {
        let state = window.GAME;
        if (!state || !state.isHost) {
            context.showToastFn('只有房主可以开始游戏');
            return;
        }
        if (!state.lobbySeats.black || !state.lobbySeats.white) {
            context.showToastFn('双方入座后才可开始');
            return;
        }

        context.initBoardDataFn();
        state.gameStarted = true;
        syncGlobalState(state);

        // P2P 广播开始（关键！）
        broadcastToAll({
            type: 'gameStart',
            board: state.board,
            currentPlayer: 1,
            moveHistory: []
        }, context);

        // 房主自己也切换界面
        document.getElementById('lobbyScreen').classList.add('hidden');
        document.getElementById('gameScreen').classList.remove('hidden');
        context.drawBoardFn();
        context.updateUIFns?.updateGameInfoPanel();
        context.updateUIFns?.updateTurnDisplay();
        context.updateUIFns?.updateGameButtons();
        context.showToastFn('⚔️ 对局开始！');

        // 后台存盘
        (async () => {
            try {
                await supabaseClient.from('rooms').update({
                    game_started: true,
                    status: 'playing',
                    board_state: state.board,
                    current_player: 1,
                    move_history: [],
                    game_over: false,
                    winner: null,
                    win_lines: [],
                    forbidden_lines: [],
                    draw_request_by: null,
                    end_reason: null
                }).eq('room_code', state.roomId);
            } catch (e) {}
        })();
    }

    // ---------- 落子 ----------
    async function tryPlace(context, row, col) {
        let state = window.GAME;
        if (!state) return false;
        if (state.gameOver || !state.gameStarted) {
            context.showToastFn('对局已结束或未开始');
            return false;
        }

        let myColor = state.mySeat === 'black' ? 1 : (state.mySeat === 'white' ? 2 : null);
        if (myColor !== state.currentPlayer) {
            context.showToastFn('请等待对方落子');
            return false;
        }
        if (state.board[row][col] !== 0) {
            context.showToastFn('此位置已有棋子');
            return false;
        }

        // 禁手检测
        if (state.isProMode && state.currentPlayer === 1) {
            state.board[row][col] = 1;
            let forbidden = Rules.checkForbidden(row, col, state.board, 15);
            state.board[row][col] = 0;
            if (forbidden.sanSan || forbidden.siSi || forbidden.overline) {
                state.board[row][col] = 1;
                state.moveHistory.push({ row, col, player: 1 });
                state.forbiddenLines = forbidden.lines;
                context.drawBoardFn(false);

                broadcastToAll({
                    type: 'gameOver',
                    winner: 2,
                    winLines: [],
                    forbiddenLines: state.forbiddenLines,
                    reason: 'forbidden'
                }, context);

                (async () => {
                    await supabaseClient.from('rooms').update({
                        board_state: state.board,
                        current_player: 2,
                        move_history: state.moveHistory,
                        game_over: true,
                        winner: 2,
                        forbidden_lines: state.forbiddenLines,
                        end_reason: 'forbidden',
                        status: 'finished'
                    }).eq('room_code', state.roomId);
                })();

                context.endGameFn(2, 'forbidden');
                return true;
            }
        }

        // 正常落子
        state.board[row][col] = state.currentPlayer;
        state.moveHistory.push({ row, col, player: state.currentPlayer });

        let winLine = Rules.checkWinWithLine(row, col, state.currentPlayer, state.board, 15);
        let full = Rules.isBoardFull(state.board, 15);

        if (winLine) {
            state.winLines = [winLine];
            state.gameOver = true;
            state.winner = state.currentPlayer;
            context.drawBoardFn(false);

            broadcastToAll({
                type: 'gameOver',
                winner: state.currentPlayer,
                winLines: state.winLines,
                forbiddenLines: []
            }, context);

            (async () => {
                await supabaseClient.from('rooms').update({
                    board_state: state.board,
                    current_player: (state.currentPlayer === 1 ? 2 : 1),
                    move_history: state.moveHistory,
                    game_over: true,
                    winner: state.currentPlayer,
                    win_lines: state.winLines,
                    status: 'finished',
                    end_reason: 'win'
                }).eq('room_code', state.roomId);
            })();

            context.endGameFn(state.currentPlayer);
            return true;
        } else if (full) {
            state.gameOver = true;
            state.winner = 0;
            context.drawBoardFn(false);

            broadcastToAll({
                type: 'gameOver',
                winner: 0,
                winLines: [],
                forbiddenLines: []
            }, context);

            (async () => {
                await supabaseClient.from('rooms').update({
                    board_state: state.board,
                    current_player: (state.currentPlayer === 1 ? 2 : 1),
                    move_history: state.moveHistory,
                    game_over: true,
                    winner: 0,
                    status: 'finished',
                    end_reason: 'draw'
                }).eq('room_code', state.roomId);
            })();

            context.endGameFn(0);
            return true;
        } else {
            let placedPlayer = state.currentPlayer;
            state.currentPlayer = (state.currentPlayer === 1 ? 2 : 1);
            syncGlobalState(state);
            context.drawBoardFn();

            // P2P 广播落子
            broadcastToAll({
                type: 'move',
                row, col,
                player: placedPlayer,
                gameOver: false
            }, context);

            // 后台存盘
            (async () => {
                await supabaseClient.from('rooms').update({
                    board_state: state.board,
                    current_player: state.currentPlayer,
                    move_history: state.moveHistory
                }).eq('room_code', state.roomId);
            })();

            context.updateUIFns.updateTurnDisplay();
            context.updateUIFns.updateGameInfoPanel();
            return true;
        }
    }

    // ---------- 聊天 ----------
    async function sendChatMsg(context) {
        let inp = document.getElementById('chatMsgInput');
        let txt = inp.value.trim();
        if (!txt) return;
        context.addChatMsgFn(context.myNick, txt, 'me');
        broadcastToAll({ type: 'chatMsg', sender: context.myNick, text: txt }, context);
        if (supabaseClient && context.state.roomId) {
            supabaseClient.from('messages').insert({
                room_code: context.state.roomId,
                sender_name: context.myNick,
                text: txt
            }).catch(e => {});
        }
        inp.value = '';
    }

    // ---------- 投降 ----------
    async function sendSurrender(context) {
        let state = window.GAME;
        if (!state || !state.gameStarted || state.gameOver) return;
        if (state.mySeat !== 'black' && state.mySeat !== 'white') return;
        if (!confirm('确定投降吗？')) return;

        let myColor = state.mySeat === 'black' ? 1 : 2;
        let winnerColor = myColor === 1 ? 2 : 1;

        broadcastToAll({
            type: 'gameOver',
            winner: winnerColor,
            winLines: [],
            forbiddenLines: [],
            reason: 'surrender'
        }, context);

        state.gameOver = true;
        state.winner = winnerColor;
        syncGlobalState(state);
        context.updateUIFns.updateTurnDisplay();
        context.updateUIFns.updateGameInfoPanel();
        if (context.showWinnerMsgFn) context.showWinnerMsgFn();
        context.showToastFn('你已投降');

        (async () => {
            await supabaseClient.from('rooms').update({
                game_over: true,
                winner: winnerColor,
                status: 'finished',
                end_reason: 'surrender'
            }).eq('room_code', state.roomId);
        })();
    }

    // ---------- 平局 ----------
    async function sendDrawRequest(context) {
        let state = window.GAME;
        if (!state || !state.gameStarted || state.gameOver) return;
        if (state.mySeat !== 'black' && state.mySeat !== 'white') return;

        if (confirm('确定提出平局？')) {
            broadcastToAll({
                type: 'gameOver',
                winner: 0,
                winLines: [],
                forbiddenLines: [],
                reason: 'draw'
            }, context);

            state.gameOver = true;
            state.winner = 0;
            syncGlobalState(state);
            context.updateUIFns.updateTurnDisplay();
            context.updateUIFns.updateGameInfoPanel();
            if (context.showWinnerMsgFn) context.showWinnerMsgFn();
            context.showToastFn('双方平局');

            (async () => {
                await supabaseClient.from('rooms').update({
                    game_over: true,
                    winner: 0,
                    status: 'finished',
                    end_reason: 'draw'
                }).eq('room_code', state.roomId);
            })();
        }
    }

    // ---------- 离开房间 ----------
    async function leaveRoom(context) {
        let state = window.GAME;
        if (!state || !state.roomId) return;
        if (!confirm('确定退出当前房间？')) return;

        let iAmHost = state.isHost;

        if (iAmHost) {
            await supabaseClient.from('room_players').delete().eq('room_code', state.roomId);
            await supabaseClient.from('rooms').delete().eq('room_code', state.roomId);
            await supabaseClient.from('messages').delete().eq('room_code', state.roomId);
        } else {
            await supabaseClient.from('room_players').delete()
                .eq('room_code', state.roomId)
                .eq('user_id', state.myUserId);
        }

        state.roomId = null;
        localStorage.removeItem('gobang_current_room');
        if (realtimeChannel) {
            supabaseClient.removeChannel(realtimeChannel);
            realtimeChannel = null;
        }
        if (peer) { try { peer.destroy(); } catch(e) {} peer = null; }
        p2pConnections.clear();
        p2pActive = false;

        document.getElementById('lobbyScreen').classList.add('hidden');
        document.getElementById('entryScreen').classList.remove('hidden');
        context.updateUIFns?.updateLobbyUI();
        context.showToastFn('已退出房间');
    }

    // ---------- 返回大厅 ----------
    async function exitToLobby(context) {
        let state = window.GAME;
        document.getElementById('gameEndOverlay').classList.remove('show');
        if (state) {
            state.gameStarted = false;
            state.gameOver = false;
            state.winner = null;
            context.initBoardDataFn();

            // P2P 广播返回大厅
            broadcastToAll({
                type: 'returnToLobby'
            }, context);

            await supabaseClient.from('rooms').update({
                status: 'waiting',
                game_started: false,
                game_over: false,
                winner: null
            }).eq('room_code', state.roomId);
        }

        document.getElementById('gameScreen').classList.add('hidden');
        document.getElementById('lobbyScreen').classList.remove('hidden');
        context.updateUIFns.updateLobbyUI();
        context.updateUIFns.updateTurnDisplay();
        context.showToastFn('已返回房间');
    }

    // ---------- 重连恢复 ----------
    async function tryReconnect(context) {
        const user = await getCurrentUser();
        if (user) {
            context.userId = user.id;
            context.currentUser = user;
        }
        let savedRoom = localStorage.getItem('gobang_current_room');
        if (!savedRoom) return null;

        const { data: room } = await supabaseClient
            .from('rooms')
            .select('*')
            .eq('room_code', savedRoom)
            .single();

        if (room && room.status !== 'closed') {
            let state = await joinRoom(context, savedRoom);
            if (state) {
                context.showToastFn?.('✅ 已恢复连接');
                return state;
            }
        }
        localStorage.removeItem('gobang_current_room');
        return null;
    }

    // ---------- 对外 API ----------
    global.SupabaseNetwork = {
        createSupabaseClient,
        getCurrentUser,
        genRoomCode,
        createRoom,
        joinRoom,
        requestSeat,
        requestStartGame,
        tryPlace,
        sendChatMsg,
        sendSurrender,
        sendDrawRequest,
        leaveRoom,
        exitToLobby,
        tryReconnect,
        setupSubscription: setupSupabaseSubscription,
        getPeer,
        broadcastToAll,
        _getState: () => window.GAME,
        _isP2PActive: () => p2pActive,
        _isDegraded: () => isDegraded
    };

})(window);