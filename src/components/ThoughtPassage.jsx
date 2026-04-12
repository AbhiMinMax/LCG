import { useState } from 'react';

/**
 * Renders a single thought as a beautiful, collapsible book-passage quote.
 * type: 'back' (negative/limiting) | 'forth' (positive/empowering)
 * defaultExpanded: override auto-collapse logic (auto: short=expanded, long=collapsed)
 */
export function ThoughtPassage({ thought, type = 'back', defaultExpanded }) {
  const isLong = thought.length > 160 || thought.includes('\n');
  const startExpanded = defaultExpanded !== undefined ? defaultExpanded : !isLong;
  const [expanded, setExpanded] = useState(startExpanded);

  const isBack = type === 'back';
  const accentColor = isBack ? '#c62828' : '#1565c0';
  const softBg = isBack
    ? 'rgba(220, 53, 69, 0.045)'
    : 'rgba(21, 101, 192, 0.045)';

  const firstLine = thought.split('\n')[0];
  const preview =
    firstLine.length > 88
      ? firstLine.substring(0, 88).trimEnd() + '\u2026'
      : firstLine + (thought.includes('\n') ? '\u2026' : '');

  return (
    <div
      style={{
        borderLeft: `3px solid ${accentColor}`,
        background: softBg,
        borderRadius: '0 8px 8px 0',
        overflow: 'hidden',
      }}
    >
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        aria-expanded={expanded}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          width: '100%',
          background: 'none',
          border: 'none',
          padding: '9px 12px 7px 12px',
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        <span style={{ flexShrink: 0, fontSize: '0.6rem', color: accentColor, lineHeight: 1 }}>
          {expanded ? '▼' : '▶'}
        </span>

        {!expanded ? (
          <span
            style={{
              fontStyle: 'italic',
              fontFamily: 'Georgia, "Palatino Linotype", serif',
              fontSize: '0.88rem',
              color: 'var(--text-secondary, #666)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              flex: 1,
              lineHeight: '1.4',
            }}
          >
            {preview}
          </span>
        ) : (
          <span style={{ fontSize: '0.72rem', color: accentColor, opacity: 0.75, fontWeight: 600 }}>
            collapse
          </span>
        )}
      </button>

      {expanded && (
        <blockquote
          style={{
            margin: 0,
            padding: '0 16px 12px 14px',
            fontStyle: 'italic',
            fontFamily: 'Georgia, "Palatino Linotype", "Book Antiqua", serif',
            fontSize: '0.93rem',
            lineHeight: '1.85',
            color: 'var(--text-primary, #333)',
            whiteSpace: 'pre-wrap',
            letterSpacing: '0.008em',
            borderLeft: 'none',
          }}
        >
          {thought}
        </blockquote>
      )}
    </div>
  );
}

/**
 * Renders a paired back + forth thought together as a visual unit.
 * Either back or forth can be omitted (solo thought).
 */
export function ThoughtPair({ backThought, forthThought, defaultExpanded }) {
  const hasBoth = backThought && forthThought;

  return (
    <div
      style={{
        border: hasBoth ? '1px solid rgba(100,100,100,0.12)' : 'none',
        borderRadius: '10px',
        padding: hasBoth ? '10px 10px 8px 10px' : '0',
        marginBottom: '12px',
        background: hasBoth ? 'rgba(0,0,0,0.015)' : 'transparent',
      }}
    >
      {backThought && (
        <ThoughtPassage thought={backThought} type="back" defaultExpanded={defaultExpanded} />
      )}

      {hasBoth && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            margin: '4px 0',
            paddingLeft: '6px',
          }}
        >
          <div style={{ width: '20px', height: '1px', background: 'var(--border-color)' }} />
          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', userSelect: 'none' }}>
            countered by
          </span>
          <div style={{ flex: 1, height: '1px', background: 'var(--border-color)' }} />
        </div>
      )}

      {forthThought && (
        <ThoughtPassage thought={forthThought} type="forth" defaultExpanded={defaultExpanded} />
      )}
    </div>
  );
}

export default ThoughtPassage;
