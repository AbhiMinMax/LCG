import { useTheme } from '../hooks/useTheme';

function ThemeToggle() {
  const { toggleTheme, isDark } = useTheme();

  return (
    <button
      onClick={toggleTheme}
      className="theme-toggle"
      title={`Switch to ${isDark ? 'light' : 'dark'} theme`}
      style={{
        position: 'fixed',
        top: '20px',
        right: '20px',
        zIndex: 1000,
        background: 'var(--bg-secondary)',
        border: '2px solid var(--border-color)',
        borderRadius: '50%',
        width: '50px',
        height: '50px',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '1.5rem',
        boxShadow: '0 2px 8px var(--shadow)',
        transition: 'all 0.2s ease',
        color: 'var(--text-primary)'
      }}
      onMouseEnter={(e) => {
        e.target.style.transform = 'scale(1.05)';
        e.target.style.boxShadow = '0 4px 12px var(--shadow-hover)';
      }}
      onMouseLeave={(e) => {
        e.target.style.transform = 'scale(1)';
        e.target.style.boxShadow = '0 2px 8px var(--shadow)';
      }}
    >
      {isDark ? '☀️' : '🌙'}
    </button>
  );
}

export default ThemeToggle;