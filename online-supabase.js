// online-supabase.js —— Supabase 网络层（完整版）

(function() {
    const SUPABASE_URL = 'https://txgemtxikpieaqcohglr.supabase.co';
    const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR4Z2VtdHhpa3BpZWFxY29oZ2xyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk4MDY1NTIsImV4cCI6MjA5NTM4MjU1Mn0.I0PHUfWmiDpBnfjmTBJ1u6ybzZzhsTG0uaLbKBrcN1c';

    let supabaseClient = null;
    let realtimeChannel = null;
    let heartbeatTimer = null;
    let currentUser = null;

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

    function genRoomCode() {
        return Math.random().toString(36).substring(2, 8).toUpperCase();
    }

    function setupSubscription(context) {
        if (realtimeChannel) {
            supabaseClient.removeChannel(realtimeChannel);
        }

        realtimeChannel = supabaseClient
            .channel('room:' + context.state.roomId)
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'rooms',
                filter: 'room_code=eq.' + context.state.roomId
            }, (payload) => {
                handleRoomUpdate(context, payload.new, payload.old);
            })
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'room_players',
                filter: 'room_code=eq.' + context.state.roomId
            }, (payload) => {
                handlePlayersUpdate(context);
            })
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'messages',
                filter: 'room_code=eq.' + context.state.roomId
            }, (payload) => {
                const msg = payload.new;
                if (msg.sender_name !== context.myNick) {
                    context.addChatMsgFn(msg.sender_name, msg.text, 'other');
                }
            })
            .subscribe((status) => {
                window.UI.updateConnUI(status === 'SUBSCRIBED');
            });
    }

    async function handleRoomUpdate(context, newRow, oldRow) {
        if (!newRow) return;
        context.state.roomGameMode = newRow.mode || 'casual';
        context.state.isProMode = context.state.roomGameMode === 'pro';

        if (newRow.game_started && !context.state.gameStarted) {
            context.state.gameStarted = true;
            context.initBoardDataFn();
            if (newRow.board_state) context.state.board = newRow.board_state;
            context.state.currentPlayer = newRow.current_player || 1;
            context.state.moveHistory = newRow.move_history || [];
            context.state.winLines = newRow.win_lines || [];
            context.state.forbiddenLines = newRow.forbidden_lines || [];

            document.getElementById('lobbyScreen').classList.add('hidden');
            document.getElementById('gameScreen').classList.remove('hidden');
            context.drawBoardFn();
            context.updateUIFns.updateGameInfoPanel();
            context.updateUIFns.updateTurnDisplay();
            context.updateUIFns.updateGameButtons();
            context.showToastFn('对局开始！');
            return;
        }

        if (context.state.gameStarted) {
            if (newRow.board_state) {
                context.state.board = newRow.board_state;
                context.state.currentPlayer = newRow.current_player;
                context.state.moveHistory = newRow.move_history || [];
                context.state.winLines = newRow.win_lines || [];
                context.state.forbiddenLines = newRow.forbidden_lines || [];
                context.drawBoardFn();
                context.updateUIFns.updateTurnDisplay();
                context.updateUIFns.updateGameInfoPanel();
            }

            if (newRow.game_over && !context.state.gameOver) {
                context.state.gameOver = true;
                context.state.winner = newRow.winner;
                context.endGameFn(context.state.winner, newRow.end_reason);
            }

            if (newRow.status === 'waiting' && oldRow && (oldRow.status === 'playing' || oldRow.status === 'finished')) {
                context.state.gameStarted = false;
                context.state.gameOver = false;
                context.state.winner = null;
                context.initBoardDataFn();
                document.getElementById('gameScreen').classList.add('hidden');
                document.getElementById('lobbyScreen').classList.remove('hidden');
                context.updateUIFns.updateLobbyUI();
                context.updateUIFns.updateTurnDisplay();
                context.showToastFn('已返回房间，准备下一局');
            }

            if (newRow.draw_request_by && newRow.draw_request_by !== context.state.myUserId) {
                if (!context.state.drawRequestHandled) {
                    context.state.drawRequestHandled = true;
                    setTimeout(async () => {
                        if (confirm('对方请求平局，是否同意？')) {
                            await supabaseClient.from('rooms').update({
                                game_over: true,
                                winner: 0,
                                draw_request_by: null,
                                status: 'finished',
                                end_reason: 'draw'
                            }).eq('room_code', context.state.roomId);
                        } else {
                            await supabaseClient.from('rooms').update({
                                draw_request_by: null
                            }).eq('room_code', context.state.roomId);
                            context.state.drawRequestHandled = false;
                        }
                    }, 100);
                }
            } else if (!newRow.draw_request_by) {
                context.state.drawRequestHandled = false;
            }
        }
    }

    async function handlePlayersUpdate(context) {
        const { data: players } = await supabaseClient
            .from('room_players')
            .select('*')
            .eq('room_code', context.state.roomId);

        context.state.allMembers.clear();
        context.state.lobbySeats = { black: null, white: null, spectators: Array(6).fill(null) };

        if (players) {
            for (let p of players) {
                let isOnline = p.is_online && new Date() - new Date(p.last_seen) < 120000;
                context.state.allMembers.set(p.user_id, { name: p.nickname, seat: p.seat, online: isOnline });
                if (p.seat === 'black') context.state.lobbySeats.black = p.user_id;
                else if (p.seat === 'white') context.state.lobbySeats.white = p.user_id;
                else if (p.seat && p.seat.startsWith('spec-')) {
                    let idx = parseInt(p.seat.split('-')[1]);
                    if (idx >= 0 && idx < 6) context.state.lobbySeats.spectators[idx] = p.user_id;
                }
                if (p.user_id === context.state.myUserId) context.state.mySeat = p.seat;
            }
        }

        context.updateUIFns.updateLobbyUI();
        if (context.state.gameStarted) context.updateUIFns.updateGameInfoPanel();
    }

    async function createRoom(context) {
        if (!supabaseClient) {
            supabaseClient = createSupabaseClient();
            if (!supabaseClient) { context.showToastFn('Supabase 加载失败'); return; }
        }

        const roomCode = genRoomCode();
        context.state.roomId = roomCode;
        context.state.isHost = true;
        context.state.myUserId = context.myUserId;
        context.state.mySeat = null;
        context.state.gameStarted = false;
        context.initBoardDataFn();

        document.getElementById('roomCodeDisplay').innerText = roomCode;
        document.getElementById('gameRoomCode').innerText = roomCode;

        try {
            const { error: roomErr } = await supabaseClient.from('rooms').insert({
                room_code: roomCode,
                host_id: context.myUserId,
                mode: context.state.roomGameMode,
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
                end_reason: null
            });
            if (roomErr) throw roomErr;

            const { error: playerErr } = await supabaseClient.from('room_players').insert({
                room_code: roomCode,
                user_id: context.myUserId,
                nickname: context.myNick,
                seat: 'black',
                is_online: true,
                last_seen: new Date().toISOString()
            });
            if (playerErr) throw playerErr;

            context.state.mySeat = 'black';
            localStorage.setItem('gobang_current_room', roomCode);

            setupSubscription(context);

            document.getElementById('entryScreen').classList.add('hidden');
            document.getElementById('lobbyScreen').classList.remove('hidden');
            window.UI.renderSpectators();
            context.updateUIFns.updateLobbyUI();
            window.UI.lockNicknameDisplay(context.myNick);
            context.showToastFn('房间已创建：' + roomCode);
            startHeartbeat(context);
        } catch (e) {
            context.showToastFn('创建房间失败：' + e.message);
            console.error(e);
            context.state.roomId = null;
        }
    }

    async function joinRoom(context, code) {
        if (!supabaseClient) {
            supabaseClient = createSupabaseClient();
            if (!supabaseClient) { context.showToastFn('Supabase 加载失败'); return; }
        }

        const roomCode = code.toUpperCase();
        context.state.roomId = roomCode;
        context.state.isHost = false;
        context.state.myUserId = context.myUserId;
        context.state.mySeat = null;
        context.state.gameStarted = false;
        context.initBoardDataFn();

        document.getElementById('roomCodeDisplay').innerText = roomCode;
        document.getElementById('gameRoomCode').innerText = roomCode;

        try {
            const { data: room, error: roomErr } = await supabaseClient
                .from('rooms')
                .select('*')
                .eq('room_code', roomCode)
                .single();

            if (roomErr || !room) {
                context.showToastFn('房间不存在');
                context.state.roomId = null;
                return;
            }
            if (room.status === 'closed') {
                context.showToastFn('房间已关闭');
                context.state.roomId = null;
                return;
            }

            context.state.roomGameMode = room.mode || 'casual';
            context.state.isProMode = context.state.roomGameMode === 'pro';

            const { error: playerErr } = await supabaseClient.from('room_players').upsert({
                room_code: roomCode,
                user_id: context.myUserId,
                nickname: context.myNick,
                seat: null,
                is_online: true,
                last_seen: new Date().toISOString()
            }, { onConflict: 'room_code,user_id' });
            if (playerErr && playerErr.code !== '23505') throw playerErr;

            await autoAssignSeat(context);

            localStorage.setItem('gobang_current_room', roomCode);

            setupSubscription(context);

            document.getElementById('entryScreen').classList.add('hidden');
            document.getElementById('lobbyScreen').classList.remove('hidden');
            window.UI.renderSpectators();
            context.updateUIFns.updateLobbyUI();
            window.UI.lockNicknameDisplay(context.myNick);
            context.showToastFn('已加入房间：' + roomCode);
            startHeartbeat(context);
        } catch (e) {
            context.showToastFn('加入房间失败：' + e.message);
            console.error(e);
            context.state.roomId = null;
        }
    }

    async function autoAssignSeat(context) {
        const { data: players } = await supabaseClient
            .from('room_players')
            .select('seat')
            .eq('room_code', context.state.roomId);

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
                .eq('room_code', context.state.roomId)
                .eq('user_id', context.myUserId);
            context.state.mySeat = targetSeat;
        }
    }

    async function requestSeat(context, targetSeat) {
        if (!context.state.roomId) {
            context.showToastFn('请先创建或加入房间');
            return;
        }
        if (context.state.mySeat === targetSeat) return;

        const { data: occupant } = await supabaseClient
            .from('room_players')
            .select('user_id')
            .eq('room_code', context.state.roomId)
            .eq('seat', targetSeat)
            .maybeSingle();

        if (occupant && occupant.user_id && occupant.user_id !== context.state.myUserId) {
            context.showToastFn('该位置已有人');
            return;
        }

        await supabaseClient.from('room_players')
            .update({ seat: null })
            .eq('room_code', context.state.roomId)
            .eq('user_id', context.state.myUserId);

        await supabaseClient.from('room_players')
            .update({ seat: targetSeat })
            .eq('room_code', context.state.roomId)
            .eq('user_id', context.state.myUserId);

        context.state.mySeat = targetSeat;
    }

    async function requestStartGame(context) {
        if (!context.state.isHost) {
            context.showToastFn('只有房主可以开始游戏');
            return;
        }
        if (!context.state.lobbySeats.black || !context.state.lobbySeats.white) {
            context.showToastFn('双方入座后才可开始');
            return;
        }

        context.initBoardDataFn();

        await supabaseClient.from('rooms').update({
            game_started: true,
            status: 'playing',
            board_state: context.state.board,
            current_player: 1,
            move_history: [],
            game_over: false,
            winner: null,
            win_lines: [],
            forbidden_lines: [],
            draw_request_by: null,
            end_reason: null
        }).eq('room_code', context.state.roomId);

        context.state.gameStarted = true;
        document.getElementById('lobbyScreen').classList.add('hidden');
        document.getElementById('gameScreen').classList.remove('hidden');
        context.drawBoardFn();
        context.updateUIFns.updateGameInfoPanel();
        context.updateUIFns.updateTurnDisplay();
        context.updateUIFns.updateGameButtons();
        context.showToastFn('对局开始！');
    }

    // ========== 核心：落子逻辑 ==========
    async function tryPlace(context, row, col) {
        const state = context.state;
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

        // 禁手检测（专业模式 + 黑棋）
        if (state.isProMode && state.currentPlayer === 1) {
            state.board[row][col] = 1;
            let forbidden = Rules.checkForbidden(row, col, state.board, 15);
            state.board[row][col] = 0;
            if (forbidden.sanSan || forbidden.siSi || forbidden.overline) {
                state.board[row][col] = 1;
                state.moveHistory.push({ row, col, player: 1 });
                state.forbiddenLines = forbidden.lines;
                context.drawBoardFn(false);

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

                context.endGameFn(2, 'forbidden');
                return true;
            }
        }

        // 正常落子
        state.board[row][col] = state.currentPlayer;
        state.moveHistory.push({ row, col, player: state.currentPlayer });

        // 检测胜负
        let winLine = Rules.checkWinWithLine(row, col, state.currentPlayer, state.board, 15);
        let full = Rules.isBoardFull(state.board, 15);

        if (winLine) {
            state.winLines = [winLine];
            state.gameOver = true;
            state.winner = state.currentPlayer;
            context.drawBoardFn(false);

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

            context.endGameFn(state.currentPlayer);
            return true;
        } else if (full) {
            state.gameOver = true;
            state.winner = 0;
            context.drawBoardFn(false);

            await supabaseClient.from('rooms').update({
                board_state: state.board,
                current_player: (state.currentPlayer === 1 ? 2 : 1),
                move_history: state.moveHistory,
                game_over: true,
                winner: 0,
                status: 'finished',
                end_reason: 'draw'
            }).eq('room_code', state.roomId);

            context.endGameFn(0);
            return true;
        } else {
            let placedPlayer = state.currentPlayer;
            state.currentPlayer = (state.currentPlayer === 1 ? 2 : 1);
            context.drawBoardFn();

            await supabaseClient.from('rooms').update({
                board_state: state.board,
                current_player: state.currentPlayer,
                move_history: state.moveHistory
            }).eq('room_code', state.roomId);

            context.updateUIFns.updateTurnDisplay();
            context.updateUIFns.updateGameInfoPanel();
            return true;
        }
    }

    async function sendChatMsg(context) {
        let inp = document.getElementById('chatMsgInput');
        let txt = inp.value.trim();
        if (!txt) return;
        context.addChatMsgFn(context.myNick, txt, 'me');
        await supabaseClient.from('messages').insert({
            room_code: context.state.roomId,
            sender_name: context.myNick,
            text: txt
        });
        inp.value = '';
    }

    async function sendSurrender(context) {
        if (!context.state.gameStarted || context.state.gameOver) return;
        if (context.state.mySeat !== 'black' && context.state.mySeat !== 'white') return;
        if (!confirm('你是否确定要投降？')) return;

        let myColor = context.state.mySeat === 'black' ? 1 : 2;
        let winnerColor = myColor === 1 ? 2 : 1;

        await supabaseClient.from('rooms').update({
            game_over: true,
            winner: winnerColor,
            status: 'finished',
            end_reason: 'surrender'
        }).eq('room_code', context.state.roomId);

        context.state.gameOver = true;
        context.state.winner = winnerColor;
        context.updateUIFns.updateTurnDisplay();
        context.updateUIFns.updateGameInfoPanel();
        if (context.showWinnerMsgFn) context.showWinnerMsgFn();
        context.showToastFn('你已投降');
    }

    async function sendDrawRequest(context) {
        if (!context.state.gameStarted || context.state.gameOver) return;
        if (context.state.mySeat !== 'black' && context.state.mySeat !== 'white') return;

        await supabaseClient.from('rooms').update({
            draw_request_by: context.state.myUserId
        }).eq('room_code', context.state.roomId);

        context.showToastFn('已发送平局申请');
    }

    async function leaveRoom(context) {
        if (!context.state.roomId) return;
        if (!confirm('确定退出当前房间？')) return;

        let iAmHost = context.state.isHost;

        if (iAmHost) {
            await supabaseClient.from('room_players').delete().eq('room_code', context.state.roomId);
            await supabaseClient.from('rooms').delete().eq('room_code', context.state.roomId);
            await supabaseClient.from('messages').delete().eq('room_code', context.state.roomId);
        } else {
            await supabaseClient.from('room_players').delete()
                .eq('room_code', context.state.roomId)
                .eq('user_id', context.state.myUserId);
        }

        context.state.roomId = null;
        localStorage.removeItem('gobang_current_room');
        if (realtimeChannel) {
            supabaseClient.removeChannel(realtimeChannel);
            realtimeChannel = null;
        }

        document.getElementById('lobbyScreen').classList.add('hidden');
        document.getElementById('entryScreen').classList.remove('hidden');
        context.showToastFn('已退出房间');
    }

    async function exitToLobby(context) {
        document.getElementById('gameEndOverlay').classList.remove('show');
        context.state.gameStarted = false;
        context.state.gameOver = false;
        context.state.winner = null;
        context.initBoardDataFn();

        document.getElementById('gameScreen').classList.add('hidden');
        document.getElementById('lobbyScreen').classList.remove('hidden');

        await supabaseClient.from('rooms').update({
            status: 'waiting',
            game_started: false,
            game_over: false,
            winner: null
        }).eq('room_code', context.state.roomId);

        context.updateUIFns.updateLobbyUI();
        context.updateUIFns.updateTurnDisplay();
        context.showToastFn('已返回房间，准备下一局');
    }

    function startHeartbeat(context) {
        if (heartbeatTimer) clearInterval(heartbeatTimer);
        heartbeatTimer = setInterval(async () => {
            if (!context.state.roomId) return;
            await supabaseClient.from('room_players')
                .update({ last_seen: new Date().toISOString(), is_online: true })
                .eq('room_code', context.state.roomId)
                .eq('user_id', context.state.myUserId);
        }, 15000);
    }

    async function tryReconnect(context) {
        const user = await getCurrentUser();
        if (user) {
            context.state.myUserId = user.id;
            context.currentUser = user;
        }

        let savedRoom = localStorage.getItem('gobang_current_room');
        if (!savedRoom) return;

        const { data: room } = await supabaseClient
            .from('rooms')
            .select('*')
            .eq('room_code', savedRoom)
            .single();

        if (room && room.status !== 'closed') {
            context.state.roomId = savedRoom;
            context.state.roomGameMode = room.mode || 'casual';
            context.state.isProMode = context.state.roomGameMode === 'pro';
            context.state.isHost = room.host_id === context.state.myUserId;

            await supabaseClient.from('room_players').upsert({
                room_code: savedRoom,
                user_id: context.state.myUserId,
                nickname: context.myNick,
                is_online: true,
                last_seen: new Date().toISOString()
            }, { onConflict: 'room_code,user_id' });

            document.getElementById('roomCodeDisplay').innerText = savedRoom;
            document.getElementById('gameRoomCode').innerText = savedRoom;

            setupSubscription(context);
            await handlePlayersUpdate(context);

            if (room.game_started) {
                context.state.gameStarted = true;
                if (room.board_state) context.state.board = room.board_state;
                context.state.currentPlayer = room.current_player;
                context.state.moveHistory = room.move_history || [];
                context.state.gameOver = room.game_over;
                context.state.winner = room.winner;
                context.state.winLines = room.win_lines || [];
                context.state.forbiddenLines = room.forbidden_lines || [];

                document.getElementById('entryScreen').classList.add('hidden');
                document.getElementById('lobbyScreen').classList.add('hidden');
                document.getElementById('gameScreen').classList.remove('hidden');
                context.drawBoardFn();
                context.updateUIFns.updateGameInfoPanel();
                context.updateUIFns.updateTurnDisplay();
                context.updateUIFns.updateGameButtons();
                if (context.state.gameOver) {
                    if (context.showWinnerMsgFn) context.showWinnerMsgFn(room.end_reason);
                }
            } else {
                document.getElementById('entryScreen').classList.add('hidden');
                document.getElementById('lobbyScreen').classList.remove('hidden');
                window.UI.renderSpectators();
                context.updateUIFns.updateLobbyUI();
            }
            window.UI.lockNicknameDisplay(context.myNick);
            startHeartbeat(context);
            context.showToastFn('已恢复连接');
        } else {
            localStorage.removeItem('gobang_current_room');
        }
    }

    // 导出
    window.SupabaseNetwork = {
        createSupabaseClient: createSupabaseClient,
        getCurrentUser: getCurrentUser,
        genRoomCode: genRoomCode,
        createRoom: createRoom,
        joinRoom: joinRoom,
        requestSeat: requestSeat,
        requestStartGame: requestStartGame,
        tryPlace: tryPlace,          // 新增
        sendChatMsg: sendChatMsg,
        sendSurrender: sendSurrender,
        sendDrawRequest: sendDrawRequest,
        leaveRoom: leaveRoom,
        exitToLobby: exitToLobby,
        tryReconnect: tryReconnect,
        setupSubscription: setupSubscription
    };
})();