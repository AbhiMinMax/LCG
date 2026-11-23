import { useState, Fragment } from 'react';
import './ThoughtPicks.css';

const CAP = 5;

function Capped({ items, render }) {
  const [all, setAll] = useState(false);
  const shown = all ? items : items.slice(0, CAP);
  return (
    <>
      {shown.map(render)}
      {!all && items.length > CAP && (
        <button type="button" className="tp-showall" onClick={() => setAll(true)}>Show all ({items.length})</button>
      )}
    </>
  );
}

function Accordion({ title, className, children }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`tp-accordion ${className}`}>
      <button type="button" className="tp-acc-head" aria-expanded={open} onClick={() => setOpen(o => !o)}>
        <span>{title}</span>
        <span>{open ? '▲' : '▼'}</span>
      </button>
      {open && <div className="tp-acc-body">{children}</div>}
    </div>
  );
}

/** "Comes with" for the chosen situation (spec §4.6). Hidden when empty. */
export function ComesWith({ relations, titles }) {
  if (!relations) return null;
  const { before, after, sameDay, helps } = relations;
  if (!before.length && !after.length && !sameDay.length && !helps.length) return null;
  const t = id => titles[id] || 'Unknown';

  return (
    <Accordion title="🔗 Comes with" className="comes-with">
      {before.length > 0 && (
        <div className="cw-section">
          <div className="tv-section">Usually before this</div>
          <Capped items={before} render={c => (
            <div key={`b${c.from}`} className="tv-line">{t(c.from)} — {c.follows} of {c.n}</div>
          )} />
        </div>
      )}
      {after.length > 0 && (
        <div className="cw-section">
          <div className="tv-section">Often after this</div>
          <Capped items={after} render={c => (
            <div key={`a${c.to}`} className="tv-line">{t(c.to)} — {c.follows} of {c.n}</div>
          )} />
        </div>
      )}
      {sameDay.length > 0 && (
        <div className="cw-section">
          <div className="tv-section">Same day</div>
          <Capped items={sameDay} render={r => (
            <div key={`s${r.other}`} className="tv-line">{t(r.other)} — {r.days} days</div>
          )} />
        </div>
      )}
      {helps.length > 0 && (
        <div className="cw-section">
          <div className="tv-section">Helps</div>
          <Capped items={helps} render={h => (
            <div key={`h${h.from}`} className="tv-line">
              {t(h.from)} (done) — went well {h.withOk} of {h.withN} vs {h.withoutOk} of {h.withoutN} otherwise
            </div>
          )} />
        </div>
      )}
    </Accordion>
  );
}

function RoutePath({ path, titles, highlight }) {
  return (
    <span>
      {path.map((id, i) => (
        <Fragment key={id}>
          {i > 0 && ' → '}
          {id === highlight ? <strong>{titles[id] || 'Unknown'}</strong> : (titles[id] || 'Unknown')}
        </Fragment>
      ))}
    </span>
  );
}

/**
 * "Routes" accordion (spec §4.5). `groups` = [{ name, routes: [{path}] }].
 * A single group with no name is shown without a heading (antagonist card).
 */
export function Routes({ groups, titles, highlight = null }) {
  const nonEmpty = (groups || []).filter(g => g.routes.length > 0);
  if (nonEmpty.length === 0) return null;
  return (
    <Accordion title="🧭 Routes" className="routes-view">
      {nonEmpty.map(g => (
        <div key={g.name || 'routes'} className="route-group">
          {g.name && <div className="tv-section">⚔ {g.name}</div>}
          {g.routes.map(r => (
            <div key={r.path.join('>')} className="tv-line route-line">
              <RoutePath path={r.path} titles={titles} highlight={highlight} />
            </div>
          ))}
        </div>
      ))}
    </Accordion>
  );
}

/** Quiet line after logging (spec §4.6). Stays until dismissed. */
export function AfterLogLine({ text, onDismiss }) {
  if (!text) return null;
  return (
    <div className="after-log-line" role="status" style={{
      display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 12, padding: '8px 12px',
      border: '1px solid var(--border-color)', borderRadius: 6, background: 'var(--bg-tertiary)',
      color: 'var(--text-secondary)', fontSize: '0.88rem',
    }}>
      <span style={{ flex: 1 }}>🔗 {text}</span>
      <button type="button" onClick={onDismiss} aria-label="Dismiss" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: 0 }}>✕</button>
    </div>
  );
}
