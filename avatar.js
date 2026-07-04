// ===== 头像上传与裁剪功能（支持拖动裁剪 + 可靠上传） =====
// 依赖：supabase, currentUser, myAvatarUrl, showToast, updateAvatarUI

let cropImageData = null;
let cropFileName = null;
let dragData = null; // 存储拖拽状态

// ---------- 打开文件选择 ----------
function openAvatarUpload() {
    if (!currentUser) {
        showToast('请先登录');
        if (typeof openProfile === 'function') openProfile();
        return;
    }
    document.getElementById('avatarFileInput').click();
}

// ---------- 文件选择 ----------
function onAvatarFileSelected(event) {
    const input = event.target;
    const file = input.files && input.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
        showToast('请选择图片文件');
        input.value = '';
        return;
    }
    if (file.size > 2 * 1024 * 1024) {
        showToast('图片不能超过 2MB');
        input.value = '';
        return;
    }

    cropFileName = file.name;
    const reader = new FileReader();
    reader.onload = (e) => {
        cropImageData = e.target.result;
        const modal = document.getElementById('avatarCropModal');
        const img = document.getElementById('cropImg');
        img.src = cropImageData;
        img.onload = () => {
            initDrag(img);
            modal.classList.add('show');
        };
        if (img.complete && img.naturalWidth) {
            initDrag(img);
            modal.classList.add('show');
        }
    };
    reader.onerror = () => {
        showToast('读取图片失败');
        input.value = '';
    };
    reader.readAsDataURL(file);
    input.value = '';
}

// ---------- 初始化拖拽 ----------
function initDrag(img) {
    const container = document.getElementById('cropContainer');
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const cw = rect.width || 280;
    const ch = rect.height || 280;
    const nw = img.naturalWidth;
    const nh = img.naturalHeight;

    const scale = Math.min(cw / nw, ch / nh);
    const dw = nw * scale;
    const dh = nh * scale;
    const ox = (cw - dw) / 2;
    const oy = (ch - dh) / 2;

    dragData = { offsetX: ox, offsetY: oy, imgW: dw, imgH: dh, cw, ch, naturalW: nw, naturalH: nh, scale };

    img.style.position = 'absolute';
    img.style.left = ox + 'px';
    img.style.top = oy + 'px';
    img.style.width = dw + 'px';
    img.style.height = dh + 'px';
    img.style.cursor = 'grab';
    img.style.userSelect = 'none';
    img.style.pointerEvents = 'auto';
    img.style.maxWidth = 'none';
    img.style.maxHeight = 'none';

    let isDragging = false;
    let startX, startY, startOx, startOy;

    const onStart = (e) => {
        e.preventDefault();
        const touch = e.touches ? e.touches[0] : e;
        isDragging = true;
        startX = touch.clientX;
        startY = touch.clientY;
        startOx = dragData.offsetX;
        startOy = dragData.offsetY;
        img.style.cursor = 'grabbing';
    };

    const onMove = (e) => {
        if (!isDragging) return;
        e.preventDefault();
        const touch = e.touches ? e.touches[0] : e;
        const dx = touch.clientX - startX;
        const dy = touch.clientY - startY;
        let newX = startOx + dx;
        let newY = startOy + dy;
        // 边界限制
        const minX = dragData.cw - dragData.imgW;
        const minY = dragData.ch - dragData.imgH;
        newX = Math.min(Math.max(newX, minX), 0);
        newY = Math.min(Math.max(newY, minY), 0);
        dragData.offsetX = newX;
        dragData.offsetY = newY;
        img.style.left = newX + 'px';
        img.style.top = newY + 'px';
    };

    const onEnd = () => {
        isDragging = false;
        img.style.cursor = 'grab';
    };

    img.addEventListener('mousedown', onStart);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onEnd);
    img.addEventListener('touchstart', onStart, { passive: false });
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onEnd);

    // 关闭时清理事件
    const modal = document.getElementById('avatarCropModal');
    const cleanup = () => {
        img.removeEventListener('mousedown', onStart);
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onEnd);
        img.removeEventListener('touchstart', onStart);
        window.removeEventListener('touchmove', onMove);
        window.removeEventListener('touchend', onEnd);
    };
    const observer = new MutationObserver(() => {
        if (!modal.classList.contains('show')) {
            cleanup();
            observer.disconnect();
        }
    });
    observer.observe(modal, { attributes: true, attributeFilter: ['class'] });
}

