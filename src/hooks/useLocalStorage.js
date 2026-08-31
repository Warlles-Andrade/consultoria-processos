import { useEffect, useRef, useState } from 'react';

export function useLocalStorage(key, initialValue) {
  const [storedValue, setStoredValue] = useState(() => {
    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch {
      return initialValue;
    }
  });

  const setValue = (value) => {
    try {
      const valueToStore = value instanceof Function ? value(storedValue) : value;
      setStoredValue(valueToStore);
      window.localStorage.setItem(key, JSON.stringify(valueToStore));
    } catch {
      // silently ignore write errors
    }
  };

  return [storedValue, setValue];
}

/**
 * Igual ao useLocalStorage mas usa sessionStorage.
 * Dados são descartados quando o tab é fechado — ideal para rascunhos
 * de formulários que não devem persistir entre sessões.
 */
export function useSessionStorage(key, initialValue) {
  const initialValueRef = useRef(initialValue);
  initialValueRef.current = initialValue;

  const [storedValue, setStoredValue] = useState(() => {
    try {
      const item = window.sessionStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch {
      return initialValue;
    }
  });

  useEffect(() => {
    try {
      const item = window.sessionStorage.getItem(key);
      setStoredValue(item ? JSON.parse(item) : initialValueRef.current);
    } catch {
      setStoredValue(initialValueRef.current);
    }
  }, [key]);

  const setValue = (value) => {
    try {
      const valueToStore = value instanceof Function ? value(storedValue) : value;
      setStoredValue(valueToStore);
      window.sessionStorage.setItem(key, JSON.stringify(valueToStore));
    } catch {
      // silently ignore write errors
    }
  };

  const removeValue = () => {
    try {
      window.sessionStorage.removeItem(key);
      setStoredValue(initialValueRef.current);
    } catch {
      // silently ignore
    }
  };

  return [storedValue, setValue, removeValue];
}
