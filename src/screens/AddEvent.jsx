import { useState, useEffect, useMemo } from 'react';
import { dbHelpers } from '../database/db';
import { ThoughtPair } from '../components/ThoughtPassage';

const CHOICE_OPTIONS = [
  { value: 1, label: 'Misguided Action', xp: -3, color: '#dc3545' },
  { value: 2, label: 'Didnt Try', xp: -2, color: '#fd7e14' },
  { value: 3, label: 'Tried', xp: 2, color: '#28a745' },
  { value: 4, label: 'Well Done!', xp: 5, color: '#007bff' }
];

function AddEvent() {
  const [situations, setSituations] = useState([]);
  const [filteredSituations, setFilteredSituations] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSituation, setSelectedSituation] = useState('');
  const [eventTitle, setEventTitle] = useState('');
  const [eventDescription, setEventDescription] = useState('');
  const [selectedChoice, setSelectedChoice] = useState('');
  const [affectedOpportunities, setAffectedOpportunities] = useState([]);
  const [currentSituation, setCurrentSituation] = useState(null);
  const [dynamicXpEnabled, setDynamicXpEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [lastResult, setLastResult] = useState(null);
  const [pastSuccesses, setPastSuccesses] = useState([]);
  const [pastFailures, setPastFailures] = useState([]);
  const [successesExpanded, setSuccessesExpanded] = useState(false);
  const [failuresExpanded, setFailuresExpanded] = useState(false);

  useEffect(() => {
    loadSituations();
    loadDynamicXpConfig();
  }, []);

  const loadDynamicXpConfig = async () => {
    try {
      const dynamicXp = await dbHelpers.getConfig('dynamicXpEnabled', false);
      setDynamicXpEnabled(dynamicXp);
    } catch (error) {
      console.error('Error loading dynamic XP config:', error);
    }
  };

  useEffect(() => {
    const loadSituationData = async () => {
      try {
        const sitId = parseInt(selectedSituation);
        const [opportunities, successes, failures] = await Promise.all([
          dbHelpers.getOpportunitiesForSituation(sitId),
          dbHelpers.getEventsForSituation(sitId, [3, 4]),
          dbHelpers.getEventsForSituation(sitId, [1, 2]),
        ]);
        setAffectedOpportunities(opportunities);
        setCurrentSituation(situations.find(s => s.id === sitId));
        setPastSuccesses(successes);
        setPastFailures(failures);
        setSuccessesExpanded(false);
        setFailuresExpanded(false);

        // Reload dynamic XP config to ensure it's current
        await loadDynamicXpConfig();
      } catch (error) {
        console.error('Error loading situation data:', error);
      }
    };

    if (selectedSituation) {
      loadSituationData();
    } else {
      setAffectedOpportunities([]);
      setCurrentSituation(null);
      setPastSuccesses([]);
      setPastFailures([]);
    }
  }, [selectedSituation, situations]);

  const loadSituations = async () => {
    try {
      const situationsData = await dbHelpers.getSituationsWithOpportunities();
      const sorted = [...situationsData].sort((a, b) => a.title.localeCompare(b.title));
      setSituations(sorted);
      setFilteredSituations(sorted);
    } catch (error) {
      console.error('Error loading situations:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSearchChange = (e) => {
    const query = e.target.value.toLowerCase();
    setSearchQuery(query);
    
    if (!query.trim()) {
      setFilteredSituations(situations);
      return;
    }
    
    const filtered = situations
      .filter(situation =>
        situation.title.toLowerCase().includes(query) ||
        situation.description.toLowerCase().includes(query) ||
        (situation.tags && situation.tags.some(tag => tag.toLowerCase().includes(query)))
      )
      .sort((a, b) => a.title.localeCompare(b.title));

    setFilteredSituations(filtered);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!selectedSituation || !eventDescription.trim() || !selectedChoice) {
      alert('Please fill in all required fields');
      return;
    }

    setSubmitting(true);
    
    try {
      const result = await dbHelpers.addEvent(
        parseInt(selectedSituation),
        eventDescription.trim(),
        parseInt(selectedChoice),
        eventTitle.trim() || null
      );

      setLastResult(result);
      setShowSuccess(true);
      
      // Reset form
      setSelectedSituation('');
      setEventTitle('');
      setEventDescription('');
      setSelectedChoice('');
      setAffectedOpportunities([]);
      setCurrentSituation(null);

      // Hide success message after 3 seconds
      setTimeout(() => setShowSuccess(false), 3000);
      
    } catch (error) {
      console.error('Error adding event:', error);
      alert('Error saving event. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = () => {
    setSelectedSituation('');
    setEventTitle('');
    setEventDescription('');
    setSelectedChoice('');
    setAffectedOpportunities([]);
    setCurrentSituation(null);
    setPastSuccesses([]);
    setPastFailures([]);
    setSuccessesExpanded(false);
    setFailuresExpanded(false);
    setSearchQuery('');
    setFilteredSituations(situations);
  };

  const formatEventDate = (timestamp) => {
    const date = new Date(timestamp);
    const now = new Date();
    const dateOnly = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const todayOnly = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const diffDays = Math.floor((todayOnly - dateOnly) / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return `Today at ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    if (diffDays === 1) return `Yesterday at ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    if (diffDays < 7) return `${diffDays} days ago`;
    return date.toLocaleDateString();
  };

  const currentXp = useMemo(() => {
    if (!selectedChoice) return 0;
    const choice = CHOICE_OPTIONS.find(opt => opt.value === parseInt(selectedChoice));
    if (!choice) return 0;
    
    let xp = choice.xp;
    
    // Apply dynamic XP calculation if enabled and we have a situation
    if (dynamicXpEnabled && currentSituation && currentSituation.challenging_level) {
      const multiplier = Math.max(1.0, currentSituation.challenging_level / 3); // Base level 3 = 1x, minimum 1x
      xp = Math.round(xp * multiplier);
    }
    
    return xp;
  }, [selectedChoice, dynamicXpEnabled, currentSituation]);

  const getChoiceXp = () => {
    return currentXp;
  };

  if (loading) {
    return (
      <div className="screen">
        <div className="card">
          <p>Loading situations...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="screen">
      <h2>📝 Add Life Event</h2>
      
      {showSuccess && lastResult && (
        <div className="card success-card">
          <h3>✅ Event Added Successfully!</h3>
          <p>
            <strong>XP Change:</strong> {lastResult.xpChange > 0 ? '+' : ''}{lastResult.xpChange}
            {lastResult.challengingLevel && lastResult.challengingLevel !== 3 && (
              <span style={{fontSize: '0.9em', marginLeft: '8px', color: '#666'}}>
                (Challenging Level: {lastResult.challengingLevel}/5)
              </span>
            )}
          </p>
          <div>
            <strong>Affected Opportunities:</strong>
            <ul>
              {lastResult.updatedOpportunities.map(opp => (
                <li key={opp.id}>
                  {opp.title}: Level {opp.current_level} ({opp.current_xp}/100 XP)
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {dynamicXpEnabled && currentSituation && currentSituation.challenging_level !== 3 && (
        <div className="card" style={{background: '#f8f9fa', border: '1px solid #e9ecef'}}>
          <div style={{display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px'}}>
            <span style={{fontSize: '1.2em'}}>⚡</span>
            <strong style={{color: '#495057'}}>Dynamic XP Active</strong>
          </div>
          <p style={{margin: '0', fontSize: '0.9em', color: '#6c757d'}}>
            XP rewards are being multiplied by {Math.max(1.0, currentSituation.challenging_level / 3).toFixed(1)}x due to this situation's challenging level ({currentSituation.challenging_level}/5).
          </p>
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div className="card">
          <div className="form-group">
            <label htmlFor="search" className="form-label">
              Search Situations
            </label>
            <input
              id="search"
              type="text"
              className="form-input"
              placeholder="Search by title, description, or tags..."
              value={searchQuery}
              onChange={handleSearchChange}
            />
          </div>
          
          <div className="form-group">
            <label htmlFor="situation" className="form-label">
              Life Situation * {filteredSituations.length !== situations.length && `(${filteredSituations.length} of ${situations.length})`}
            </label>
            <select
              id="situation"
              className="form-select"
              value={selectedSituation}
              onChange={(e) => setSelectedSituation(e.target.value)}
              required
            >
              <option value="">Select a situation...</option>
              {filteredSituations.map(situation => (
                <option key={situation.id} value={situation.id}>
                  {situation.title} {situation.tags && situation.tags.length > 0 && `[${situation.tags.join(', ')}]`}
                </option>
              ))}
            </select>
            {filteredSituations.length === 0 && searchQuery && (
              <div style={{fontSize: '0.9em', color: '#666', marginTop: '8px'}}>
                No situations found matching "{searchQuery}"
              </div>
            )}
          </div>

          {selectedSituation && (
            <div className="form-group">
              <label className="form-label">Situation Description</label>
              <div style={{
                padding: '12px',
                backgroundColor: '#f8f9fa',
                border: '1px solid #e9ecef',
                borderRadius: '6px',
                fontSize: '0.95em',
                color: '#495057',
                lineHeight: '1.5'
              }}>
                {filteredSituations.find(s => s.id === parseInt(selectedSituation))?.description}
              </div>
            </div>
          )}

          <div className="form-group">
            <label htmlFor="title" className="form-label">
              Event Title
            </label>
            <input
              id="title"
              type="text"
              className="form-input"
              value={eventTitle}
              onChange={(e) => setEventTitle(e.target.value)}
              placeholder="Optional: Give this event a custom title..."
            />
            <div style={{fontSize: '0.85em', color: '#666', marginTop: '4px'}}>
              Leave blank to auto-generate based on your response choice
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="description" className="form-label">
              Event Description *
            </label>
            <textarea
              id="description"
              className="form-input form-textarea"
              value={eventDescription}
              onChange={(e) => setEventDescription(e.target.value)}
              placeholder="Describe what happened in this situation..."
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">Your Response Choice *</label>
            <div className="choice-group">
              {CHOICE_OPTIONS.map(choice => (
                <label
                  key={choice.value}
                  className={`choice-option ${selectedChoice === choice.value.toString() ? 'selected' : ''}`}
                >
                  <input
                    type="radio"
                    name="choice"
                    value={choice.value}
                    checked={selectedChoice === choice.value.toString()}
                    onChange={(e) => setSelectedChoice(e.target.value)}
                    className="choice-radio"
                  />
                  <div className="choice-content">
                    <div className="choice-label">{choice.label}</div>
                    <div 
                      className="choice-xp" 
                      style={{ color: choice.color }}
                    >
                      {(() => {
                        // Use the same calculation as currentXp but for this specific choice
                        if (selectedChoice === choice.value.toString()) {
                          return `${currentXp > 0 ? '+' : ''}${currentXp} XP`;
                        } else {
                          let displayXp = choice.xp;
                          if (dynamicXpEnabled && currentSituation && currentSituation.challenging_level) {
                            const multiplier = Math.max(1.0, currentSituation.challenging_level / 3);
                            displayXp = Math.round(choice.xp * multiplier);
                          }
                          return `${displayXp > 0 ? '+' : ''}${displayXp} XP`;
                        }
                      })()}
                      {dynamicXpEnabled && currentSituation && currentSituation.challenging_level !== 3 && (
                        <span style={{fontSize: '0.8em', marginLeft: '4px', opacity: 0.7}}>
                          (×{Math.max(1.0, currentSituation.challenging_level / 3).toFixed(1)})
                        </span>
                      )}
                    </div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {currentSituation && (currentSituation.back_thoughts?.length > 0 || currentSituation.forth_thoughts?.length > 0) && (
            <div className="form-group">
              <label className="form-label">💭 Common Thoughts in This Situation</label>
              <div style={{ marginBottom: '4px', display: 'flex', gap: '16px', fontSize: '0.78rem', color: 'var(--text-muted, #888)' }}>
                {currentSituation.back_thoughts?.length > 0 && <span>😈 Unhelpful</span>}
                {currentSituation.forth_thoughts?.length > 0 && <span>😇 Helpful</span>}
              </div>
              {Array.from({
                length: Math.max(
                  currentSituation.back_thoughts?.length || 0,
                  currentSituation.forth_thoughts?.length || 0
                )
              }, (_, i) => (
                <ThoughtPair
                  key={i}
                  backThought={currentSituation.back_thoughts?.[i]}
                  forthThought={currentSituation.forth_thoughts?.[i]}
                />
              ))}
            </div>
          )}

          {/* Past Successes Collapsible */}
          {selectedSituation && (
            <div style={{ marginTop: '16px', border: '1px solid #28a74533', borderRadius: '8px', overflow: 'hidden' }}>
              <button
                type="button"
                onClick={() => setSuccessesExpanded(e => !e)}
                style={{
                  width: '100%',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '12px 16px',
                  background: '#28a74511',
                  border: 'none',
                  cursor: 'pointer',
                  fontWeight: 600,
                  fontSize: '0.95em',
                  color: '#28a745',
                  textAlign: 'left'
                }}
              >
                <span>Past Successes ({pastSuccesses.length})</span>
                <span>{successesExpanded ? '▼' : '▶'}</span>
              </button>
              {successesExpanded && (
                <div style={{ padding: '12px 16px' }}>
                  {pastSuccesses.length === 0 ? (
                    <p style={{ color: '#666', fontSize: '0.9em', margin: 0 }}>No past successes for this situation yet.</p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      {pastSuccesses.map(event => (
                        <div key={event.id} style={{ borderLeft: '3px solid #28a745', paddingLeft: '12px', fontSize: '0.9em' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                            <strong style={{ color: event.choice_value === 4 ? '#007bff' : '#28a745' }}>
                              {event.title}
                            </strong>
                            <span style={{ color: '#28a745', fontWeight: 600 }}>+{event.xp_change} XP</span>
                          </div>
                          <div style={{ color: '#666', marginBottom: '4px' }}>{formatEventDate(event.timestamp)}</div>
                          <p style={{ margin: '4px 0', color: '#333' }}>{event.event_description}</p>
                          {event.selected_back_thought && (
                            <div style={{ fontSize: '0.85em', color: '#dc3545', marginTop: '4px' }}>
                              Back thought: {event.selected_back_thought}
                            </div>
                          )}
                          {event.selected_forth_thought && (
                            <div style={{ fontSize: '0.85em', color: '#007bff', marginTop: '2px' }}>
                              Forth thought: {event.selected_forth_thought}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Past Failures Collapsible */}
          {selectedSituation && (
            <div style={{ marginTop: '12px', border: '1px solid #dc354533', borderRadius: '8px', overflow: 'hidden' }}>
              <button
                type="button"
                onClick={() => setFailuresExpanded(e => !e)}
                style={{
                  width: '100%',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '12px 16px',
                  background: '#dc354511',
                  border: 'none',
                  cursor: 'pointer',
                  fontWeight: 600,
                  fontSize: '0.95em',
                  color: '#dc3545',
                  textAlign: 'left'
                }}
              >
                <span>
                  Past Failures ({pastFailures.length})
                  {pastFailures.length >= 2 && (
                    <span style={{ marginLeft: '8px', fontSize: '0.85em', fontWeight: 400 }}>
                      — {pastFailures.length}-event pattern
                    </span>
                  )}
                </span>
                <span>{failuresExpanded ? '▼' : '▶'}</span>
              </button>
              {failuresExpanded && (
                <div style={{ padding: '12px 16px' }}>
                  {pastFailures.length === 0 ? (
                    <p style={{ color: '#666', fontSize: '0.9em', margin: 0 }}>No past failures for this situation.</p>
                  ) : (
                    <>
                      {affectedOpportunities.length > 0 && pastFailures.length >= 2 && (
                        <div style={{
                          background: '#fff3cd',
                          border: '1px solid #ffc107',
                          borderRadius: '6px',
                          padding: '10px 12px',
                          marginBottom: '12px',
                          fontSize: '0.88em',
                          color: '#856404'
                        }}>
                          You've failed here {pastFailures.length} time{pastFailures.length !== 1 ? 's' : ''}. Each failure costs XP across {affectedOpportunities.length} linked opportunit{affectedOpportunities.length !== 1 ? 'ies' : 'y'}: {affectedOpportunities.map(o => o.title).join(', ')}.
                        </div>
                      )}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {pastFailures.map(event => (
                          <div key={event.id} style={{ borderLeft: '3px solid #dc3545', paddingLeft: '12px', fontSize: '0.9em' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                              <strong style={{ color: event.choice_value === 1 ? '#dc3545' : '#fd7e14' }}>
                                {event.title}
                              </strong>
                              <span style={{ color: '#dc3545', fontWeight: 600 }}>{event.xp_change} XP</span>
                            </div>
                            <div style={{ color: '#666', marginBottom: '4px' }}>{formatEventDate(event.timestamp)}</div>
                            <p style={{ margin: '4px 0', color: '#333' }}>{event.event_description}</p>
                            {event.selected_back_thought && (
                              <div style={{ fontSize: '0.85em', color: '#dc3545', marginTop: '4px' }}>
                                Back thought: {event.selected_back_thought}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {affectedOpportunities.length > 0 && (
          <div className="card">
            <h3>🎯 Opportunities Affected</h3>
            <p>
              This event will {getChoiceXp() >= 0 ? 'add' : 'subtract'} <strong>{Math.abs(getChoiceXp())} XP</strong> to:
              {dynamicXpEnabled ? (
                currentSituation && currentSituation.challenging_level !== 3 && (
                  <span style={{fontSize: '0.9em', color: '#666', marginLeft: '8px'}}>
                    (Challenging Level {currentSituation.challenging_level}/5 applied)
                  </span>
                )
              ) : (
                <span style={{fontSize: '0.9em', color: '#999', marginLeft: '8px'}}>
                  (Base XP - Dynamic XP disabled)
                </span>
              )}
            </p>
            <ul>
              {affectedOpportunities.map(opp => (
                <li key={opp.id}>
                  <strong>{opp.title}</strong> (Level {opp.current_level}, {opp.current_xp}/100 XP)
                  <div style={{fontSize: '0.85em', color: '#666', marginTop: '2px'}}>
                    After this event: Level {opp.current_level}, {Math.max(0, Math.min(100, opp.current_xp + getChoiceXp()))}/100 XP
                    {opp.current_xp + getChoiceXp() >= 100 && (
                      <span style={{color: '#28a745', fontWeight: 'bold', marginLeft: '8px'}}>
                        🎉 LEVEL UP!
                      </span>
                    )}
                  </div>
                  {opp.tags && opp.tags.length > 0 && (
                    <div style={{fontSize: '0.8em', color: '#999', marginTop: '2px'}}>
                      Tags: {opp.tags.join(', ')}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="form-actions">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleCancel}
            disabled={submitting}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="btn btn-success"
            disabled={submitting || !selectedSituation || !eventDescription.trim() || !selectedChoice}
          >
            {submitting ? 'Adding...' : 'Add Event'}
          </button>
        </div>
      </form>
    </div>
  );
}

export default AddEvent;