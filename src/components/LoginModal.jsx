import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import './LoginModal.css';

const LoginModal = ({ isOpen, onClose }) => {
  const [email, setEmail] = useState('');
  const [pantryId, setPantryId] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [showHelp, setShowHelp] = useState(false);
  
  const { login } = useAuth();

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!email || !pantryId) {
      setError('Please fill in all fields');
      return;
    }

    if (!email.includes('@')) {
      setError('Please enter a valid email address');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const result = await login(email.trim(), pantryId.trim());
      
      if (result.success) {
        onClose();
        setEmail('');
        setPantryId('');
      } else {
        setError(result.error || 'Login failed');
      }
    } catch (error) {
      setError('Login failed: ' + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    if (!isLoading) {
      onClose();
      setEmail('');
      setPantryId('');
      setError('');
      setShowHelp(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="login-modal-overlay" onClick={handleClose}>
      <div className="login-modal" onClick={(e) => e.stopPropagation()}>
        <div className="login-modal-header">
          <h2>🔐 Connect Cloud Storage</h2>
          <button 
            className="close-button" 
            onClick={handleClose}
            disabled={isLoading}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="login-modal-content">
          <p className="login-description">
            Save your progress to the cloud and sync across devices using Pantry.cloud storage.
          </p>

          <form onSubmit={handleSubmit} className="login-form">
            <div className="form-group">
              <label htmlFor="email">Email Address</label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                disabled={isLoading}
                required
              />
              <small className="form-hint">
                Used to identify your account (not stored on servers)
              </small>
            </div>

            <div className="form-group">
              <label htmlFor="pantryId">
                Pantry ID
                <button
                  type="button"
                  className="help-button"
                  onClick={() => setShowHelp(!showHelp)}
                >
                  ?
                </button>
              </label>
              <input
                id="pantryId"
                type="text"
                value={pantryId}
                onChange={(e) => setPantryId(e.target.value)}
                placeholder="your-pantry-id-here"
                disabled={isLoading}
                required
              />
              <small className="form-hint">
                Your unique Pantry.cloud storage ID
              </small>
            </div>

            {showHelp && (
              <div className="help-panel">
                <h4>How to get your Pantry ID:</h4>
                <ol>
                  <li>Visit <a href="https://getpantry.cloud/" target="_blank" rel="noopener noreferrer">getpantry.cloud</a></li>
                  <li>Click "Create New Pantry"</li>
                  <li>Copy the generated Pantry ID</li>
                  <li>Paste it here to connect your storage</li>
                </ol>
                <p className="help-note">
                  <strong>Note:</strong> This app uses client-side authentication with JWT tokens. 
                  Your data is stored securely on Pantry.cloud with a 1-request-per-minute rate limit.
                </p>
              </div>
            )}

            {error && (
              <div className="error-message">
                {error}
              </div>
            )}

            <div className="form-actions">
              <button
                type="button"
                onClick={handleClose}
                disabled={isLoading}
                className="btn btn-secondary"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isLoading || !email || !pantryId}
                className="btn btn-primary"
              >
                {isLoading ? 'Connecting...' : 'Connect Storage'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default LoginModal;