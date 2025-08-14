// Pantry.cloud Integration Service with Rate Limiting
import { authService } from './authService';

const PANTRY_BASE_URL = 'https://getpantry.cloud/apiv1/pantry';
const RATE_LIMIT_INTERVAL = 60000; // 1 minute in milliseconds

export class PantryService {
  constructor() {
    this.lastRequestTime = 0;
    this.requestQueue = [];
    this.isProcessingQueue = false;
  }

  // Check if we can make a request (rate limiting)
  canMakeRequest() {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    return timeSinceLastRequest >= RATE_LIMIT_INTERVAL;
  }

  // Wait until we can make the next request
  async waitForRateLimit() {
    if (this.canMakeRequest()) {
      return Promise.resolve();
    }

    const now = Date.now();
    const timeToWait = RATE_LIMIT_INTERVAL - (now - this.lastRequestTime);
    
    console.log(`Rate limit: waiting ${Math.ceil(timeToWait / 1000)} seconds before next request`);
    
    return new Promise(resolve => {
      setTimeout(resolve, timeToWait);
    });
  }

  // Make rate-limited request to Pantry
  async makeRequest(pantryId, basketName, method = 'GET', data = null) {
    // Add to queue if we can't make request immediately
    return new Promise((resolve, reject) => {
      this.requestQueue.push({
        pantryId,
        basketName,
        method,
        data,
        resolve,
        reject
      });

      this.processQueue();
    });
  }

  // Process request queue with rate limiting
  async processQueue() {
    if (this.isProcessingQueue || this.requestQueue.length === 0) {
      return;
    }

    this.isProcessingQueue = true;

    while (this.requestQueue.length > 0) {
      const request = this.requestQueue.shift();
      
      try {
        // Wait for rate limit
        await this.waitForRateLimit();
        
        // Make the actual request
        const result = await this.executeRequest(
          request.pantryId,
          request.basketName,
          request.method,
          request.data
        );
        
        this.lastRequestTime = Date.now();
        request.resolve(result);
        
      } catch (error) {
        request.reject(error);
      }
    }

    this.isProcessingQueue = false;
  }

  // Execute the actual HTTP request
  async executeRequest(pantryId, basketName, method, data) {
    const url = `${PANTRY_BASE_URL}/${pantryId}/basket/${basketName}`;
    
    const options = {
      method,
      headers: {
        'Content-Type': 'application/json',
      }
    };

    if (data && (method === 'POST' || method === 'PUT')) {
      options.body = JSON.stringify(data);
    }

    const response = await fetch(url, options);
    
    if (!response.ok) {
      throw new Error(`Pantry API error: ${response.status} ${response.statusText}`);
    }

    // Handle different response types
    if (method === 'DELETE') {
      return { success: true };
    }

    try {
      return await response.json();
    } catch (error) {
      // Some responses might not be JSON
      return await response.text();
    }
  }

  // Save user data to Pantry
  async saveUserData(data) {
    const user = authService.getCurrentUser();
    if (!user || !user.pantryId) {
      throw new Error('User not authenticated or pantry ID not found');
    }

    const dataToSave = {
      ...data,
      lastUpdated: Date.now(),
      userId: user.userId,
      version: '1.0'
    };

    try {
      const result = await this.makeRequest(
        user.pantryId,
        'user-data',
        'POST',
        dataToSave
      );
      
      console.log('Data saved to Pantry successfully');
      return result;
    } catch (error) {
      console.error('Error saving data to Pantry:', error);
      throw new Error(`Failed to save data: ${error.message}`);
    }
  }

  // Load user data from Pantry
  async loadUserData() {
    const user = authService.getCurrentUser();
    if (!user || !user.pantryId) {
      throw new Error('User not authenticated or pantry ID not found');
    }

    try {
      const result = await this.makeRequest(
        user.pantryId,
        'user-data',
        'GET'
      );
      
      console.log('Data loaded from Pantry successfully');
      return result;
    } catch (error) {
      console.error('Error loading data from Pantry:', error);
      
      // If basket doesn't exist, return null instead of throwing
      if (error.message.includes('404')) {
        return null;
      }
      
      throw new Error(`Failed to load data: ${error.message}`);
    }
  }

  // Update specific data in Pantry
  async updateUserData(updates) {
    const user = authService.getCurrentUser();
    if (!user || !user.pantryId) {
      throw new Error('User not authenticated or pantry ID not found');
    }

    try {
      // First get existing data
      const existingData = await this.loadUserData() || {};
      
      // Merge updates
      const updatedData = {
        ...existingData,
        ...updates,
        lastUpdated: Date.now(),
        userId: user.userId
      };

      const result = await this.makeRequest(
        user.pantryId,
        'user-data',
        'PUT',
        updatedData
      );
      
      console.log('Data updated in Pantry successfully');
      return result;
    } catch (error) {
      console.error('Error updating data in Pantry:', error);
      throw new Error(`Failed to update data: ${error.message}`);
    }
  }

  // Delete user data from Pantry
  async deleteUserData() {
    const user = authService.getCurrentUser();
    if (!user || !user.pantryId) {
      throw new Error('User not authenticated or pantry ID not found');
    }

    try {
      const result = await this.makeRequest(
        user.pantryId,
        'user-data',
        'DELETE'
      );
      
      console.log('Data deleted from Pantry successfully');
      return result;
    } catch (error) {
      console.error('Error deleting data from Pantry:', error);
      throw new Error(`Failed to delete data: ${error.message}`);
    }
  }

  // Sync local database with Pantry
  async syncWithPantry(localData) {
    try {
      // Get cloud data
      const cloudData = await this.loadUserData();
      
      if (!cloudData) {
        // No cloud data exists, save local data
        await this.saveUserData(localData);
        return { 
          action: 'uploaded', 
          message: 'Local data uploaded to cloud' 
        };
      }

      // Compare timestamps to determine which is newer
      const localTimestamp = localData.lastUpdated || 0;
      const cloudTimestamp = cloudData.lastUpdated || 0;

      if (localTimestamp > cloudTimestamp) {
        // Local data is newer, upload to cloud
        await this.updateUserData(localData);
        return { 
          action: 'uploaded', 
          message: 'Local data uploaded to cloud (newer)' 
        };
      } else if (cloudTimestamp > localTimestamp) {
        // Cloud data is newer, return it for local update
        return { 
          action: 'downloaded', 
          message: 'Cloud data is newer',
          data: cloudData 
        };
      } else {
        // Data is in sync
        return { 
          action: 'synced', 
          message: 'Data is already in sync' 
        };
      }
    } catch (error) {
      console.error('Error syncing with Pantry:', error);
      throw new Error(`Sync failed: ${error.message}`);
    }
  }

  // Get rate limit status
  getRateLimitStatus() {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    const canMakeRequest = timeSinceLastRequest >= RATE_LIMIT_INTERVAL;
    
    return {
      canMakeRequest,
      timeUntilNextRequest: canMakeRequest ? 0 : RATE_LIMIT_INTERVAL - timeSinceLastRequest,
      queueLength: this.requestQueue.length,
      lastRequestTime: this.lastRequestTime
    };
  }
}

// Export singleton instance
export const pantryService = new PantryService();