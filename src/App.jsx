import { BrowserRouter as Router, Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import Navigation from './components/Navigation';
import ThemeToggle from './components/ThemeToggle';
import InstallPrompt from './components/InstallPrompt';
import PWAUninstall from './components/PWAUninstall';
import ThemeProvider from './contexts/ThemeContext';
import { AuthProvider } from './contexts/AuthContext';
import CloudSyncButton from './components/CloudSyncButton';
import { ensureDefaultData } from './database/db';
import AddEvent from './screens/AddEvent';
import CheckProgress from './screens/CheckProgress';
import CheckHistory from './screens/CheckHistory';
import Customize from './screens/Customize';
import Analytics from './screens/Analytics';
import './App.css';

function AppContent() {
  const location = useLocation();
  const navigate = useNavigate();
  const isWideLayout = location.pathname === '/analytics';
  
  useEffect(() => {
    // Ensure default data is available when the app starts
    ensureDefaultData();
  }, []);

  const handleTitleClick = () => {
    navigate('/');
  };
  
  return (
    <div className="app">
      <header className="app-header">
        <div className="header-content">
          <div className="header-text">
            <h1 
              onClick={handleTitleClick}
              style={{ 
                cursor: 'pointer', 
                userSelect: 'none',
                transition: 'opacity 0.2s ease'
              }}
              onMouseEnter={(e) => e.target.style.opacity = '0.7'}
              onMouseLeave={(e) => e.target.style.opacity = '1'}
              title="Go to home"
            >
              🎮 Life Progress Tracker
            </h1>
            <p>Gamify your personal development</p>
          </div>
          <CloudSyncButton />
        </div>
      </header>
      
      <main className={`app-main ${isWideLayout ? 'wide-layout' : ''}`}>
        <Routes>
          <Route path="/" element={<AddEvent />} />
          <Route path="/add-event" element={<AddEvent />} />
          <Route path="/progress" element={<CheckProgress />} />
          <Route path="/history" element={<CheckHistory />} />
          <Route path="/analytics" element={<Analytics />} />
          <Route path="/customize" element={<Customize />} />
        </Routes>
      </main>
      
      <Navigation />
      <ThemeToggle />
      <InstallPrompt />
      <PWAUninstall />
    </div>
  );
}

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <Router>
          <AppContent />
        </Router>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
