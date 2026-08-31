import React, { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

const formatador = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** '1.234,56' → 1234.56 | '' → null */
const paraNumero = (texto) => {
  if (texto == null || texto === '') return null;
  if (typeof texto === 'number') return texto;
  const limpo = String(texto)
    .replace(/[^\d,.-]/g, '')
    .replace(/\./g, '')
    .replace(',', '.');
  if (limpo === '' || limpo === '-') return null;
  const n = Number(limpo);
  return Number.isNaN(n) ? null : n;
};

/**
 * Campo de valor em reais.
 *
 * Enquanto o campo está focado o usuário digita livre ("1234,56"); ao sair,
 * o valor é normalizado e exibido como "1.234,56". O `onChange` sempre
 * devolve um Number (ou null), nunca a string formatada.
 */
const CurrencyInput = ({ value, onChange, placeholder = '0,00', className, id, disabled, ...props }) => {
  const [texto, setTexto] = useState('');
  const [focado, setFocado] = useState(false);

  useEffect(() => {
    if (focado) return;
    setTexto(value == null || value === '' ? '' : formatador.format(Number(value)));
  }, [value, focado]);

  return (
    <div className="relative">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400 pointer-events-none">
        R$
      </span>
      <Input
        id={id}
        inputMode="decimal"
        disabled={disabled}
        value={texto}
        placeholder={placeholder}
        className={cn('pl-9 text-right tabular-nums', className)}
        onFocus={() => {
          setFocado(true);
          setTexto(value == null || value === '' ? '' : String(value).replace('.', ','));
        }}
        onChange={(e) => {
          setTexto(e.target.value);
          onChange?.(paraNumero(e.target.value));
        }}
        onBlur={() => {
          setFocado(false);
          const n = paraNumero(texto);
          onChange?.(n);
          setTexto(n == null ? '' : formatador.format(n));
        }}
        {...props}
      />
    </div>
  );
};

export { CurrencyInput, paraNumero };
export default CurrencyInput;
