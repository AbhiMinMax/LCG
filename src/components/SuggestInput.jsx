import { useState, useMemo, useRef, useId } from 'react';
import './SuggestInput.css';

const MAX_SUGGESTIONS = 8;

/**
 * Text input (or textarea) with a dropdown of past values.
 *
 * `suggestions` should already be ordered most recent first. On focus the
 * most recent entries are shown; as the user types, the list narrows to
 * entries containing the typed text (case-insensitive).
 * The user can pick one (click, or arrow keys + Enter) or keep typing.
 */
export default function SuggestInput({
  value,
  onChange,
  suggestions = [],
  multiline = false,
  className = '',
  ...inputProps
}) {
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const blurTimer = useRef(null);
  const listId = useId();

  const matches = useMemo(() => {
    // Empty field: show the most recent entries as soon as the box is focused
    const query = value.trim().toLowerCase();
    const seen = new Set();
    const out = [];
    for (const s of suggestions) {
      if (typeof s !== 'string') continue;
      const text = s.trim();
      const key = text.toLowerCase();
      if (!text || seen.has(key)) continue;
      seen.add(key);
      // Nothing to suggest if it's exactly what's already typed
      if (query && key === query) continue;
      if (!query || key.includes(query)) out.push(text);
      if (out.length >= MAX_SUGGESTIONS) break;
    }
    return out;
  }, [value, suggestions]);

  const showList = open && matches.length > 0;

  const pick = (text) => {
    onChange(text);
    setOpen(false);
    setHighlight(-1);
  };

  const handleKeyDown = (e) => {
    if (!showList) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight(h => (h + 1) % matches.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight(h => (h <= 0 ? matches.length - 1 : h - 1));
    } else if (e.key === 'Enter' && highlight >= 0) {
      e.preventDefault();
      pick(matches[highlight]);
    } else if (e.key === 'Escape') {
      setOpen(false);
      setHighlight(-1);
    }
  };

  const Field = multiline ? 'textarea' : 'input';

  return (
    <div className="suggest-input">
      <Field
        {...inputProps}
        className={className}
        value={value}
        autoComplete="off"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={showList}
        aria-controls={listId}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setHighlight(-1);
        }}
        onFocus={() => {
          clearTimeout(blurTimer.current);
          setOpen(true);
        }}
        onBlur={() => {
          // Let a tap on a suggestion register before closing
          blurTimer.current = setTimeout(() => setOpen(false), 150);
        }}
        onKeyDown={handleKeyDown}
      />
      {showList && (
        <ul className="suggest-list" id={listId} role="listbox">
          {matches.map((text, i) => (
            <li
              key={text}
              role="option"
              aria-selected={i === highlight}
              className={`suggest-item${i === highlight ? ' active' : ''}${multiline ? ' multiline' : ''}`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(text)}
              onMouseEnter={() => setHighlight(i)}
            >
              {text}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
