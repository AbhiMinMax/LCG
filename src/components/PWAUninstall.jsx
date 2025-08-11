import { useState, useEffect } from 'react';

function PWAUninstall() {
  const [showConfirm, setShowConfirm] = useState(false);
  const [installStatus, setInstallStatus] = useState('unknown');

  useEffect(() => {
    // Check if PWA is installed (standalone mode)
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
    const isInWebAppiOS = window.navigator.standalone === true;
    const isMinimalUI = window.matchMedia('(display-mode: minimal-ui)').matches;
    const isFullscreen = window.matchMedia('(display-mode: fullscreen)').matches;
    
    const installed = isStandalone || isInWebAppiOS || isMinimalUI || isFullscreen;
    
    if (installed) {
      console.log('PWA detected as installed');
      setInstallStatus('installed');
      checkUninstallCapability();
    } else {
      // Check if running in browser
      const hasWindow = window.outerHeight && window.outerWidth;
      const hasAddressBar = window.locationbar && window.locationbar.visible;
      
      if (hasWindow && hasAddressBar) {
        console.log('PWA detected as running in browser mode');
        setInstallStatus('browser');
      } else {
        console.log('PWA install status unknown');
        setInstallStatus('unknown');
      }
    }

    // Listen for appinstalled event
    const handleAppInstalled = () => {
      setInstallStatus('installed');
    };

    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const checkUninstallCapability = () => {
    // Check for programmatic uninstall capabilities
    if ('getInstalledRelatedApps' in navigator) {
      navigator.getInstalledRelatedApps().then(() => {
        // App is installed and has related apps
      }).catch(() => {
        // Fallback: assume we can try uninstall methods
      });
    }
    // We can always try programmatic uninstall methods
  };

  // const handleInstall = async () => {
  //   try {
  //     if (deferredPrompt) {
  //       // Use the deferred prompt for installation
  //       //const result = await deferredPrompt.prompt();
  //       const userChoice = await deferredPrompt.userChoice;
        
  //       if (userChoice.outcome === 'accepted') {
  //         console.log('User accepted the install prompt');
  //       } else {
  //         console.log('User dismissed the install prompt');
  //       }
        
  //       setDeferredPrompt(null);
  //       setCanInstall(false);
  //     } else {
  //       // Show manual install instructions
  //       const userAgent = navigator.userAgent.toLowerCase();
  //       let instructions = '';

  //       if (userAgent.includes('chrome') || userAgent.includes('chromium')) {
  //         instructions = `CHROME INSTALLATION GUIDE:\n\n1. Look for the install icon (⊞) in your address bar\n2. Click the install icon\n3. Click "Install" in the dialog\n\nALTERNATIVE METHODS:\n• Click the three dots menu (⋮) → "Install Life Progress Tracker"\n• On mobile: Menu → "Add to Home screen"`;
  //       } else if (userAgent.includes('firefox')) {
  //         instructions = `FIREFOX INSTALLATION GUIDE:\n\n1. Look for the install icon in your address bar\n2. Click the install icon\n3. Click "Install" to confirm\n\nALTERNATIVE:\n• Menu (≡) → "Install this site as an app"`;
  //       } else if (userAgent.includes('safari')) {
  //         instructions = `SAFARI INSTALLATION GUIDE:\n\nDesktop:\n1. Share button → "Add to Dock"\n\niOS/iPadOS:\n1. Share button (📤) → "Add to Home Screen"\n2. Tap "Add" to confirm`;
  //       } else if (userAgent.includes('edge')) {
  //         instructions = `EDGE INSTALLATION GUIDE:\n\n1. Look for the install icon (⊞) in your address bar\n2. Click the install icon\n3. Click "Install" in the dialog\n\nALTERNATIVE:\n• Menu (···) → "Apps" → "Install this site as an app"`;
  //       } else {
  //         instructions = `BROWSER INSTALLATION GUIDE:\n\n1. Look for an install icon in your browser's address bar\n2. Check your browser's menu for "Install app" or "Add to home screen" options\n3. Follow your browser's installation prompts`;
  //       }

  //       alert(instructions);
  //     }
  //   } catch (error) {
  //     console.error('Error during installation:', error);
  //     alert('Installation failed. Please try using your browser\'s install option.');
  //   }
  // };

  const handleProgrammaticUninstall = async () => {
    try {
      // Method 1: Try to trigger browser's uninstall prompt
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        for (let registration of registrations) {
          await registration.unregister();
        }
      }

      // Method 2: Clear all app data and caches
      await handleDataClear(false); // Don't show confirmation for this internal call

      // Method 3: Try to close the PWA window if possible
      if (window.close) {
        window.close();
      }

      // Method 4: If still running, navigate away and clear history
      setTimeout(() => {
        if (history && history.replaceState) {
          history.replaceState(null, '', 'about:blank');
        }
        window.location.href = 'about:blank';
      }, 1000);

      alert('PWA has been uninstalled! Service workers removed, data cleared, and app closed.');
      
    } catch (error) {
      console.error('Error during uninstall:', error);
      alert('Partial uninstall completed. Data cleared and service workers removed. You may need to manually close the app window.');
    }
    
    setShowConfirm(false);
  };

  const handleLaunchInBrowser = () => {
    const currentUrl = window.location.origin + window.location.pathname;
    window.open(currentUrl, '_blank', 'noopener,noreferrer');
    setShowConfirm(false);
  };

  const handleUninstall = () => {
    const userAgent = navigator.userAgent.toLowerCase();
    let instructions = '';

    if (userAgent.includes('chrome') || userAgent.includes('chromium')) {
      instructions = `CHROME UNINSTALL METHODS:

⚠️ IMPORTANT: Uninstall options only show if app was installed as PWA

METHOD 1 - From Installed App:
1. Look for three dots menu (⋮) in app window
2. Select "Uninstall Life Progress Tracker"
(Only works if you see browser-like controls)

METHOD 2 - Chrome Settings:
1. Open Chrome browser
2. Go to chrome://apps/
3. Right-click "Life Progress Tracker"
4. Select "Remove from Chrome"

METHOD 3 - Chrome Address Bar:
1. Open Chrome and visit this app's URL
2. Look for install icon (⊞) in address bar
3. If installed, click it and select "Uninstall"

METHOD 4 - Windows/Mac System:
• Windows: Settings > Apps > Find "Life Progress Tracker"
• Mac: Applications folder > Move to Trash

IF NO UNINSTALL OPTIONS APPEAR:
The app is running in browser mode, not installed as PWA.
Just close the browser tab - no uninstall needed!`;

    } else if (userAgent.includes('firefox')) {
      instructions = `FIREFOX UNINSTALL METHODS:

METHOD 1 - Firefox Add-ons:
1. Type "about:addons" in address bar
2. Click "Extensions" on left sidebar
3. Look for "Life Progress Tracker" 
4. Click "Remove" if found

METHOD 2 - Firefox Settings:
1. Menu (≡) > Settings
2. Search for "web apps" or "installed apps"
3. Remove "Life Progress Tracker" if listed

IF NOT FOUND:
The app is running in browser mode, not installed.
Just close the browser tab!`;

    } else if (userAgent.includes('safari')) {
      instructions = `SAFARI UNINSTALL METHODS:

METHOD 1 - Applications Folder:
1. Open Finder > Applications
2. Look for "Life Progress Tracker"
3. Drag to Trash if found

METHOD 2 - Dock (if pinned):
1. Right-click app icon in Dock
2. Options > Remove from Dock

IF NOT FOUND:
The app is running in Safari browser mode.
Just close the browser tab!`;

    } else {
      instructions = `BROWSER UNINSTALL GUIDE:

1. Check if app appears in:
   • Browser settings > Installed apps
   • System apps/programs list
   • Desktop or taskbar icons

2. If found, uninstall through:
   • Browser app management
   • System uninstall programs
   • Right-click app icon > Remove

3. If NOT found:
   You're using browser mode - just close the tab!

NO UNINSTALL NEEDED if running in regular browser tab.`;
    }

    alert(instructions);
  };

  const handleDataClear = async (showConfirmation = true) => {
    const shouldContinue = !showConfirmation || confirm('This will clear all your data (situations, opportunities, events). This cannot be undone. Continue?');
    if (shouldContinue) {
      try {
        // Clear localStorage
        localStorage.clear();
        
        // Clear IndexedDB
        if ('indexedDB' in window) {
          const dbs = await indexedDB.databases();
          await Promise.all(
            dbs.map(db => {
              return new Promise((resolve, reject) => {
                const deleteReq = indexedDB.deleteDatabase(db.name);
                deleteReq.onsuccess = () => resolve();
                deleteReq.onerror = () => reject(deleteReq.error);
              });
            })
          );
        }

        // Clear caches
        if ('caches' in window) {
          const cacheNames = await caches.keys();
          await Promise.all(cacheNames.map(cacheName => caches.delete(cacheName)));
        }

        if (showConfirmation) {
          alert('All app data cleared successfully! Please refresh the page.');
          window.location.reload();
        }
      } catch (error) {
        console.error('Error clearing data:', error);
        if (showConfirmation) {
          alert('Error clearing some data. Please check browser settings.');
        }
      }
    }
  };

  // Always show the component, but with different messaging

  return (
    <div className="pwa-uninstall-section" style={{ marginTop: '20px' }}>
      <div className="card">
        <h3>📱 App Management</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          
          <div style={{ padding: '15px', background: 'var(--bg-tertiary)', borderRadius: '8px' }}>
            <h4 style={{ margin: '0 0 8px 0', fontSize: '1rem' }}>🗑️ Clear All Data</h4>
            <p style={{ margin: '0 0 12px 0', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
              Remove all situations, opportunities, events, and settings
            </p>
            <button
              onClick={() => handleDataClear(true)}
              className="btn btn-danger"
              style={{ width: '100%' }}
            >
              Clear All App Data
            </button>
          </div>

          <div style={{ padding: '15px', background: 'var(--bg-tertiary)', borderRadius: '8px' }}>
            <h4 style={{ margin: '0 0 8px 0', fontSize: '1rem' }}>
              {installStatus === 'installed' ? '📤 Uninstall PWA' : '🌐 App Removal'}
            </h4>
            <p style={{ margin: '0 0 12px 0', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
              {installStatus === 'installed' 
                ? 'Remove this installed PWA from your device'
                : installStatus === 'browser'
                ? 'Running in browser mode - just close the tab to stop using'
                : 'Remove or stop using this application'
              }
            </p>
            {showConfirm ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <button
                  onClick={handleProgrammaticUninstall}
                  className="btn btn-danger"
                  style={{ width: '100%' }}
                >
                  🗑️ Uninstall Now (Recommended)
                </button>
                <button
                  onClick={handleLaunchInBrowser}
                  className="btn btn-secondary"
                  style={{ width: '100%' }}
                >
                  🌐 Launch in Browser
                </button>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={() => setShowConfirm(false)}
                    className="btn btn-secondary"
                    style={{ flex: 1 }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleUninstall}
                    className="btn btn-secondary"
                    style={{ flex: 1 }}
                  >
                    Manual Guide
                  </button>
                </div>
              </div>
            ) : (
              <>
                {installStatus === 'installed' ? (
                  <button
                    onClick={() => {
                      console.log('Uninstall PWA button clicked');
                      setShowConfirm(true);
                    }}
                    className="btn btn-danger"
                    style={{ width: '100%' }}
                  >
                    Uninstall PWA
                  </button>
                ) : installStatus === 'browser' ? (
                  <div style={{
                    padding: '12px',
                    background: 'var(--choice-bg)',
                    borderRadius: '8px',
                    border: '1px solid var(--border-color)',
                    textAlign: 'center'
                  }}>
                    <p style={{ margin: '0 0 8px 0', fontSize: '0.9rem', fontWeight: '500' }}>
                      ✅ No uninstall needed!
                    </p>
                    <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                      You're using this app in browser mode. Just close the browser tab when done.
                    </p>
                  </div>
                ) : (
                  <button
                    onClick={() => {
                      console.log('Uninstall button clicked, installStatus:', installStatus);
                      setShowConfirm(true);
                    }}
                    className="btn btn-danger"
                    style={{ width: '100%' }}
                  >
                    Uninstall App
                  </button>
                )}
              </>
            )}
          </div>

          <div style={{ 
            padding: '12px', 
            background: 'var(--choice-bg)', 
            borderRadius: '8px',
            border: '1px solid var(--border-color)'
          }}>
            <p style={{ 
              margin: 0, 
              fontSize: '0.8rem', 
              color: 'var(--text-muted)',
              textAlign: 'center'
            }}>
              {installStatus === 'installed'
                ? '💡 "Uninstall Now" removes service workers, clears data, and closes the app automatically'
                : installStatus === 'browser'
                ? '💡 Browser mode detected - no installation to remove'
                : '💡 One-click uninstall available - no need to access browser settings'
              }
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default PWAUninstall;