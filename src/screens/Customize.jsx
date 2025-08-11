import { useState, useEffect } from 'react';
import { db, dbHelpers } from '../database/db';
import TagInput from '../components/TagInput';
import PWAUninstall from '../components/PWAUninstall';
import './ProgressStyles.css';

function Customize() {
  const [activeTab, setActiveTab] = useState('situations');
  
  console.log('Customize component rendered, activeTab:', activeTab);
  const [situations, setSituations] = useState([]);
  const [opportunities, setOpportunities] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Available tags for suggestions
  const [availableSituationTags, setAvailableSituationTags] = useState([]);
  const [availableOpportunityTags, setAvailableOpportunityTags] = useState([]);
  
  // Form states
  const [showSituationForm, setShowSituationForm] = useState(false);
  const [showOpportunityForm, setShowOpportunityForm] = useState(false);
  const [editingSituation, setEditingSituation] = useState(null);
  const [editingOpportunity, setEditingOpportunity] = useState(null);
  
  const [situationForm, setSituationForm] = useState({
    title: '',
    description: '',
    tags: [],
    linkedOpportunities: []
  });
  
  const [opportunityForm, setOpportunityForm] = useState({
    title: '',
    description: '',
    tags: [],
    initialLevel: 1
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [situationsData, opportunitiesData, sitTags, oppTags] = await Promise.all([
        dbHelpers.getSituationsWithOpportunities(),
        db.opportunities.toArray(),
        dbHelpers.getAllSituationTags(),
        dbHelpers.getAllOpportunityTags()
      ]);
      setSituations(situationsData);
      setOpportunities(opportunitiesData);
      setAvailableSituationTags(sitTags);
      setAvailableOpportunityTags(oppTags);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  // Situation handlers
  const handleSituationSubmit = async (e) => {
    e.preventDefault();
    
    if (!situationForm.title.trim() || !situationForm.description.trim()) {
      alert('Please fill in all required fields');
      return;
    }

    try {
      let situationId;
      if (editingSituation) {
        await dbHelpers.updateSituation(
          editingSituation.id,
          situationForm.title,
          situationForm.description,
          situationForm.tags
        );
        situationId = editingSituation.id;
      } else {
        const newSituation = await dbHelpers.createSituation(
          situationForm.title,
          situationForm.description,
          situationForm.tags
        );
        situationId = newSituation.id;
      }

      // Update opportunity links
      await dbHelpers.linkSituationToOpportunities(situationId, situationForm.linkedOpportunities);

      resetSituationForm();
      loadData();
      
    } catch (error) {
      console.error('Error saving situation:', error);
      alert('Error saving situation. Please try again.');
    }
  };

  const handleEditSituation = (situation) => {
    setEditingSituation(situation);
    setSituationForm({
      title: situation.title,
      description: situation.description,
      tags: situation.tags || [],
      linkedOpportunities: situation.opportunities.map(opp => opp.id)
    });
    setShowSituationForm(true);
  };

  const handleDeleteSituation = async (situationId) => {
    if (!confirm('Are you sure you want to delete this situation? This action cannot be undone.')) {
      return;
    }

    try {
      // Check if situation has events
      const eventCount = await db.events.where('situation_id').equals(situationId).count();
      if (eventCount > 0) {
        alert('Cannot delete situation that has associated events. Delete events first.');
        return;
      }

      await dbHelpers.deleteSituation(situationId);
      loadData();
      
    } catch (error) {
      console.error('Error deleting situation:', error);
      alert('Error deleting situation. Please try again.');
    }
  };

  // Opportunity handlers  
  const handleOpportunitySubmit = async (e) => {
    e.preventDefault();
    
    if (!opportunityForm.title.trim() || !opportunityForm.description.trim()) {
      alert('Please fill in all required fields');
      return;
    }

    try {
      if (editingOpportunity) {
        await dbHelpers.updateOpportunity(
          editingOpportunity.id,
          opportunityForm.title,
          opportunityForm.description,
          opportunityForm.tags,
          opportunityForm.initialLevel
        );
      } else {
        await dbHelpers.createOpportunity(
          opportunityForm.title,
          opportunityForm.description,
          opportunityForm.tags,
          opportunityForm.initialLevel
        );
      }

      resetOpportunityForm();
      loadData();
      
    } catch (error) {
      console.error('Error saving opportunity:', error);
      alert('Error saving opportunity. Please try again.');
    }
  };

  const handleEditOpportunity = (opportunity) => {
    setEditingOpportunity(opportunity);
    setOpportunityForm({
      title: opportunity.title,
      description: opportunity.description,
      tags: opportunity.tags || [],
      initialLevel: opportunity.current_level || 1
    });
    setShowOpportunityForm(true);
  };

  const handleDeleteOpportunity = async (opportunityId) => {
    if (!confirm('Are you sure you want to delete this opportunity? This action cannot be undone.')) {
      return;
    }

    try {
      // Check if opportunity has events
      const eventCount = await db.events.where('affected_opportunities').equals(opportunityId).count();
      if (eventCount > 0) {
        alert('Cannot delete opportunity that has associated events. This would break event history.');
        return;
      }

      await dbHelpers.deleteOpportunity(opportunityId);
      loadData();
      
    } catch (error) {
      console.error('Error deleting opportunity:', error);
      alert('Error deleting opportunity. Please try again.');
    }
  };

  // Form reset handlers
  const resetSituationForm = () => {
    setSituationForm({ title: '', description: '', tags: [], linkedOpportunities: [] });
    setEditingSituation(null);
    setShowSituationForm(false);
  };

  const resetOpportunityForm = () => {
    setOpportunityForm({ title: '', description: '', tags: [], initialLevel: 1 });
    setEditingOpportunity(null);
    setShowOpportunityForm(false);
  };

  // Toggle opportunity link
  const toggleOpportunityLink = (opportunityId) => {
    const currentLinks = situationForm.linkedOpportunities;
    const newLinks = currentLinks.includes(opportunityId)
      ? currentLinks.filter(id => id !== opportunityId)
      : [...currentLinks, opportunityId];
    
    setSituationForm({ ...situationForm, linkedOpportunities: newLinks });
  };

  if (loading) {
    return (
      <div className="screen">
        <div className="card">
          <p>Loading customization options...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="screen">
      <h2>⚙️ Customize</h2>

      {/* Tab Navigation */}
      <div className="card">
        <div className="tab-navigation">
          <button
            className={`tab-button ${activeTab === 'situations' ? 'active' : ''}`}
            onClick={() => setActiveTab('situations')}
          >
            🎭 Situations ({situations.length})
          </button>
          <button
            className={`tab-button ${activeTab === 'opportunities' ? 'active' : ''}`}
            onClick={() => setActiveTab('opportunities')}
          >
            🎯 Opportunities ({opportunities.length})
          </button>
          <button
            className={`tab-button ${activeTab === 'settings' ? 'active' : ''}`}
            onClick={() => setActiveTab('settings')}
          >
            ⚙️ Settings
          </button>
        </div>
      </div>

      {/* Situations Tab */}
      {activeTab === 'situations' && (
        <div className="tab-content">
          <div className="card">
            <div className="section-header">
              <h3>Manage Situations</h3>
              <button
                className="btn btn-success"
                onClick={() => setShowSituationForm(true)}
              >
                + Add Situation
              </button>
            </div>
          </div>

          {/* Situation Form */}
          {showSituationForm && (
            <div className="card form-card">
              <h4>{editingSituation ? 'Edit' : 'Add New'} Situation</h4>
              <form onSubmit={handleSituationSubmit}>
                <div className="form-group">
                  <label className="form-label">Title *</label>
                  <input
                    type="text"
                    className="form-input"
                    value={situationForm.title}
                    onChange={(e) => setSituationForm({ ...situationForm, title: e.target.value })}
                    placeholder="e.g., Work Meeting Conflict"
                    required
                  />
                </div>
                
                <div className="form-group">
                  <label className="form-label">Description *</label>
                  <textarea
                    className="form-input form-textarea"
                    value={situationForm.description}
                    onChange={(e) => setSituationForm({ ...situationForm, description: e.target.value })}
                    placeholder="Describe the situation type..."
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Tags</label>
                  <TagInput
                    tags={situationForm.tags}
                    onChange={(tags) => setSituationForm({ ...situationForm, tags })}
                    placeholder="Add tags (e.g., work, personal, health)..."
                    availableTags={availableSituationTags}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Linked Opportunities</label>
                  <div className="opportunities-checklist">
                    {opportunities.map(opp => (
                      <label key={opp.id} className="checkbox-item">
                        <input
                          type="checkbox"
                          checked={situationForm.linkedOpportunities.includes(opp.id)}
                          onChange={() => toggleOpportunityLink(opp.id)}
                        />
                        <span>{opp.title}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="form-actions">
                  <button type="button" className="btn btn-secondary" onClick={resetSituationForm}>
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-success">
                    {editingSituation ? 'Update' : 'Add'} Situation
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Situations List */}
          <div className="items-list">
            {situations.map(situation => (
              <div key={situation.id} className="card item-card">
                <div className="item-header">
                  <h4>{situation.title}</h4>
                  <div className="item-actions">
                    <button
                      className="btn-icon"
                      onClick={() => handleEditSituation(situation)}
                      title="Edit"
                    >
                      ✏️
                    </button>
                    <button
                      className="btn-icon"
                      onClick={() => handleDeleteSituation(situation.id)}
                      title="Delete"
                    >
                      🗑️
                    </button>
                  </div>
                </div>
                
                <p className="item-description">{situation.description}</p>
                
                {situation.tags && situation.tags.length > 0 && (
                  <div style={{marginBottom: '12px'}}>
                    <strong>Tags:</strong>
                    <div style={{display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '4px'}}>
                      {situation.tags.map(tag => (
                        <span key={tag} style={{
                          display: 'inline-block',
                          background: '#e8f5e8',
                          color: '#2e7d2e',
                          padding: '2px 8px',
                          borderRadius: '12px',
                          fontSize: '0.75rem'
                        }}>
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                
                <div className="item-meta">
                  <div className="linked-opportunities">
                    <strong>Linked Opportunities:</strong>
                    {situation.opportunities.length > 0 ? (
                      <div className="opportunity-tags">
                        {situation.opportunities.map(opp => (
                          <span key={opp.id} className="opportunity-tag">{opp.title}</span>
                        ))}
                      </div>
                    ) : (
                      <span className="no-links">No opportunities linked</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Opportunities Tab */}
      {activeTab === 'opportunities' && (
        <div className="tab-content">
          <div className="card">
            <div className="section-header">
              <h3>Manage Opportunities</h3>
              <button
                className="btn btn-success"
                onClick={() => setShowOpportunityForm(true)}
              >
                + Add Opportunity
              </button>
            </div>
          </div>

          {/* Opportunity Form */}
          {showOpportunityForm && (
            <div className="card form-card">
              <h4>{editingOpportunity ? 'Edit' : 'Add New'} Opportunity</h4>
              <form onSubmit={handleOpportunitySubmit}>
                <div className="form-group">
                  <label className="form-label">Title *</label>
                  <input
                    type="text"
                    className="form-input"
                    value={opportunityForm.title}
                    onChange={(e) => setOpportunityForm({ ...opportunityForm, title: e.target.value })}
                    placeholder="e.g., Leadership"
                    required
                  />
                </div>
                
                <div className="form-group">
                  <label className="form-label">Description *</label>
                  <textarea
                    className="form-input form-textarea"
                    value={opportunityForm.description}
                    onChange={(e) => setOpportunityForm({ ...opportunityForm, description: e.target.value })}
                    placeholder="Describe this skill or opportunity..."
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Tags</label>
                  <TagInput
                    tags={opportunityForm.tags}
                    onChange={(tags) => setOpportunityForm({ ...opportunityForm, tags })}
                    placeholder="Add tags (e.g., leadership, skill, creative)..."
                    availableTags={availableOpportunityTags}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">{editingOpportunity ? 'Current Level' : 'Initial Level'}</label>
                  <input
                    type="number"
                    className="form-input"
                    value={opportunityForm.initialLevel}
                    onChange={(e) => setOpportunityForm({ ...opportunityForm, initialLevel: parseInt(e.target.value) || 1 })}
                    min="1"
                    max="100"
                    placeholder="1"
                  />
                  <small style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'block', marginTop: '4px' }}>
                    {editingOpportunity 
                      ? 'Update the current level for this opportunity (1-100).'
                      : 'Set the starting level for this opportunity (1-100). Default is 1.'
                    }
                  </small>
                </div>

                <div className="form-actions">
                  <button type="button" className="btn btn-secondary" onClick={resetOpportunityForm}>
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-success">
                    {editingOpportunity ? 'Update' : 'Add'} Opportunity
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Opportunities List */}
          <div className="items-list">
            {opportunities.map(opportunity => (
              <div key={opportunity.id} className="card item-card">
                <div className="item-header">
                  <div className="item-title-section">
                    <h4>{opportunity.title}</h4>
                    <div className="opportunity-stats">
                      <span className="level-badge">Level {opportunity.current_level}</span>
                      <span className="xp-text">{opportunity.current_xp}/100 XP</span>
                    </div>
                  </div>
                  <div className="item-actions">
                    <button
                      className="btn-icon"
                      onClick={() => handleEditOpportunity(opportunity)}
                      title="Edit"
                    >
                      ✏️
                    </button>
                    <button
                      className="btn-icon"
                      onClick={() => handleDeleteOpportunity(opportunity.id)}
                      title="Delete"
                    >
                      🗑️
                    </button>
                  </div>
                </div>
                
                <p className="item-description">{opportunity.description}</p>
                
                {opportunity.tags && opportunity.tags.length > 0 && (
                  <div style={{marginBottom: '12px'}}>
                    <strong>Tags:</strong>
                    <div style={{display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '4px'}}>
                      {opportunity.tags.map(tag => (
                        <span key={tag} style={{
                          display: 'inline-block',
                          background: '#e3f2fd',
                          color: '#1976d2',
                          padding: '2px 8px',
                          borderRadius: '12px',
                          fontSize: '0.75rem'
                        }}>
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                
                <div className="progress-bar">
                  <div 
                    className="progress-fill"
                    style={{ width: `${opportunity.current_xp}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Settings Tab */}
      {activeTab === 'settings' && (
        <div className="tab-content">
          <div className="card">
            <h3>🎨 App Settings</h3>
            <p style={{color: 'var(--text-secondary)', marginBottom: '20px'}}>
              Manage your app preferences and data
            </p>
            
            <div style={{
              padding: '15px',
              background: 'var(--bg-tertiary)',
              borderRadius: '8px',
              marginBottom: '20px'
            }}>
              <h4 style={{margin: '0 0 8px 0', fontSize: '1rem'}}>🌙 Theme</h4>
              <p style={{margin: '0', fontSize: '0.9rem', color: 'var(--text-secondary)'}}>
                Use the theme toggle button (☀️/🌙) in the top-right corner to switch between light and dark modes
              </p>
            </div>

            <div style={{
              padding: '15px',
              background: 'var(--bg-tertiary)',
              borderRadius: '8px',
              marginBottom: '20px'
            }}>
              <h4 style={{margin: '0 0 8px 0', fontSize: '1rem'}}>🏷️ Tags</h4>
              <p style={{margin: '0', fontSize: '0.9rem', color: 'var(--text-secondary)'}}>
                Add custom tags when creating situations and opportunities. Use the filter feature in Progress screen to find items by tags.
              </p>
            </div>
          </div>

          <PWAUninstall />
          
          {/* App Info */}
          <div className="card" style={{marginTop: '20px'}}>
            <h3>ℹ️ App Information</h3>
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              fontSize: '0.9rem',
              color: 'var(--text-secondary)'
            }}>
              <div style={{display: 'flex', justifyContent: 'space-between'}}>
                <span>Version:</span>
                <span>1.6.0</span>
              </div>
              <div style={{display: 'flex', justifyContent: 'space-between'}}>
                <span>App Name:</span>
                <span>Life Progress Tracker</span>
              </div>
              <div style={{display: 'flex', justifyContent: 'space-between'}}>
                <span>Type:</span>
                <span>Progressive Web App</span>
              </div>
              <div style={{display: 'flex', justifyContent: 'space-between'}}>
                <span>Features:</span>
                <span>Tags, Dark Theme, Offline Support</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Empty States */}
      {activeTab === 'situations' && situations.length === 0 && (
        <div className="card empty-state">
          <h3>No Situations Yet</h3>
          <p>Create your first situation to start tracking life events!</p>
        </div>
      )}
      
      {activeTab === 'opportunities' && opportunities.length === 0 && (
        <div className="card empty-state">
          <h3>No Opportunities Yet</h3>
          <p>Create your first opportunity to start building skills!</p>
        </div>
      )}
    </div>
  );
}

export default Customize;