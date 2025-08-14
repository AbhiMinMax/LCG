import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { dbHelpers } from '../database/db';
import LoginModal from './LoginModal';
import './CloudSyncButton.css';

const CloudSyncButton = () => {
  const { user, isAuthenticated, logout, syncData, getRateLimitStatus } = useAuth();
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [syncStatus, setSyncStatus] = useState('idle'); // idle, syncing, success, error
  const [syncMessage, setSyncMessage] = useState('');
  const [rateLimitStatus, setRateLimitStatus] = useState(null);

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
    setSyncMessage('Syncing with cloud...');

    try {
      // Get local data
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

      // Sync with cloud
      const result = await syncData(localData);

      if (result.action === 'downloaded') {
        // Cloud data is newer, update local database
        // This would require implementing data import functionality
        setSyncMessage('Cloud data downloaded (import feature needed)');
        setSyncStatus('success');
      } else {
        setSyncMessage(result.message);
        setSyncStatus('success');
      }

    } catch (error) {
      console.error('Sync error:', error);
      setSyncMessage(`Sync failed: ${error.message}`);
      setSyncStatus('error');
    }

    // Clear status after 3 seconds
    setTimeout(() => {
      setSyncStatus('idle');
      setSyncMessage('');
    }, 3000);
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
    </>
  );
};

export default CloudSyncButton;