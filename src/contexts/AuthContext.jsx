import React, { createContext, useContext, useState, useEffect } from 'react';
import { authService } from '../services/authService';
import { pantryService } from '../services/pantryService';

const AuthContext = createContext();

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    checkAuthStatus();
  }, []);

  const checkAuthStatus = async () => {
    try {
      const isAuth = await authService.isAuthenticated();
      const currentUser = authService.getCurrentUser();
      
      setIsAuthenticated(isAuth);
      setUser(currentUser);
    } catch (error) {
      console.error('Error checking auth status:', error);
      setIsAuthenticated(false);
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  };

  const login = async (email, pantryId) => {
    try {
      setIsLoading(true);
      const result = await authService.login(email, pantryId);
      
      if (result.success) {
        setUser(result.user);
        setIsAuthenticated(true);
        return { success: true, user: result.user };
      } else {
        return { success: false, error: result.error };
      }
    } catch (error) {
      console.error('Login error:', error);
      return { success: false, error: error.message };
    } finally {
      setIsLoading(false);
    }
  };

  const logout = () => {
    authService.logout();
    setUser(null);
    setIsAuthenticated(false);
  };

  const syncData = async (localData) => {
    if (!isAuthenticated) {
      throw new Error('Must be authenticated to sync data');
    }

    try {
      const result = await pantryService.syncWithPantry(localData);
      return result;
    } catch (error) {
      console.error('Data sync error:', error);
      throw error;
    }
  };

  const saveToCloud = async (data) => {
    if (!isAuthenticated) {
      throw new Error('Must be authenticated to save data');
    }

    try {
      const result = await pantryService.saveUserData(data);
      return result;
    } catch (error) {
      console.error('Save to cloud error:', error);
      throw error;
    }
  };

  const loadFromCloud = async () => {
    if (!isAuthenticated) {
      throw new Error('Must be authenticated to load data');
    }

    try {
      const result = await pantryService.loadUserData();
      return result;
    } catch (error) {
      console.error('Load from cloud error:', error);
      throw error;
    }
  };

  const getRateLimitStatus = () => {
    return pantryService.getRateLimitStatus();
  };

  const value = {
    user,
    isAuthenticated,
    isLoading,
    login,
    logout,
    syncData,
    saveToCloud,
    loadFromCloud,
    getRateLimitStatus,
    checkAuthStatus
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};