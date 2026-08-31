import React, { useState, useRef, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { Settings, KeyRound, Sun, Moon, Check } from 'lucide-react';
import { useTheme } from '@/hooks/useTheme';

const SettingsMenu = ({ isCollapsed, onChangePasswordRequest, userId }) => {
  const [open, setOpen]   = useState(false);
  const { theme, setTheme } = useTheme(userId);
  const btnRef            = useRef(null);
  const dropRef           = useRef(null);
  const [rect, setRect]   = useState(null);

  const handleToggle = () => {
    if (!open && btnRef.current) setRect(btnRef.current.getBoundingClientRect());
    setOpen(o => !o);
  };

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (dropRef.current?.contains(e.target) || btnRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const portal = rect && open ? ReactDOM.createPortal(
    <div
      ref={dropRef}
      style={{
        position: 'fixed',
        top: rect.top - 8,
        left: rect.left,
        width: Math.max(rect.width, 220),
        transform: 'translateY(-100%)',
        zIndex: 99999,
      }}
      className="rounded-xl bg-white border border-slate-200 shadow-2xl overflow-hidden"
    >
      {/* Alterar Senha */}
      <button
        onClick={() => { setOpen(false); onChangePasswordRequest(); }}
        className="w-full flex items-center gap-3 px-4 py-3 text-sm text-slate-700 hover:bg-purple-50 hover:text-purple-700 transition-colors"
      >
        <KeyRound className="h-4 w-4 flex-shrink-0" />
        <span className="font-medium">Alterar Senha</span>
      </button>

      <div className="border-t border-slate-100" />

      {/* Tema Claro */}
      <button
        onClick={() => setTheme('light')}
        className={`w-full flex items-center gap-3 px-4 py-3 text-sm transition-colors
          ${theme === 'light' ? 'bg-purple-50 text-purple-700' : 'text-slate-700 hover:bg-slate-50'}`}
      >
        <Sun className="h-4 w-4 flex-shrink-0" />
        <span className="font-medium flex-1 text-left">Tema Claro</span>
        {theme === 'light' && <Check className="h-3.5 w-3.5 text-purple-600" />}
      </button>

      {/* Tema Escuro */}
      <button
        onClick={() => setTheme('dark')}
        className={`w-full flex items-center gap-3 px-4 py-3 text-sm transition-colors rounded-b-xl
          ${theme === 'dark' ? 'bg-purple-50 text-purple-700' : 'text-slate-700 hover:bg-slate-50'}`}
      >
        <Moon className="h-4 w-4 flex-shrink-0" />
        <span className="font-medium flex-1 text-left">Tema Escuro</span>
        {theme === 'dark' && <Check className="h-3.5 w-3.5 text-purple-600" />}
      </button>
    </div>,
    document.body
  ) : null;

  return (
    <div className="px-4 pb-2">
      <button
        ref={btnRef}
        onClick={handleToggle}
        title={isCollapsed ? 'Configurações' : ''}
        className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl
          bg-white/60 hover:bg-slate-100 text-gray-700 hover:text-slate-900
          border border-white/60 transition-all duration-200
          ${isCollapsed ? 'justify-center' : ''}
          ${open ? 'bg-slate-100' : ''}`}
      >
        <Settings className={`h-5 w-5 flex-shrink-0 transition-transform duration-300 ${open ? 'rotate-90' : ''}`} />
        {!isCollapsed && (
          <span className="font-medium text-sm whitespace-nowrap flex-1 text-left">Configurações</span>
        )}
      </button>
      {portal}
    </div>
  );
};

export default SettingsMenu;