// ---------- 关闭裁剪 ----------
function closeAvatarCrop() {
    document.getElementById('avatarCropModal').classList.remove('show');
    cropImageData = null;
    cropFileName = null;
    dragData = null;
}

// ---------- 确认裁剪并上传 ----------
async function confirmAvatarCrop() {
    if (!cropImageData || !currentUser) {
        showToast('请先选择图片');
        return;
    }

    showToast('上传中...');

    try {
        // 裁剪生成圆形头像
        const blob = await cropToCircleWithOffset();

        // 上传到 Storage
        const filePath = `${currentUser.id}/${Date.now()}.png`;
        const { data, error } = await supabase.storage
            .from('avatars')
            .upload(filePath, blob, {
                contentType: 'image/png',
                upsert: true
            });

        if (error) {
            console.error('上传失败:', error);
            showToast('上传失败: ' + error.message);
            return;
        }

        // 获取公开 URL
        const { data: urlData } = supabase.storage
            .from('avatars')
            .getPublicUrl(filePath);
        const publicUrl = urlData.publicUrl;

        // 更新 profiles
        const { error: updateErr } = await supabase
            .from('profiles')
            .update({ avatar_url: publicUrl, updated_at: new Date().toISOString() })
            .eq('id', currentUser.id);

        if (updateErr) {
            console.error('更新资料失败:', updateErr);
            showToast('保存失败: ' + updateErr.message);
            return;
        }

        // 更新本地状态
        myAvatarUrl = publicUrl;
        localStorage.setItem('goavatar', publicUrl);
        updateAvatarUI();
        closeAvatarCrop();
        showToast('头像已更新');
    } catch (err) {
        console.error('操作异常:', err);
        showToast('操作失败，请重试');
    }
}

// ---------- 裁剪函数（根据拖拽偏移） ----------
function cropToCircleWithOffset() {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            if (!dragData) {
                // 无拖拽数据时居中裁剪
                const canvas = document.createElement('canvas');
                const size = 200;
                canvas.width = size;
                canvas.height = size;
                const ctx = canvas.getContext('2d');
                ctx.beginPath();
                ctx.arc(size/2, size/2, size/2, 0, 2*Math.PI);
                ctx.closePath();
                ctx.clip();
                const minDim = Math.min(img.width, img.height);
                const sx = (img.width - minDim)/2;
                const sy = (img.height - minDim)/2;
                ctx.drawImage(img, sx, sy, minDim, minDim, 0, 0, size, size);
                canvas.toBlob(b => resolve(b), 'image/png');
                return;
            }

            const { naturalW, naturalH, scale, offsetX, offsetY, cw, ch } = dragData;
            const displayW = naturalW * scale;
            const displayH = naturalH * scale;
            const cropSize = 200;
            // 裁剪框中心在显示容器中的坐标
            const centerX = offsetX + cw/2;
            const centerY = offsetY + ch/2;
            // 映射到原图
            const srcCenterX = (centerX / displayW) * naturalW;
            const srcCenterY = (centerY / displayH) * naturalH;
            const srcSize = (cropSize / displayW) * naturalW;

            let sx = srcCenterX - srcSize/2;
            let sy = srcCenterY - srcSize/2;
            let sw = srcSize;
            let sh = srcSize;
            // 边界保护
            if (sx < 0) { sx = 0; sw = srcSize; }
            if (sy < 0) { sy = 0; sh = srcSize; }
            if (sx + sw > naturalW) { sw = naturalW - sx; }
            if (sy + sh > naturalH) { sh = naturalH - sy; }

            const canvas = document.createElement('canvas');
            const size = 200;
            canvas.width = size;
            canvas.height = size;
            const ctx = canvas.getContext('2d');
            ctx.beginPath();
            ctx.arc(size/2, size/2, size/2, 0, 2*Math.PI);
            ctx.closePath();
            ctx.clip();
            ctx.drawImage(img, sx, sy, sw, sh, 0, 0, size, size);
            canvas.toBlob(b => resolve(b), 'image/png');
        };
        img.onerror = reject;
        img.src = cropImageData;
    });
}

// ---------- 辅助函数（保留兼容） ----------
function dataURLToBlob(dataURL) {
    return new Promise((resolve) => {
        const arr = dataURL.split(',');
        const mime = arr[0].match(/:(.*?);/)[1];
        const bstr = atob(arr[1]);
        let n = bstr.length;
        const u8arr = new Uint8Array(n);
        while (n--) u8arr[n] = bstr.charCodeAt(n);
        resolve(new Blob([u8arr], { type: mime }));
    });
}