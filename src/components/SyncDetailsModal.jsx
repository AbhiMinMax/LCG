import React from 'react';
import './SyncDetailsModal.css';

const SyncDetailsModal = ({ isOpen, onClose, syncResult }) => {
  if (!isOpen || !syncResult) return null;

  const renderChangesList = (changes, type) => {
    const { added = [], modified = [], deleted = [] } = changes;
    const total = added.length + modified.length + deleted.length;
    
    if (total === 0) return null;

    return (
      <div className="changes-section">
        <h4>{type.charAt(0).toUpperCase() + type.slice(1)} ({total} changes)</h4>
        
        {added.length > 0 && (
          <div className="change-group added">
            <h5>✅ Added ({added.length})</h5>
            <ul>
              {added.map((item, index) => (
                <li key={index}>
                  <strong>{item.title}</strong>
                  {item.description && (
                    <span className="change-desc"> - {item.description.substring(0, 50)}...</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {modified.length > 0 && (
          <div className="change-group modified">
            <h5>✏️ Updated ({modified.length})</h5>
            <ul>
              {modified.map((item, index) => (
                <li key={index}>
                  <strong>{item.title}</strong>
                  {item.description && (
                    <span className="change-desc"> - {item.description.substring(0, 50)}...</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {deleted.length > 0 && (
          <div className="change-group deleted">
            <h5>🗑️ Removed ({deleted.length})</h5>
            <ul>
              {deleted.map((itemId, index) => (
                <li key={index}>
                  ID: {itemId}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  };

  const getTotalChanges = () => {
    let total = 0;
    Object.values(syncResult.changes || {}).forEach(typeChanges => {
      total += (typeChanges.added?.length || 0) + 
               (typeChanges.modified?.length || 0) + 
               (typeChanges.deleted?.length || 0);
    });
    return total;
  };

  return (
    <div className="sync-modal-overlay" onClick={onClose}>
      <div className="sync-modal" onClick={(e) => e.stopPropagation()}>
        <div className="sync-modal-header">
          <h2>🔄 Sync Details</h2>
          <button className="close-button" onClick={onClose}>✕</button>
        </div>

        <div className="sync-modal-content">
          <div className="sync-summary">
            <div className="sync-status">
              <span className={`status-badge ${syncResult.action}`}>
                {syncResult.action === 'merged' ? '🔄 Merged' :
                 syncResult.action === 'uploaded' ? '📤 Uploaded' :
                 syncResult.action === 'synced' ? '✅ In Sync' : syncResult.action}
              </span>
            </div>
            <p className="sync-message">{syncResult.message}</p>
            <p className="changes-summary">
              <strong>Total changes: {getTotalChanges()}</strong>
            </p>
          </div>

          <div className="changes-details">
            {syncResult.changes?.situations && renderChangesList(syncResult.changes.situations, 'situations')}
            {syncResult.changes?.opportunities && renderChangesList(syncResult.changes.opportunities, 'opportunities')}
            {syncResult.changes?.events && renderChangesList(syncResult.changes.events, 'events')}
            
            {getTotalChanges() === 0 && (
              <div className="no-changes">
                <p>🎉 All data is already synchronized between local and cloud storage!</p>
              </div>
            )}
          </div>
        </div>

        <div className="sync-modal-footer">
          <button className="btn btn-primary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default SyncDetailsModal;