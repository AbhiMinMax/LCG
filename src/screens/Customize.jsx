import { useState, useEffect, useRef } from 'react';
import { db, dbHelpers, ensureDefaultData, ANTAGONIST_HP_POOLS, ANTAGONIST_LEVEL_LABELS } from '../database/db';
import TagInput from '../components/TagInput';
import PWAUninstall from '../components/PWAUninstall';
import { ThoughtPair } from '../components/ThoughtPassage';
import { PATHS, PATH_KEYS, getPathLevel, getRebirthInfo, getRebirthSymbols } from '../utils/pathUtils';
import './ProgressStyles.css';

function Customize() {
  const [activeTab, setActiveTab] = useState('situations');
  
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
  const [situationSearch, setSituationSearch] = useState('');
  const [opportunitySearch, setOpportunitySearch] = useState('');
  const [eventCountsPerSit, setEventCountsPerSit] = useState({});
  const [eventCountsPerOpp, setEventCountsPerOpp] = useState({});
  const [oppLinkedSits, setOppLinkedSits] = useState({}); // oppId → [situation title strings]
  
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
  const [situationBossThreshold, setSituationBossThreshold] = useState(5);
  const [bossDissolutionThreshold, setBossDissolutionThreshold] = useState(5);
  const [breadthWeeklyTarget, setBreadthWeeklyTarget] = useState(7);
  const [masteryStreakMinDisplay, setMasteryStreakMinDisplay] = useState(3);
  const [opportunityBossWindow, setOpportunityBossWindow] = useState(20);
  
  // Archived opportunities (separate from active list)
  const [archivedOpportunities, setArchivedOpportunities] = useState([]);
  const [showArchived, setShowArchived] = useState(false);

  // Merge state
  const [mergingOpp, setMergingOpp] = useState(null);  // opp being merged away
  const [mergeTargetId, setMergeTargetId] = useState('');
  const [merging, setMerging] = useState(false);

  // Antagonist state
  const [activeAntagonists, setActiveAntagonists] = useState([]);
  const [defeatedAntagonists, setDefeatedAntagonists] = useState([]);
  const [showAntagonistForm, setShowAntagonistForm] = useState(false);
  const [editingAntagonist, setEditingAntagonist] = useState(null);
  const [antagonistForm, setAntagonistForm] = useState({
    name: '',
    description: '',
    startingLevel: 5,
    taggedSituationIds: [],
  });
  const [antagonistSituationSearch, setAntagonistSituationSearch] = useState('');
  const [deleteConfirmAntagonistId, setDeleteConfirmAntagonistId] = useState(null);

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
  
  const thoughtPairDragIndex = useRef(null);
  const [thoughtDragSrc, setThoughtDragSrc] = useState(null);

  const handleThoughtTouchStart = (e, index) => {
    e.stopPropagation();
    thoughtPairDragIndex.current = index;
    setThoughtDragSrc(index);

    const handleMove = (ev) => ev.preventDefault();
    const handleEnd = (ev) => {
      const touch = ev.changedTouches[0];
      const el = document.elementFromPoint(touch.clientX, touch.clientY);
      const pairEl = el?.closest('[data-pair-index]');
      if (pairEl) {
        const to = parseInt(pairEl.dataset.pairIndex, 10);
        const from = thoughtPairDragIndex.current;
        if (!isNaN(to) && from !== null && to !== from) {
          setSituationForm(prev => {
            const updated = [...prev.thoughtPairs];
            const [moved] = updated.splice(from, 1);
            updated.splice(to, 0, moved);
            return { ...prev, thoughtPairs: updated };
          });
        }
      }
      thoughtPairDragIndex.current = null;
      setThoughtDragSrc(null);
      document.removeEventListener('touchmove', handleMove);
      document.removeEventListener('touchend', handleEnd);
    };

    document.addEventListener('touchmove', handleMove, { passive: false });
    document.addEventListener('touchend', handleEnd);
  };

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
    loadAntagonists();
  }, []);

  const loadAntagonists = async () => {
    try {
      const all = await dbHelpers.getAllAntagonists();
      setActiveAntagonists(all.filter(a => a.status === 'active'));
      setDefeatedAntagonists(all.filter(a => a.status === 'defeated'));
    } catch (error) {
      console.error('[Customize] loadAntagonists error:', error);
    }
  };

  const loadConfig = async () => {
    try {
      const [dynamicXp, cloudSync, gameMode, sitBoss, bossDiss, breadth, mastery, oppBoss] = await Promise.all([
        dbHelpers.getConfig('dynamicXpEnabled', false),
        dbHelpers.getConfig('cloudSyncEnabled', false),
        dbHelpers.getConfig('gameModeEnabled', false),
        dbHelpers.getConfig('situationBossThreshold', 5),
        dbHelpers.getConfig('bossDissolutionThreshold', 5),
        dbHelpers.getConfig('breadthWeeklyTarget', 7),
        dbHelpers.getConfig('masteryStreakMinDisplay', 3),
        dbHelpers.getConfig('opportunityBossWindow', 20),
      ]);
      setDynamicXpEnabled(dynamicXp);
      setCloudSyncEnabled(cloudSync);
      setGameModeEnabled(gameMode);
      setSituationBossThreshold(sitBoss);
      setBossDissolutionThreshold(bossDiss);
      setBreadthWeeklyTarget(breadth);
      setMasteryStreakMinDisplay(mastery);
      setOpportunityBossWindow(oppBoss);
    } catch (error) {
      console.error('Error loading config:', error);
    }
  };

  // Generic config number saver — clamps to [min, max], persists to DB
  const saveNumConfig = async (key, val, min, max, defaultVal, setter) => {
    const n = Math.max(min, Math.min(max, parseInt(val) || defaultVal));
    setter(n);
    try {
      await dbHelpers.setConfig(key, n);
    } catch (error) {
      console.error(`Error saving config ${key}:`, error);
    }
  };

  const handleBossThresholdChange      = v => saveNumConfig('situationBossThreshold', v, 3, 20, 5,  setSituationBossThreshold);
  const handleBossDissolutionChange    = v => saveNumConfig('bossDissolutionThreshold', v, 2, 15, 5, setBossDissolutionThreshold);
  const handleBreadthTargetChange      = v => saveNumConfig('breadthWeeklyTarget', v, 2, 14, 7,  setBreadthWeeklyTarget);
  const handleMasteryMinDisplayChange  = v => saveNumConfig('masteryStreakMinDisplay', v, 1, 10, 3, setMasteryStreakMinDisplay);
  const handleOppBossWindowChange      = v => saveNumConfig('opportunityBossWindow', v, 5, 50, 20, setOpportunityBossWindow);

  useEffect(() => {
    const filterAndSortSituations = () => {
      let filtered = allSituations;

      if (situationSearch.trim()) {
        const q = situationSearch.trim().toLowerCase();
        filtered = filtered.filter(s =>
          s.title.toLowerCase().includes(q) ||
          (s.description && s.description.toLowerCase().includes(q))
        );
      }

      if (selectedSituationTags.length > 0) {
        filtered = filtered.filter(situation =>
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
  }, [situationSortBy, situationSearch, selectedSituationTags, filterSituationThoughts, filterSituationHasEvents, eventCountsPerSit, allSituations]);

  useEffect(() => {
    const filterAndSortOpportunities = () => {
      // Split archived from active
      setArchivedOpportunities(allOpportunities.filter(o => o.archived));

      let filtered = allOpportunities.filter(o => !o.archived);

      if (opportunitySearch.trim()) {
        const q = opportunitySearch.trim().toLowerCase();
        filtered = filtered.filter(o =>
          o.title.toLowerCase().includes(q) ||
          (o.description && o.description.toLowerCase().includes(q))
        );
      }

      if (selectedOpportunityTags.length > 0) {
        filtered = filtered.filter(opportunity =>
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
  }, [opportunitySortBy, opportunitySearch, selectedOpportunityTags, filterOpportunityHasEvents, eventCountsPerOpp, allOpportunities]);

  const loadData = async () => {
    try {
      const [situationsData, opportunitiesData, sitTags, oppTags, sitCounts, oppCounts, links] = await Promise.all([
        dbHelpers.getSituationsWithOpportunities(),
        db.opportunities.toArray(),
        dbHelpers.getAllSituationTags(),
        dbHelpers.getAllOpportunityTags(),
        dbHelpers.getEventCountsPerSituation(),
        dbHelpers.getEventCountsPerOpportunity(),
        db.situation_opportunities.toArray(),
      ]);
      setAllSituations(situationsData);
      setSituations(situationsData);
      setAllOpportunities(opportunitiesData);
      setOpportunities(opportunitiesData);
      setAvailableSituationTags(sitTags);
      setAvailableOpportunityTags(oppTags);
      setEventCountsPerSit(sitCounts);
      setEventCountsPerOpp(oppCounts);

      // Build oppId → [situation title] map for linked situations display
      const sitTitleMap = Object.fromEntries(situationsData.map(s => [s.id, s.title]));
      const linked = {};
      for (const link of links) {
        if (!linked[link.opportunity_id]) linked[link.opportunity_id] = [];
        const title = sitTitleMap[link.situation_id];
        if (title) linked[link.opportunity_id].push(title);
      }
      setOppLinkedSits(linked);
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
      description: situation.description || '',
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
      description: opportunity.description || '',
      tags: opportunity.tags || [],
      initialLevel: opportunity.current_level || 1,
      path: opportunity.path || 'default'
    });
    setShowOpportunityForm(true);
  };

  const handleArchiveOpportunity = async (opportunity) => {
    if (!confirm(`Archive "${opportunity.title}"? It will be hidden from active views but all history is preserved.`)) return;
    try {
      await dbHelpers.archiveOpportunity(opportunity.id);
      await loadData();
    } catch (error) {
      console.error('[Customize] archiveOpportunity error:', error);
      alert('Error archiving opportunity.');
    }
  };

  const handleUnarchiveOpportunity = async (opportunity) => {
    try {
      await dbHelpers.unarchiveOpportunity(opportunity.id);
      await loadData();
    } catch (error) {
      console.error('[Customize] unarchiveOpportunity error:', error);
      alert('Error unarchiving opportunity.');
    }
  };

  const handleDeleteOpportunityForce = async (opportunity) => {
    const eventCount = eventCountsPerOpp[opportunity.id] || 0;
    const confirmText = eventCount > 0
      ? `This opportunity has ${eventCount} event${eventCount !== 1 ? 's' : ''} in history. Deleting it is permanent — event history entries will still exist but the opportunity reference will be broken.\n\nType the opportunity title to confirm deletion:`
      : 'Delete this opportunity permanently?';

    if (eventCount > 0) {
      const typed = prompt(confirmText);
      if (typed !== opportunity.title) {
        if (typed !== null) alert('Title did not match. Deletion cancelled.');
        return;
      }
    } else {
      if (!confirm(confirmText)) return;
    }

    try {
      await dbHelpers.deleteOpportunity(opportunity.id);
      await loadData();
    } catch (error) {
      console.error('[Customize] deleteOpportunity error:', error);
      alert('Error deleting opportunity.');
    }
  };

  const handleStartMerge = (opportunity) => {
    setMergingOpp(opportunity);
    setMergeTargetId('');
  };

  const handleConfirmMerge = async () => {
    if (!mergingOpp || !mergeTargetId) return;
    const target = allOpportunities.find(o => o.id === parseInt(mergeTargetId));
    if (!target) return;
    if (!confirm(`Merge "${mergingOpp.title}" into "${target.title}"?\n\nThis will:\n• Add all XP from "${mergingOpp.title}" to "${target.title}"\n• Redirect all event history to "${target.title}"\n• Permanently delete "${mergingOpp.title}"\n\nThis cannot be undone.`)) return;

    setMerging(true);
    try {
      await dbHelpers.mergeOpportunities(target.id, mergingOpp.id);
      setMergingOpp(null);
      setMergeTargetId('');
      await loadData();
    } catch (error) {
      console.error('[Customize] mergeOpportunities error:', error);
      alert('Error merging opportunities.');
    } finally {
      setMerging(false);
    }
  };

  // ─── Antagonist handlers ───────────────────────────────────────────────────

  const resetAntagonistForm = () => {
    setAntagonistForm({ name: '', description: '', startingLevel: 5, taggedSituationIds: [] });
    setEditingAntagonist(null);
    setShowAntagonistForm(false);
    setAntagonistSituationSearch('');
  };

  const handleAntagonistSubmit = async (e) => {
    e.preventDefault();
    if (!antagonistForm.name.trim()) {
      alert('Name is required.');
      return;
    }
    try {
      if (editingAntagonist) {
        await dbHelpers.updateAntagonist(editingAntagonist.id, {
          name: antagonistForm.name.trim(),
          description: antagonistForm.description.trim(),
          taggedSituationIds: antagonistForm.taggedSituationIds,
        });
      } else {
        await dbHelpers.createAntagonist(
          antagonistForm.name,
          antagonistForm.description,
          antagonistForm.startingLevel,
          antagonistForm.taggedSituationIds
        );
      }
      resetAntagonistForm();
      await loadAntagonists();
    } catch (error) {
      console.error('[Customize] antagonist save error:', error);
      alert('Error saving antagonist. Please try again.');
    }
  };

  const handleEditAntagonist = (antagonist) => {
    setEditingAntagonist(antagonist);
    setAntagonistForm({
      name: antagonist.name,
      description: antagonist.description || '',
      startingLevel: antagonist.startingLevel,
      taggedSituationIds: antagonist.taggedSituationIds || [],
    });
    setShowAntagonistForm(true);
  };

  const handleDeleteAntagonist = async (antagonist) => {
    if (deleteConfirmAntagonistId !== antagonist.id) {
      setDeleteConfirmAntagonistId(antagonist.id);
      return;
    }
    try {
      await dbHelpers.deleteAntagonist(antagonist.id);
      setDeleteConfirmAntagonistId(null);
      await loadAntagonists();
    } catch (error) {
      console.error('[Customize] deleteAntagonist error:', error);
      alert('Error deleting antagonist.');
    }
  };

  const toggleAntagonistSituation = (sitId) => {
    setAntagonistForm(prev => ({
      ...prev,
      taggedSituationIds: prev.taggedSituationIds.includes(sitId)
        ? prev.taggedSituationIds.filter(id => id !== sitId)
        : [...prev.taggedSituationIds, sitId],
    }));
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
      if (newValue) {
        // Backfill game_xp for events logged before game mode was enabled
        await dbHelpers.backfillGameXp();
      }
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
          {gameModeEnabled && (
            <button
              className={`tab-button ${activeTab === 'antagonists' ? 'active' : ''}`}
              onClick={() => setActiveTab('antagonists')}
            >
              ⚔️ Antagonists ({activeAntagonists.length})
            </button>
          )}
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
            <input
              type="text"
              className="form-input"
              placeholder="Search situations…"
              value={situationSearch}
              onChange={e => setSituationSearch(e.target.value)}
              style={{ marginBottom: '12px' }}
            />
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
                        data-pair-index={index}
                        draggable
                        onDragStart={() => { thoughtPairDragIndex.current = index; setThoughtDragSrc(index); }}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => {
                          e.preventDefault();
                          const from = thoughtPairDragIndex.current;
                          if (from === null || from === index) return;
                          const updated = [...situationForm.thoughtPairs];
                          const [moved] = updated.splice(from, 1);
                          updated.splice(index, 0, moved);
                          setSituationForm({ ...situationForm, thoughtPairs: updated });
                          thoughtPairDragIndex.current = null;
                          setThoughtDragSrc(null);
                        }}
                        onDragEnd={() => { thoughtPairDragIndex.current = null; setThoughtDragSrc(null); }}
                        style={{
                          border: isPair ? '1px solid #dee2e6' : `1px solid ${isSoloBack ? '#dc354540' : '#007bff40'}`,
                          borderRadius: '8px',
                          padding: '10px',
                          marginBottom: '10px',
                          background: isPair ? 'var(--bg-tertiary)' : 'transparent',
                          opacity: thoughtDragSrc === index ? 0.45 : 1,
                          transition: 'opacity 0.15s',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span
                              style={{ display: 'flex', flexDirection: 'column', gap: '3px', cursor: 'grab', userSelect: 'none', touchAction: 'none', padding: '4px 8px 4px 2px' }}
                              title="Drag to reorder"
                              onTouchStart={(e) => handleThoughtTouchStart(e, index)}
                            >
                              {[0,1,2].map(i => (
                                <span key={i} style={{ display: 'flex', gap: '3px' }}>
                                  <span style={{ width: '4px', height: '4px', borderRadius: '50%', background: 'var(--text-muted, #aaa)', display: 'block' }} />
                                  <span style={{ width: '4px', height: '4px', borderRadius: '50%', background: 'var(--text-muted, #aaa)', display: 'block' }} />
                                </span>
                              ))}
                            </span>
                            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                              {isPair ? '💭 Pair' : isSoloBack ? '😈 Back only' : '😇 Forth only'}
                            </span>
                          </div>
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
                
                {situation.description ? <p className="item-description">{situation.description}</p> : null}
                
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
            <input
              type="text"
              className="form-input"
              placeholder="Search opportunities…"
              value={opportunitySearch}
              onChange={e => setOpportunitySearch(e.target.value)}
              style={{ marginBottom: '12px' }}
            />
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
                        const { rebirths } = getRebirthInfo(opportunity.game_xp || 0);
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
                              {pathInfo.icon} {levelInfo.fullLabel}
                              {rebirths > 0 && <span style={{ marginLeft: 4, color: '#c8a84b' }}>{getRebirthSymbols(rebirths, opportunity.path)}</span>}
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
                      onClick={() => handleStartMerge(opportunity)}
                      title="Merge into another opportunity"
                      style={{ fontSize: '0.85rem' }}
                    >
                      ⇄
                    </button>
                    <button
                      className="btn-icon"
                      onClick={() => handleArchiveOpportunity(opportunity)}
                      title="Archive"
                      style={{ fontSize: '0.85rem', opacity: 0.7 }}
                    >
                      📦
                    </button>
                    <button
                      className="btn-icon"
                      onClick={() => handleDeleteOpportunityForce(opportunity)}
                      title="Delete permanently"
                      style={{ fontSize: '0.85rem', opacity: 0.5 }}
                    >
                      🗑️
                    </button>
                  </div>
                </div>

                {/* Merge panel */}
                {mergingOpp?.id === opportunity.id && (
                  <div style={{
                    marginTop: 10,
                    padding: '12px 14px',
                    background: 'var(--bg-tertiary)',
                    borderRadius: 8,
                    border: '1px solid var(--border-color)',
                  }}>
                    <div style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: 8 }}>
                      Merge "{opportunity.title}" into:
                    </div>
                    <select
                      className="form-select"
                      value={mergeTargetId}
                      onChange={e => setMergeTargetId(e.target.value)}
                      style={{ marginBottom: 10 }}
                    >
                      <option value="">— select target —</option>
                      {opportunities.filter(o => o.id !== opportunity.id).map(o => (
                        <option key={o.id} value={o.id}>{o.title}</option>
                      ))}
                    </select>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        className="btn btn-primary"
                        style={{ fontSize: '0.85rem', padding: '6px 14px' }}
                        disabled={!mergeTargetId || merging}
                        onClick={handleConfirmMerge}
                      >
                        {merging ? 'Merging…' : 'Merge'}
                      </button>
                      <button
                        className="btn btn-secondary"
                        style={{ fontSize: '0.85rem', padding: '6px 14px' }}
                        onClick={() => setMergingOpp(null)}
                      >
                        Cancel
                      </button>
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: 8 }}>
                      XP is combined. All events are redirected to the target. This cannot be undone.
                    </div>
                  </div>
                )}

                {opportunity.description && (<p className="item-description">{opportunity.description}</p>)}

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

                {/* Linked situations */}
                {(oppLinkedSits[opportunity.id] || []).length > 0 && (
                  <div style={{ marginBottom: '12px' }}>
                    <strong style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Linked situations:</strong>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '4px' }}>
                      {(oppLinkedSits[opportunity.id] || []).map(title => (
                        <span key={title} style={{
                          display: 'inline-block',
                          background: 'rgba(40,167,69,0.12)',
                          color: 'var(--success, #28a745)',
                          padding: '2px 8px',
                          borderRadius: '12px',
                          fontSize: '0.75rem',
                        }}>
                          {title}
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

          {/* Archived opportunities */}
          {archivedOpportunities.length > 0 && (
            <div style={{ marginTop: 20 }}>
              <button
                onClick={() => setShowArchived(v => !v)}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--text-secondary)',
                  fontSize: '0.88rem',
                  padding: '6px 0',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                {showArchived ? '▼' : '▶'} Archived ({archivedOpportunities.length})
              </button>

              {showArchived && (
                <div className="items-list" style={{ marginTop: 8, opacity: 0.75 }}>
                  {archivedOpportunities.map(opportunity => (
                    <div key={opportunity.id} className="card item-card" style={{ borderStyle: 'dashed' }}>
                      <div className="item-header">
                        <div className="item-title-section">
                          <h4 style={{ color: 'var(--text-secondary)' }}>{opportunity.title}</h4>
                          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                            <span style={{
                              background: 'rgba(108,117,125,0.15)',
                              color: 'var(--text-secondary)',
                              padding: '2px 8px',
                              borderRadius: 12,
                              fontSize: '0.72rem',
                              fontWeight: 600,
                            }}>
                              📦 Archived
                            </span>
                            {(eventCountsPerOpp[opportunity.id] || 0) > 0 && (
                              <span style={{
                                background: 'rgba(25,118,210,0.1)',
                                color: 'var(--text-secondary)',
                                padding: '2px 8px',
                                borderRadius: 12,
                                fontSize: '0.72rem',
                              }}>
                                {eventCountsPerOpp[opportunity.id]} event{eventCountsPerOpp[opportunity.id] !== 1 ? 's' : ''} in history
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="item-actions">
                          <button
                            className="btn btn-secondary"
                            style={{ fontSize: '0.78rem', padding: '4px 10px' }}
                            onClick={() => handleUnarchiveOpportunity(opportunity)}
                            title="Restore to active"
                          >
                            Restore
                          </button>
                          <button
                            className="btn-icon"
                            onClick={() => handleDeleteOpportunityForce(opportunity)}
                            title="Delete permanently"
                            style={{ fontSize: '0.85rem', opacity: 0.5 }}
                          >
                            🗑️
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Antagonists Tab */}
      {activeTab === 'antagonists' && gameModeEnabled && (
        <div className="tab-content">
          <div className="card">
            <div className="section-header">
              <h3>⚔️ Declared Antagonists</h3>
              <button className="btn btn-success" onClick={() => setShowAntagonistForm(true)}>
                + Declare Antagonist
              </button>
            </div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', marginTop: 8, marginBottom: 0 }}>
              Name a real-life struggle and fight it through your logged situations.
            </p>
          </div>

          {/* Create / Edit form */}
          {showAntagonistForm && (
            <div className="card form-card">
              <h4>{editingAntagonist ? 'Edit' : 'Declare'} Antagonist</h4>
              <form onSubmit={handleAntagonistSubmit}>
                <div className="form-group">
                  <label className="form-label">Name *</label>
                  <input
                    type="text"
                    className="form-input"
                    value={antagonistForm.name}
                    onChange={e => setAntagonistForm({ ...antagonistForm, name: e.target.value })}
                    placeholder="e.g., Procrastination, Social anxiety…"
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Why this fight matters (private, optional)</label>
                  <textarea
                    className="form-input form-textarea"
                    value={antagonistForm.description}
                    onChange={e => setAntagonistForm({ ...antagonistForm, description: e.target.value })}
                    placeholder="Your motivation, context, what winning looks like…"
                    rows={3}
                  />
                </div>

                {/* Starting level — only editable on creation */}
                {!editingAntagonist && (
                  <div className="form-group">
                    <label className="form-label">Starting Level</label>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {[10,9,8,7,6,5,4,3,2,1].map(lvl => (
                        <button
                          key={lvl}
                          type="button"
                          onClick={() => setAntagonistForm({ ...antagonistForm, startingLevel: lvl })}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 10,
                            padding: '8px 12px',
                            border: antagonistForm.startingLevel === lvl ? '2px solid #8b2020' : '1px solid var(--border-color)',
                            borderRadius: 8,
                            background: antagonistForm.startingLevel === lvl ? 'rgba(139,32,32,0.12)' : 'var(--bg-secondary)',
                            cursor: 'pointer',
                            textAlign: 'left',
                          }}
                        >
                          <span style={{ fontWeight: 700, minWidth: 24, color: antagonistForm.startingLevel === lvl ? '#c0392b' : 'var(--text-secondary)' }}>
                            {lvl}
                          </span>
                          <span style={{ fontWeight: antagonistForm.startingLevel === lvl ? 700 : 400, color: antagonistForm.startingLevel === lvl ? '#c0392b' : 'var(--text-primary)' }}>
                            {ANTAGONIST_LEVEL_LABELS[lvl]}
                          </span>
                          <span style={{ marginLeft: 'auto', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                            {ANTAGONIST_HP_POOLS[lvl]} HP
                          </span>
                        </button>
                      ))}
                    </div>
                    <small style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'block', marginTop: 6 }}>
                      Be honest — pick the level that best describes how much this currently affects you.
                    </small>
                  </div>
                )}

                <div className="form-group">
                  <label className="form-label">Tag Situations</label>
                  <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: 8, marginTop: 0 }}>
                    XP you earn on tagged situations deals damage to this antagonist.
                  </p>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Search situations…"
                    value={antagonistSituationSearch}
                    onChange={e => setAntagonistSituationSearch(e.target.value)}
                    style={{ marginBottom: 8 }}
                  />
                  <div style={{ maxHeight: 220, overflowY: 'auto', border: '1px solid var(--border-color)', borderRadius: 8, padding: '4px 0' }}>
                    {allSituations
                      .filter(s => !antagonistSituationSearch || s.title.toLowerCase().includes(antagonistSituationSearch.toLowerCase()))
                      .map(s => (
                        <label key={s.id} className="checkbox-item" style={{ padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={antagonistForm.taggedSituationIds.includes(s.id)}
                            onChange={() => toggleAntagonistSituation(s.id)}
                          />
                          <span style={{ fontSize: '0.9rem' }}>{s.title}</span>
                          {s.isMeta && <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Meta</span>}
                        </label>
                      ))
                    }
                    {allSituations.filter(s => !antagonistSituationSearch || s.title.toLowerCase().includes(antagonistSituationSearch.toLowerCase())).length === 0 && (
                      <p style={{ padding: '10px 12px', color: 'var(--text-secondary)', fontSize: '0.85rem', margin: 0 }}>No situations match.</p>
                    )}
                  </div>
                  {antagonistForm.taggedSituationIds.length > 0 && (
                    <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginTop: 6, marginBottom: 0 }}>
                      {antagonistForm.taggedSituationIds.length} situation{antagonistForm.taggedSituationIds.length !== 1 ? 's' : ''} tagged
                    </p>
                  )}
                </div>

                <div className="form-actions">
                  <button type="button" className="btn btn-secondary" onClick={resetAntagonistForm}>Cancel</button>
                  <button type="submit" className="btn btn-success">
                    {editingAntagonist ? 'Update' : 'Declare'} Antagonist
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Active antagonists list */}
          {activeAntagonists.length === 0 && !showAntagonistForm && (
            <div className="card empty-state">
              <p>No active antagonists. Declare one to start fighting.</p>
            </div>
          )}

          {activeAntagonists.map(ant => {
            const maxHP = ANTAGONIST_HP_POOLS[ant.currentLevel];
            const hpPct = Math.min(100, Math.max(0, (ant.currentHP / maxHP) * 100));
            const createdDays = Math.floor((Date.now() - new Date(ant.createdAt).getTime()) / 86400000);
            const confirming = deleteConfirmAntagonistId === ant.id;
            const taggedTitles = allSituations.filter(s => (ant.taggedSituationIds || []).includes(s.id)).map(s => s.title);

            return (
              <div key={ant.id} className="card item-card" style={{ borderLeft: '3px solid #8b2020' }}>
                <div className="item-header">
                  <div className="item-title-section">
                    <h4 style={{ color: 'var(--text-primary)' }}>⚔️ {ant.name}</h4>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                      <span style={{ background: 'rgba(139,32,32,0.15)', color: '#c0392b', padding: '2px 8px', borderRadius: 12, fontSize: '0.78rem', fontWeight: 700 }}>
                        {ANTAGONIST_LEVEL_LABELS[ant.currentLevel]}  Lv.{ant.currentLevel}
                      </span>
                      <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                        {ant.totalDamageDealt} dmg dealt · {createdDays}d fighting
                      </span>
                    </div>
                  </div>
                  <div className="item-actions">
                    <button className="btn-icon" onClick={() => handleEditAntagonist(ant)} title="Edit">✏️</button>
                    {confirming ? (
                      <>
                        <span style={{ fontSize: '0.78rem', color: '#c0392b' }}>Confirm?</span>
                        <button
                          className="btn-icon"
                          onClick={() => handleDeleteAntagonist(ant)}
                          title="Yes, delete permanently"
                          style={{ color: '#c0392b' }}
                        >
                          ✓
                        </button>
                        <button
                          className="btn-icon"
                          onClick={() => setDeleteConfirmAntagonistId(null)}
                          title="Cancel"
                        >
                          ✕
                        </button>
                      </>
                    ) : (
                      <button className="btn-icon" onClick={() => handleDeleteAntagonist(ant)} title="Delete permanently" style={{ opacity: 0.5 }}>🗑️</button>
                    )}
                  </div>
                </div>

                {/* HP bar */}
                <div style={{ marginTop: 10, marginBottom: 6 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: 4 }}>
                    <span>{ant.currentHP} / {maxHP} HP</span>
                    <span>{Math.round(hpPct)}%</span>
                  </div>
                  <div style={{ height: 10, background: 'var(--bg-tertiary)', borderRadius: 5, overflow: 'hidden', border: '1px solid var(--border-color)' }}>
                    <div style={{ height: '100%', width: `${hpPct}%`, background: '#8b2020', borderRadius: 5, transition: 'width 0.4s ease' }} />
                  </div>
                </div>

                {ant.description && (
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: '8px 0 4px 0' }}>{ant.description}</p>
                )}

                {taggedTitles.length > 0 && (
                  <div style={{ marginTop: 8 }}>
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Tagged: </span>
                    {taggedTitles.map(t => (
                      <span key={t} style={{ fontSize: '0.75rem', background: 'rgba(139,32,32,0.1)', color: '#c0392b', padding: '1px 7px', borderRadius: 10, marginRight: 4 }}>{t}</span>
                    ))}
                  </div>
                )}

                <div style={{ marginTop: 8, fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', gap: 12 }}>
                  <span>Started Lv.{ant.startingLevel} ({ANTAGONIST_LEVEL_LABELS[ant.startingLevel]})</span>
                  {ant.startingLevel > ant.currentLevel && (
                    <span style={{ color: '#27ae60' }}>↓ {ant.startingLevel - ant.currentLevel} level{ant.startingLevel - ant.currentLevel !== 1 ? 's' : ''} cleared</span>
                  )}
                </div>
              </div>
            );
          })}

          {/* Defeated archive */}
          {defeatedAntagonists.length > 0 && (
            <div style={{ marginTop: 24 }}>
              <h4 style={{ fontSize: '0.95rem', color: 'var(--text-secondary)', margin: '0 0 10px 0' }}>
                Defeated ({defeatedAntagonists.length})
              </h4>
              {defeatedAntagonists.map(ant => {
                const fightDays = ant.defeatedAt
                  ? Math.floor((new Date(ant.defeatedAt).getTime() - new Date(ant.createdAt).getTime()) / 86400000)
                  : null;
                return (
                  <div key={ant.id} className="card item-card" style={{ opacity: 0.7, borderLeft: '3px solid #27ae60' }}>
                    <div className="item-header">
                      <div className="item-title-section">
                        <h4 style={{ color: 'var(--text-secondary)' }}>
                          ✅ {ant.name}
                        </h4>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                          <span>Started Lv.{ant.startingLevel} ({ANTAGONIST_LEVEL_LABELS[ant.startingLevel]})</span>
                          {fightDays !== null && <span>· {fightDays}d fight</span>}
                          <span>· {ant.totalDamageDealt} total damage</span>
                          {ant.defeatedAt && (
                            <span>· Defeated {new Date(ant.defeatedAt).toLocaleDateString()}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
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

            {gameModeEnabled && (
              <div style={{
                padding: '15px',
                background: 'var(--bg-tertiary)',
                borderRadius: '8px',
                marginBottom: '20px'
              }}>
                <h4 style={{margin: '0 0 14px 0', fontSize: '1rem'}}>⚔️ Game Mode: Streak Config</h4>
                {[
                  {
                    label: 'Situation boss triggers after', suffix: 'consecutive failures',
                    value: situationBossThreshold, onChange: handleBossThresholdChange,
                    min: 3, max: 20, hint: 'Default 5',
                  },
                  {
                    label: 'Boss dissolves after', suffix: 'consecutive successes',
                    value: bossDissolutionThreshold, onChange: handleBossDissolutionChange,
                    min: 2, max: 15, hint: 'Default 5',
                  },
                  {
                    label: 'Breadth bonus when', suffix: 'distinct situations handled in a week',
                    value: breadthWeeklyTarget, onChange: handleBreadthTargetChange,
                    min: 2, max: 14, hint: 'Default 7',
                  },
                  {
                    label: 'Show mastery streak only when ≥', suffix: '',
                    value: masteryStreakMinDisplay, onChange: handleMasteryMinDisplayChange,
                    min: 1, max: 10, hint: 'Default 3',
                  },
                  {
                    label: 'Opportunity boss looks back', suffix: 'events for XP trend',
                    value: opportunityBossWindow, onChange: handleOppBossWindowChange,
                    min: 5, max: 50, hint: 'Default 20',
                  },
                ].map(({ label, suffix, value, onChange, min, max, hint }) => (
                  <div key={label} style={{ marginBottom: '14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '6px', fontSize: '0.9rem', color: 'var(--text-primary)' }}>
                      <span>{label}</span>
                      <input
                        type="number"
                        min={min}
                        max={max}
                        value={value}
                        onChange={e => onChange(e.target.value)}
                        style={{
                          width: '56px',
                          padding: '3px 6px',
                          border: '1px solid var(--border-color)',
                          borderRadius: '4px',
                          background: 'var(--bg-primary)',
                          color: 'var(--text-primary)',
                          fontSize: '0.9rem',
                          textAlign: 'center',
                        }}
                      />
                      {suffix && <span>{suffix}</span>}
                      <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginLeft: 4 }}>({hint}, range {min}–{max})</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

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