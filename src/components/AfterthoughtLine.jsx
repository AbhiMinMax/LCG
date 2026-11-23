import { useState } from 'react';
import { formatAddedLater, formatLogicalShortDate } from '../utils/dayUtils';

const LIST_CAP = 5;

/**
 * Compact line showing hindsight from past events of the chosen situation
 * (spec §1.3). `events` must be this situation's events, newest first.
 * Renders nothing when no event has an afterthought.
 */
export default function AfterthoughtLine({ events, dayStartHour, choiceLabels }) {
  const [expanded, setExpanded] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const withAfterthought = events.filter(e => e.afterthought && e.afterthought.text);
  if (withAfterthought.length === 0) return null;

  const latest = withAfterthought[0];
  const more = withAfterthought.length - 1;
  const rows = showAll ? withAfterthought : withAfterthought.slice(0, LIST_CAP);

  return (
    <div className="afterthought-line" style={{ margin: '0 0 16px', fontSize: '0.9rem' }}>
      <button
        type="button"
        onClick={() => setExpanded(x => !x)}
        aria-expanded={expanded}
        style={{
          display: 'flex', alignItems: 'baseline', gap: 6, width: '100%', textAlign: 'left',
          background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', borderRadius: 6,
          padding: '8px 10px', cursor: 'pointer', color: 'var(--text-primary)',
        }}
      >
        <span style={{ flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          💭 {formatLogicalShortDate(latest.timestamp, dayStartHour)}: "{latest.afterthought.text}"
        </span>
        {more > 0 && (
          <span style={{ flexShrink: 0, color: 'var(--text-secondary)', fontSize: '0.8rem' }}>({more} more)</span>
        )}
      </button>

      {expanded && (
        <div style={{ border: '1px solid var(--border-color)', borderTop: 'none', borderRadius: '0 0 6px 6px', padding: '4px 10px' }}>
          {rows.map(ev => (
            <div key={ev.id} className="afterthought-row" style={{ padding: '6px 0', borderBottom: '1px solid var(--border-color)' }}>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                {formatLogicalShortDate(ev.timestamp, dayStartHour)} · {choiceLabels[ev.choice_value] || ''} · {formatAddedLater(ev.timestamp, ev.afterthought.written_at, dayStartHour)}
              </div>
              <div style={{ color: 'var(--text-primary)' }}>{ev.afterthought.text}</div>
            </div>
          ))}
          {!showAll && withAfterthought.length > LIST_CAP && (
            <button
              type="button"
              onClick={() => setShowAll(true)}
              style={{ background: 'none', border: 'none', color: 'var(--primary-color, #2196f3)', cursor: 'pointer', padding: '6px 0', fontSize: '0.85rem' }}
            >
              Show all ({withAfterthought.length})
            </button>
          )}
        </div>
      )}
    </div>
  );
}
