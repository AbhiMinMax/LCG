import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { dbHelpers } from '../database/db';
import LoginModal from './LoginModal';
import SyncDetailsModal from './SyncDetailsModal';
import './CloudSyncButton.css';

const CloudSyncButton = () => {
  const { user, isAuthenticated, logout, syncData, getRateLimitStatus } = useAuth();
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [showSyncDetails, setShowSyncDetails] = useState(false);
  const [syncStatus, setSyncStatus] = useState('idle'); // idle, syncing, success, error
  const [syncMessage, setSyncMessage] = useState('');
  const [rateLimitStatus, setRateLimitStatus] = useState(null);
  const [lastSyncResult, setLastSyncResult] = useState(null);

  useEffect(() => {
    // Update rate limit status every second
    const interval = setInterval(() => {
      setRateLimitStatus(getRateLimitStatus());
    }, 1000);

    return () => clearInterval(interval);
  }, [getRateLimitStatus]);

  const handleSync = async () => {
    if (!isAuthenticated) {
      setShowLoginModal(true);
      return;
    }

    const rateLimitStatus = getRateLimitStatus();
    if (!rateLimitStatus.canMakeRequest) {
      const secondsToWait = Math.ceil(rateLimitStatus.timeUntilNextRequest / 1000);
      setSyncMessage(`Rate limit: wait ${secondsToWait}s`);
      return;
    }

    setSyncStatus('syncing');
    setSyncMessage('Fetching cloud data...');

    try {
      // Get local data with progress updates
      setSyncMessage('Loading local data...');
      const [opportunities, events, stats, situations] = await Promise.all([
        dbHelpers.getOpportunitiesSorted('level'),
        dbHelpers.getEventsWithDetails(),
        dbHelpers.getDataStats(),
        dbHelpers.getSituationsWithOpportunities()
      ]);

      const localData = {
        opportunities,
        events,
        stats,
        situations,
        lastUpdated: Date.now()
      };

      setSyncMessage(`Syncing ${opportunities.length + events.length + situations.length} items...`);
      
      // Sync with cloud
      const result = await syncData(localData);

      if (result.action === 'merged' && result.mergedData) {
        setSyncMessage('Updating local database...');
        
        // Update local database with merged data
        await updateLocalDatabase(result.mergedData);
        
        // Store result for details modal
        setLastSyncResult(result);
        
        // Create detailed sync message
        const changesSummary = formatChangesSummary(result.changes);
        setSyncMessage(`Sync complete! ${changesSummary}`);
        setSyncStatus('success');
      } else {
        // Store result for details modal
        setLastSyncResult(result);
        setSyncMessage(result.message);
        setSyncStatus('success');
      }

    } catch (error) {
      console.error('Sync error:', error);
      setSyncMessage(`Sync failed: ${error.message}`);
      setSyncStatus('error');
    }

    // Clear status after 5 seconds for longer messages
    setTimeout(() => {
      setSyncStatus('idle');
      setSyncMessage('');
    }, 5000);
  };

  const updateLocalDatabase = async (mergedData) => {
    try {
      // Get current local data for comparison
      const [localSituations, localOpportunities, localEvents] = await Promise.all([
        dbHelpers.db.situations.toArray(),
        dbHelpers.db.opportunities.toArray(),
        dbHelpers.db.events.toArray()
      ]);

      // Update situations
      if (mergedData.situations) {
        const mergedSituationIds = new Set(mergedData.situations.map(s => s.id));
        
        // Add/update situations
        for (const situation of mergedData.situations) {
          const existing = await dbHelpers.db.situations.get(situation.id);
          if (existing) {
            await dbHelpers.db.situations.update(situation.id, situation);
          } else {
            await dbHelpers.db.situations.add(situation);
          }
        }

        // Remove situations that are not in merged data
        for (const localSituation of localSituations) {
          if (!mergedSituationIds.has(localSituation.id)) {
            await dbHelpers.db.situations.delete(localSituation.id);
            // Also remove related links
            await dbHelpers.db.situation_opportunities.where('situation_id').equals(localSituation.id).delete();
          }
        }
      }

      // Update opportunities
      if (mergedData.opportunities) {
        const mergedOpportunityIds = new Set(mergedData.opportunities.map(o => o.id));
        
        // Add/update opportunities
        for (const opportunity of mergedData.opportunities) {
          const existing = await dbHelpers.db.opportunities.get(opportunity.id);
          if (existing) {
            await dbHelpers.db.opportunities.update(opportunity.id, opportunity);
          } else {
            await dbHelpers.db.opportunities.add(opportunity);
          }
        }

        // Remove opportunities that are not in merged data
        for (const localOpportunity of localOpportunities) {
          if (!mergedOpportunityIds.has(localOpportunity.id)) {
            await dbHelpers.db.opportunities.delete(localOpportunity.id);
            // Also remove related links
            await dbHelpers.db.situation_opportunities.where('opportunity_id').equals(localOpportunity.id).delete();
          }
        }
      }

      // Update events
      if (mergedData.events) {
        const mergedEventIds = new Set(mergedData.events.map(e => e.id));
        
        // Add/update events
        for (const event of mergedData.events) {
          const existing = await dbHelpers.db.events.get(event.id);
          if (existing) {
            await dbHelpers.db.events.update(event.id, event);
          } else {
            await dbHelpers.db.events.add(event);
          }
        }

        // Remove events that are not in merged data
        for (const localEvent of localEvents) {
          if (!mergedEventIds.has(localEvent.id)) {
            await dbHelpers.db.events.delete(localEvent.id);
          }
        }
      }

      console.log('Local database updated successfully with merged data');
    } catch (error) {
      console.error('Error updating local database:', error);
      throw new Error('Failed to update local database');
    }
  };

  const formatChangesSummary = (changes) => {
    const parts = [];
    
    Object.entries(changes).forEach(([type, typeChanges]) => {
      const { added, modified, deleted } = typeChanges;
      if (added.length > 0) parts.push(`${added.length} ${type} added`);
      if (modified.length > 0) parts.push(`${modified.length} ${type} updated`);
      if (deleted.length > 0) parts.push(`${deleted.length} ${type} removed`);
    });

    return parts.length > 0 ? parts.join(', ') : 'No changes detected';
  };

  const handleLogout = () => {
    logout();
    setSyncStatus('idle');
    setSyncMessage('');
  };

  const formatTimeRemaining = (ms) => {
    if (ms <= 0) return '0s';
    const seconds = Math.ceil(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  };

  return (
    <>
      <div className="cloud-sync-container">
        {!isAuthenticated ? (
          <button
            className="cloud-sync-button connect"
            onClick={() => setShowLoginModal(true)}
            title="Connect cloud storage"
          >
            <span className="cloud-icon">☁️</span>
            <span className="button-text">Connect Cloud</span>
          </button>
        ) : (
          <div className="cloud-sync-authenticated">
            <div className="user-info">
              <span className="user-email">{user?.email}</span>
              <button
                className="logout-button"
                onClick={handleLogout}
                title="Logout"
              >
                🚪
              </button>
            </div>
            
            <button
              className={`cloud-sync-button ${syncStatus}`}
              onClick={handleSync}
              disabled={syncStatus === 'syncing' || (rateLimitStatus && !rateLimitStatus.canMakeRequest)}
              title={
                rateLimitStatus && !rateLimitStatus.canMakeRequest 
                  ? `Rate limited: ${formatTimeRemaining(rateLimitStatus.timeUntilNextRequest)}`
                  : 'Sync with cloud storage'
              }
            >
              <span className="cloud-icon">
                {syncStatus === 'syncing' ? '🔄' : 
                 syncStatus === 'success' ? '✅' : 
                 syncStatus === 'error' ? '❌' : '☁️'}
              </span>
              <span className="button-text">
                {syncStatus === 'syncing' ? 'Syncing...' :
                 syncStatus === 'success' ? 'Synced!' :
                 syncStatus === 'error' ? 'Error' :
                 rateLimitStatus && !rateLimitStatus.canMakeRequest 
                   ? `Wait ${formatTimeRemaining(rateLimitStatus.timeUntilNextRequest)}` 
                   : 'Sync'}
              </span>
            </button>

            {syncMessage && (
              <div className={`sync-message ${syncStatus}`}>
                {syncMessage}
                {lastSyncResult && syncStatus === 'success' && (
                  <button
                    className="details-button"
                    onClick={() => setShowSyncDetails(true)}
                    title="View sync details"
                  >
                    📋 Details
                  </button>
                )}
              </div>
            )}

            {rateLimitStatus && (
              <div className="rate-limit-info">
                <small>
                  Queue: {rateLimitStatus.queueLength} | 
                  Next: {rateLimitStatus.canMakeRequest ? 'Now' : formatTimeRemaining(rateLimitStatus.timeUntilNextRequest)}
                </small>
              </div>
            )}
          </div>
        )}
      </div>

      <LoginModal
        isOpen={showLoginModal}
        onClose={() => setShowLoginModal(false)}
      />

      <SyncDetailsModal
        isOpen={showSyncDetails}
        onClose={() => setShowSyncDetails(false)}
        syncResult={lastSyncResult}
      />
    </>
  );
};

export default CloudSyncButton;