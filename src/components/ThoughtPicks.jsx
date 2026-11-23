import { useState, useMemo } from 'react';
import './ThoughtPicks.css';

const INLINE = 3;
const CHIP_CHARS = 25;

const truncate = t => (t.length > CHIP_CHARS ? t.slice(0, CHIP_CHARS).trimEnd() + '…' : t);

// Count badge for Backs, held/used badge for Forths. Shown only when ≥1.
function Badge({ option, side }) {
  if (side === 'back') return option.count >= 1 ? <span className="tp-badge">·{option.count}</span> : null;
  return option.used >= 1 ? <span className="tp-badge">✓{option.held}/{option.used}</span> : null;
}

// Top 3 inline; a selected item outside them replaces the third chip.
function inlineOptions(options, selectedId) {
  const top = options.slice(0, INLINE);
  if (selectedId && !top.some(o => o.id === selectedId)) {
    const sel = options.find(o => o.id === selectedId);
    if (sel) top[Math.min(INLINE, top.length) - 1] = sel;
  }
  return top;
}

function PickSheet({ title, side, options, selectedId, onSelect, onCreate, onClose }) {
  const [query, setQuery] = useState('');
  const [newText, setNewText] = useState('');
  const [creating, setCreating] = useState(false);
  const q = query.trim().toLowerCase();
  const shown = q ? options.filter(o => o.text.toLowerCase().includes(q)) : options;

  const create = async () => {
    if (!newText.trim() || creating) return;
    setCreating(true);
    try {
      await onCreate(newText.trim());
      onClose();
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="tp-sheet-backdrop" onClick={onClose}>
      <div className="tp-sheet" role="dialog" aria-label={title} onClick={e => e.stopPropagation()}>
        <div className="tp-sheet-head">
          <strong>{title}</strong>
          <button type="button" className="tp-close" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <input
          className="form-input tp-search"
          type="text"
          placeholder="Search…"
          value={query}
          autoFocus
          onChange={e => setQuery(e.target.value)}
        />
        <div className="tp-sheet-list">
          {shown.map(o => (
            <button
              type="button"
              key={o.id}
              className={`tp-sheet-row${o.id === selectedId ? ' selected' : ''}`}
              onClick={() => { onSelect(o.id); onClose(); }}
            >
              <span className="tp-sheet-text">{o.text}</span>
              <Badge option={o} side={side} />
            </button>
          ))}
          {shown.length === 0 && <div className="tp-empty">No matches</div>}
        </div>
        <div className="tp-new">
          <input
            className="form-input"
            type="text"
            placeholder={side === 'back' ? 'New pulling thought…' : 'New answer…'}
            value={newText}
            onChange={e => setNewText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); create(); } }}
          />
          <button type="button" className="btn btn-secondary tp-new-btn" onClick={create} disabled={!newText.trim() || creating}>
            + new
          </button>
        </div>
      </div>
    </div>
  );
}

function PickRow({ label, side, options, selectedId, onSelect, onCreate }) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const inline = inlineOptions(options, selectedId);
  const moreCount = options.length - INLINE;

  return (
    <div className="tp-row">
      <div className="form-label tp-label">{label}</div>
      <div className="tp-chips">
        {inline.map(o => {
          const selected = o.id === selectedId;
          return (
            <button
              type="button"
              key={o.id}
              className={`tp-chip tp-${side}${selected ? ' selected' : ''}`}
              aria-pressed={selected}
              title={o.text}
              onClick={() => onSelect(selected ? null : o.id)}
            >
              <span className="tp-chip-text">{truncate(o.text)}</span>
              <Badge option={o} side={side} />
            </button>
          );
        })}
        {moreCount > 0 ? (
          <button type="button" className="tp-chip tp-more" onClick={() => setSheetOpen(true)}>
            More ({moreCount})
          </button>
        ) : (
          // ≤3 thoughts: no "More", but a small "+" opens the same sheet to add one
          <button type="button" className="tp-chip tp-plus" onClick={() => setSheetOpen(true)} aria-label="Add a thought" title="Add a thought">
            +
          </button>
        )}
      </div>
      {sheetOpen && (
        <PickSheet
          title={label}
          side={side}
          options={options}
          selectedId={selectedId}
          onSelect={onSelect}
          onCreate={onCreate}
          onClose={() => setSheetOpen(false)}
        />
      )}
    </div>
  );
}

/**
 * Two optional pick rows (spec §2.2). `stats` comes from buildThoughtStats.
 * onCreate(side, text) must create the pair and return its id.
 */
export function ThoughtPickRows({ stats, backId, forthId, onChangeBack, onChangeForth, onCreate }) {
  const backOptions = useMemo(() => stats.backOptions(), [stats]);
  const forthOptions = useMemo(() => stats.forthOptions(backId), [stats, backId]);

  return (
    <div className="thought-picks">
      <PickRow
        label="What was pulling at you?"
        side="back"
        options={backOptions}
        selectedId={backId}
        onSelect={onChangeBack}
        onCreate={async text => onChangeBack(await onCreate('back', text))}
      />
      <PickRow
        label="What did you answer with?"
        side="forth"
        options={forthOptions}
        selectedId={forthId}
        onSelect={onChangeForth}
        onCreate={async text => onChangeForth(await onCreate('forth', text))}
      />
    </div>
  );
}

const CAP = 5;
const archivedMark = a => (a ? ' (archived)' : '');

/** Collapsible "Thoughts" accordion (spec §2.3). Hidden when nothing was picked. */
export function ThoughtsView({ stats }) {
  const [open, setOpen] = useState(false);
  const [allBacks, setAllBacks] = useState(false);
  const [allSolo, setAllSolo] = useState(false);
  const view = useMemo(() => (stats.anyPick ? stats.thoughtsView() : null), [stats]);
  if (!view) return null;

  const backs = allBacks ? view.backs : view.backs.slice(0, CAP);
  const solo = allSolo ? view.solo : view.solo.slice(0, CAP);

  return (
    <div className="tp-accordion thoughts-view">
      <button type="button" className="tp-acc-head" aria-expanded={open} onClick={() => setOpen(o => !o)}>
        <span>💭 Thoughts</span>
        <span>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="tp-acc-body">
          {backs.map(b => (
            <div key={b.id} className="tv-line">
              <div><strong>{b.text}{archivedMark(b.archived)}</strong> · Appeared {b.appeared} · Held {b.held}</div>
              {b.best && (
                <div className="tv-sub">Best answer: {b.best.text}{archivedMark(b.best.archived)} ({b.best.held}/{b.best.used})</div>
              )}
              {b.noAnswer && <div className="tv-sub tv-neutral">No answer has held yet.</div>}
            </div>
          ))}
          {!allBacks && view.backs.length > CAP && (
            <button type="button" className="tp-showall" onClick={() => setAllBacks(true)}>Show all ({view.backs.length})</button>
          )}
          {view.solo.length > 0 && (
            <>
              <div className="tv-section">Answers on their own</div>
              {solo.map(f => (
                <div key={f.id} className="tv-line">{f.text}{archivedMark(f.archived)} ({f.held}/{f.used})</div>
              ))}
              {!allSolo && view.solo.length > CAP && (
                <button type="button" className="tp-showall" onClick={() => setAllSolo(true)}>Show all ({view.solo.length})</button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
