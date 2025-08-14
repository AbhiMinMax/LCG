import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Navigation from './components/Navigation';
import ThemeToggle from './components/ThemeToggle';
import InstallPrompt from './components/InstallPrompt';
import PWAUninstall from './components/PWAUninstall';
import ThemeProvider from './contexts/ThemeContext';
import { AuthProvider } from './contexts/AuthContext';
import CloudSyncButton from './components/CloudSyncButton';
import AddEvent from './screens/AddEvent';
import CheckProgress from './screens/CheckProgress';
import CheckHistory from './screens/CheckHistory';
import Customize from './screens/Customize';
import Analytics from './screens/Analytics';
import './App.css';

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <Router>
          <div className="app">
            <header className="app-header">
              <div className="header-content">
                <div className="header-text">
                  <h1>🎮 Life Progress Tracker</h1>
                  <p>Gamify your personal development</p>
                </div>
                <CloudSyncButton />
              </div>
            </header>
            
            <main className="app-main">
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
        </Router>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
