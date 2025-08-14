// JWT Authentication Service
import { SignJWT, jwtVerify } from 'jose';

const JWT_SECRET = new TextEncoder().encode(
  import.meta.env.VITE_JWT_SECRET || 'life-progress-tracker-secret-key-2024'
);

const JWT_ALGORITHM = 'HS256';

export class AuthService {
  constructor() {
    this.currentUser = null;
    this.loadUserFromStorage();
  }

  // Generate JWT token for user
  async generateToken(userData) {
    try {
      const token = await new SignJWT({ 
        userId: userData.userId,
        email: userData.email,
        pantryId: userData.pantryId,
        exp: Math.floor(Date.now() / 1000) + (24 * 60 * 60) // 24 hours
      })
      .setProtectedHeader({ alg: JWT_ALGORITHM })
      .setIssuedAt()
      .setExpirationTime('24h')
      .sign(JWT_SECRET);

      return token;
    } catch (error) {
      console.error('Error generating JWT token:', error);
      throw new Error('Failed to generate authentication token');
    }
  }

  // Verify JWT token
  async verifyToken(token) {
    try {
      const { payload } = await jwtVerify(token, JWT_SECRET);
      return payload;
    } catch (error) {
      console.error('Error verifying JWT token:', error);
      throw new Error('Invalid or expired token');
    }
  }

  // Login user with email and pantry ID
  async login(email, pantryId) {
    try {
      // Generate unique user ID based on email
      const userId = btoa(email).replace(/[^a-zA-Z0-9]/g, '').substring(0, 16);
      
      const userData = {
        userId,
        email,
        pantryId,
        loginTime: Date.now()
      };

      // Generate JWT token
      const token = await this.generateToken(userData);
      
      // Store in localStorage
      localStorage.setItem('lpt_auth_token', token);
      localStorage.setItem('lpt_user_data', JSON.stringify(userData));
      
      this.currentUser = userData;
      
      return {
        success: true,
        user: userData,
        token
      };
    } catch (error) {
      console.error('Login error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Logout user
  logout() {
    localStorage.removeItem('lpt_auth_token');
    localStorage.removeItem('lpt_user_data');
    this.currentUser = null;
  }

  // Check if user is authenticated
  async isAuthenticated() {
    const token = localStorage.getItem('lpt_auth_token');
    if (!token) return false;

    try {
      const payload = await this.verifyToken(token);
      return payload && payload.exp > Math.floor(Date.now() / 1000);
    } catch (error) {
      // Token is invalid, clear it
      this.logout();
      return false;
    }
  }

  // Get current user
  getCurrentUser() {
    return this.currentUser;
  }

  // Load user from localStorage
  loadUserFromStorage() {
    const userData = localStorage.getItem('lpt_user_data');
    if (userData) {
      try {
        this.currentUser = JSON.parse(userData);
      } catch (error) {
        console.error('Error parsing stored user data:', error);
        this.logout();
      }
    }
  }

  // Get current auth token
  getToken() {
    return localStorage.getItem('lpt_auth_token');
  }

  // Refresh token if needed
  async refreshTokenIfNeeded() {
    const token = this.getToken();
    if (!token) return false;

    try {
      const payload = await this.verifyToken(token);
      const timeUntilExpiry = payload.exp - Math.floor(Date.now() / 1000);
      
      // If token expires in less than 1 hour, refresh it
      if (timeUntilExpiry < 3600) {
        const newToken = await this.generateToken(this.currentUser);
        localStorage.setItem('lpt_auth_token', newToken);
        return newToken;
      }
      
      return token;
    } catch (error) {
      console.error('Error refreshing token:', error);
      this.logout();
      return false;
    }
  }
}

// Export singleton instance
export const authService = new AuthService();