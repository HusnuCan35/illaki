/**
 * Media Processing Library
 * 
 * - Görselleri WebP'ye sıkıştırır + thumbnail oluşturur
 * - Video'nun ilk karesini thumbnail olarak çıkarır
 * - Canvas API kullanır (sunucu gerektirmez)
 */

// ────────────────────────────────────────────────────────────
// Görsel işleme
// ────────────────────────────────────────────────────────────

/**
 * Görseli WebP'ye sıkıştır ve boyutlandır
 * @param {File} file - Orijinal görsel dosyası
 * @param {number} maxWidth - Maksimum genişlik (piksel)
 * @param {number} quality - 0-1 arası kalite (WebP)
 * @returns {Promise<{ blob: Blob, width: number, height: number }>}
 */
export async function compressImage(file, maxWidth = 1280, quality = 0.82) {
  const img = await loadImage(file);
  const { width, height } = calculateDimensions(img.width, img.height, maxWidth);
  
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, width, height);
  
  const blob = await canvasToBlob(canvas, 'image/webp', quality);
  return { blob, width, height };
}

/**
 * Thumbnail oluştur (küçük önizleme)
 * @param {File} file - Orijinal görsel
 * @param {number} maxSize - Thumbnail max boyutu
 * @returns {Promise<{ blob: Blob, dataUrl: string }>}
 */
export async function generateImageThumbnail(file, maxSize = 256) {
  const img = await loadImage(file);
  const { width, height } = calculateDimensions(img.width, img.height, maxSize);
  
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, width, height);
  
  const blob = await canvasToBlob(canvas, 'image/webp', 0.65);
  const dataUrl = canvas.toDataURL('image/webp', 0.65);
  return { blob, dataUrl, width, height };
}

// ────────────────────────────────────────────────────────────
// Video işleme
// ────────────────────────────────────────────────────────────

/**
 * Video'nun ilk karesinden thumbnail üretir
 * @param {File} file - Video dosyası
 * @param {number} maxSize - Thumbnail max boyutu
 * @returns {Promise<{ blob: Blob, dataUrl: string, duration: number }>}
 */
export async function generateVideoThumbnail(file, maxSize = 256) {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    const url = URL.createObjectURL(file);
    
    video.src = url;
    video.muted = true;
    video.currentTime = 1; // 1. saniye (intro karesi daha iyi)
    video.preload = 'metadata';
    
    video.onloadeddata = async () => {
      try {
        const duration = video.duration;
        const { width, height } = calculateDimensions(
          video.videoWidth, video.videoHeight, maxSize
        );
        
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0, width, height);
        
        const blob = await canvasToBlob(canvas, 'image/webp', 0.7);
        const dataUrl = canvas.toDataURL('image/webp', 0.7);
        
        URL.revokeObjectURL(url);
        resolve({ blob, dataUrl, duration, width, height });
      } catch (err) {
        URL.revokeObjectURL(url);
        reject(err);
      }
    };
    
    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Video yüklenemedi'));
    };
    
    // Mobil uyumluluk için play + pause
    video.play().then(() => video.pause()).catch(() => {});
  });
}

// ────────────────────────────────────────────────────────────
// Dosya tipi algılama ve işleme karar noktası
// ────────────────────────────────────────────────────────────

/**
 * Dosyayı tipine göre işler ve metadata döner
 * @param {File} file
 * @returns {Promise<MediaProcessResult>}
 */
export async function processMediaFile(file) {
  const isImage = file.type.startsWith('image/');
  const isVideo = file.type.startsWith('video/');
  
  if (isImage) {
    const [compressed, thumbnail] = await Promise.all([
      compressImage(file, 1280, 0.82),
      generateImageThumbnail(file, 256),
    ]);
    return {
      type: 'image',
      originalFile: file,
      compressedBlob: compressed.blob,
      thumbnailBlob: thumbnail.blob,
      thumbnailDataUrl: thumbnail.dataUrl,
      dimensions: { width: compressed.width, height: compressed.height },
      originalSize: file.size,
      compressedSize: compressed.blob.size,
    };
  }
  
  if (isVideo) {
    const thumbnail = await generateVideoThumbnail(file, 320);
    return {
      type: 'video',
      originalFile: file,
      compressedBlob: file, // Video sıkıştırma client-side mümkün değil, orijinal gönderilir
      thumbnailBlob: thumbnail.blob,
      thumbnailDataUrl: thumbnail.dataUrl,
      duration: thumbnail.duration,
      dimensions: { width: thumbnail.width, height: thumbnail.height },
      originalSize: file.size,
    };
  }
  
  // Diğer dosyalar (PDF, ZIP, vb.)
  return {
    type: 'file',
    originalFile: file,
    compressedBlob: file,
    thumbnailBlob: null,
    thumbnailDataUrl: null,
    originalSize: file.size,
  };
}

/**
 * Dosya boyutunu okunabilir formata çevirir
 */
export function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ────────────────────────────────────────────────────────────
// Yardımcılar
// ────────────────────────────────────────────────────────────

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Görsel yüklenemedi')); };
    img.src = url;
  });
}

function calculateDimensions(origW, origH, maxSize) {
  if (origW <= maxSize && origH <= maxSize) {
    return { width: origW, height: origH };
  }
  const ratio = Math.min(maxSize / origW, maxSize / origH);
  return {
    width: Math.round(origW * ratio),
    height: Math.round(origH * ratio),
  };
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error('Canvas→Blob dönüşümü başarısız')),
      type,
      quality
    );
  });
}
