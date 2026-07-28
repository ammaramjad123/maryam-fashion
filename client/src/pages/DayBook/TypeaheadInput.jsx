import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { apiFetch } from '../../lib/api.js';

/**
 * Async type-ahead cell. Talks to a Phase-3 search endpoint, shows a dropdown,
 * ArrowUp/Down to highlight, Enter/Tab/click to select.
 *
 * The dropdown is rendered in a PORTAL with fixed positioning so it is never
 * clipped by the grid's horizontal-scroll container (`overflow-x-auto` also
 * clips vertically, which used to hide the dropdown on the last/trailing row).
 *
 * Keyboard contract (so the grid feels like a spreadsheet):
 *  - dropdown OPEN + Enter  → select highlighted, then onAfterSelect() (advance cell)
 *  - dropdown OPEN + Tab    → select highlighted, let native Tab advance
 *  - dropdown CLOSED + Enter→ onEnterCommit() (commit the row)
 *  - Esc                    → close dropdown, else onEsc()
 */
export default function TypeaheadInput({
  value, // display text of the current selection
  endpoint, // e.g. '/products/search'
  buildQuery = (q) => `q=${encodeURIComponent(q)}`,
  renderItem,
  onSelect, // (item) => void
  onClear, // () => void  (field emptied)
  onEnterCommit, // () => void
  onEsc,
  onAfterSelect, // () => void  (advance focus to next cell)
  placeholder,
  inputRef,
  allowEmpty = false,
  align = 'left',
  uppercase = false, // force-uppercase the typed text (product codes)
  onResolveText, // (text) => void  — on blur/Tab/Enter, resolve typed text w/o the dropdown
  title,
}) {
  const [text, setText] = useState(value ?? '');
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState([]);
  const [highlight, setHighlight] = useState(0);
  const [loading, setLoading] = useState(false);
  const [rect, setRect] = useState(null); // input box position for the portal
  const boxRef = useRef(null);
  const dirtyRef = useRef(false); // text changed since last selection?

  // Held in a ref so its (per-render) identity can't retrigger the search effect
  // below — otherwise every re-render (e.g. an ArrowDown highlight change) would
  // re-run the search and reset the highlight back to the first option.
  const buildQueryRef = useRef(buildQuery);
  buildQueryRef.current = buildQuery;

  useEffect(() => {
    setText(value ?? '');
  }, [value]);

  // Debounced search. Runs ONLY when the query (`text`) changes — not on every
  // render — so ArrowUp/ArrowDown move the highlight without re-fetching.
  useEffect(() => {
    if (!dirtyRef.current) return;
    const q = text.trim();
    if (!q) {
      setOptions([]);
      setOpen(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const data = await apiFetch(`${endpoint}?${buildQueryRef.current(q)}`);
        if (cancelled) return;
        setOptions(data.items || []);
        setHighlight(0); // a NEW query starts at the top; arrows move from here
        setOpen(true);
      } catch {
        if (!cancelled) setOptions([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [text, endpoint]);

  // While the dropdown is open, keep it positioned under the input even as the
  // page/grid scrolls — the portal is fixed to the viewport.
  useEffect(() => {
    if (!open) return;
    const measure = () => boxRef.current && setRect(boxRef.current.getBoundingClientRect());
    measure();
    window.addEventListener('scroll', measure, true);
    window.addEventListener('resize', measure);
    return () => {
      window.removeEventListener('scroll', measure, true);
      window.removeEventListener('resize', measure);
    };
  }, [open]);

  function choose(item, advance) {
    dirtyRef.current = false;
    setOpen(false);
    setOptions([]);
    onSelect(item);
    if (advance) onAfterSelect?.();
  }

  function handleKeyDown(e) {
    if (open && options.length) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlight((h) => (h + 1) % options.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlight((h) => (h - 1 + options.length) % options.length);
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        choose(options[highlight], true);
        return;
      }
      if (e.key === 'Tab') {
        choose(options[highlight], false); // select, let native Tab advance
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        setOpen(false);
        return;
      }
    } else {
      if (e.key === 'Enter') {
        e.preventDefault();
        // Resolve a typed value against known items first (no dropdown needed);
        // only commit the row if there was nothing to resolve.
        if (onResolveText && dirtyRef.current && text.trim() !== '') {
          dirtyRef.current = false;
          onResolveText(text.trim());
          return;
        }
        onEnterCommit?.();
        return;
      }
      if (e.key === 'Escape') {
        onEsc?.();
        return;
      }
    }
  }

  function handleBlur() {
    // Close after a tick so a click on an option registers first.
    setTimeout(() => setOpen(false), 120);
    if (!dirtyRef.current) return; // a dropdown selection already handled it
    const q = text.trim();
    if (q === '') {
      if (allowEmpty) {
        dirtyRef.current = false;
        onClear?.();
      }
      return;
    }
    // Typed text and tabbed/clicked away → resolve it (auto-select on exact match).
    if (onResolveText) {
      dirtyRef.current = false;
      onResolveText(q);
    }
  }

  const showDropdown = open && (loading || options.length > 0) && rect;

  return (
    <div className="relative" ref={boxRef}>
      <input
        ref={inputRef}
        value={text}
        placeholder={placeholder}
        title={title}
        onChange={(e) => {
          dirtyRef.current = true;
          const v = uppercase ? e.target.value.toUpperCase() : e.target.value;
          setText(v);
          if (v.trim() === '') onClear?.();
        }}
        onKeyDown={handleKeyDown}
        onFocus={() => {
          if (options.length) setOpen(true);
        }}
        onBlur={handleBlur}
        className={`w-full bg-transparent px-1.5 py-1 text-[13px] outline-none focus:bg-amber-50/70 ${
          align === 'right' ? 'text-right' : ''
        }`}
        autoComplete="off"
        spellCheck={false}
      />
      {showDropdown &&
        createPortal(
          <ul
            // Fixed to the viewport (via a portal) so the grid's overflow
            // container can't clip it — the old bug on the last row.
            style={{
              position: 'fixed',
              top: rect.bottom + 2,
              left: rect.left,
              minWidth: rect.width,
              zIndex: 60,
            }}
            className="max-h-56 w-max overflow-auto rounded border border-stone-300 bg-white py-1 text-[13px] shadow-lg"
          >
            {loading && options.length === 0 && (
              <li className="px-2 py-1 text-stone-400">Searching…</li>
            )}
            {options.map((item, i) => (
              <li
                key={item._id}
                // onMouseDown (not onClick) so it fires before input blur.
                onMouseDown={(e) => {
                  e.preventDefault();
                  choose(item, true);
                }}
                onMouseEnter={() => setHighlight(i)}
                className={`cursor-pointer border-l-2 px-2 py-1 text-stone-800 ${
                  i === highlight
                    ? 'border-amber-500 bg-amber-100'
                    : 'border-transparent hover:bg-stone-100'
                }`}
              >
                {renderItem(item)}
              </li>
            ))}
          </ul>,
          document.body
        )}
    </div>
  );
}
