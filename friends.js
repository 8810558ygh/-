// friends.js —— 好友系统完整模块（修复搜索和发送错误）

(function() {
    'use strict';

    let supabase = null;
    let currentUser = null;
    let friendDrawerOpen = false;

    // ==================== 初始化 ====================
    function init(client, user) {
        console.log('📦 Friends.init 被调用, client:', !!client, 'user:', !!user);
        supabase = client;
        currentUser = user;
        if (currentUser) {
            console.log('✅ 当前用户ID:', currentUser.id);
            loadFriendList();
            updateLastSeen();
            setInterval(updateLastSeen, 60000);
            setInterval(loadFriendList, 30000);
        } else {
            console.warn('⚠️ currentUser 为空');
        }
        bindEvents();
    }

    function bindEvents() {
        document.addEventListener('click', function(e) {
            const drawer = document.getElementById('friendDrawer');
            const toggle = document.querySelector('.friend-drawer-toggle');
            if (friendDrawerOpen && drawer && !drawer.contains(e.target) && !toggle?.contains(e.target)) {
                toggleFriendDrawer();
            }
        });
        const recipientType = document.getElementById('recipientType');
        if (recipientType) {
            recipientType.addEventListener('change', function() {
                const group = document.getElementById('userIdGroup');
                if (group) group.style.display = this.value === 'user' ? 'block' : 'none';
            });
        }
    }

    function toggleFriendDrawer() {
        friendDrawerOpen = !friendDrawerOpen;
        const drawer = document.getElementById('friendDrawer');
        if (drawer) drawer.classList.toggle('open', friendDrawerOpen);
    }

    function openAddFriend() {
        const modal = document.getElementById('addFriendModal');
        if (modal) {
            modal.classList.add('show');
            document.getElementById('searchInput').value = '';
            document.getElementById('searchResults').innerHTML = '';
            document.getElementById('searchInput').focus();
        }
    }

    function closeAddFriend() {
        document.getElementById('addFriendModal').classList.remove('show');
    }

    // ==================== 加载好友列表 ====================
    async function loadFriendList() {
        if (!currentUser || !supabase) {
            console.warn('loadFriendList: 缺少 currentUser 或 supabase');
            return;
        }

        const container = document.getElementById('friendListContainer');
        if (!container) {
            console.warn('loadFriendList: 当前页面没有 friendListContainer，跳过刷新');
            return;
        }

        const { data: friends, error } = await supabase
            .from('friends')
            .select('id, user_id, friend_id, status')
            .or(`user_id.eq.${currentUser.id},friend_id.eq.${currentUser.id}`)
            .eq('status', 'accepted');

        if (error) {
            console.error('加载好友列表失败:', error);
            return;
        }

        if (!friends || friends.length === 0) {
            container.innerHTML = `<div class="friend-empty">暂无好友</div>`;
            return;
        }

        const friendIds = friends.map(f => f.user_id === currentUser.id ? f.friend_id : f.user_id);
        const { data: profiles, error: pErr } = await supabase
            .from('profiles')
            .select('id, nickname, avatar_url, last_seen')
            .in('id', friendIds);

        if (pErr) {
            console.error('加载好友资料失败:', pErr);
            return;
        }

        const profileMap = {};
        profiles.forEach(p => profileMap[p.id] = p);

        let html = '';
        friendIds.forEach(id => {
            const p = profileMap[id];
            if (!p) return;
            const isOnline = p.last_seen && (Date.now() - new Date(p.last_seen).getTime() < 120000);
            const avatar = p.avatar_url || '';
            const name = p.nickname || '棋手';
            const initial = name.charAt(0).toUpperCase();

            html += `
                <div class="friend-item" onclick="Friends.chatWithFriend('${p.id}')">
                    ${avatar ? 
                        `<img class="avatar-small ${isOnline ? 'online' : 'offline'}" src="${avatar}" alt="${name}">` : 
                        `<div class="avatar-small ${isOnline ? 'online' : 'offline'}" style="display:flex;align-items:center;justify-content:center;background:linear-gradient(145deg,#c89d60,#8f6a30);color:#1e160c;font-weight:bold;font-size:1.2rem;flex-shrink:0;">${initial}</div>`
                    }
                    <div class="info">
                        <div class="name">${escapeHtml(name)}</div>
                        <div class="status ${isOnline ? 'online' : 'offline'}">${isOnline ? '🟢 在线' : '⚪ 离线'}</div>
                    </div>
                </div>
            `;
        });
        container.innerHTML = html;
    }

    // ==================== 搜索用户（增强错误处理） ====================
    async function searchUsers(query) {
        const resultsContainer = document.getElementById('searchResults');
        if (!resultsContainer) return;

        if (!query || query.length < 1) {
            resultsContainer.innerHTML = '';
            return;
        }

        if (!supabase || !currentUser) {
            resultsContainer.innerHTML = '<div style="color:#f87171;padding:12px;">系统未初始化，请刷新页面</div>';
            return;
        }

        console.log('🔍 搜索关键词:', query);
        console.log('当前用户ID:', currentUser.id);

        try {
            const { data, error } = await supabase
                .from('profiles')
                .select('id, nickname, avatar_url')
                .ilike('nickname', `%${query}%`)
                .neq('id', currentUser.id)
                .limit(10);

            if (error) {
                console.error('❌ 搜索失败:', error);
                resultsContainer.innerHTML = `<div style="color:#f87171;padding:12px;">搜索出错: ${error.message}</div>`;
                return;
            }

            console.log('✅ 搜索结果数量:', data?.length || 0, data);

            if (!data || data.length === 0) {
                resultsContainer.innerHTML = `
                    <div style="color:#a09070;padding:12px;text-align:center;">
                        ❌ 未找到昵称包含 "${query}" 的用户<br>
                        <span style="font-size:0.8rem;">💡 请确认对方已在「个人中心」设置了昵称</span>
                    </div>`;
                return;
            }

            const ids = data.map(u => u.id);
            const { data: existing, error: existErr } = await supabase
                .from('friends')
                .select('user_id, friend_id, status')
                .or(`user_id.eq.${currentUser.id},friend_id.eq.${currentUser.id}`)
                .in('user_id', ids)
                .in('friend_id', ids);

            if (existErr) {
                console.error('查询好友状态失败:', existErr);
                // 继续显示结果，只是不显示状态
            }

            const existingMap = {};
            if (existing) {
                existing.forEach(rec => {
                    const otherId = rec.user_id === currentUser.id ? rec.friend_id : rec.user_id;
                    existingMap[otherId] = rec.status;
                });
            }

            let html = '';
            data.forEach(u => {
                const status = existingMap[u.id];
                let actionHtml = '';
                if (status === 'accepted') {
                    actionHtml = '<span class="already">✅ 已是好友</span>';
                } else if (status === 'pending') {
                    actionHtml = '<span class="already">⏳ 已发送申请</span>';
                } else {
                    actionHtml = `<button class="add-friend-btn" onclick="Friends.sendFriendRequest('${u.id}')">添加</button>`;
                }
                html += `
                    <div class="result-item">
                        <span class="name">${escapeHtml(u.nickname)}</span>
                        ${actionHtml}
                    </div>
                `;
            });
            resultsContainer.innerHTML = html;

        } catch (err) {
            console.error('搜索异常:', err);
            resultsContainer.innerHTML = `<div style="color:#f87171;padding:12px;">搜索异常: ${err.message}</div>`;
        }
    }

    // ==================== 发送好友申请（增强错误日志） ====================
    async function sendFriendRequest(friendId) {
        if (!currentUser || !supabase) {
            showToast('请先登录');
            return;
        }

        console.log('发送好友申请给:', friendId);

        try {
            // 检查是否已存在任何记录
            const { data: existing, error: existErr } = await supabase
                .from('friends')
                .select('id, status')
                .or(`and(user_id.eq.${currentUser.id},friend_id.eq.${friendId}),and(user_id.eq.${friendId},friend_id.eq.${currentUser.id})`)
                .maybeSingle();

            if (existErr) {
                console.error('检查好友状态失败:', existErr);
                showToast('检查好友状态失败: ' + existErr.message);
                return;
            }

            if (existing) {
                if (existing.status === 'accepted') {
                    showToast('你们已经是好友了');
                } else if (existing.status === 'pending') {
                    showToast('已发送过好友申请，等待对方同意');
                }
                return;
            }

            // 插入好友申请
            const { data: newFriend, error: insertErr } = await supabase
                .from('friends')
                .insert({ user_id: currentUser.id, friend_id: friendId, status: 'pending' })
                .select()
                .single();

            if (insertErr) {
                console.error('插入好友记录失败:', insertErr);
                showToast('申请失败: ' + insertErr.message);
                return;
            }

            console.log('✅ 好友记录已插入:', newFriend);

            // 获取双方昵称
            const { data: friendProfile, error: fpErr } = await supabase
                .from('profiles')
                .select('nickname')
                .eq('id', friendId)
                .single();

            if (fpErr) {
                console.error('获取好友昵称失败:', fpErr);
                // 不阻塞流程，使用默认值
            }

            const { data: myProfile, error: mpErr } = await supabase
                .from('profiles')
                .select('nickname')
                .eq('id', currentUser.id)
                .single();

            if (mpErr) {
                console.error('获取自己昵称失败:', mpErr);
            }

            const friendName = friendProfile?.nickname || '棋手';
            const myName = myProfile?.nickname || '我';

            // 发送邮件
            const { error: mailErr } = await supabase.from('mails').insert({
                sender: myName,
                sender_type: 'user',
                subject: `📨 好友申请 from ${myName}`,
                content: `${myName} 想加你为好友。\n\n请点击下方按钮同意或拒绝。`,
                recipient_type: 'user',
                user_id: friendId,
                friend_request_id: newFriend.id,
                read: false,
                created_at: new Date().toISOString()
            });

            if (mailErr) {
                console.error('❌ 发送邮件失败:', mailErr);
                // 回滚好友记录
                await supabase.from('friends').delete().eq('id', newFriend.id);
                showToast('申请失败（邮件发送失败）: ' + mailErr.message);
                return;
            }

            showToast('✅ 好友申请已发送，等待对方同意');
            closeAddFriend();

        } catch (err) {
            console.error('发送申请异常:', err);
            showToast('申请异常: ' + err.message);
        }
    }

    // ==================== 同意好友申请 ====================
    async function acceptFriendRequest(requestId) {
        if (!currentUser || !supabase) {
            showToast('请先登录');
            return false;
        }

        const { data: record, error: findErr } = await supabase
            .from('friends')
            .select('id, user_id, friend_id, status')
            .eq('id', requestId)
            .eq('friend_id', currentUser.id)
            .eq('status', 'pending')
            .single();

        if (findErr || !record) {
            showToast('该好友申请不存在或已过期');
            return false;
        }

        const { error: updateErr } = await supabase
            .from('friends')
            .update({ status: 'accepted', updated_at: new Date().toISOString() })
            .eq('id', requestId);

        if (updateErr) {
            showToast('同意好友失败: ' + updateErr.message);
            return false;
        }

        await supabase.from('mails').delete().eq('friend_request_id', requestId);
        await loadFriendList();
        showToast('✅ 已同意好友申请！');
        return true;
    }

    // ==================== 拒绝好友申请 ====================
    async function rejectFriendRequest(requestId) {
        if (!currentUser || !supabase) {
            showToast('请先登录');
            return false;
        }

        const { data: record, error: findErr } = await supabase
            .from('friends')
            .select('id')
            .eq('id', requestId)
            .eq('friend_id', currentUser.id)
            .eq('status', 'pending')
            .single();

        if (findErr || !record) {
            showToast('该好友申请不存在或已过期');
            return false;
        }

        const { error: delErr } = await supabase
            .from('friends')
            .delete()
            .eq('id', requestId);

        if (delErr) {
            showToast('拒绝好友失败: ' + delErr.message);
            return false;
        }

        await supabase.from('mails').delete().eq('friend_request_id', requestId);
        showToast('已拒绝好友申请');
        return true;
    }

    // ==================== 更新在线状态 ====================
    async function updateLastSeen() {
        if (!currentUser || !supabase) return;
        try {
            await supabase
                .from('profiles')
                .update({ last_seen: new Date().toISOString() })
                .eq('id', currentUser.id);
        } catch (e) {}
    }

    function chatWithFriend(friendId) {
        showToast('💬 聊天功能开发中...');
    }

    function escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.innerText = text;
        return div.innerHTML;
    }

    function showToast(msg) {
        const t = document.getElementById('toast');
        if (!t) { console.log('Toast:', msg); return; }
        t.innerText = msg;
        t.classList.add('show');
        setTimeout(() => t.classList.remove('show'), 2500);
    }

    // ==================== 导出 ====================
    window.Friends = {
        init: init,
        toggleFriendDrawer: toggleFriendDrawer,
        openAddFriend: openAddFriend,
        closeAddFriend: closeAddFriend,
        searchUsers: searchUsers,
        sendFriendRequest: sendFriendRequest,
        acceptFriendRequest: acceptFriendRequest,
        rejectFriendRequest: rejectFriendRequest,
        loadFriendList: loadFriendList,
        updateLastSeen: updateLastSeen,
        chatWithFriend: chatWithFriend
    };

})();