/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * RAKAN BALANCE (راكان بلانس) — Independent Sticky Notes View
 * Personal memo cards completely decoupled from financial ledger
 */

import React, { useState } from 'react';
import { useApp } from '../context/AppContext.tsx';
import { StickyNoteModel } from '../domain/types.ts';
import {
  StickyNote,
  Plus,
  Trash2,
  Archive,
  RefreshCw,
  Edit2,
  X,
  Check,
} from 'lucide-react';

export const NotesView: React.FC = () => {
  const { notes, addNote, updateNote, deleteNote, toggleArchiveNote } = useApp();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingNote, setEditingNote] = useState<StickyNoteModel | null>(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [color, setColor] = useState<StickyNoteModel['color']>('emerald');
  const [statusFilter, setStatusFilter] = useState<'active' | 'archived'>('active');

  const filteredNotes = notes.filter((n) => (statusFilter === 'active' ? !n.archived : n.archived));

  const colors: Array<{ id: StickyNoteModel['color']; label: string; bgClass: string; borderClass: string }> = [
    { id: 'emerald', label: 'زمردي', bgClass: 'bg-emerald-50/80 dark:bg-emerald-950/40', borderClass: 'border-emerald-200 dark:border-emerald-800' },
    { id: 'amber', label: 'كهرماني', bgClass: 'bg-amber-50/80 dark:bg-amber-950/40', borderClass: 'border-amber-200 dark:border-amber-800' },
    { id: 'blue', label: 'أزرق', bgClass: 'bg-sky-50/80 dark:bg-sky-950/40', borderClass: 'border-sky-200 dark:border-sky-800' },
    { id: 'rose', label: 'وردي', bgClass: 'bg-rose-50/80 dark:bg-rose-950/40', borderClass: 'border-rose-200 dark:border-rose-800' },
    { id: 'purple', label: 'بنفسجي', bgClass: 'bg-purple-50/80 dark:bg-purple-950/40', borderClass: 'border-purple-200 dark:border-purple-800' },
    { id: 'slate', label: 'رمادي', bgClass: 'bg-slate-50 dark:bg-slate-800/40', borderClass: 'border-slate-200 dark:border-slate-700' },
  ];

  const openAddModal = () => {
    setEditingNote(null);
    setTitle('');
    setContent('');
    setColor('emerald');
    setIsModalOpen(true);
  };

  const openEditModal = (n: StickyNoteModel) => {
    setEditingNote(n);
    setTitle(n.title);
    setContent(n.content);
    setColor(n.color);
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() && !content.trim()) return;

    if (editingNote) {
      await updateNote({
        ...editingNote,
        title: title.trim() || 'ملاحظة بدون عنوان',
        content: content.trim(),
        color,
      });
    } else {
      await addNote({
        title: title.trim() || 'ملاحظة بدون عنوان',
        content: content.trim(),
        color,
        archived: false,
      });
    }
    setIsModalOpen(false);
  };

  return (
    <div className="space-y-5" dir="rtl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">
            الملاحظات والمذكرات المستقلة
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            مذكرات شخصية لحفظ الأفكار والمتابعات دون أي تأثير محاسبي على الأرصدة
          </p>
        </div>

        <button
          type="button"
          onClick={openAddModal}
          className="py-2 px-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs flex items-center gap-1.5 shadow-sm shadow-emerald-600/30 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>إضافة ملاحظة جديدة</span>
        </button>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-2">
        <div className="flex items-center p-0.5 bg-slate-100 dark:bg-slate-800 rounded-lg text-xs font-medium">
          <button
            type="button"
            onClick={() => setStatusFilter('active')}
            className={`px-3 py-1 rounded-md transition-colors cursor-pointer ${
              statusFilter === 'active'
                ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-xs'
                : 'text-slate-500'
            }`}
          >
            الملاحظات النشطة ({notes.filter((n) => !n.archived).length})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('archived')}
            className={`px-3 py-1 rounded-md transition-colors cursor-pointer ${
              statusFilter === 'archived'
                ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-xs'
                : 'text-slate-500'
            }`}
          >
            المؤرشفة ({notes.filter((n) => n.archived).length})
          </button>
        </div>
      </div>

      {/* Notes Grid */}
      {filteredNotes.length === 0 ? (
        <div className="p-12 text-center rounded-2xl border border-dashed border-slate-300 dark:border-slate-800 text-slate-400 text-xs">
          لا توجد ملاحظات {statusFilter === 'active' ? 'نشطة' : 'مؤرشفة'} حالياً.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredNotes.map((note) => {
            const colConfig = colors.find((c) => c.id === note.color) || colors[0];
            return (
              <div
                key={note.id}
                className={`p-4 rounded-2xl border shadow-xs flex flex-col justify-between transition-all ${colConfig.bgClass} ${colConfig.borderClass}`}
              >
                <div>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100 line-clamp-1">
                      {note.title}
                    </h3>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => openEditModal(note)}
                        className="p-1 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                        title="تعديل"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleArchiveNote(note.id)}
                        className="p-1 rounded text-slate-400 hover:text-amber-600 cursor-pointer"
                        title={note.archived ? 'استعادة' : 'أرشفة'}
                      >
                        {note.archived ? (
                          <RefreshCw className="w-3.5 h-3.5" />
                        ) : (
                          <Archive className="w-3.5 h-3.5" />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteNote(note.id)}
                        className="p-1 rounded text-slate-400 hover:text-rose-600 cursor-pointer"
                        title="حذف"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <p className="text-xs text-slate-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed">
                    {note.content}
                  </p>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-200/50 dark:border-slate-800/50 text-[10px] text-slate-400 font-mono">
                  {new Date(note.createdAt).toLocaleDateString('ar-SA')}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add / Edit Note Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl overflow-hidden p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                {editingNote ? 'تعديل الملاحظة' : 'إضافة ملاحظة جديدة'}
              </h3>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  عنوان الملاحظة:
                </label>
                <input
                  type="text"
                  placeholder="عنوان مختصر..."
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full h-10 px-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-xs text-slate-900 dark:text-slate-100"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  نص الملاحظة:
                </label>
                <textarea
                  rows={4}
                  placeholder="اكتب تفاصيل الملاحظة هنا..."
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  className="w-full p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-xs text-slate-900 dark:text-slate-100"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  لون البطاقة:
                </label>
                <div className="flex items-center gap-2">
                  {colors.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setColor(c.id)}
                      className={`w-6 h-6 rounded-full border-2 transition-transform cursor-pointer flex items-center justify-center ${
                        c.bgClass
                      } ${color === c.id ? 'border-slate-900 dark:border-white scale-110 shadow-sm' : 'border-transparent'}`}
                      title={c.label}
                    >
                      {color === c.id && <Check className="w-3 h-3 text-slate-800 dark:text-slate-100" />}
                    </button>
                  ))}
                </div>
              </div>

              <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="py-1.5 px-3 rounded-xl text-xs text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="py-1.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium cursor-pointer"
                >
                  حفظ الملاحظة
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
