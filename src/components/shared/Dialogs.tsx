import React, { useState, useEffect } from 'react';

// Common Alert Dialog for Errors or Warnings
export function AlertDialog({ 
  open, 
  title, 
  message, 
  onClose,
  type = 'error' 
}: { 
  open: boolean; 
  title?: string; 
  message: string; 
  onClose: () => void;
  type?: 'error' | 'warning';
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-white dark:bg-gray-900 p-8 rounded-3xl max-w-sm w-full space-y-6 text-center shadow-2xl animate-in zoom-in-95 duration-200 border border-gray-100 dark:border-gray-800">
        <div className={`w-20 h-20 mx-auto flex items-center justify-center rounded-full mb-2 animate-in zoom-in duration-300 shadow-inner
          ${type === 'error' ? 'bg-red-100 dark:bg-red-900/30 text-red-500' : 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-500'}`}>
          {type === 'error' ? (
            <svg className="w-10 h-10 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          ) : (
            <span className="text-4xl animate-bounce">⚠️</span>
          )}
        </div>
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">{title || (type === 'error' ? 'Error' : 'Warning')}</h2>
          <p className="text-sm text-gray-500 mt-2">{message}</p>
        </div>
        <button 
          className="w-full btn-secondary py-2.5 rounded-xl font-semibold bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700 transition-colors cursor-pointer" 
          onClick={onClose}>
          OK
        </button>
      </div>
    </div>
  );
}

// Common Confirm Dialog for YES/NO questions
export function ConfirmDialog({ 
  open, 
  title, 
  message, 
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  isDestructive = false,
  onConfirm,
  onCancel 
}: { 
  open: boolean; 
  title: string; 
  message: string; 
  confirmText?: string;
  cancelText?: string;
  isDestructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-white dark:bg-gray-900 p-8 rounded-3xl max-w-sm w-full space-y-6 text-center shadow-2xl animate-in zoom-in-95 duration-200 border border-gray-100 dark:border-gray-800">
        <div className={`w-20 h-20 mx-auto flex items-center justify-center rounded-full mb-2 animate-in zoom-in duration-300 shadow-inner
          ${isDestructive ? 'bg-red-50 dark:bg-red-900/20 text-red-500' : 'bg-blue-50 dark:bg-blue-900/20 text-blue-500'}`}>
          <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">{title}</h2>
          <p className="text-sm text-gray-500 mt-2">{message}</p>
        </div>
        <div className="flex gap-3 pt-2">
          <button 
            className="flex-1 py-2.5 rounded-xl font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700 transition-colors cursor-pointer" 
            onClick={onCancel}>
            {cancelText}
          </button>
          <button 
            className={`flex-1 py-2.5 rounded-xl font-semibold shadow-sm transition-colors text-white ${isDestructive ? 'bg-red-500 hover:bg-red-600' : 'bg-teal-500 hover:bg-teal-600'}`} 
            onClick={onConfirm}>
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}

// Common Prompt Dialog for user input
export function PromptDialog({ 
  open, 
  title, 
  message, 
  placeholder = '',
  initialValue = '',
  type = 'text',
  onConfirm,
  onCancel 
}: { 
  open: boolean; 
  title: string; 
  message: string; 
  placeholder?: string;
  initialValue?: string;
  type?: 'text' | 'password';
  onConfirm: (val: string) => void;
  onCancel: () => void;
}) {
  const [val, setVal] = useState(initialValue);

  // Reset value when dialog opens
  useEffect(() => {
    if (open) setVal(initialValue);
  }, [open, initialValue]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-white dark:bg-gray-900 p-8 rounded-3xl max-w-sm w-full space-y-6 shadow-2xl animate-in zoom-in-95 duration-200 border border-gray-100 dark:border-gray-800">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <span>✏️</span> {title}
          </h2>
          {message && <p className="text-sm text-gray-500 mt-2">{message}</p>}
        </div>
        <div>
          <input 
            type={type} 
            className="input w-full" 
            placeholder={placeholder} 
            value={val} 
            onChange={e => setVal(e.target.value)} 
            autoFocus
            onKeyDown={e => e.key === 'Enter' && onConfirm(val)}
          />
        </div>
        <div className="flex gap-3 pt-2">
          <button 
            className="flex-1 py-2.5 rounded-xl font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700 transition-colors cursor-pointer" 
            onClick={onCancel}>
            Cancel
          </button>
          <button 
            className="btn-primary flex-1 py-2.5" 
            onClick={() => onConfirm(val)}>
            Submit
          </button>
        </div>
      </div>
    </div>
  );
}
