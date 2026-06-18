// online-p2p.js —— PeerJS 网络层（最终稳定版）

(function() {
    const ICE_SERVERS = [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
        { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
        { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' }
    ];

    let peer = null;
    let heartbeatTimer = null;
    let healthCheckTimer = null;
    let assignedPeers = new Set();

    function startHeartbeat(context) {
        if (heartbeatTimer) clearInterval(heartbeatTimer);
        if (healthCheckTimer) clearInterval(healthCheckTimer);
        heartbeatTimer = setInterval(() => {
            context.broadcastToAll({ type: 'ping', from: window.GAME.myPeerId, time: Date.now() });
        }, 10000);
        healthCheckTimer = setInterval(() => {
            let now = Date.now();
            window.GAME.connections.forEach((val, id) => {
                if (now - val.lastSeen > 35000) {
                    console.log('连接超时:', id);
                    attemptReconnect(context, id);
                }
            });
        }, 10000);
    }

    function attemptReconnect(context, targetId) {
        if (!peer || peer.destroyed) return;
        if (window.GAME.isHost) return;
        if (targetId === window.GAME.roomId) {
            let existing = window.GAME.connections.get(window.GAME.roomId);
            if (existing && existing.conn && existing.conn.open) return;
            context.showToastFn('连接断开，正在重连...');
            try {
                let conn = peer.connect(window.GAME.roomId, {
                    metadata: { name: context.myNick },
                    reliable: true,
                    serialization: 'json'
                });
                setupJoinerConnection(context, conn);
            } catch (e) { console.error('重连失败:', e); }
        }
    }

    function setupJoinerConnection(context, conn) {
        conn.on('open', () => {
            window.GAME.connections.set(window.GAME.roomId, { conn: conn, lastSeen: Date.now() });
            conn.send({ type: 'joinRequest', myId: window.GAME.myPeerId, name: context.myNick });
            startHeartbeat(context);
        });
        conn.on('data', (d) => context.onReceiveMessageFn(window.GAME.roomId, d));
        conn.on('close', () => {
            console.log('与房主断开');
            window.GAME.connections.delete(window.GAME.roomId);
            setTimeout(() => attemptReconnect(context, window.GAME.roomId), 3000);
        });
        conn.on('error', (err) => { console.error('连接错误:', err); });
    }

    function createRoom(context) {
        if (peer) peer.destroy();

        let roomId = window.UI.genRoomCode();
        window.GAME.isHost = true;
        window.GAME.myPeerId = roomId;
        window.GAME.roomId = roomId;
        window._myId = roomId;

        document.getElementById('roomCodeDisplay').innerText = roomId;
        document.getElementById('gameRoomCode').innerText = roomId;

        window.GAME.allMembers.clear();
        window.GAME.lobbySeats = { black: null, white: null, spectators: Array(6).fill(null) };
        window.GAME.mySeat = null;
        window.GAME.gameStarted = false;
        context.initBoardDataFn();

        assignedPeers.clear();
        window.GAME.allMembers.set(window.GAME.myPeerId, { name: context.myNick, seat: null, online: true });
        window.GAME.lobbySeats.black = window.GAME.myPeerId;
        window.GAME.mySeat = 'black';

        // 立即刷新UI
        window.UI.updateLobbyUI(window.GAME.lobbySeats, window.GAME.isHost, window.GAME.roomGameMode);
        window.UI.renderSpectators();

        peer = new Peer(window.GAME.roomId, {
            host: '0.peerjs.com',
            port: 443,
            secure: true,
            config: { iceServers: ICE_SERVERS }
        });

        peer.on('open', () => {
            window.UI.updateConnUI(true);
            startHeartbeat(context);
            window.UI.updateLobbyUI(window.GAME.lobbySeats, window.GAME.isHost, window.GAME.roomGameMode);
        });

        peer.on('connection', (conn) => {
            let clientName = conn.metadata?.name || '棋客';
            window.GAME.allMembers.set(conn.peer, { name: clientName, seat: null, online: true });
            window.GAME.connections.set(conn.peer, { conn: conn, lastSeen: Date.now() });

            conn.on('data', (d) => context.onReceiveMessageFn(conn.peer, d));

            conn.on('open', () => {
                if (assignedPeers.has(conn.peer)) {
                    let oldConn = window.GAME.connections.get(conn.peer);
                    if (oldConn && oldConn.conn !== conn) {
                        assignedPeers.delete(conn.peer);
                        window.Core.clearAllSeatsOf(conn.peer, window.GAME.lobbySeats);
                        window.GAME.connections.delete(conn.peer);
                    } else { return; }
                }
                assignedPeers.add(conn.peer);

                let seat = window.Core.autoAssignSeat(conn.peer, window.GAME.lobbySeats);
                if (seat) {
                    let newSeat = window.Core.handleSeatChange(
                        conn.peer,
                        seat,
                        window.GAME.lobbySeats,
                        window.GAME.allMembers,
                        window.GAME.myPeerId,
                        context.broadcastToAll
                    );
                    if (newSeat !== null) window.GAME.mySeat = newSeat;
                }

                let memberList = Array.from(window.GAME.allMembers.entries()).map(([id, val]) => ({ id: id, name: val.name, seat: val.seat }));
                conn.send({
                    type: 'fullSync',
                    seats: window.GAME.lobbySeats,
                    gameStarted: window.GAME.gameStarted,
                    board: window.GAME.board,
                    currentPlayer: window.GAME.currentPlayer,
                    gameOver: window.GAME.gameOver,
                    winner: window.GAME.winner,
                    moveHistory: window.GAME.moveHistory,
                    members: memberList,
                    mySeat: window.GAME.allMembers.get(conn.peer)?.seat,
                    gameMode: window.GAME.roomGameMode
                });

                context.broadcastToAll({ type: 'memberUpdate', peerId: conn.peer, name: clientName, seat: window.GAME.allMembers.get(conn.peer)?.seat });
                window.UI.updateLobbyUI(window.GAME.lobbySeats, window.GAME.isHost, window.GAME.roomGameMode);
            });

            conn.on('close', () => {
                let mem = window.GAME.allMembers.get(conn.peer);
                window.GAME.allMembers.delete(conn.peer);
                window.GAME.connections.delete(conn.peer);
                assignedPeers.delete(conn.peer);
                window.Core.clearAllSeatsOf(conn.peer, window.GAME.lobbySeats);
                context.broadcastToAll({ type: 'memberUpdate', peerId: conn.peer, name: mem?.name || '棋客', seat: null });
                window.UI.updateLobbyUI(window.GAME.lobbySeats, window.GAME.isHost, window.GAME.roomGameMode);
                if (window.GAME.gameStarted) {
                    window.UI.updateGameInfoPanel(window.GAME.lobbySeats, window.GAME.allMembers, window.GAME.mySeat, window.GAME.gameStarted, window.GAME.gameOver, window.GAME.isProMode);
                }
            });
        });

        peer.on('error', () => {});

        document.getElementById('entryScreen').classList.add('hidden');
        document.getElementById('lobbyScreen').classList.remove('hidden');
        window.UI.lockNicknameDisplay(context.myNick);
    }

    function joinRoom(context, code) {
        if (peer) peer.destroy();

        window.GAME.roomId = code.toUpperCase();
        window.GAME.isHost = false;
        window.GAME.myPeerId = 'player_' + Date.now() + '_' + Math.floor(Math.random() * 10000);
        window._myId = window.GAME.myPeerId;

        document.getElementById('roomCodeDisplay').innerText = window.GAME.roomId;
        document.getElementById('gameRoomCode').innerText = window.GAME.roomId;

        window.GAME.allMembers.clear();
        window.GAME.mySeat = null;
        context.initBoardDataFn();
        window.GAME.gameStarted = false;

        document.getElementById('entryScreen').classList.add('hidden');
        document.getElementById('lobbyScreen').classList.remove('hidden');
        window.UI.renderSpectators();
        window.UI.updateLobbyUI(window.GAME.lobbySeats, window.GAME.isHost, window.GAME.roomGameMode);
        window.UI.lockNicknameDisplay(context.myNick);

        peer = new Peer(window.GAME.myPeerId, {
            host: '0.peerjs.com',
            port: 443,
            secure: true,
            config: { iceServers: ICE_SERVERS }
        });

        peer.on('open', () => {
            window.UI.updateConnUI(true);
            let conn = peer.connect(window.GAME.roomId, {
                metadata: { name: context.myNick },
                reliable: true,
                serialization: 'json'
            });
            setupJoinerConnection(context, conn);
        });

        peer.on('error', () => {
            if (context) context.showToastFn('房间不存在或网络错误');
        });
    }

    window.P2PNetwork = {
        createRoom: createRoom,
        joinRoom: joinRoom
    };
})();