import { useState, useEffect } from 'react';
import { dbHelpers, ANTAGONIST_LEVEL_LABELS } from '../database/db';
import { ThoughtPassage } from '../components/ThoughtPassage';
import './ProgressStyles.css';

const fmtXp = (v) => parseFloat((v || 0).toFixed(2));

const CHOICE_LABELS = {
  1: 'Misguided Action',
  2: 'Didnt Try', 
  3: 'Did Try',
  4: 'Well Done!'
};

const CHOICE_COLORS = {
  1: '#dc3545',
  2: '#fd7e14',
  3: '#28a745', 
  4: '#007bff'
};

function CheckHistory() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedEvents, setExpandedEvents] = useState(new Set());
  const [searchTerm, setSearchTerm] = useState('');
  const [sortOrder, setSortOrder] = useState('desc');
  const [filterThoughts, setFilterThoughts] = useState(false);
  const [gameModeEnabled, setGameModeEnabled] = useState(false);
  const [openAntagonistPopover, setOpenAntagonistPopover] = useState(null); // eventId

  useEffect(() => {
    loadEvents();
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      const gameMode = await dbHelpers.getConfig('gameModeEnabled', false);
      setGameModeEnabled(gameMode);
    } catch (error) {
      console.error('Error loading config:', error);
    }
  };

  const loadEvents = async () => {
    try {
      const eventsData = await dbHelpers.getEventsWithDetails();
      setEvents(eventsData);
    } catch (error) {
      console.error('Error loading events:', error);
    } finally {
      setLoading(false);
    }
  };

  // Returns the XP value to display for an event:
  // In game mode, use game_xp_change if it was logged under game mode; fallback to xp_change for older events.
  const getDisplayXp = (event) => {
    if (gameModeEnabled && event.game_xp_change != null) return event.game_xp_change;
    return event.xp_change;
  };

  const handleDeleteEvent = async (eventId) => {
    if (!confirm('Delete this event? This cannot be undone.')) return;
    try {
      await dbHelpers.deleteEvent(eventId);
      setEvents(prev => prev.filter(e => e.id !== eventId));
    } catch (error) {
      console.error('Error deleting event:', error);
      alert('Error deleting event. Please try again.');
    }
  };

  const toggleEventExpansion = (eventId) => {
    const newExpanded = new Set(expandedEvents);
    if (newExpanded.has(eventId)) {
      newExpanded.delete(eventId);
    } else {
      newExpanded.add(eventId);
    }
    setExpandedEvents(newExpanded);
  };

  const formatTimestamp = (timestamp) => {
    const date = new Date(timestamp);
    const now = new Date();
    
    // Compare dates only (not times) for accurate day calculation
    const dateOnly = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const todayOnly = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const diffTime = todayOnly - dateOnly;
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) {
      return `Today at ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    } else if (diffDays === 1) {
      return `Yesterday at ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    } else if (diffDays < 7) {
      return `${diffDays} days ago`;
    } else {
      return date.toLocaleDateString();
    }
  };

  const getXpChangeStyle = (xpChange) => {
    return {
      color: xpChange >= 0 ? '#28a745' : '#dc3545',
      fontWeight: 'bold'
    };
  };

  const truncateDescription = (text, maxLength = 100) => {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  };

  const filteredEvents = events
    .filter(event =>
      event.event_description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      event.situation.title.toLowerCase().includes(searchTerm.toLowerCase())
    )
    .filter(event =>
      !filterThoughts || event.selected_back_thought || event.selected_forth_thought
    )
    .sort((a, b) => {
      switch (sortOrder) {
        case 'desc': return new Date(b.timestamp) - new Date(a.timestamp);
        case 'asc':  return new Date(a.timestamp) - new Date(b.timestamp);
        case 'xp_high': return getDisplayXp(b) - getDisplayXp(a);
        case 'xp_low':  return getDisplayXp(a) - getDisplayXp(b);
        case 'situation': return a.situation.title.localeCompare(b.situation.title);
        case 'choice': return b.choice_value - a.choice_value;
        default: return 0;
      }
    });

  const getEventStats = () => {
    const totalEvents = events.length;
    const totalXpGained = events.reduce((sum, event) => sum + Math.max(0, getDisplayXp(event)), 0);
    const totalXpLost = events.reduce((sum, event) => sum + Math.min(0, getDisplayXp(event)), 0);
    const avgXpPerEvent = totalEvents > 0 ? (events.reduce((sum, event) => sum + getDisplayXp(event), 0) / totalEvents).toFixed(2) : 0;

    return { totalEvents, totalXpGained, totalXpLost, avgXpPerEvent };
  };

  const stats = getEventStats();

  if (loading) {
    return (
      <div className="screen">
        <div className="card">
          <p>Loading history...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="screen">
      <h2>📋 Event History</h2>

      {/* Stats Summary */}
      <div className="card">
        <h3>📈 History Stats</h3>
        <div className="stats-grid">
          <div className="stat-item">
            <div className="stat-value">{stats.totalEvents}</div>
            <div className="stat-label">Total Events</div>
          </div>
          <div className="stat-item">
            <div className="stat-value" style={{ color: '#28a745' }}>+{fmtXp(stats.totalXpGained)}</div>
            <div className="stat-label">XP Gained</div>
          </div>
          <div className="stat-item">
            <div className="stat-value" style={{ color: '#dc3545' }}>{fmtXp(stats.totalXpLost)}</div>
            <div className="stat-label">XP Lost</div>
          </div>
        </div>
        <div className="avg-stat">
          <div className="stat-item">
            <div className="stat-value">{stats.avgXpPerEvent}</div>
            <div className="stat-label">Avg XP/Event</div>
          </div>
        </div>
      </div>

      {/* Search and Sort */}
      <div className="card">
        <div className="form-group">
          <label htmlFor="search" className="form-label">Search Events</label>
          <input
            id="search"
            type="text"
            className="form-input"
            placeholder="Search by description or situation..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="form-group">
          <label className="form-label">Filter</label>
          <button
            className={`btn ${filterThoughts ? 'btn-primary' : 'btn-secondary'}`}
            style={{ fontSize: '0.85em', padding: '6px 12px' }}
            onClick={() => setFilterThoughts(f => !f)}
          >
            💭 With Thoughts Only {filterThoughts ? `(${filteredEvents.length})` : ''}
          </button>
        </div>

        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">Sort By</label>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {[
              { key: 'desc',      label: 'Newest' },
              { key: 'asc',       label: 'Oldest' },
              { key: 'xp_high',   label: 'XP High' },
              { key: 'xp_low',    label: 'XP Low' },
              { key: 'situation', label: 'Situation' },
              { key: 'choice',    label: 'Response' },
            ].map(opt => (
              <button
                key={opt.key}
                className={`btn ${sortOrder === opt.key ? 'btn-primary' : 'btn-secondary'}`}
                style={{ fontSize: '0.85em', padding: '6px 12px' }}
                onClick={() => setSortOrder(opt.key)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Events List */}
      <div className="events-list">
        {filteredEvents.map(event => {
          const isExpanded = expandedEvents.has(event.id);
          const choiceColor = CHOICE_COLORS[event.choice_value];
          
          return (
            <div key={event.id} className="card event-card">
              <div 
                className="event-header"
                onClick={() => toggleEventExpansion(event.id)}
              >
                <div className="event-meta">
                  <div className="event-time">{formatTimestamp(event.timestamp)}</div>
                  <div className="event-situation">{event.situation.title}</div>
                </div>
                <div className="event-summary">
                  <span
                    className="xp-change"
                    style={getXpChangeStyle(getDisplayXp(event))}
                  >
                    {getDisplayXp(event) > 0 ? '+' : ''}{fmtXp(getDisplayXp(event))} XP
                  </span>
                  {gameModeEnabled && event.antagonistImpacts?.length > 0 && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setOpenAntagonistPopover(prev => prev === event.id ? null : event.id);
                      }}
                      title="Antagonist impacts"
                      style={{
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        fontSize: '0.85em',
                        padding: '2px 4px',
                        color: '#8b2020',
                        lineHeight: 1
                      }}
                    >
                      ⚔
                    </button>
                  )}
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDeleteEvent(event.id); }}
                    title="Delete event"
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      color: '#dc3545',
                      fontSize: '1em',
                      padding: '2px 6px',
                      borderRadius: '4px',
                      lineHeight: 1
                    }}
                  >
                    🗑️
                  </button>
                  <div className="expand-icon">
                    {isExpanded ? '▼' : '▶'}
                  </div>
                </div>
              </div>

              <div className="event-preview">
                <h4 className="event-title">{event.title || CHOICE_LABELS[event.choice_value]}</h4>
                <p>{truncateDescription(event.event_description)}</p>
                <div 
                  className="choice-indicator"
                  style={{ backgroundColor: choiceColor }}
                >
                  {CHOICE_LABELS[event.choice_value]}
                </div>
              </div>

              {/* Antagonist impact popover */}
              {openAntagonistPopover === event.id && event.antagonistImpacts?.length > 0 && (
                <div style={{ padding: '10px 14px', background: 'rgba(139,32,32,0.06)', borderTop: '1px solid rgba(139,32,32,0.2)', fontSize: '0.82rem' }}>
                  {event.antagonistImpacts.map((impact, i) => (
                    <div key={i} style={{ marginBottom: i < event.antagonistImpacts.length - 1 ? 8 : 0 }}>
                      <span style={{ fontWeight: 600, color: '#8b2020' }}>⚔ {impact.antagonistName}</span>
                      <span style={{ color: 'var(--text-secondary)', marginLeft: 6 }}>
                        Lv.{impact.levelAtTime} ({ANTAGONIST_LEVEL_LABELS[impact.levelAtTime] || ''})
                      </span>
                      <div style={{ marginTop: 2, color: impact.hpDelta < 0 ? '#27ae60' : '#c0392b' }}>
                        {impact.hpDelta < 0
                          ? `${Math.abs(impact.hpDelta)} damage dealt`
                          : `${impact.hpDelta} HP recovered`}
                        {impact.levelChanged && (
                          <span style={{ marginLeft: 8, color: impact.hpDelta < 0 ? '#27ae60' : '#c0392b', fontWeight: 600 }}>
                            → Lv.{impact.newLevel} ({ANTAGONIST_LEVEL_LABELS[impact.newLevel] || ''})
                          </span>
                        )}
                        {impact.defeated && <span style={{ marginLeft: 8, fontWeight: 700, color: '#27ae60' }}>Defeated!</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {isExpanded && (
                <div className="event-details">
                  <div className="detail-section">
                    <h4>📝 Full Description</h4>
                    <p>{event.event_description}</p>
                  </div>

                  <div className="detail-section">
                    <h4>🎯 Situation Details</h4>
                    <div className="situation-details">
                      <div className="detail-item">
                        <span className="detail-label">Situation:</span>
                        <span className="detail-value">{event.situation.title}</span>
                      </div>
                      <div className="detail-item">
                        <span className="detail-label">Response:</span>
                        <span 
                          className="detail-value"
                          style={{ color: choiceColor }}
                        >
                          {CHOICE_LABELS[event.choice_value]}
                        </span>
                      </div>
                      <div className="detail-item">
                        <span className="detail-label">XP Impact:</span>
                        <span
                          className="detail-value"
                          style={getXpChangeStyle(getDisplayXp(event))}
                        >
                          {getDisplayXp(event) > 0 ? '+' : ''}{fmtXp(getDisplayXp(event))}
                          {gameModeEnabled && event.game_xp_change == null && (
                            <span style={{ fontSize: '0.8em', color: '#999', marginLeft: '6px' }}>(pre-game mode)</span>
                          )}
                        </span>
                      </div>
                    </div>
                  </div>

                  {(event.selected_back_thought || event.selected_forth_thought) && (
                    <div className="detail-section">
                      <h4>💭 Thoughts During Event</h4>
                      {event.selected_back_thought && (
                        <div style={{ marginBottom: '8px' }}>
                          <div style={{ fontSize: '0.78rem', color: 'var(--danger)', fontWeight: 600, marginBottom: '4px' }}>
                            😈 Unhelpful thought
                          </div>
                          <ThoughtPassage thought={event.selected_back_thought} type="back" />
                        </div>
                      )}
                      {event.selected_forth_thought && (
                        <div>
                          <div style={{ fontSize: '0.78rem', color: '#2196f3', fontWeight: 600, marginBottom: '4px' }}>
                            😇 Helpful thought
                          </div>
                          <ThoughtPassage thought={event.selected_forth_thought} type="forth" />
                        </div>
                      )}
                    </div>
                  )}

                  <div className="detail-section">
                    <h4>📊 Affected Opportunities</h4>
                    <div className="affected-opportunities">
                      {event.affected_opportunities && event.affected_opportunities.length > 0 ? (
                        <div className="opportunities-count">
                          {event.affected_opportunities.length} opportunities affected
                        </div>
                      ) : (
                        <div className="no-opportunities">No opportunities linked</div>
                      )}
                    </div>
                  </div>

                  <div className="detail-section">
                    <h4>🕒 Timestamp</h4>
                    <p>{new Date(event.timestamp).toLocaleString()}</p>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {filteredEvents.length === 0 && !loading && (
        <div className="card empty-state">
          {searchTerm ? (
            <>
              <h3>No Events Found</h3>
              <p>No events match your search criteria.</p>
              <button 
                className="btn btn-secondary"
                onClick={() => setSearchTerm('')}
              >
                Clear Search
              </button>
            </>
          ) : (
            <>
              <h3>No Events Yet</h3>
              <p>Start adding life events to see your history here!</p>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default CheckHistory;