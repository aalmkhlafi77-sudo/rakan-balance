/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * RAKAN BALANCE (راكان بلانس) — Native PDF Canvas Viewer
 * Renders PDF documents client-side using PDF.js onto an HTML5 Canvas.
 * Solves Chrome iframe / plugin sandbox restrictions 100% offline.
 */

import React, { useState, useEffect, useRef } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import {
  ChevronRight,
  ChevronLeft,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Loader2,
  AlertTriangle,
} from 'lucide-react';

// Configure PDF.js Worker with workerSrc URL
try {
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.mjs',
    import.meta.url
  ).toString();
} catch (e) {
  console.warn('PDF.js worker URL setup fallback:', e);
}

interface PdfViewerCanvasProps {
  dataUrl: string;
  originalName: string;
}

export const PdfViewerCanvas: React.FC<PdfViewerCanvasProps> = ({ dataUrl, originalName }) => {
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [pageNum, setPageNum] = useState<number>(1);
  const [numPages, setNumPages] = useState<number>(0);
  const [scale, setScale] = useState<number>(1.2);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string>('');

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const renderTaskRef = useRef<any>(null);

  // Load PDF document from Base64 Data URL
  useEffect(() => {
    let isCancelled = false;
    setIsLoading(true);
    setErrorMsg('');
    setPageNum(1);
    setPdfDoc(null);

    const loadPdf = async () => {
      try {
        if (!dataUrl) {
          throw new Error('بيانات مستند PDF مفقودة.');
        }

        let bytes: Uint8Array;
        if (dataUrl.startsWith('data:')) {
          const parts = dataUrl.split(',');
          const base64Data = parts.length > 1 ? parts[1] : parts[0];
          const binaryString = atob(base64Data);
          bytes = new Uint8Array(binaryString.length);
          for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
          }
        } else {
          const response = await fetch(dataUrl, { cache: 'no-store' });
          if (!response.ok) throw new Error('تعذر قراءة بيانات مستند PDF.');
          bytes = new Uint8Array(await response.arrayBuffer());
        }

        const loadingTask = pdfjsLib.getDocument({ data: bytes });
        const doc = await loadingTask.promise;

        if (isCancelled) return;

        setPdfDoc(doc);
        setNumPages(doc.numPages);
        setIsLoading(false);
      } catch (err: any) {
        console.error('Failed to load PDF with PDF.js:', err);
        if (!isCancelled) {
          setErrorMsg(err.message || 'تعذر تحميل صفحات مستند PDF.');
          setIsLoading(false);
        }
      }
    };

    loadPdf();

    return () => {
      isCancelled = true;
    };
  }, [dataUrl]);

  // Render current page onto Canvas
  useEffect(() => {
    if (!pdfDoc || !canvasRef.current) return;

    let isPageCancelled = false;

    const renderPage = async () => {
      try {
        // Cancel previous render task if active
        if (renderTaskRef.current) {
          renderTaskRef.current.cancel();
          renderTaskRef.current = null;
        }

        const page = await pdfDoc.getPage(pageNum);
        if (isPageCancelled || !canvasRef.current) return;

        const viewport = page.getViewport({ scale });
        const canvas = canvasRef.current;
        const context = canvas.getContext('2d');

        if (!context) return;

        // Support high-DPI retina displays
        const outputScale = window.devicePixelRatio || 1;
        canvas.width = Math.floor(viewport.width * outputScale);
        canvas.height = Math.floor(viewport.height * outputScale);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;

        const transform = outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : undefined;

        const renderContext = {
          canvasContext: context,
          viewport,
          transform,
        };

        const renderTask = page.render(renderContext);
        renderTaskRef.current = renderTask;

        await renderTask.promise;
        renderTaskRef.current = null;
      } catch (err: any) {
        if (err?.name !== 'RenderingCancelledException') {
          console.error('PDF page render error:', err);
        }
      }
    };

    renderPage();

    return () => {
      isPageCancelled = true;
      if (renderTaskRef.current) {
        renderTaskRef.current.cancel();
        renderTaskRef.current = null;
      }
    };
  }, [pdfDoc, pageNum, scale]);

  const handlePrevPage = () => {
    setPageNum((prev) => Math.max(prev - 1, 1));
  };

  const handleNextPage = () => {
    setPageNum((prev) => Math.min(prev + 1, numPages));
  };

  const handleZoomIn = () => setScale((prev) => Math.min(prev + 0.25, 3.0));
  const handleZoomOut = () => setScale((prev) => Math.max(prev - 0.25, 0.5));
  const handleResetZoom = () => setScale(1.2);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-slate-300 space-y-3">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
        <p className="text-xs font-semibold">جاري معالجة وقراءة صفحات مستند PDF...</p>
      </div>
    );
  }

  if (errorMsg) {
    return (
      <div className="text-center p-8 bg-slate-900/90 border border-slate-800 rounded-2xl max-w-md space-y-3 text-white">
        <AlertTriangle className="w-8 h-8 text-amber-400 mx-auto" />
        <h4 className="text-sm font-bold">تعذر عرض مستند PDF داخل العارض</h4>
        <p className="text-xs text-slate-400">{errorMsg}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center w-full h-full space-y-3 overflow-hidden">
      {/* Controls Bar for Page & Zoom */}
      <div className="bg-slate-900/90 border border-slate-800/80 rounded-xl px-3 py-2 flex items-center justify-between gap-3 text-xs text-slate-200 shrink-0 shadow-md w-full max-w-3xl">
        {/* Page Navigation */}
        <div className="flex items-center gap-1.5 font-mono">
          <button
            type="button"
            onClick={handlePrevPage}
            disabled={pageNum <= 1}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 cursor-pointer"
            title="الصفحة السابقة"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <span className="px-2 font-bold text-emerald-400">
            صفحة {pageNum} من {numPages}
          </span>
          <button
            type="button"
            onClick={handleNextPage}
            disabled={pageNum >= numPages}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 cursor-pointer"
            title="الصفحة التالية"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
        </div>

        {/* Zoom Controls */}
        <div className="flex items-center gap-1 bg-slate-800/80 p-1 rounded-lg border border-slate-700/60 font-mono">
          <button
            type="button"
            onClick={handleZoomOut}
            className="p-1 rounded hover:bg-slate-700 text-slate-300 hover:text-white cursor-pointer"
            title="تصغير الصفحة"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <span className="px-1.5 text-[11px] text-emerald-400 font-bold">
            {Math.round(scale * 100)}%
          </span>
          <button
            type="button"
            onClick={handleZoomIn}
            className="p-1 rounded hover:bg-slate-700 text-slate-300 hover:text-white cursor-pointer"
            title="تكبير الصفحة"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={handleResetZoom}
            className="p-1 rounded hover:bg-slate-700 text-slate-300 hover:text-white cursor-pointer"
            title="إعادة الحجم الافتراضي"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Canvas Viewport Scroll Container */}
      <div className="flex-1 w-full overflow-auto flex items-start justify-center p-2 rounded-xl bg-slate-950/60 border border-slate-800/60">
        <canvas
          ref={canvasRef}
          className="shadow-2xl rounded-lg bg-white border border-slate-700 transition-all duration-150"
        />
      </div>
    </div>
  );
};
