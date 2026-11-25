import { compressImageFile } from '../utils/imageUtils';

export const uploadSingleMedicalImage = async (file, onProgress = null) => {
  if (!file || !file.type.startsWith('image/')) {
    throw new Error('Tệp không phải là hình ảnh hợp lệ');
  }

  const url = await compressImageFile(file, {
    maxWidth: 1600,
    maxHeight: 1600,
    quality: 0.82,
    mimeType: 'image/jpeg',
  });
  onProgress?.(100);
  return {
    id: `img_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    url,
    name: file.name,
    size: `${Math.round(url.length * 0.75 / 1024)} KB`,
    isCloud: false,
    timestamp: new Date().toISOString(),
  };
};

/**
 * Upload multiple medical image files sequentially with progress reporting
 * @param {FileList|Array<File>} files
 * @param {Function} onProgressTotal - (pct: number, currentIndex: number, total: number) => void
 * @returns {Promise<Array<Object>>}
 */
export const uploadMultipleMedicalImages = async (files, onProgressTotal = null) => {
  const fileArray = Array.from(files).filter(f => f.type && f.type.startsWith('image/'));
  const results = [];

  for (let i = 0; i < fileArray.length; i++) {
    const file = fileArray[i];
    try {
      const uploadedItem = await uploadSingleMedicalImage(file, (singlePct) => {
        if (onProgressTotal) {
          const overallPct = Math.round(((i + singlePct / 100) / fileArray.length) * 100);
          onProgressTotal(overallPct, i + 1, fileArray.length);
        }
      });
      results.push(uploadedItem);
    } catch (err) {
      console.error('Lỗi khi tải ảnh:', file.name, err);
    }
  }

  if (onProgressTotal) {
    onProgressTotal(100, fileArray.length, fileArray.length);
  }

  return results;
};
