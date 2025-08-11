import { NavLink } from 'react-router-dom';
import './Navigation.css';

function Navigation() {
  return (
    <nav className="navigation">
      <NavLink 
        to="/add-event" 
        className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}
      >
        <span className="nav-icon">➕</span>
        <span className="nav-label">Add Event</span>
      </NavLink>
      
      <NavLink 
        to="/progress" 
        className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}
      >
        <span className="nav-icon">📊</span>
        <span className="nav-label">Progress</span>
      </NavLink>
      
      <NavLink 
        to="/history" 
        className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}
      >
        <span className="nav-icon">📋</span>
        <span className="nav-label">History</span>
      </NavLink>
      
      <NavLink 
        to="/customize" 
        className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}
      >
        <span className="nav-icon">⚙️</span>
        <span className="nav-label">Customize</span>
      </NavLink>
    </nav>
  );
}

export default Navigation;