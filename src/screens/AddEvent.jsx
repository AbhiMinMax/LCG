import { useState, useEffect, useMemo } from 'react';
import { dbHelpers, ANTAGONIST_LEVEL_LABELS } from '../database/db';
import { ThoughtPair } from '../components/ThoughtPassage';
import { getPathLevel, getRebirthInfo, PATHS, getRebirthSymbols, getNewRebirthSymbol } from '../utils/pathUtils';
import { setPendingEvent } from '../utils/animationState';

const CHOICE_OPTIONS = [
  { value: 1, label: 'Misguided Action', xp: -3, color: '#dc3545' },
  { value: 2, label: 'Didnt Try', xp: -2, color: '#fd7e14' },
  { value: 3, label: 'Tried', xp: 2, color: '#28a745' },
  { value: 4, label: 'Well Done!', xp: 5, color: '#007bff' }
];

// Game mode base XP (before real/meta doubling)
const GAME_BASE_XP = { 1: -5, 2: -2, 3: 4, 4: 10 };

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
  const [gameModeEnabled, setGameModeEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [lastResult, setLastResult] = useState(null);
  const [pastEventsByChoice, setPastEventsByChoice] = useState({ 1: [], 2: [], 3: [], 4: [] });
  const [expandedChoiceSection, setExpandedChoiceSection] = useState({});
  const [taggedAntagonists, setTaggedAntagonists] = useState([]);

  useEffect(() => {
    loadSituations();
    loadDynamicXpConfig();
  }, []);

  const loadDynamicXpConfig = async () => {
    try {
      const [dynamicXp, gameMode] = await Promise.all([
        dbHelpers.getConfig('dynamicXpEnabled', false),
        dbHelpers.getConfig('gameModeEnabled', false),
      ]);
      setDynamicXpEnabled(dynamicXp);
      setGameModeEnabled(gameMode);
    } catch (error) {
      console.error('Error loading XP config:', error);
    }
  };

  useEffect(() => {
    const loadSituationData = async () => {
      try {
        const sitId = parseInt(selectedSituation);
        const [opportunities, allPastEvents, activeAnts] = await Promise.all([
          dbHelpers.getOpportunitiesForSituation(sitId),
          dbHelpers.getEventsForSituation(sitId),
          dbHelpers.getAntagonists(),
        ]);
        setAffectedOpportunities(opportunities);
        setCurrentSituation(situations.find(s => s.id === sitId));
        const grouped = { 1: [], 2: [], 3: [], 4: [] };
        for (const ev of allPastEvents) {
          if (grouped[ev.choice_value]) grouped[ev.choice_value].push(ev);
        }
        setPastEventsByChoice(grouped);
        setExpandedChoiceSection({});
        setTaggedAntagonists(activeAnts.filter(a => (a.taggedSituationIds || []).includes(sitId)));

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
      setPastEventsByChoice({ 1: [], 2: [], 3: [], 4: [] });
      setTaggedAntagonists([]);
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

      // Store animation state for progress page (game mode only)
      if (gameModeEnabled) {
        const levelChanges = [];
        for (const updOpp of result.updatedOpportunities) {
          const prevOpp = affectedOpportunities.find(o => o.id === updOpp.id);
          if (prevOpp) {
            const prevLabel = getPathLevel(prevOpp.game_xp || 0, prevOpp.path || 'default').fullLabel;
            const newLabel  = getPathLevel(updOpp.game_xp || 0, updOpp.path || 'default').fullLabel;
            if (prevLabel !== newLabel) levelChanges.push({ oppId: updOpp.id, prevLabel });
          }
        }
        setPendingEvent(result.updatedOpportunities.map(o => o.id), levelChanges, result.antagonistImpacts || []);
      }

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
    setPastEventsByChoice({ 1: [], 2: [], 3: [], 4: [] });
    setExpandedChoiceSection({});
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

    if (gameModeEnabled) {
      let base = GAME_BASE_XP[choice.value] ?? 0;
      // Difficulty multiplier only when Dynamic XP is also enabled
      if (dynamicXpEnabled && currentSituation && currentSituation.challenging_level) {
        const multiplier = Math.max(1.0, currentSituation.challenging_level / 3);
        base = Math.round(base * multiplier);
      }
      const isReal = currentSituation && !currentSituation.isMeta;
      if (base > 0 && isReal) base *= 2;
      return base;
    }

    let xp = choice.xp;
    if (dynamicXpEnabled && currentSituation && currentSituation.challenging_level) {
      const multiplier = Math.max(1.0, currentSituation.challenging_level / 3);
      xp = Math.round(xp * multiplier);
    }
    return xp;
  }, [selectedChoice, gameModeEnabled, dynamicXpEnabled, currentSituation]);

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
              {CHOICE_OPTIONS.map(choice => {
                const isReal = currentSituation && !currentSituation.isMeta;
                // Compute display XP for this choice
                let displayXp;
                if (gameModeEnabled) {
                  let base = GAME_BASE_XP[choice.value] ?? 0;
                  // Difficulty multiplier only when Dynamic XP is also enabled
                  if (dynamicXpEnabled && currentSituation && currentSituation.challenging_level) {
                    const multiplier = Math.max(1.0, currentSituation.challenging_level / 3);
                    base = Math.round(base * multiplier);
                  }
                  if (base > 0 && isReal) base *= 2;
                  displayXp = base;
                } else if (selectedChoice === choice.value.toString()) {
                  displayXp = currentXp;
                } else {
                  displayXp = choice.xp;
                  if (dynamicXpEnabled && currentSituation && currentSituation.challenging_level) {
                    const multiplier = Math.max(1.0, currentSituation.challenging_level / 3);
                    displayXp = Math.round(choice.xp * multiplier);
                  }
                }
                const isDoubled = gameModeEnabled && isReal && GAME_BASE_XP[choice.value] > 0;
                return (
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
                      <div className="choice-xp" style={{ color: choice.color }}>
                        {displayXp > 0 ? '+' : ''}{displayXp} XP
                        {isDoubled && (
                          <span style={{ fontSize: '0.8em', marginLeft: '4px' }} title="Real situation — positive XP doubled">⚡</span>
                        )}
                        {!gameModeEnabled && dynamicXpEnabled && currentSituation && currentSituation.challenging_level !== 3 && (
                          <span style={{ fontSize: '0.8em', marginLeft: '4px', opacity: 0.7 }}>
                            (×{Math.max(1.0, currentSituation.challenging_level / 3).toFixed(1)})
                          </span>
                        )}
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>
            {gameModeEnabled && currentSituation && (
              <div style={{ fontSize: '0.82em', color: '#666', marginTop: '6px' }}>
                {currentSituation.isMeta ? '🪞 Meta situation — standard XP' : '🌍 Real situation — positive XP doubled ⚡'}
              </div>
            )}

            {/* Antagonist damage preview (game mode only) */}
            {gameModeEnabled && taggedAntagonists.length > 0 && (
              <div style={{ marginTop: 14, padding: '10px 12px', background: 'rgba(139,32,32,0.06)', border: '1px solid rgba(139,32,32,0.2)', borderRadius: 8 }}>
                {taggedAntagonists.map(ant => {
                  let previewXp = 0;
                  if (selectedChoice) {
                    let base = GAME_BASE_XP[parseInt(selectedChoice)] ?? 0;
                    if (dynamicXpEnabled && currentSituation?.challenging_level) {
                      base = Math.round(base * Math.max(1.0, currentSituation.challenging_level / 3));
                    }
                    if (base > 0 && !currentSituation?.isMeta) base *= 2;
                    previewXp = base;
                  }
                  const isDamage = previewXp > 0;
                  const isRecovery = previewXp < 0;
                  const choiceLabel = CHOICE_OPTIONS.find(c => c.value === parseInt(selectedChoice))?.label || '';
                  return (
                    <div key={ant.id} style={{ marginBottom: 6, fontSize: '0.82rem' }}>
                      <div style={{ fontWeight: 600, color: '#8b2020' }}>
                        ⚔ {ant.name} <span style={{ fontWeight: 400, color: 'var(--text-secondary)' }}>Lv.{ant.currentLevel} — {ANTAGONIST_LEVEL_LABELS[ant.currentLevel]}</span>
                      </div>
                      {selectedChoice ? (
                        <div style={{ marginTop: 2, color: isDamage ? '#27ae60' : isRecovery ? '#c0392b' : 'var(--text-secondary)', fontSize: '0.78rem' }}>
                          {choiceLabel} will {isDamage ? `deal ${previewXp} damage` : isRecovery ? `allow ${Math.abs(previewXp)} recovery` : 'have no effect'}
                        </div>
                      ) : (
                        <div style={{ marginTop: 2, color: 'var(--text-secondary)', fontSize: '0.78rem' }}>Select a choice to see damage</div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {currentSituation?.thought_pairs?.length > 0 && (
            <div className="form-group">
              <label className="form-label">💭 Common Thoughts in This Situation</label>
              {currentSituation.thought_pairs.map((pair, i) => (
                <ThoughtPair
                  key={i}
                  backThought={pair.back}
                  forthThought={pair.forth}
                />
              ))}
            </div>
          )}

          {/* Past Events by Choice Type */}
          {selectedSituation && [
            { value: 4, label: 'Well Done!',       color: '#007bff', border: '#007bff33', bg: '#007bff11' },
            { value: 3, label: 'Tried',             color: '#28a745', border: '#28a74533', bg: '#28a74511' },
            { value: 2, label: 'Didnt Try',         color: '#fd7e14', border: '#fd7e1433', bg: '#fd7e1411' },
            { value: 1, label: 'Misguided Action',  color: '#dc3545', border: '#dc354533', bg: '#dc354511' },
          ].map(({ value, label, color, border, bg }) => {
            const events = pastEventsByChoice[value] || [];
            const isExpanded = !!expandedChoiceSection[value];
            return (
              <div key={value} style={{ marginTop: '12px', border: `1px solid ${border}`, borderRadius: '8px', overflow: 'hidden' }}>
                <button
                  type="button"
                  onClick={() => setExpandedChoiceSection(s => ({ ...s, [value]: !s[value] }))}
                  style={{
                    width: '100%',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '12px 16px',
                    background: bg,
                    border: 'none',
                    cursor: 'pointer',
                    fontWeight: 600,
                    fontSize: '0.95em',
                    color,
                    textAlign: 'left'
                  }}
                >
                  <span>
                    {label} ({events.length})
                    {value <= 2 && events.length >= 2 && (
                      <span style={{ marginLeft: '8px', fontSize: '0.85em', fontWeight: 400 }}>
                        — {events.length}-event pattern
                      </span>
                    )}
                  </span>
                  <span>{isExpanded ? '▼' : '▶'}</span>
                </button>
                {isExpanded && (
                  <div style={{ padding: '12px 16px' }}>
                    {events.length === 0 ? (
                      <p style={{ color: '#666', fontSize: '0.9em', margin: 0 }}>No past "{label}" events for this situation.</p>
                    ) : (
                      <>
                        {value <= 2 && affectedOpportunities.length > 0 && events.length >= 2 && (
                          <div style={{
                            background: '#fff3cd',
                            border: '1px solid #ffc107',
                            borderRadius: '6px',
                            padding: '10px 12px',
                            marginBottom: '12px',
                            fontSize: '0.88em',
                            color: '#856404'
                          }}>
                            You've chosen "{label}" here {events.length} time{events.length !== 1 ? 's' : ''}. Each costs XP across {affectedOpportunities.length} linked opportunit{affectedOpportunities.length !== 1 ? 'ies' : 'y'}: {affectedOpportunities.map(o => o.title).join(', ')}.
                          </div>
                        )}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                          {events.map(event => (
                            <div key={event.id} style={{ borderLeft: `3px solid ${color}`, paddingLeft: '12px', fontSize: '0.9em' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                                <strong style={{ color }}>{event.title}</strong>
                                <span style={{ color: (event.game_xp_change ?? event.xp_change) >= 0 ? '#28a745' : '#dc3545', fontWeight: 600 }}>
                                  {(event.game_xp_change ?? event.xp_change) > 0 ? '+' : ''}{event.game_xp_change ?? event.xp_change} XP
                                </span>
                              </div>
                              <div style={{ color: 'var(--text-secondary)', marginBottom: '4px' }}>{formatEventDate(event.timestamp)}</div>
                              <p style={{ margin: '4px 0', color: 'var(--text-primary)' }}>{event.event_description}</p>
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
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {affectedOpportunities.length > 0 && (
          <div className="card">
            <h3>🎯 Opportunities Affected</h3>
            <p style={{ marginBottom: 8 }}>
              This event will {getChoiceXp() >= 0 ? 'add' : 'subtract'}{' '}
              <strong>{Math.abs(getChoiceXp())} {gameModeEnabled ? 'game ' : ''}XP</strong> to each:
              {dynamicXpEnabled && currentSituation && currentSituation.challenging_level !== 3 && (
                <span style={{ fontSize: '0.9em', color: 'var(--text-secondary)', marginLeft: '8px' }}>
                  (difficulty ×{Math.max(1.0, currentSituation.challenging_level / 3).toFixed(1)} applied)
                </span>
              )}
            </p>
            <ul>
              {affectedOpportunities.map(opp => {
                if (gameModeEnabled) {
                  const pathKey = opp.path || 'default';
                  const lvNow  = getPathLevel(opp.game_xp || 0, pathKey);
                  const { rebirths: rebNow } = getRebirthInfo(opp.game_xp || 0);
                  const newGameXp = Math.max(0, (opp.game_xp || 0) + getChoiceXp());
                  const lvNext = getPathLevel(newGameXp, pathKey);
                  const { rebirths: rebNext } = getRebirthInfo(newGameXp);
                  const levelUp  = lvNext.level !== lvNow.level || rebNext !== rebNow;
                  const rebirth  = rebNext > rebNow;
                  return (
                    <li key={opp.id}>
                      <strong>{opp.title}</strong>
                      {rebNow > 0 && <span style={{ marginLeft: 4, color: '#c8a84b' }}>{getRebirthSymbols(rebNow, pathKey)}</span>}
                      {' '}({lvNow.fullLabel}, {lvNow.xpIntoLevel}/{lvNow.xpForLevel} XP)
                      <div style={{ fontSize: '0.85em', color: 'var(--text-secondary)', marginTop: '2px' }}>
                        After: {lvNext.fullLabel}
                        {rebNext > 0 && <span style={{ marginLeft: 4, color: '#c8a84b' }}>{getRebirthSymbols(rebNext, pathKey)}</span>}
                        , {lvNext.xpIntoLevel}/{lvNext.xpForLevel} XP
                        {rebirth && <span style={{ color: '#c8a84b', fontWeight: 'bold', marginLeft: '8px' }}>{getNewRebirthSymbol(rebNext, pathKey)} Rebirth!</span>}
                        {levelUp && <span style={{ color: '#28a745', fontWeight: 'bold', marginLeft: '8px' }}>↑ Level up!</span>}
                      </div>
                    </li>
                  );
                }
                {(() => {
                  let previewXp = Math.max(0, opp.current_xp + getChoiceXp());
                  let previewLevel = opp.current_level;
                  while (previewXp >= 100) { previewLevel++; previewXp -= 100; }
                  const levelUps = previewLevel - opp.current_level;
                  return (
                    <li key={opp.id}>
                      <strong>{opp.title}</strong> (Level {opp.current_level}, {opp.current_xp}/100 XP)
                      <div style={{ fontSize: '0.85em', color: 'var(--text-secondary)', marginTop: '2px' }}>
                        After: Level {previewLevel}, {previewXp}/100 XP
                        {levelUps > 0 && (
                          <span style={{ color: '#28a745', fontWeight: 'bold', marginLeft: '8px' }}>
                            🎉 Level up{levelUps > 1 ? ` ×${levelUps}` : ''}!
                          </span>
                        )}
                      </div>
                    </li>
                  );
                })()}
              })}
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