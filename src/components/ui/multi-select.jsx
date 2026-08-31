import React, { useState, useRef, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { cn } from '@/lib/utils';
import { Check, ChevronDown, X } from 'lucide-react';

const MultiSelect = ({ value = [], onValueChange, placeholder, options = [], className }) => {
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);
  const [dropdownStyle, setDropdownStyle] = useState({});

  useEffect(() => {
    let mouseInsideDropdown = false;
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    const handleMouseEnter = () => { mouseInsideDropdown = true; };
    const handleMouseLeave = () => { mouseInsideDropdown = false; };
    const handleScroll = () => {
      if (!mouseInsideDropdown) setOpen(false);
    };
    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
      window.addEventListener('scroll', handleScroll, true);
      // Attach mouse events to dropdown
      const dropdown = document.getElementById('multi-select-dropdown');
      if (dropdown) {
        dropdown.addEventListener('mouseenter', handleMouseEnter);
        dropdown.addEventListener('mouseleave', handleMouseLeave);
      }
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('scroll', handleScroll, true);
      const dropdown = document.getElementById('multi-select-dropdown');
      if (dropdown) {
        dropdown.removeEventListener('mouseenter', handleMouseEnter);
        dropdown.removeEventListener('mouseleave', handleMouseLeave);
      }
    };
  }, [open]);

  useEffect(() => {
    if (open && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      setDropdownStyle({
        position: 'fixed',
        top: rect.bottom + 4,
        left: rect.left,
        width: rect.width,
      });
    }
  }, [open]);

  const toggleValue = (val) => {
    if (value.includes(val)) {
      onValueChange(value.filter(v => v !== val));
    } else {
      onValueChange([...value, val]);
    }
  };

  const clearAll = (e) => {
    e.stopPropagation();
    onValueChange([]);
  };

  const displayText = () => {
    if (value.length === 0) return null;
    if (value.length === 1) {
      const opt = options.find(o => o.value === value[0]);
      return opt?.label || value[0];
    }
    return `${value.length} selecionados`;
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={cn(
          'flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
          className
        )}
      >
        <span className={cn('line-clamp-1 text-left', !displayText() && 'text-muted-foreground')}>
          {displayText() || placeholder}
        </span>
        <div className="flex items-center gap-1 ml-1 shrink-0">
          {value.length > 0 && (
            <span
              onClick={clearAll}
              className="rounded-full p-0.5 hover:bg-slate-200 transition-colors"
            >
              <X className="h-3.5 w-3.5 text-slate-400 hover:text-slate-600" />
            </span>
          )}
          <ChevronDown className={cn('h-4 w-4 opacity-50 transition-transform', open && 'rotate-180')} />
        </div>
      </button>

      {open && ReactDOM.createPortal(
        <div
          id="multi-select-dropdown"
          style={dropdownStyle}
          className="z-[9999] min-w-[8rem] overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md animate-in fade-in-0 zoom-in-95"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="max-h-60 overflow-y-auto p-1">
            {options.length === 0 && (
              <div className="px-3 py-2 text-sm text-muted-foreground">Nenhuma opção</div>
            )}
            {options.map((opt) => {
              const isSelected = value.includes(opt.value);
              return (
                <div
                  key={opt.value}
                  onClick={() => toggleValue(opt.value)}
                  className={cn(
                    'relative flex w-full cursor-pointer select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none hover:bg-accent hover:text-accent-foreground',
                    isSelected && 'bg-accent/50'
                  )}
                >
                  <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
                    {isSelected && <Check className="h-4 w-4 text-purple-600" />}
                  </span>
                  <span className={opt.className}>{opt.label}</span>
                </div>
              );
            })}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export { MultiSelect };
