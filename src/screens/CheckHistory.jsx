import { useState, useEffect } from 'react';
import { dbHelpers } from '../database/db';
import './ProgressStyles.css';

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

  useEffect(() => {
    loadEvents();
  }, []);

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
    const diffTime = now - date;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
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

  const filteredEvents = events.filter(event => 
    event.event_description.toLowerCase().includes(searchTerm.toLowerCase()) ||
    event.situation.title.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getEventStats = () => {
    const totalEvents = events.length;
    const totalXpGained = events.reduce((sum, event) => sum + Math.max(0, event.xp_change), 0);
    const totalXpLost = events.reduce((sum, event) => sum + Math.min(0, event.xp_change), 0);
    const avgXpPerEvent = totalEvents > 0 ? (events.reduce((sum, event) => sum + event.xp_change, 0) / totalEvents).toFixed(1) : 0;
    
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
            <div className="stat-value" style={{ color: '#28a745' }}>+{stats.totalXpGained}</div>
            <div className="stat-label">XP Gained</div>
          </div>
          <div className="stat-item">
            <div className="stat-value" style={{ color: '#dc3545' }}>{stats.totalXpLost}</div>
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

      {/* Search */}
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
                    style={getXpChangeStyle(event.xp_change)}
                  >
                    {event.xp_change > 0 ? '+' : ''}{event.xp_change} XP
                  </span>
                  <div className="expand-icon">
                    {isExpanded ? '▼' : '▶'}
                  </div>
                </div>
              </div>

              <div className="event-preview">
                <p>{truncateDescription(event.event_description)}</p>
                <div 
                  className="choice-indicator"
                  style={{ backgroundColor: choiceColor }}
                >
                  {CHOICE_LABELS[event.choice_value]}
                </div>
              </div>

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
                          style={getXpChangeStyle(event.xp_change)}
                        >
                          {event.xp_change > 0 ? '+' : ''}{event.xp_change}
                        </span>
                      </div>
                    </div>
                  </div>

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