/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * RAKAN BALANCE (راكان بلانس) — Interactive Attachment Preview Modal
 * Fullscreen preview modal for images and PDF documents with zoom controls, multi-file carousel, and download actions.
 */

import React, { useState } from 'react';
import { AttachmentModel } from '../domain/types.ts';
import { downloadAttachment, formatFileSize } from '../services/attachment_service.ts';
import {
  X,
  Download,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  ChevronRight,
  ChevronLeft,
  FileText,
  Image as ImageIcon,
  AlertTriangle,
} from 'lucide-react';

interface AttachmentPreviewModalProps {
  attachments: AttachmentModel[];
  initialIndex?: number;
  isOpen: boolean;
  onClose: () => void;
}

export const AttachmentPreviewModal: React.FC<AttachmentPreviewModalProps> = ({
  attachments,
  initialIndex = 0,
  isOpen,
  onClose,
}) => {
  const [currentIndex, setCurrentIndex] = useState<number>(initialIndex);
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [iframeError, setIframeError] = useState<boolean>(false);

  if (!isOpen || !attachments || attachments.length === 0) return null;

  const currentAttachment = attachments[currentIndex] || attachments[0];
  const isImage = currentAttachment.mimeType.startsWith('image/');
  const isPdf = currentAttachment.mimeType.includes('pdf');

  const handleNext = () => {
    setCurrentIndex((prev) => (prev + 1) % attachments.length);
    setZoomLevel(1);
    setIframeError(false);
  };

  const handlePrev = () => {
    setCurrentIndex((prev) => (prev - 1 + attachments.length) % attachments.length);
    setZoomLevel(1);
    setIframeError(false);
  };

  const handleZoomIn = () => setZoomLevel((prev) => Math.min(prev + 0.25, 3));
  const handleZoomOut = () => setZoomLevel((prev) => Math.max(prev - 0.25, 0.5));
  const handleResetZoom = () => setZoomLevel(1);

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex flex-col justify-between p-3 sm:p-6" dir="rtl">
      {/* Top Controls Header */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-3 sm:p-4 flex items-center justify-between shadow-lg text-white mb-3">
        <div className="flex items-center gap-3 truncate">
          <div className="w-9 h-9 rounded-xl bg-emerald-600/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
            {isImage ? <ImageIcon className="w-5 h-5" /> : <FileText className="w-5 h-5" />}
          </div>
          <div className="truncate">
            <h3 className="text-sm font-bold truncate text-slate-100">{currentAttachment.originalName}</h3>
            <div className="text-[11px] text-slate-400 flex items-center gap-2 font-mono">
              <span>{formatFileSize(currentAttachment.size)}</span>
              <span>·</span>
              <span>مرفق {currentIndex + 1} من {attachments.length}</span>
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2 shrink-0">
          {isImage && (
            <div className="hidden sm:flex items-center gap-1 bg-slate-800/80 p-1 rounded-xl border border-slate-700/60 text-xs">
              <button
                type="button"
                onClick={handleZoomOut}
                className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-300 hover:text-white cursor-pointer"
                title="تصغير"
              >
                <ZoomOut className="w-4 h-4" />
              </button>
              <span className="font-mono px-1.5 text-[11px] text-emerald-400 font-bold">
                {Math.round(zoomLevel * 100)}%
              </span>
              <button
                type="button"
                onClick={handleZoomIn}
                className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-300 hover:text-white cursor-pointer"
                title="تكبير"
              >
                <ZoomIn className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={handleResetZoom}
                className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-300 hover:text-white cursor-pointer"
                title="إعادة ضبط الحجم"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={() => downloadAttachment(currentAttachment)}
            className="py-1.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-1.5 transition-all shadow-sm shadow-emerald-600/30 cursor-pointer"
            title="تنزيل المرفق"
          >
            <Download className="w-4 h-4" />
            <span className="hidden sm:inline">تنزيل</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white cursor-pointer transition-colors"
            title="إغلاق المعاينة"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Main Viewing Canvas */}
      <div className="flex-1 relative flex items-center justify-center overflow-hidden bg-slate-900/40 rounded-2xl border border-slate-800/60 p-2 sm:p-4">
        {/* Next / Previous Carousel Buttons (if multi-attachments) */}
        {attachments.length > 1 && (
          <>
            <button
              type="button"
              onClick={handlePrev}
              className="absolute right-3 z-20 p-2.5 rounded-full bg-slate-900/80 hover:bg-emerald-600 text-white border border-slate-700/60 shadow-lg cursor-pointer transition-all"
              title="المرفق السابق"
            >
              <ChevronRight className="w-5 h-5" />
            </button>

            <button
              type="button"
              onClick={handleNext}
              className="absolute left-3 z-20 p-2.5 rounded-full bg-slate-900/80 hover:bg-emerald-600 text-white border border-slate-700/60 shadow-lg cursor-pointer transition-all"
              title="المرفق التالي"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
          </>
        )}

        {/* Content Render */}
        <div className="w-full h-full flex items-center justify-center overflow-auto p-2">
          {isImage ? (
            <img
              src={currentAttachment.dataUrl}
              alt={currentAttachment.originalName}
              style={{ transform: `scale(${zoomLevel})` }}
              className="max-h-full max-w-full object-contain rounded-xl shadow-2xl transition-transform duration-200 ease-out"
            />
          ) : isPdf && !iframeError ? (
            <iframe
              src={currentAttachment.dataUrl}
              title={currentAttachment.originalName}
              onError={() => setIframeError(true)}
              className="w-full h-full max-w-4xl rounded-xl border border-slate-800 bg-white"
            />
          ) : (
            <div className="text-center p-8 bg-slate-900/90 border border-slate-800 rounded-2xl max-w-md space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-400 flex items-center justify-center mx-auto">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-slate-100">معاينة المستند غير متاحة في هذا المتصفح</h4>
                <p className="text-xs text-slate-400 mt-1">
                  المستند جاهز وآمن للتنزيل مباشرة لقراءته عبر تطبيق المستندات المفضل لديك.
                </p>
              </div>
              <button
                type="button"
                onClick={() => downloadAttachment(currentAttachment)}
                className="py-2.5 px-5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs inline-flex items-center gap-2 transition-all cursor-pointer shadow-sm"
              >
                <Download className="w-4 h-4" />
                <span>تنزيل المستند الأصلي الآن</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Multi-Attachment Thumbnail Strip */}
      {attachments.length > 1 && (
        <div className="mt-3 flex items-center justify-center gap-2 overflow-x-auto p-2 bg-slate-900/80 border border-slate-800 rounded-2xl">
          {attachments.map((att, idx) => {
            const isSel = idx === currentIndex;
            const attIsImg = att.mimeType.startsWith('image/');
            return (
              <button
                key={att.id}
                type="button"
                onClick={() => {
                  setCurrentIndex(idx);
                  setZoomLevel(1);
                  setIframeError(false);
                }}
                className={`relative py-1.5 px-3 rounded-xl text-xs font-semibold transition-all flex items-center gap-2 cursor-pointer border ${
                  isSel
                    ? 'bg-emerald-600/20 text-emerald-300 border-emerald-500'
                    : 'bg-slate-800/80 text-slate-400 hover:text-slate-200 border-slate-700/60'
                }`}
              >
                {attIsImg ? <ImageIcon className="w-3.5 h-3.5" /> : <FileText className="w-3.5 h-3.5" />}
                <span className="truncate max-w-[120px]">{att.originalName}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
