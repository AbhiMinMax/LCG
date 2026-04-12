import { useState, useEffect } from 'react';
import { db, dbHelpers, ensureDefaultData } from '../database/db';
import TagInput from '../components/TagInput';
import PWAUninstall from '../components/PWAUninstall';
import { ThoughtPair } from '../components/ThoughtPassage';
import { PATHS, PATH_KEYS, getPathLevel } from '../utils/pathUtils';
import './ProgressStyles.css';

function Customize() {
  const [activeTab, setActiveTab] = useState('situations');
  
  console.log('Customize component rendered, activeTab:', activeTab);
  const [situations, setSituations] = useState([]);
  const [allSituations, setAllSituations] = useState([]);
  const [opportunities, setOpportunities] = useState([]);
  const [allOpportunities, setAllOpportunities] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Available tags for suggestions
  const [availableSituationTags, setAvailableSituationTags] = useState([]);
  const [availableOpportunityTags, setAvailableOpportunityTags] = useState([]);
  
  // Filter and sort states
  const [selectedSituationTags, setSelectedSituationTags] = useState([]);
  const [selectedOpportunityTags, setSelectedOpportunityTags] = useState([]);
  const [situationSortBy, setSituationSortBy] = useState('alphabetical');
  const [opportunitySortBy, setOpportunitySortBy] = useState('alphabetical');
  const [filterSituationThoughts, setFilterSituationThoughts] = useState(false);
  const [filterSituationHasEvents, setFilterSituationHasEvents] = useState(false);
  const [filterOpportunityHasEvents, setFilterOpportunityHasEvents] = useState(false);
  const [eventCountsPerSit, setEventCountsPerSit] = useState({});
  const [eventCountsPerOpp, setEventCountsPerOpp] = useState({});
  
  // Export/Import states
  const [dataStats, setDataStats] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  
  // Configuration states
  const [dynamicXpEnabled, setDynamicXpEnabled] = useState(false);
  const [cloudSyncEnabled, setCloudSyncEnabled] = useState(false);
  const [gameModeEnabled, setGameModeEnabled] = useState(false);
  const [ensuringDefaults, setEnsuringDefaults] = useState(false);
  
  // Form states
  const [showSituationForm, setShowSituationForm] = useState(false);
  const [showOpportunityForm, setShowOpportunityForm] = useState(false);
  const [editingSituation, setEditingSituation] = useState(null);
  const [editingOpportunity, setEditingOpportunity] = useState(null);
  
  const [situationForm, setSituationForm] = useState({
    title: '',
    description: '',
    tags: [],
    linkedOpportunities: [],
    challengingLevel: 3,
    thoughtPairs: [],   // [{back: string|null, forth: string|null}]
    isMeta: false
  });
  
  const [opportunityForm, setOpportunityForm] = useState({
    title: '',
    description: '',
    tags: [],
    initialLevel: 1,
    path: 'default'
  });

  useEffect(() => {
    loadData();
    loadDataStats();
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      const [dynamicXp, cloudSync, gameMode] = await Promise.all([
        dbHelpers.getConfig('dynamicXpEnabled', false),
        dbHelpers.getConfig('cloudSyncEnabled', false),
        dbHelpers.getConfig('gameModeEnabled', false),
      ]);
      setDynamicXpEnabled(dynamicXp);
      setCloudSyncEnabled(cloudSync);
      setGameModeEnabled(gameMode);
    } catch (error) {
      console.error('Error loading config:', error);
    }
  };

  useEffect(() => {
    const filterAndSortSituations = () => {
      let filtered = allSituations;

      if (selectedSituationTags.length > 0) {
        filtered = allSituations.filter(situation =>
          situation.tags &&
          Array.isArray(situation.tags) &&
          selectedSituationTags.some(tag => situation.tags.includes(tag))
        );
      }

      if (filterSituationThoughts) {
        filtered = filtered.filter(situation =>
          situation.thought_pairs && situation.thought_pairs.length > 0
        );
      }

      if (filterSituationHasEvents) {
        filtered = filtered.filter(situation => (eventCountsPerSit[situation.id] || 0) > 0);
      }

      switch (situationSortBy) {
        case 'alphabetical':
          filtered = [...filtered].sort((a, b) => a.title.localeCompare(b.title));
          break;
        case 'created':
          filtered = [...filtered].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
          break;
        case 'updated':
          filtered = [...filtered].sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
          break;
      }

      setSituations(filtered);
    };

    filterAndSortSituations();
  }, [situationSortBy, selectedSituationTags, filterSituationThoughts, filterSituationHasEvents, eventCountsPerSit, allSituations]);

  useEffect(() => {
    const filterAndSortOpportunities = () => {
      let filtered = allOpportunities;

      if (selectedOpportunityTags.length > 0) {
        filtered = allOpportunities.filter(opportunity =>
          opportunity.tags &&
          Array.isArray(opportunity.tags) &&
          selectedOpportunityTags.some(tag => opportunity.tags.includes(tag))
        );
      }

      if (filterOpportunityHasEvents) {
        filtered = filtered.filter(opp => (eventCountsPerOpp[opp.id] || 0) > 0);
      }

      switch (opportunitySortBy) {
        case 'alphabetical':
          filtered = [...filtered].sort((a, b) => a.title.localeCompare(b.title));
          break;
        case 'level':
          filtered = [...filtered].sort((a, b) => {
            if (b.current_level !== a.current_level) {
              return b.current_level - a.current_level;
            }
            return b.current_xp - a.current_xp;
          });
          break;
        case 'xp':
          filtered = [...filtered].sort((a, b) => b.current_xp - a.current_xp);
          break;
        case 'created':
          filtered = [...filtered].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
          break;
      }
      
      setOpportunities(filtered);
    };
    
    filterAndSortOpportunities();
  }, [opportunitySortBy, selectedOpportunityTags, filterOpportunityHasEvents, eventCountsPerOpp, allOpportunities]);

  const loadData = async () => {
    try {
      const [situationsData, opportunitiesData, sitTags, oppTags, sitCounts, oppCounts] = await Promise.all([
        dbHelpers.getSituationsWithOpportunities(),
        db.opportunities.toArray(),
        dbHelpers.getAllSituationTags(),
        dbHelpers.getAllOpportunityTags(),
        dbHelpers.getEventCountsPerSituation(),
        dbHelpers.getEventCountsPerOpportunity()
      ]);
      setAllSituations(situationsData);
      setSituations(situationsData);
      setAllOpportunities(opportunitiesData);
      setOpportunities(opportunitiesData);
      setAvailableSituationTags(sitTags);
      setAvailableOpportunityTags(oppTags);
      setEventCountsPerSit(sitCounts);
      setEventCountsPerOpp(oppCounts);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadDataStats = async () => {
    try {
      const stats = await dbHelpers.getDataStats();
      setDataStats(stats);
    } catch (error) {
      console.error('Error loading data stats:', error);
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
          situationForm.tags,
          situationForm.challengingLevel,
          situationForm.thoughtPairs,
          situationForm.isMeta
        );
        situationId = editingSituation.id;
      } else {
        const newSituation = await dbHelpers.createSituation(
          situationForm.title,
          situationForm.description,
          situationForm.tags,
          situationForm.challengingLevel,
          situationForm.thoughtPairs,
          situationForm.isMeta
        );
        situationId = newSituation.id;
      }

      // Update opportunity links
      await dbHelpers.linkSituationToOpportunities(situationId, situationForm.linkedOpportunities);

      resetSituationForm();
      await loadData();

    } catch (error) {
      console.error('Error saving situation:', error);
      alert('Error saving situation. Please try again.');
    }
  };

  const handleEditSituation = (situation) => {
    setEditingSituation(situation);
    // Support legacy back_thoughts/forth_thoughts for old DB records that haven't migrated yet
    let thoughtPairs = situation.thought_pairs;
    if (!thoughtPairs) {
      const back = situation.back_thoughts || [];
      const forth = situation.forth_thoughts || [];
      const len = Math.max(back.length, forth.length);
      thoughtPairs = Array.from({ length: len }, (_, i) => ({
        back: back[i] || null,
        forth: forth[i] || null,
      }));
    }
    setSituationForm({
      title: situation.title,
      description: situation.description,
      tags: situation.tags || [],
      linkedOpportunities: situation.opportunities.map(opp => opp.id),
      challengingLevel: situation.challenging_level || 3,
      thoughtPairs,
      isMeta: situation.isMeta === true
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
        // Update path only if not locked
        if (!editingOpportunity.path_locked) {
          await dbHelpers.updateOpportunityPath(editingOpportunity.id, opportunityForm.path);
        }
      } else {
        await dbHelpers.createOpportunity(
          opportunityForm.title,
          opportunityForm.description,
          opportunityForm.tags,
          opportunityForm.initialLevel,
          opportunityForm.path
        );
      }

      resetOpportunityForm();
      await loadData();

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
      initialLevel: opportunity.current_level || 1,
      path: opportunity.path || 'default'
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
    setSituationForm({
      title: '',
      description: '',
      tags: [],
      linkedOpportunities: [],
      challengingLevel: 3,
      thoughtPairs: [],
      isMeta: false
    });
    setEditingSituation(null);
    setShowSituationForm(false);
  };

  const resetOpportunityForm = () => {
    setOpportunityForm({ title: '', description: '', tags: [], initialLevel: 1, path: 'default' });
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

  // Tag filter functions
  const toggleSituationTag = (tag) => {
    setSelectedSituationTags(prev => 
      prev.includes(tag) 
        ? prev.filter(t => t !== tag)
        : [...prev, tag]
    );
  };

  const toggleOpportunityTag = (tag) => {
    setSelectedOpportunityTags(prev => 
      prev.includes(tag) 
        ? prev.filter(t => t !== tag)
        : [...prev, tag]
    );
  };

  // Export functionality
  const handleExportData = async () => {
    if (!dataStats || dataStats.situations === 0) {
      alert('No data to export. Add some situations and opportunities first.');
      return;
    }

    setExporting(true);
    try {
      const exportData = await dbHelpers.exportAllData();
      
      // Create and download file
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { 
        type: 'application/json' 
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `life-progress-tracker-export-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

    } catch (error) {
      console.error('Export failed:', error);
      alert('Export failed. Please try again.');
    } finally {
      setExporting(false);
    }
  };

  // Import functionality
  const handleImportData = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = handleFileSelect;
    input.click();
  };

  const handleFileSelect = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    if (!confirm('This will replace all existing data. Are you sure you want to continue?')) {
      return;
    }

    setImporting(true);
    setImportResult(null);

    try {
      const text = await file.text();
      const importData = JSON.parse(text);
      
      // Validate the import data
      if (!importData.data || !importData.data.situations) {
        throw new Error('Invalid file format. Please select a valid export file.');
      }

      const result = await dbHelpers.importAllData(importData);
      setImportResult(result);
      
      // Ensure default data is present after import
      await ensureDefaultData();
      
      // Reload all data
      await loadData();
      await loadDataStats();
      
      // Clear filters
      setSelectedSituationTags([]);
      setSelectedOpportunityTags([]);

    } catch (error) {
      console.error('Import failed:', error);
      alert(`Import failed: ${error.message}`);
    } finally {
      setImporting(false);
    }
  };

  // Configuration handlers
  const handleDynamicXpToggle = async () => {
    try {
      const newValue = !dynamicXpEnabled;
      await dbHelpers.setConfig('dynamicXpEnabled', newValue);
      setDynamicXpEnabled(newValue);
    } catch (error) {
      console.error('Error updating config:', error);
      alert('Error updating configuration. Please try again.');
    }
  };

  const handleGameModeToggle = async () => {
    try {
      const newValue = !gameModeEnabled;
      await dbHelpers.setConfig('gameModeEnabled', newValue);
      setGameModeEnabled(newValue);
    } catch (error) {
      console.error('Error updating config:', error);
      alert('Error updating configuration. Please try again.');
    }
  };

  const handleCloudSyncToggle = async () => {
    try {
      const newValue = !cloudSyncEnabled;
      await dbHelpers.setConfig('cloudSyncEnabled', newValue);
      setCloudSyncEnabled(newValue);
    } catch (error) {
      console.error('Error updating config:', error);
      alert('Error updating configuration. Please try again.');
    }
  };

  // Ensure default data handler
  const handleEnsureDefaults = async () => {
    setEnsuringDefaults(true);
    try {
      await ensureDefaultData();
      await loadData();
      await loadDataStats();
      alert('✅ Default situations and opportunities have been restored!');
    } catch (error) {
      console.error('Error ensuring defaults:', error);
      alert('Error restoring defaults. Please try again.');
    } finally {
      setEnsuringDefaults(false);
    }
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

          {/* Sort Controls for Situations */}
          <div className="card">
            <div className="sort-controls">
              <label htmlFor="situationSort" className="form-label">Sort by:</label>
              <select
                id="situationSort"
                className="form-select"
                value={situationSortBy}
                onChange={(e) => setSituationSortBy(e.target.value)}
              >
                <option value="alphabetical">A-Z</option>
                <option value="created">Newest First</option>
                <option value="updated">Recently Updated</option>
              </select>
            </div>
            <div style={{ marginTop: '12px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button
                className={`btn ${filterSituationThoughts ? 'btn-primary' : 'btn-secondary'}`}
                style={{ fontSize: '0.85em', padding: '6px 12px' }}
                onClick={() => setFilterSituationThoughts(f => !f)}
              >
                💭 With Thoughts Only {filterSituationThoughts ? `(${situations.length})` : ''}
              </button>
              <button
                className={`btn ${filterSituationHasEvents ? 'btn-primary' : 'btn-secondary'}`}
                style={{ fontSize: '0.85em', padding: '6px 12px' }}
                onClick={() => setFilterSituationHasEvents(f => !f)}
              >
                📋 Event Logged {filterSituationHasEvents ? `(${situations.length})` : ''}
              </button>
            </div>
          </div>

          {/* Tag Filter for Situations */}
          {availableSituationTags.length > 0 && (
            <div className="card">
              <h3>🏷️ Filter by Tags</h3>
              <div style={{display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '12px'}}>
                {availableSituationTags.map(tag => (
                  <button
                    key={tag}
                    onClick={() => toggleSituationTag(tag)}
                    style={{
                      padding: '6px 12px',
                      border: selectedSituationTags.includes(tag) ? '2px solid #28a745' : '1px solid #ccc',
                      borderRadius: '16px',
                      background: selectedSituationTags.includes(tag) ? 'rgba(40,167,69,0.15)' : 'var(--bg-tertiary)',
                      color: selectedSituationTags.includes(tag) ? 'var(--success)' : 'var(--text-secondary)',
                      cursor: 'pointer',
                      fontSize: '0.85rem',
                      fontWeight: selectedSituationTags.includes(tag) ? 'bold' : 'normal'
                    }}
                  >
                    {tag}
                  </button>
                ))}
              </div>
              {selectedSituationTags.length > 0 && (
                <div style={{marginTop: '12px'}}>
                  <button
                    onClick={() => setSelectedSituationTags([])}
                    style={{
                      padding: '4px 8px',
                      border: '1px solid #dc3545',
                      borderRadius: '12px',
                      background: 'rgba(220,53,69,0.15)',
                      color: 'var(--danger)',
                      cursor: 'pointer',
                      fontSize: '0.8rem'
                    }}
                  >
                    Clear Filters
                  </button>
                  <span style={{marginLeft: '12px', fontSize: '0.9rem', color: 'var(--text-secondary)'}}>
                    Showing {situations.length} of {allSituations.length} situations
                  </span>
                </div>
              )}
            </div>
          )}

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
                  <label className="form-label">Challenging Level</label>
                  <select
                    className="form-select"
                    value={situationForm.challengingLevel}
                    onChange={(e) => setSituationForm({ ...situationForm, challengingLevel: parseInt(e.target.value) })}
                  >
                    <option value={1}>1 - Very Easy</option>
                    <option value={2}>2 - Easy</option>
                    <option value={3}>3 - Medium</option>
                    <option value={4}>4 - Hard</option>
                    <option value={5}>5 - Very Hard</option>
                  </select>
                  <small style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'block', marginTop: '4px' }}>
                    Higher challenging levels give more XP when dynamic XP is enabled
                  </small>
                </div>

                <div className="form-group">
                  <label className="form-label">Situation Type</label>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      type="button"
                      onClick={() => setSituationForm({ ...situationForm, isMeta: false })}
                      style={{
                        flex: 1,
                        padding: '10px',
                        border: !situationForm.isMeta ? '2px solid #28a745' : '1px solid #ccc',
                        borderRadius: '8px',
                        background: !situationForm.isMeta ? 'rgba(40,167,69,0.15)' : 'var(--bg-secondary)',
                        color: !situationForm.isMeta ? 'var(--success)' : 'var(--text-primary)',
                        cursor: 'pointer',
                        textAlign: 'center',
                        fontWeight: !situationForm.isMeta ? 600 : 400
                      }}
                    >
                      🌍 Real
                      <div style={{ fontSize: '0.75rem', marginTop: '2px', fontWeight: 400 }}>Actual life events</div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setSituationForm({ ...situationForm, isMeta: true })}
                      style={{
                        flex: 1,
                        padding: '10px',
                        border: situationForm.isMeta ? '2px solid #6c757d' : '1px solid #ccc',
                        borderRadius: '8px',
                        background: situationForm.isMeta ? 'var(--bg-tertiary)' : 'var(--bg-secondary)',
                        color: situationForm.isMeta ? 'var(--text-primary)' : 'var(--text-primary)',
                        cursor: 'pointer',
                        textAlign: 'center',
                        fontWeight: situationForm.isMeta ? 600 : 400
                      }}
                    >
                      🪞 Meta
                      <div style={{ fontSize: '0.75rem', marginTop: '2px', fontWeight: 400 }}>Reflection / thinking</div>
                    </button>
                  </div>
                  <small style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'block', marginTop: '4px' }}>
                    Real situations award double positive XP in game mode
                  </small>
                </div>

                <div className="form-group">
                  <label className="form-label" style={{ marginBottom: '8px' }}>💭 Internal Dialogue</label>
                  <div style={{ background: 'var(--bg-tertiary)', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--border-color)', marginBottom: '12px' }}>
                    <p style={{ fontSize: '0.85rem', color: '#6c757d', margin: 0, lineHeight: '1.4' }}>
                      Add thought pairs (😈 back + 😇 forth) or standalone thoughts. Pairs are always shown together.
                    </p>
                  </div>

                  {situationForm.thoughtPairs.map((pair, index) => {
                    const isPair = pair.back !== null && pair.forth !== null;
                    const isSoloBack = pair.back !== null && pair.forth === null;
                    const isSoloForth = pair.back === null && pair.forth !== null;

                    return (
                      <div
                        key={index}
                        style={{
                          border: isPair ? '1px solid #dee2e6' : `1px solid ${isSoloBack ? '#dc354540' : '#007bff40'}`,
                          borderRadius: '8px',
                          padding: '10px',
                          marginBottom: '10px',
                          background: isPair ? 'var(--bg-tertiary)' : 'transparent',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                          <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                            {isPair ? '💭 Pair' : isSoloBack ? '😈 Back only' : '😇 Forth only'}
                          </span>
                          <button
                            type="button"
                            onClick={() => setSituationForm({
                              ...situationForm,
                              thoughtPairs: situationForm.thoughtPairs.filter((_, i) => i !== index)
                            })}
                            style={{ padding: '2px 7px', background: '#dc3545', color: 'white', border: 'none', borderRadius: '4px', fontSize: '0.8rem', cursor: 'pointer' }}
                          >
                            ✕
                          </button>
                        </div>

                        {pair.back !== null && (
                          <div style={{ marginBottom: isPair ? '8px' : 0 }}>
                            <div style={{ fontSize: '0.75rem', color: '#dc3545', fontWeight: 600, marginBottom: '4px' }}>😈 Back</div>
                            <textarea
                              className="form-input"
                              value={pair.back}
                              onChange={(e) => {
                                const updated = [...situationForm.thoughtPairs];
                                updated[index] = { ...updated[index], back: e.target.value };
                                setSituationForm({ ...situationForm, thoughtPairs: updated });
                              }}
                              placeholder="Negative/limiting thought..."
                              rows="2"
                              style={{ resize: 'vertical', minHeight: '60px', borderColor: '#dc3545', borderWidth: '1px' }}
                            />
                          </div>
                        )}

                        {isPair && (
                          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textAlign: 'center', margin: '2px 0 6px 0' }}>↓ countered by</div>
                        )}

                        {pair.forth !== null && (
                          <div>
                            <div style={{ fontSize: '0.75rem', color: '#007bff', fontWeight: 600, marginBottom: '4px' }}>😇 Forth</div>
                            <textarea
                              className="form-input"
                              value={pair.forth}
                              onChange={(e) => {
                                const updated = [...situationForm.thoughtPairs];
                                updated[index] = { ...updated[index], forth: e.target.value };
                                setSituationForm({ ...situationForm, thoughtPairs: updated });
                              }}
                              placeholder="Positive response/reframe..."
                              rows="2"
                              style={{ resize: 'vertical', minHeight: '60px', borderColor: '#007bff', borderWidth: '1px' }}
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}

                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '8px' }}>
                    <button
                      type="button"
                      onClick={() => setSituationForm({
                        ...situationForm,
                        thoughtPairs: [...situationForm.thoughtPairs, { back: '', forth: '' }]
                      })}
                      style={{ padding: '7px 14px', background: '#6c757d', color: 'white', border: 'none', borderRadius: '6px', fontSize: '0.85rem', cursor: 'pointer' }}
                    >
                      💭 Add Pair
                    </button>
                    <button
                      type="button"
                      onClick={() => setSituationForm({
                        ...situationForm,
                        thoughtPairs: [...situationForm.thoughtPairs, { back: '', forth: null }]
                      })}
                      style={{ padding: '7px 14px', background: '#c62828', color: 'white', border: 'none', borderRadius: '6px', fontSize: '0.85rem', cursor: 'pointer' }}
                    >
                      😈 Back Only
                    </button>
                    <button
                      type="button"
                      onClick={() => setSituationForm({
                        ...situationForm,
                        thoughtPairs: [...situationForm.thoughtPairs, { back: null, forth: '' }]
                      })}
                      style={{ padding: '7px 14px', background: '#1976d2', color: 'white', border: 'none', borderRadius: '6px', fontSize: '0.85rem', cursor: 'pointer' }}
                    >
                      😇 Forth Only
                    </button>
                  </div>
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
                  <div className="item-title-section">
                    <h4>{situation.title}</h4>
                    <div className="situation-stats" style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
                      <span style={{
                        background: situation.isMeta ? 'var(--bg-tertiary)' : 'rgba(40,167,69,0.15)',
                        color: situation.isMeta ? 'var(--text-secondary)' : 'var(--success)',
                        padding: '2px 8px',
                        borderRadius: '12px',
                        fontSize: '0.75rem',
                        fontWeight: 600
                      }}>
                        {situation.isMeta ? '🪞 Meta' : '🌍 Real'}
                      </span>
                      <span className="challenging-badge" style={{
                        background: situation.challenging_level >= 4 ? '#dc3545' : situation.challenging_level >= 3 ? '#ffc107' : '#28a745',
                        color: 'white',
                        padding: '2px 8px',
                        borderRadius: '12px',
                        fontSize: '0.75rem',
                        fontWeight: 'bold'
                      }}>
                        Level {situation.challenging_level}/5
                      </span>
                      {(eventCountsPerSit[situation.id] || 0) > 0 && (
                        <span style={{
                          background: 'rgba(40,167,69,0.15)',
                          color: 'var(--success)',
                          padding: '2px 8px',
                          borderRadius: '12px',
                          fontSize: '0.75rem',
                          fontWeight: 600
                        }}>
                          📋 {eventCountsPerSit[situation.id]} event{eventCountsPerSit[situation.id] !== 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                  </div>
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
                          background: 'rgba(40,167,69,0.15)',
                          color: 'var(--success)',
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
                
                {situation.thought_pairs?.length > 0 && (
                  <div style={{ marginBottom: '12px' }}>
                    <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-muted, #888)', marginBottom: '6px' }}>
                      💭 Thoughts
                    </div>
                    {situation.thought_pairs.map((pair, i) => (
                      <ThoughtPair
                        key={i}
                        backThought={pair.back}
                        forthThought={pair.forth}
                        defaultExpanded={false}
                      />
                    ))}
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

          {/* Sort Controls for Opportunities */}
          <div className="card">
            <div className="sort-controls">
              <label htmlFor="opportunitySort" className="form-label">Sort by:</label>
              <select
                id="opportunitySort"
                className="form-select"
                value={opportunitySortBy}
                onChange={(e) => setOpportunitySortBy(e.target.value)}
              >
                <option value="alphabetical">A-Z</option>
                <option value="level">Level</option>
                <option value="xp">XP Progress</option>
                <option value="created">Newest First</option>
              </select>
            </div>
            <div style={{ marginTop: '12px' }}>
              <button
                className={`btn ${filterOpportunityHasEvents ? 'btn-primary' : 'btn-secondary'}`}
                style={{ fontSize: '0.85em', padding: '6px 12px' }}
                onClick={() => setFilterOpportunityHasEvents(f => !f)}
              >
                📋 Event Logged {filterOpportunityHasEvents ? `(${opportunities.length})` : ''}
              </button>
            </div>
          </div>

          {/* Tag Filter for Opportunities */}
          {availableOpportunityTags.length > 0 && (
            <div className="card">
              <h3>🏷️ Filter by Tags</h3>
              <div style={{display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '12px'}}>
                {availableOpportunityTags.map(tag => (
                  <button
                    key={tag}
                    onClick={() => toggleOpportunityTag(tag)}
                    style={{
                      padding: '6px 12px',
                      border: selectedOpportunityTags.includes(tag) ? '2px solid #1976d2' : '1px solid #ccc',
                      borderRadius: '16px',
                      background: selectedOpportunityTags.includes(tag) ? 'rgba(25,118,210,0.15)' : 'var(--bg-tertiary)',
                      color: selectedOpportunityTags.includes(tag) ? '#2196f3' : 'var(--text-secondary)',
                      cursor: 'pointer',
                      fontSize: '0.85rem',
                      fontWeight: selectedOpportunityTags.includes(tag) ? 'bold' : 'normal'
                    }}
                  >
                    {tag}
                  </button>
                ))}
              </div>
              {selectedOpportunityTags.length > 0 && (
                <div style={{marginTop: '12px'}}>
                  <button
                    onClick={() => setSelectedOpportunityTags([])}
                    style={{
                      padding: '4px 8px',
                      border: '1px solid #dc3545',
                      borderRadius: '12px',
                      background: 'rgba(220,53,69,0.15)',
                      color: 'var(--danger)',
                      cursor: 'pointer',
                      fontSize: '0.8rem'
                    }}
                  >
                    Clear Filters
                  </button>
                  <span style={{marginLeft: '12px', fontSize: '0.9rem', color: 'var(--text-secondary)'}}>
                    Showing {opportunities.length} of {allOpportunities.length} opportunities
                  </span>
                </div>
              )}
            </div>
          )}

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

                {/* Path selection — only shown when game mode is enabled */}
                {gameModeEnabled && (
                  <div className="form-group">
                    <label className="form-label">
                      Growth Path
                      {editingOpportunity?.path_locked && (
                        <span style={{ marginLeft: '8px', fontSize: '0.75rem', color: 'var(--warning)', background: 'rgba(255,193,7,0.15)', padding: '2px 8px', borderRadius: '12px' }}>
                          🔒 Locked at level 3
                        </span>
                      )}
                    </label>
                    {editingOpportunity?.path_locked ? (
                      <div style={{ padding: '10px 14px', background: 'var(--bg-secondary, #f5f5f5)', border: '1px solid #ccc', borderRadius: '8px', fontSize: '0.9rem' }}>
                        {PATHS[opportunityForm.path]?.icon} {PATHS[opportunityForm.path]?.name} — <em>{PATHS[opportunityForm.path]?.philosophy}</em>
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '4px' }}>Path is permanently locked. It cannot be changed.</div>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {PATH_KEYS.map(key => {
                          const p = PATHS[key];
                          const isSelected = opportunityForm.path === key;
                          return (
                            <button
                              key={key}
                              type="button"
                              onClick={() => setOpportunityForm({ ...opportunityForm, path: key })}
                              style={{
                                display: 'flex',
                                alignItems: 'flex-start',
                                gap: '10px',
                                padding: '10px 12px',
                                border: isSelected ? '2px solid #1976d2' : '1px solid #ccc',
                                borderRadius: '8px',
                                background: isSelected ? 'rgba(25,118,210,0.15)' : 'var(--bg-secondary)',
                                cursor: 'pointer',
                                textAlign: 'left',
                              }}
                            >
                              <span style={{ fontSize: '1.2em', lineHeight: 1.2 }}>{p.icon}</span>
                              <div>
                                <div style={{ fontWeight: isSelected ? 700 : 500, fontSize: '0.9rem', color: isSelected ? '#2196f3' : 'var(--text-primary)' }}>
                                  {p.name}
                                </div>
                                <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '2px' }}>{p.philosophy}</div>
                                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '3px' }}>
                                  {p.labels.join(' → ')}
                                </div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                    {!editingOpportunity?.path_locked && (
                      <small style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'block', marginTop: '4px' }}>
                        Path locks permanently after reaching level 3 (700 game XP).
                      </small>
                    )}
                  </div>
                )}

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
                    <div className="opportunity-stats" style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
                      <span className="level-badge">Level {opportunity.current_level}</span>
                      <span className="xp-text">{opportunity.current_xp}/100 XP</span>
                      {gameModeEnabled && (() => {
                        const pathKey = opportunity.path || 'default';
                        const pathInfo = PATHS[pathKey];
                        const levelInfo = getPathLevel(opportunity.game_xp || 0, pathKey);
                        return (
                          <>
                            <span style={{
                              background: 'rgba(156,39,176,0.15)',
                              color: '#ab47bc',
                              padding: '2px 8px',
                              borderRadius: '12px',
                              fontSize: '0.75rem',
                              fontWeight: 600
                            }}>
                              {pathInfo.icon} {levelInfo.fullLabel}{levelInfo.isPrestige ? ` — sub ${levelInfo.prestigeSub}` : ''}
                            </span>
                            {opportunity.path_locked && (
                              <span style={{ fontSize: '0.72rem', color: 'var(--warning)' }}>🔒</span>
                            )}
                          </>
                        );
                      })()}
                      {(eventCountsPerOpp[opportunity.id] || 0) > 0 && (
                        <span style={{
                          background: 'rgba(25,118,210,0.15)',
                          color: '#2196f3',
                          padding: '2px 8px',
                          borderRadius: '12px',
                          fontSize: '0.75rem',
                          fontWeight: 600
                        }}>
                          📋 {eventCountsPerOpp[opportunity.id]} event{eventCountsPerOpp[opportunity.id] !== 1 ? 's' : ''}
                        </span>
                      )}
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
                          background: 'rgba(25,118,210,0.15)',
                          color: '#2196f3',
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

            <div style={{
              padding: '15px',
              background: 'var(--bg-tertiary)',
              borderRadius: '8px',
              marginBottom: '20px'
            }}>
              <h4 style={{margin: '0 0 12px 0', fontSize: '1rem'}}>🎮 Game Mode</h4>
              <div style={{display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px'}}>
                <label style={{display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer'}}>
                  <input
                    type="checkbox"
                    checked={gameModeEnabled}
                    onChange={handleGameModeToggle}
                    style={{transform: 'scale(1.2)'}}
                  />
                  <span style={{fontWeight: 'bold'}}>Enable Game Mode</span>
                </label>
              </div>
              <p style={{margin: '0', fontSize: '0.9rem', color: 'var(--text-secondary)'}}>
                {gameModeEnabled
                  ? "Game mode active — new XP values (Well Done +10/+20, Tried +4/+8), paths, streaks, and more. Real situations award double positive XP."
                  : "Game mode off — standard XP and views. Enable to unlock the full game layer."
                }
              </p>
            </div>

            <div style={{
              padding: '15px',
              background: 'var(--bg-tertiary)',
              borderRadius: '8px',
              marginBottom: '20px'
            }}>
              <h4 style={{margin: '0 0 12px 0', fontSize: '1rem'}}>⚡ XP System</h4>
              <div style={{display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px'}}>
                <label style={{display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer'}}>
                  <input
                    type="checkbox"
                    checked={dynamicXpEnabled}
                    onChange={handleDynamicXpToggle}
                    style={{transform: 'scale(1.2)'}}
                  />
                  <span style={{fontWeight: 'bold'}}>Dynamic XP</span>
                </label>
              </div>
              <p style={{margin: '0', fontSize: '0.9rem', color: 'var(--text-secondary)'}}>
                {dynamicXpEnabled
                  ? "XP rewards are multiplied based on situation challenging level. Higher challenging levels give more XP."
                  : "XP rewards are fixed regardless of situation challenging level."
                }
              </p>
            </div>

            <div style={{
              padding: '15px',
              background: 'var(--bg-tertiary)',
              borderRadius: '8px',
              marginBottom: '20px'
            }}>
              <h4 style={{margin: '0 0 12px 0', fontSize: '1rem'}}>☁️ Cloud Sync</h4>
              <div style={{display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px'}}>
                <label style={{display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer'}}>
                  <input
                    type="checkbox"
                    checked={cloudSyncEnabled}
                    onChange={handleCloudSyncToggle}
                    style={{transform: 'scale(1.2)'}}
                  />
                  <span style={{fontWeight: 'bold'}}>Enable Cloud Sync</span>
                </label>
              </div>
              <p style={{margin: '0', fontSize: '0.9rem', color: 'var(--text-secondary)'}}>
                {cloudSyncEnabled 
                  ? "Cloud sync button is visible. You can sync your data to the cloud." 
                  : "Cloud sync is disabled and the sync button is hidden from the interface."
                }
              </p>
            </div>
          </div>

          {/* Data Export/Import */}
          <div className="card">
            <h3>📤 Data Management</h3>
            
            {dataStats && (
              <div style={{
                background: 'var(--bg-tertiary)',
                padding: '15px',
                borderRadius: '8px',
                marginBottom: '20px'
              }}>
                <h4 style={{margin: '0 0 12px 0', fontSize: '1rem'}}>📊 Current Data</h4>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
                  gap: '12px',
                  fontSize: '0.9rem'
                }}>
                  <div>
                    <strong>{dataStats.situations}</strong>
                    <div style={{color: 'var(--text-secondary)'}}>Situations</div>
                  </div>
                  <div>
                    <strong>{dataStats.opportunities}</strong>
                    <div style={{color: 'var(--text-secondary)'}}>Opportunities</div>
                  </div>
                  <div>
                    <strong>{dataStats.links}</strong>
                    <div style={{color: 'var(--text-secondary)'}}>Links</div>
                  </div>
                  <div>
                    <strong>{dataStats.events}</strong>
                    <div style={{color: 'var(--text-secondary)'}}>Events</div>
                  </div>
                </div>
              </div>
            )}

            <div style={{
              display: 'flex',
              gap: '12px',
              marginBottom: '20px',
              flexWrap: 'wrap'
            }}>
              <button
                className="btn btn-primary"
                onClick={handleExportData}
                disabled={exporting || !dataStats || dataStats.situations === 0}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}
              >
                {exporting ? '⏳' : '📤'} 
                {exporting ? 'Exporting...' : 'Export All Data'}
              </button>
              
              <button
                className="btn btn-secondary"
                onClick={handleImportData}
                disabled={importing}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}
              >
                {importing ? '⏳' : '📥'} 
                {importing ? 'Importing...' : 'Import Data'}
              </button>
              
              <button
                className="btn btn-outline"
                onClick={handleEnsureDefaults}
                disabled={ensuringDefaults}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  border: '1px solid #6c757d',
                  color: '#6c757d'
                }}
              >
                {ensuringDefaults ? '⏳' : '🔄'} 
                {ensuringDefaults ? 'Restoring...' : 'Restore Defaults'}
              </button>
            </div>

            {importResult && (
              <div style={{
                background: 'rgba(40,167,69,0.15)',
                border: '1px solid rgba(40,167,69,0.3)',
                color: 'var(--success)',
                padding: '12px',
                borderRadius: '8px',
                marginBottom: '20px'
              }}>
                <h4 style={{margin: '0 0 8px 0'}}>✅ Import Successful!</h4>
                <div style={{fontSize: '0.9rem'}}>
                  Imported: {importResult.situationsCount} situations, {importResult.opportunitiesCount} opportunities, {importResult.linksCount} links, {importResult.eventsCount} events
                </div>
              </div>
            )}

            <div style={{
              fontSize: '0.85rem',
              color: 'var(--text-secondary)',
              lineHeight: '1.4'
            }}>
              <p><strong>Export:</strong> Download all your data as a JSON file for backup or transfer.</p>
              <p><strong>Import:</strong> Upload a previously exported JSON file. This will replace all current data.</p>
              <p><strong>Restore Defaults:</strong> Ensures essential situations and opportunities are always available. Safe to use - won't delete your custom data.</p>
              <p><strong>⚠️ Warning:</strong> Import will permanently delete all existing data. Make sure to export first if you want to keep your current data.</p>
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