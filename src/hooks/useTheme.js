import { useEffect, useState } from 'react';

const KEY = (id) => `theme_${id}`;

export function applyTheme(theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark');
}

// Aplica o último tema salvo imediatamente ao carregar (evita flash na tela de login)
function applyLastSavedTheme() {
  const entry = Object.keys(localStorage).find(k => k.startsWith('theme_'));
  if (entry) applyTheme(localStorage.getItem(entry));
}
applyLastSavedTheme();

export function useTheme(userId) {
  const [theme, setThemeState] = useState(() => {
    if (!userId) return 'light';
    return localStorage.getItem(KEY(userId)) || 'light';
  });

  useEffect(() => {
    if (!userId) return;
    const saved = localStorage.getItem(KEY(userId)) || 'light';
    setThemeState(saved);
    applyTheme(saved);
  }, [userId]);

  const setTheme = (value) => {
    setThemeState(value);
    if (userId) localStorage.setItem(KEY(userId), value);
    applyTheme(value);
  };

  return { theme, setTheme };
}
