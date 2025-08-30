import { useState } from 'react';
import { dbHelpers, DataBackupSystem } from '../database/db';

function DataRecovery({ onClose, onRecoveryComplete }) {
  const [isRecovering, setIsRecovering] = useState(false);
  const [recoveryStatus, setRecoveryStatus] = useState(null);
  
  const handleRecoverData = async () => {
    setIsRecovering(true);
    setRecoveryStatus(null);
    
    try {
      const result = await dbHelpers.recoverData();
      setRecoveryStatus({
        success: true,
        message: result.method === 'backup' 
          ? 'Successfully restored data from automatic backup!' 
          : 'Restored default data as fallback.',
        method: result.method
      });
      
      if (onRecoveryComplete) {
        onRecoveryComplete();
      }
    } catch (error) {
      console.error('Recovery failed:', error);
      setRecoveryStatus({
        success: false,
        message: 'Data recovery failed: ' + error.message
      });
    } finally {
      setIsRecovering(false);
    }
  };
  
  const handleDebugExport = async () => {
    try {
      await dbHelpers.debugExport();
      alert('Debug export completed. Check your downloads folder.');
    } catch (error) {
      alert('Debug export failed: ' + error.message);
    }
  };
  
  const backupDate = DataBackupSystem.getBackupDate();
  const hasBackup = DataBackupSystem.hasBackup();
  
  return (
    <div className="modal-overlay" style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000
    }}>
      <div className="modal-content card" style={{
        maxWidth: '500px',
        margin: '20px',
        maxHeight: '80vh',
        overflowY: 'auto'
      }}>
        <h2>🔧 Data Recovery</h2>
        
        <p>
          It looks like some of your data might be missing. This can happen during database upgrades.
        </p>
        
        {hasBackup && (
          <div className="card" style={{background: '#e8f5e8', border: '1px solid #28a745', marginBottom: '16px'}}>
            <h3>✅ Backup Available</h3>
            <p>
              A backup from <strong>{backupDate?.toLocaleDateString()} at {backupDate?.toLocaleTimeString()}</strong> is available.
            </p>
          </div>
        )}
        
        {!hasBackup && (
          <div className="card" style={{background: '#fff3cd', border: '1px solid #ffc107', marginBottom: '16px'}}>
            <h3>⚠️ No Backup Found</h3>
            <p>
              No automatic backup was found. Recovery will restore default situations and opportunities.
            </p>
          </div>
        )}
        
        {recoveryStatus && (
          <div className={`card ${recoveryStatus.success ? 'success-card' : 'error-card'}`} style={{marginBottom: '16px'}}>
            <p>{recoveryStatus.message}</p>
          </div>
        )}
        
        <div className="form-actions">
          <button
            className="btn btn-primary"
            onClick={handleRecoverData}
            disabled={isRecovering}
            style={{marginRight: '8px'}}
          >
            {isRecovering ? 'Recovering...' : '🔄 Recover Data'}
          </button>
          
          <button
            className="btn btn-secondary"
            onClick={handleDebugExport}
            style={{marginRight: '8px'}}
          >
            📊 Export Debug Info
          </button>
          
          <button
            className="btn btn-outline"
            onClick={onClose}
            disabled={isRecovering}
          >
            Close
          </button>
        </div>
        
        <div style={{marginTop: '20px', padding: '12px', backgroundColor: '#f8f9fa', borderRadius: '6px', fontSize: '0.9em'}}>
          <h4>🛡️ Future Protection</h4>
          <p>
            This app now includes automatic backup protection:
          </p>
          <ul>
            <li>Backups are created automatically before any database changes</li>
            <li>Data is stored in browser localStorage as a safety net</li>
            <li>Manual recovery is available through this dialog</li>
            <li>Debug exports help troubleshoot issues</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

export default DataRecovery;