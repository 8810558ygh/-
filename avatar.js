// ===== 头像上传与裁剪功能 =====
// 依赖全局变量：supabase, currentUser, myAvatarUrl, showToast, updateAvatarUI

let cropImageData = null;
let cropFileName = null;

function openAvatarUpload() {
  if (!currentUser) {
    showToast('请先登录账号');
    if (typeof openProfile === 'function') openProfile();
    return;
  }
  document.getElementById('avatarFileInput').click();
}

function onAvatarFileSelected(event) {
  const input = event.target;
  const file = input.files && input.files[0];
  if (!file) {
    showToast('未选择文件');
    return;
  }
  
  if (!file.type.startsWith('image/')) {
    showToast('请选择图片文件');
    input.value = '';
    return;
  }
  
  if (file.size > 2 * 1024 * 1024) {
    showToast('图片大小不能超过 2MB');
    input.value = '';
    return;
  }
  
  cropFileName = file.name;
  
  const reader = new FileReader();
  reader.onload = (e) => {
    cropImageData = e.target.result;
    const cropImg = document.getElementById('cropImg');
    const modal = document.getElementById('avatarCropModal');
    cropImg.src = cropImageData;
    modal.classList.add('show');
  };
  reader.onerror = () => {
    showToast('读取图片失败');
    input.value = '';
  };
  reader.readAsDataURL(file);
  input.value = '';
}

function closeAvatarCrop() {
  document.getElementById('avatarCropModal').classList.remove('show');
  cropImageData = null;
  cropFileName = null;
}

async function confirmAvatarCrop() {
  if (!cropImageData || !currentUser) return;
  
  showToast('正在上传头像...');
  
  try {
    const blob = await dataURLToBlob(cropImageData);
    const croppedBlob = await cropToCircle(blob);
    const filePath = `${currentUser.id}/${Date.now()}.png`;
    
    console.log('开始上传头像到路径:', filePath);
    
    const { data, error } = await supabase.storage
      .from('avatars')
      .upload(filePath, croppedBlob, {
        contentType: 'image/png',
        upsert: true
      });
    
    if (error) {
      console.error('Storage 上传失败:', error);
      showToast('上传失败: ' + error.message);
      return;
    }
    
    console.log('Storage 上传成功:', data);
    
    const { data: urlData } = supabase.storage
      .from('avatars')
      .getPublicUrl(filePath);
    
    const publicUrl = urlData.publicUrl;
    console.log('获取到公开URL:', publicUrl);
    
    const { error: updateError } = await supabase
      .from('profiles')
      .update({ 
        avatar_url: publicUrl,
        updated_at: new Date().toISOString()
      })
      .eq('id', currentUser.id);
    
    if (updateError) {
      console.error('profiles 更新失败:', updateError);
      showToast('保存头像信息失败: ' + updateError.message);
      return;
    }
    
    console.log('profiles 更新成功');
    
    myAvatarUrl = publicUrl;
    localStorage.setItem('goavatar', publicUrl);
    updateAvatarUI();
    
    closeAvatarCrop();
    showToast('头像上传成功！');
    
  } catch (e) {
    console.error('头像处理异常:', e);
    showToast('头像处理失败: ' + e.message);
  }
}

function dataURLToBlob(dataURL) {
  return new Promise((resolve) => {
    const arr = dataURL.split(',');
    const mime = arr[0].match(/:(.*?);/)[1];
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }
    resolve(new Blob([u8arr], { type: mime }));
  });
}

function cropToCircle(blob) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const size = 200;
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      
      const minDim = Math.min(img.width, img.height);
      const sx = (img.width - minDim) / 2;
      const sy = (img.height - minDim) / 2;
      
      ctx.beginPath();
      ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();
      
      ctx.drawImage(img, sx, sy, minDim, minDim, 0, 0, size, size);
      
      canvas.toBlob((blob) => {
        resolve(blob);
      }, 'image/png');
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(blob);
  });
}