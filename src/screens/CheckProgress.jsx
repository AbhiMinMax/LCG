import { useState, useEffect } from 'react';
import { dbHelpers } from '../database/db';
import './ProgressStyles.css';

const SORT_OPTIONS = [
  { value: 'alphabetical', label: 'A-Z' },
  { value: 'xp_percentage', label: 'XP %' },
  { value: 'level', label: 'Level' }
];

function CheckProgress() {
  const [opportunities, setOpportunities] = useState([]);
  const [allOpportunities, setAllOpportunities] = useState([]);
  const [sortBy, setSortBy] = useState('alphabetical');
  const [loading, setLoading] = useState(true);
  const [selectedOpportunity, setSelectedOpportunity] = useState(null);
  const [availableTags, setAvailableTags] = useState([]);
  const [selectedTags, setSelectedTags] = useState([]);

  useEffect(() => {
    loadOpportunities();
    loadTags();
  }, []);

  useEffect(() => {
    const filterAndSort = () => {
      let filtered = allOpportunities;
      
      if (selectedTags.length > 0) {
        filtered = allOpportunities.filter(opportunity => 
          opportunity.tags && 
          Array.isArray(opportunity.tags) &&
          selectedTags.some(tag => opportunity.tags.includes(tag))
        );
      }
      
      switch (sortBy) {
        case 'alphabetical':
          filtered.sort((a, b) => a.title.localeCompare(b.title));
          break;
        case 'xp_percentage':
          filtered.sort((a, b) => b.current_xp - a.current_xp);
          break;
        case 'level':
          filtered.sort((a, b) => {
            if (b.current_level !== a.current_level) {
              return b.current_level - a.current_level;
            }
            return b.current_xp - a.current_xp;
          });
          break;
      }
      
      setOpportunities(filtered);
    };
    
    filterAndSort();
  }, [sortBy, selectedTags, allOpportunities]);

  const loadOpportunities = async () => {
    try {
      const data = await dbHelpers.getOpportunitiesSorted('alphabetical');
      setAllOpportunities(data);
    } catch (error) {
      console.error('Error loading opportunities:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadTags = async () => {
    try {
      const tags = await dbHelpers.getAllOpportunityTags();
      setAvailableTags(tags);
    } catch (error) {
      console.error('Error loading tags:', error);
    }
  };


  const toggleTag = (tag) => {
    setSelectedTags(prev => 
      prev.includes(tag) 
        ? prev.filter(t => t !== tag)
        : [...prev, tag]
    );
  };

  const getProgressPercentage = (xp) => {
    return Math.min((xp / 100) * 100, 100);
  };

  const getProgressColor = (percentage) => {
    if (percentage < 25) return '#dc3545';
    if (percentage < 50) return '#fd7e14';
    if (percentage < 75) return '#ffc107';
    return '#28a745';
  };

  const getTotalLevel = () => {
    return allOpportunities.reduce((total, opp) => total + opp.current_level, 0);
  };

  const getTotalXP = () => {
    return allOpportunities.reduce((total, opp) => total + opp.current_xp, 0);
  };

  const getAverageLevel = () => {
    if (allOpportunities.length === 0) return 0;
    return (getTotalLevel() / allOpportunities.length).toFixed(1);
  };

  if (loading) {
    return (
      <div className="screen">
        <div className="card">
          <p>Loading progress...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="screen">
      <h2>📊 Progress Overview</h2>

      {/* Summary Stats */}
      <div className="card">
        <h3>🏆 Overall Stats</h3>
        <div className="stats-grid">
          <div className="stat-item">
            <div className="stat-value">{getTotalLevel()}</div>
            <div className="stat-label">Total Levels</div>
          </div>
          <div className="stat-item">
            <div className="stat-value">{getTotalXP()}</div>
            <div className="stat-label">Total XP</div>
          </div>
          <div className="stat-item">
            <div className="stat-value">{getAverageLevel()}</div>
            <div className="stat-label">Avg Level</div>
          </div>
        </div>
      </div>

      {/* Sort Controls */}
      <div className="card">
        <div className="sort-controls">
          <label htmlFor="sort" className="form-label">Sort by:</label>
          <select
            id="sort"
            className="form-select"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
          >
            {SORT_OPTIONS.map(option => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Tag Filter */}
      {availableTags.length > 0 && (
        <div className="card">
          <h3>🏷️ Filter by Tags</h3>
          <div style={{display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '12px'}}>
            {availableTags.map(tag => (
              <button
                key={tag}
                onClick={() => toggleTag(tag)}
                style={{
                  padding: '6px 12px',
                  border: selectedTags.includes(tag) ? '2px solid #1976d2' : '1px solid #ccc',
                  borderRadius: '16px',
                  background: selectedTags.includes(tag) ? '#e3f2fd' : '#f5f5f5',
                  color: selectedTags.includes(tag) ? '#1976d2' : '#666',
                  cursor: 'pointer',
                  fontSize: '0.85rem',
                  fontWeight: selectedTags.includes(tag) ? 'bold' : 'normal'
                }}
              >
                {tag}
              </button>
            ))}
          </div>
          {selectedTags.length > 0 && (
            <div style={{marginTop: '12px'}}>
              <button
                onClick={() => setSelectedTags([])}
                style={{
                  padding: '4px 8px',
                  border: '1px solid #dc3545',
                  borderRadius: '12px',
                  background: '#f8d7da',
                  color: '#721c24',
                  cursor: 'pointer',
                  fontSize: '0.8rem'
                }}
              >
                Clear Filters
              </button>
              <span style={{marginLeft: '12px', fontSize: '0.9rem', color: '#666'}}>
                Showing {opportunities.length} of {allOpportunities.length} opportunities
              </span>
            </div>
          )}
        </div>
      )}

      {/* Opportunities List */}
      <div className="opportunities-list">
        {opportunities.map(opportunity => {
          const progressPercentage = getProgressPercentage(opportunity.current_xp);
          const progressColor = getProgressColor(progressPercentage);
          
          return (
            <div key={opportunity.id} className="card opportunity-card">
              <div 
                className="opportunity-header"
                onClick={() => setSelectedOpportunity(
                  selectedOpportunity?.id === opportunity.id ? null : opportunity
                )}
              >
                <div className="opportunity-info">
                  <h3 className="opportunity-title">{opportunity.title}</h3>
                  <div className="opportunity-meta">
                    <span className="level-badge">Level {opportunity.current_level}</span>
                    <span className="xp-text">{opportunity.current_xp}/100 XP</span>
                  </div>
                  {opportunity.tags && opportunity.tags.length > 0 && (
                    <div className="tags-container" style={{marginTop: '8px'}}>
                      {opportunity.tags.map(tag => (
                        <span key={tag} className="tag" style={{
                          display: 'inline-block',
                          background: '#e3f2fd',
                          color: '#1976d2',
                          padding: '2px 8px',
                          borderRadius: '12px',
                          fontSize: '0.75rem',
                          marginRight: '4px',
                          marginBottom: '4px'
                        }}>
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="expand-icon">
                  {selectedOpportunity?.id === opportunity.id ? '▼' : '▶'}
                </div>
              </div>
              
              <div className="progress-section">
                <div className="progress-bar">
                  <div 
                    className="progress-fill"
                    style={{ 
                      width: `${progressPercentage}%`,
                      backgroundColor: progressColor
                    }}
                  />
                </div>
                <div className="progress-percentage">
                  {progressPercentage.toFixed(0)}%
                </div>
              </div>

              {selectedOpportunity?.id === opportunity.id && (
                <div className="opportunity-details">
                  <div className="detail-section">
                    <h4>📋 Description</h4>
                    <p>{opportunity.description}</p>
                  </div>
                  
                  <div className="detail-section">
                    <h4>📈 Progress Details</h4>
                    <div className="progress-details">
                      <div className="detail-item">
                        <span className="detail-label">Current Level:</span>
                        <span className="detail-value">{opportunity.current_level}</span>
                      </div>
                      <div className="detail-item">
                        <span className="detail-label">XP Progress:</span>
                        <span className="detail-value">{opportunity.current_xp}/100</span>
                      </div>
                      <div className="detail-item">
                        <span className="detail-label">XP to Next Level:</span>
                        <span className="detail-value">{100 - opportunity.current_xp}</span>
                      </div>
                      <div className="detail-item">
                        <span className="detail-label">Created:</span>
                        <span className="detail-value">
                          {new Date(opportunity.created_at).toLocaleDateString()}
                        </span>
                      </div>
                      <div className="detail-item">
                        <span className="detail-label">Last Updated:</span>
                        <span className="detail-value">
                          {new Date(opportunity.updated_at).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {opportunities.length === 0 && (
        <div className="card empty-state">
          <h3>No Opportunities Found</h3>
          <p>Go to Customize to add some opportunities to track!</p>
        </div>
      )}
    </div>
  );
}

export default CheckProgress;