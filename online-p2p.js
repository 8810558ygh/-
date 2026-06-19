// online-p2p.js —— PeerJS 网络层（安全高音质语音 + 完整日志）

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

    // ========== 安全 SDP 修改：提高 Opus 比特率 ==========
    function applyHighQualityAudio(sdp) {
        console.log('📝 原始 SDP (音频部分):', sdp.match(/a=fmtp:\d+ opus/g));
        let modified = sdp.replace(/a=fmtp:(\d+) opus(.*?)(\r\n|$)/g, function(match, payloadType, existingParams, ending) {
            let params = existingParams.trim();
            if (!params.includes('stereo=')) {
                params += '; stereo=1';
            }
            if (!params.includes('maxaveragebitrate=')) {
                params += '; maxaveragebitrate=510000';
            }
            return 'a=fmtp:' + payloadType + ' opus ' + params + ending;
        });
        if (modified === sdp) {
            modified = sdp.replace(/a=fmtp:\d+ opus/g, function(match) {
                return match + ' stereo=1; maxaveragebitrate=510000';
            });
        }
        console.log('📝 修改后 SDP (音频部分):', modified.match(/a=fmtp:\d+ opus/g));
        return modified;
    }

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
                    console.log('⚠️ 连接超时:', id);
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
            if (window._localStream && window._isMicOn) {
                startCallToPeer(window.GAME.roomId);
            }
        });
        conn.on('data', (d) => context.onReceiveMessageFn(window.GAME.roomId, d));
        conn.on('close', () => {
            console.log('与房主断开');
            window.GAME.connections.delete(window.GAME.roomId);
            removeRemoteAudio(window.GAME.roomId);
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

        window.UI.updateLobbyUI(window.GAME.lobbySeats, window.GAME.isHost, window.GAME.roomGameMode);
        window.UI.renderSpectators();

        peer = new Peer(window.GAME.roomId, {
            host: '0.peerjs.com',
            port: 443,
            secure: true,
            config: { iceServers: ICE_SERVERS }
        });

        window.peer = peer;

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

                if (window._localStream && window._isMicOn) {
                    startCallToPeer(conn.peer);
                }
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
                removeRemoteAudio(conn.peer);
            });
        });

        // ---- 音频呼叫监听（安全应答，检查流有效性） ----
        peer.on('call', (call) => {
            console.log('📞 收到来电:', call.peer, '本地流存在?', !!window._localStream);
            try {
                // 检查本地流是否有效
                if (window._localStream && typeof window._localStream.getTracks === 'function') {
                    call.answer(window._localStream);
                } else {
                    call.answer();
                }
                call.on('stream', (remoteStream) => {
                    console.log('📥 收到远端音频流:', call.peer);
                    addRemoteAudio(call.peer, remoteStream);
                });
                call.on('close', () => {
                    removeRemoteAudio(call.peer);
                });
            } catch (err) {
                console.error('❌ 应答呼叫失败:', err);
                // 如果带流应答失败，尝试无流应答
                try { call.answer(); } catch(e) { console.error('❌ 无流应答也失败:', e); }
            }
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

        window.peer = peer;

        peer.on('open', () => {
            window.UI.updateConnUI(true);
            let conn = peer.connect(window.GAME.roomId, {
                metadata: { name: context.myNick },
                reliable: true,
                serialization: 'json'
            });
            setupJoinerConnection(context, conn);
        });

        // ---- 音频呼叫监听（安全应答） ----
        peer.on('call', (call) => {
            console.log('📞 收到来电:', call.peer, '本地流存在?', !!window._localStream);
            try {
                if (window._localStream && typeof window._localStream.getTracks === 'function') {
                    call.answer(window._localStream);
                } else {
                    call.answer();
                }
                call.on('stream', (remoteStream) => {
                    console.log('📥 收到远端音频流:', call.peer);
                    addRemoteAudio(call.peer, remoteStream);
                });
                call.on('close', () => {
                    removeRemoteAudio(call.peer);
                });
            } catch (err) {
                console.error('❌ 应答呼叫失败:', err);
                try { call.answer(); } catch(e) { console.error('❌ 无流应答也失败:', e); }
            }
        });

        peer.on('error', () => {
            if (context) context.showToastFn('房间不存在或网络错误');
        });
    }

    // ===== 语音辅助函数 =====
    window.startCallToPeer = function(peerId) {
        if (!window.peer) {
            console.warn('⚠️ 无 Peer 实例');
            return;
        }
        if (!window._localStream) {
            console.warn('⚠️ 无本地流，无法发起呼叫');
            return;
        }
        if (!window._isMicOn) {
            console.warn('⚠️ 麦克风未开启');
            return;
        }
        if (window._audioCalls && window._audioCalls.has(peerId)) {
            console.warn('⚠️ 已存在对该 Peer 的呼叫:', peerId);
            return;
        }
        // 检查流有效性
        if (typeof window._localStream.getTracks !== 'function') {
            console.error('❌ 本地流无效，无法发起呼叫');
            return;
        }
        try {
            console.log('📞 发起音频呼叫到:', peerId, '流状态:', window._localStream.active ? '活跃' : '非活跃');
            const call = window.peer.call(peerId, window._localStream);
            call.on('stream', (remoteStream) => {
                console.log('📥 远端流来自:', peerId);
                addRemoteAudio(peerId, remoteStream);
            });
            call.on('close', () => {
                console.log('📞 呼叫关闭:', peerId);
                removeRemoteAudio(peerId);
            });
            if (!window._audioCalls) window._audioCalls = new Map();
            window._audioCalls.set(peerId, call);
            console.log('✅ 音频呼叫已发起:', peerId);
        } catch (e) {
            console.error('❌ 发起音频呼叫失败:', e);
        }
    };

    window.addRemoteAudio = function(peerId, stream) {
        console.log('🔊 addRemoteAudio 被调用, peerId:', peerId);
        if (!window._remoteAudioElements) window._remoteAudioElements = new Map();
        if (window._remoteAudioElements.has(peerId)) {
            const old = window._remoteAudioElements.get(peerId);
            old.pause();
            old.srcObject = null;
            old.remove();
            console.log('🔇 移除旧音频元素:', peerId);
        }
        const audio = document.createElement('audio');
        audio.srcObject = stream;
        audio.autoplay = true;
        audio.muted = !window._isSpeakerOn;
        audio.style.display = 'none';
        document.body.appendChild(audio);
        console.log('🔊 音频元素已创建, 听筒状态:', window._isSpeakerOn ? '开' : '关');
        if (window._isSpeakerOn) {
            audio.play().then(() => {
                console.log('✅ 自动播放成功:', peerId);
            }).catch(e => {
                console.warn('❌ 自动播放失败:', peerId, e);
                // 尝试在用户手势后播放（由 toggleSpeaker 负责）
            });
        }
        window._remoteAudioElements.set(peerId, audio);
        console.log('🔊 添加远端音频元素完成, 总数:', window._remoteAudioElements.size);
    };

    window.removeRemoteAudio = function(peerId) {
        if (window._remoteAudioElements && window._remoteAudioElements.has(peerId)) {
            const audio = window._remoteAudioElements.get(peerId);
            audio.pause();
            audio.srcObject = null;
            audio.remove();
            window._remoteAudioElements.delete(peerId);
            console.log('🔇 移除远端音频:', peerId);
        }
        if (window._audioCalls && window._audioCalls.has(peerId)) {
            const call = window._audioCalls.get(peerId);
            try { call.close(); } catch(e) {}
            window._audioCalls.delete(peerId);
        }
    };

    window.stopAllAudio = function() {
        console.log('🔇 停止所有音频');
        if (window._remoteAudioElements) {
            for (let [peerId, audio] of window._remoteAudioElements) {
                audio.pause();
                audio.srcObject = null;
                audio.remove();
            }
            window._remoteAudioElements.clear();
        }
        if (window._audioCalls) {
            for (let [peerId, call] of window._audioCalls) {
                try { call.close(); } catch(e) {}
            }
            window._audioCalls.clear();
        }
        if (window._localStream) {
            window._localStream.getTracks().forEach(t => t.stop());
            window._localStream = null;
        }
        window._isMicOn = false;
        window._isSpeakerOn = false;
        const micBtn = document.getElementById('micToggle');
        const speakerBtn = document.getElementById('speakerToggle');
        if (micBtn) {
            micBtn.classList.remove('active-mic');
            micBtn.classList.add('inactive-mic');
            document.getElementById('micStatus').innerText = '关';
        }
        if (speakerBtn) {
            speakerBtn.classList.remove('active-speaker');
            speakerBtn.classList.add('inactive-speaker');
            document.getElementById('speakerStatus').innerText = '关';
        }
        console.log('✅ 所有音频已停止');
    };

    window.P2PNetwork = {
        createRoom: createRoom,
        joinRoom: joinRoom
    };
})();