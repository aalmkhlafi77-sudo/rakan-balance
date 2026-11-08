/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * RAKAN BALANCE (راكان بلانس) — Attachments Management Service
 * File validation, Base64 conversion, Blob download triggers, and privacy controls.
 */

import { AttachmentModel } from '../domain/types.ts';

// Allowed Mime Types: Images & PDF
export const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/svg+xml',
  'application/pdf',
];


export const PRIVATE_ATTACHMENT_PREFIX = 'rakan-private://attachment/';

export function isPrivateAttachment(attachment: AttachmentModel): boolean {
  return attachment.dataUrl === PRIVATE_ATTACHMENT_PREFIX + attachment.id;
}

export async function fetchPrivateAttachmentBlob(attachment: AttachmentModel): Promise<Blob> {
  if (!isPrivateAttachment(attachment)) {
    throw new Error('المرفق ليس مرجعًا خاصًا على الخادم.');
  }
  let response: Response;
  try {
    response = await fetch('/api/owner/attachment-blobs/' + encodeURIComponent(attachment.id), {
      credentials: 'same-origin',
      cache: 'no-store',
    });
  } catch {
    throw new Error('تعذر الاتصال بالخادم لتحميل المرفق الخاص.');
  }
  if (response.status === 401) {
    window.dispatchEvent(new Event('rakan-owner-session-expired'));
    throw new Error('انتهت جلسة المالك. أعد تسجيل الدخول لتحميل المرفق.');
  }
  if (!response.ok) {
    throw new Error('تعذر تحميل المرفق الخاص أو فشل فحص سلامته.');
  }
  const blob = await response.blob();
  const expected = attachment.mimeType === 'image/jpg' ? 'image/jpeg' : attachment.mimeType;
  if (blob.size !== attachment.size || (blob.type && blob.type !== expected)) {
    throw new Error('المرفق المستلم لا يطابق بياناته المحفوظة.');
  }
  return blob;
}

export async function resolveAttachmentUrl(
  attachment: AttachmentModel
): Promise<{ url: string; revoke: boolean }> {
  if (!isPrivateAttachment(attachment)) {
    return { url: attachment.dataUrl, revoke: false };
  }
  const blob = await fetchPrivateAttachmentBlob(attachment);
  return { url: URL.createObjectURL(blob), revoke: true };
}

// Maximum allowed file size: 5 MB (5 * 1024 * 1024 bytes)
export const MAX_ATTACHMENT_SIZE_BYTES = 5 * 1024 * 1024;

export interface FileValidationResult {
  isValid: boolean;
  error?: string;
}

/**
 * Validates file type and size limit before reading
 */
export function validateAttachmentFile(file: File): FileValidationResult {
  if (!file) {
    return { isValid: false, error: 'الملف المرفق غير محدد.' };
  }

  // Size Check
  if (file.size > MAX_ATTACHMENT_SIZE_BYTES) {
    return {
      isValid: false,
      error: `حجم الملف "${file.name}" يتجاوز الحد المسموح به (5 ميجابايت).`,
    };
  }

  if (file.size <= 0) {
    return {
      isValid: false,
      error: `الملف "${file.name}" فارغ أو تالف.`,
    };
  }

  // Type Check (by Mime Type or extension fallback)
  const mime = (file.type || '').toLowerCase();
  const ext = file.name.slice(((file.name.lastIndexOf('.') - 1) >>> 0) + 2).toLowerCase();

  const isImageMime = mime.startsWith('image/');
  const isPdfMime = mime === 'application/pdf';
  const isImageExt = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'svg'].includes(ext);
  const isPdfExt = ext === 'pdf';

  if (!isImageMime && !isPdfMime && !isImageExt && !isPdfExt) {
    return {
      isValid: false,
      error: `نوع الملف "${file.name}" غير مدعوم. يسمح بإرفاق الصور (PNG, JPG, WEBP, GIF, SVG) ومستندات PDF فقط.`,
    };
  }

  return { isValid: true };
}

/**
 * Converts a validated File object to Base64 AttachmentModel
 */
export function fileToAttachmentModel(
  file: File,
  transactionId: string = ''
): Promise<AttachmentModel> {
  return new Promise((resolve, reject) => {
    const validation = validateAttachmentFile(file);
    if (!validation.isValid) {
      reject(new Error(validation.error));
      return;
    }

    const reader = new FileReader();

    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      if (!dataUrl) {
        reject(new Error(`تعذر قراءة بيانات الملف "${file.name}".`));
        return;
      }

      const id = `att_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
      const mimeType = file.type || (file.name.endsWith('.pdf') ? 'application/pdf' : 'image/png');

      resolve({
        id,
        transactionId,
        originalName: file.name,
        mimeType,
        size: file.size,
        dataUrl,
        createdAt: new Date().toISOString(),
      });
    };

    reader.onerror = () => {
      reject(new Error(`حدث خطأ أثناء قراءة الملف "${file.name}".`));
    };

    reader.readAsDataURL(file);
  });
}

/**
 * Triggers clean browser download of the original file content from Base64 Data URL
 */
export async function downloadAttachment(attachment: AttachmentModel): Promise<void> {
  if (!attachment || !attachment.dataUrl) {
    alert('بيانات المرفق مفقودة أو غير صالحة.');
    return;
  }

  let resolved: { url: string; revoke: boolean } | null = null;
  try {
    resolved = await resolveAttachmentUrl(attachment);
    const a = document.createElement('a');
    a.href = resolved.url;
    a.download = attachment.originalName || 'document';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  } catch (err) {
    console.error('Failed to trigger attachment download:', err);
    alert(err instanceof Error ? err.message : `تعذر تنزيل الملف "${attachment.originalName}".`);
  } finally {
    if (resolved?.revoke) {
      setTimeout(() => URL.revokeObjectURL(resolved!.url), 1000);
    }
  }
}

/**
 * Formats size in bytes into human-readable Arabic string (e.g., 250 KB, 1.5 MB)
 */
export function formatFileSize(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 بايت';
  if (bytes < 1024) return `${bytes} بايت`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} ك.ب`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} م.ب`;
}

/**
 * Converts a Base64 Data URL to a Blob URL for reliable in-browser PDF/media previewing
 */
export function dataUrlToBlobUrl(dataUrl: string, fallbackMime: string = 'application/pdf'): string | null {
  if (!dataUrl) return null;
  try {
    const parts = dataUrl.split(',');
    if (parts.length < 2) return dataUrl;

    const mimeString = parts[0].split(':')[1]?.split(';')[0] || fallbackMime;
    const byteString = atob(parts[1]);
    const ab = new ArrayBuffer(byteString.length);
    const ia = new Uint8Array(ab);

    for (let i = 0; i < byteString.length; i++) {
      ia[i] = byteString.charCodeAt(i);
    }

    const blob = new Blob([ab], { type: mimeString });
    return URL.createObjectURL(blob);
  } catch (err) {
    console.error('Failed to convert DataURL to BlobURL:', err);
    return null;
  }
}

