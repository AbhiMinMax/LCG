import { useState, useEffect } from 'react';
import { dbHelpers } from '../database/db';

const CHOICE_OPTIONS = [
  { value: 1, label: 'Misguided Action', xp: -3, color: '#dc3545' },
  { value: 2, label: 'Didnt Try', xp: -2, color: '#fd7e14' },
  { value: 3, label: 'Tried', xp: 2, color: '#28a745' },
  { value: 4, label: 'Well Done!', xp: 5, color: '#007bff' }
];

function AddEvent() {
  const [situations, setSituations] = useState([]);
  const [selectedSituation, setSelectedSituation] = useState('');
  const [eventDescription, setEventDescription] = useState('');
  const [selectedChoice, setSelectedChoice] = useState('');
  const [affectedOpportunities, setAffectedOpportunities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [lastResult, setLastResult] = useState(null);

  useEffect(() => {
    loadSituations();
  }, []);

  useEffect(() => {
    const loadAffectedOpportunities = async () => {
      try {
        const opportunities = await dbHelpers.getOpportunitiesForSituation(parseInt(selectedSituation));
        setAffectedOpportunities(opportunities);
      } catch (error) {
        console.error('Error loading opportunities:', error);
      }
    };

    if (selectedSituation) {
      loadAffectedOpportunities();
    } else {
      setAffectedOpportunities([]);
    }
  }, [selectedSituation]);

  const loadSituations = async () => {
    try {
      const situationsData = await dbHelpers.getSituationsWithOpportunities();
      setSituations(situationsData);
    } catch (error) {
      console.error('Error loading situations:', error);
    } finally {
      setLoading(false);
    }
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
        parseInt(selectedChoice)
      );

      setLastResult(result);
      setShowSuccess(true);
      
      // Reset form
      setSelectedSituation('');
      setEventDescription('');
      setSelectedChoice('');
      setAffectedOpportunities([]);
      
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
    setEventDescription('');
    setSelectedChoice('');
    setAffectedOpportunities([]);
  };

  const getChoiceXp = () => {
    if (!selectedChoice) return 0;
    const choice = CHOICE_OPTIONS.find(opt => opt.value === parseInt(selectedChoice));
    return choice ? choice.xp : 0;
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
          <p><strong>XP Change:</strong> {lastResult.xpChange > 0 ? '+' : ''}{lastResult.xpChange}</p>
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

      <form onSubmit={handleSubmit}>
        <div className="card">
          <div className="form-group">
            <label htmlFor="situation" className="form-label">
              Life Situation *
            </label>
            <select
              id="situation"
              className="form-select"
              value={selectedSituation}
              onChange={(e) => setSelectedSituation(e.target.value)}
              required
            >
              <option value="">Select a situation...</option>
              {situations.map(situation => (
                <option key={situation.id} value={situation.id}>
                  {situation.title} {situation.tags && situation.tags.length > 0 && `[${situation.tags.join(', ')}]`}
                </option>
              ))}
            </select>
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
                      {choice.xp > 0 ? '+' : ''}{choice.xp} XP
                    </div>
                  </div>
                </label>
              ))}
            </div>
          </div>
        </div>

        {affectedOpportunities.length > 0 && (
          <div className="card">
            <h3>🎯 Opportunities Affected</h3>
            <p>
              This event will {getChoiceXp() >= 0 ? 'add' : 'subtract'} <strong>{Math.abs(getChoiceXp())} XP</strong> to:
            </p>
            <ul>
              {affectedOpportunities.map(opp => (
                <li key={opp.id}>
                  <strong>{opp.title}</strong> (Level {opp.current_level}, {opp.current_xp}/100 XP)
                  {opp.tags && opp.tags.length > 0 && (
                    <div style={{fontSize: '0.9em', color: '#666', marginTop: '4px'}}>
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