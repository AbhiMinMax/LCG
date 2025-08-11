import { useState, useEffect } from 'react'

function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(null)
  const [showPrompt, setShowPrompt] = useState(false)
  const [installSource, setInstallSource] = useState('manual')

  useEffect(() => {
    // Check if app is already installed/running as standalone
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || 
                        window.navigator.standalone === true ||
                        document.referrer.includes('android-app://') ||
                        window.location.search.includes('standalone=true')
    
    // Don't show install button if already running as app
    if (isStandalone) {
      console.log('App is running in standalone mode - no install prompt needed')
      setShowPrompt(false)
      return
    }

    // Check if dismissed in current session
    const sessionDismissed = sessionStorage.getItem('installPromptDismissed')
    if (sessionDismissed) {
      setShowPrompt(false)
      return
    }

    // Always show the install button (unless dismissed in session)
    setShowPrompt(true)

    const handler = (e) => {
      e.preventDefault()
      setDeferredPrompt(e)
      setInstallSource('auto')
    }

    window.addEventListener('beforeinstallprompt', handler)

    // Set manual install as default since we always show
    setInstallSource('manual')

    return () => {
      window.removeEventListener('beforeinstallprompt', handler)
    }
  }, [])

  const handleInstall = async () => {
    if (deferredPrompt && installSource === 'auto') {
      deferredPrompt.prompt()
      await deferredPrompt.userChoice
      
      setDeferredPrompt(null)
      setShowPrompt(false)
    } else {
      // Manual install instructions
      const isAndroid = /Android/i.test(navigator.userAgent)
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
      
      let instructions = 'To install this app:\n\n'
      if (isAndroid) {
        instructions += '1. Tap the menu (⋮) in Chrome\n2. Select "Add to Home screen"\n3. Tap "Add" to confirm'
      } else if (isIOS) {
        instructions += '1. Tap the Share button (📤)\n2. Select "Add to Home Screen"\n3. Tap "Add" to confirm'
      } else {
        instructions += '1. Look for the install icon in your address bar\n2. Click it to install\n3. Or use browser menu → Install app'
      }
      
      alert(instructions)
      setShowPrompt(false)
    }
  }

  const handleDismiss = () => {
    setShowPrompt(false)
    // Store dismissal for current session only
    sessionStorage.setItem('installPromptDismissed', 'true')
  }

  if (!showPrompt) return null

  return (
    <div style={{
      position: 'fixed',
      top: '0',
      left: '0',
      right: '0',
      backgroundColor: 'white',
      color: '#333',
      padding: '20px',
      borderBottom: '1px solid #e0e0e0',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      boxShadow: '0 2px 12px rgba(0,0,0,0.1)',
      zIndex: 1000,
      animation: 'slideDown 0.3s ease-out'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div style={{
          width: '48px',
          height: '48px',
          backgroundColor: '#646cff',
          borderRadius: '12px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '20px'
        }}>
          📱
        </div>
        <div>
          <div style={{ fontWeight: 'bold', fontSize: '16px' }}>Install Life Progress Tracker</div>
          <div style={{ fontSize: '14px', color: '#666' }}>
            Get the full app experience
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: '8px' }}>
        <button
          onClick={handleInstall}
          style={{
            backgroundColor: '#646cff',
            color: 'white',
            border: 'none',
            padding: '10px 20px',
            borderRadius: '20px',
            cursor: 'pointer',
            fontWeight: 'bold',
            fontSize: '14px'
          }}
        >
          Install
        </button>
        <button
          onClick={handleDismiss}
          style={{
            backgroundColor: 'transparent',
            color: '#666',
            border: 'none',
            padding: '10px',
            borderRadius: '20px',
            cursor: 'pointer',
            fontSize: '18px'
          }}
        >
          ×
        </button>
      </div>
      <style jsx>{`
        @keyframes slideDown {
          from { transform: translateY(-100%); }
          to { transform: translateY(0); }
        }
      `}</style>
    </div>
  )
}

export default InstallPrompt