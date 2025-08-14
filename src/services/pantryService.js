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
        'LCG',
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
        'LCG',
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
        'LCG',
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
        'LCG',
        'DELETE'
      );
      
      console.log('Data deleted from Pantry successfully');
      return result;
    } catch (error) {
      console.error('Error deleting data from Pantry:', error);
      throw new Error(`Failed to delete data: ${error.message}`);
    }
  }

  // Intelligent sync with detailed comparison
  async syncWithPantry(localData) {
    try {
      // Get cloud data
      const cloudData = await this.loadUserData();
      
      if (!cloudData) {
        // No cloud data exists, save local data
        await this.saveUserData(localData);
        return { 
          action: 'uploaded', 
          message: 'Local data uploaded to cloud (first time)',
          changes: {
            situations: { added: localData.situations?.length || 0 },
            opportunities: { added: localData.opportunities?.length || 0 },
            events: { added: localData.events?.length || 0 }
          }
        };
      }

      // Compare data intelligently
      const comparison = this.compareData(localData, cloudData);
      
      if (comparison.hasChanges) {
        // Merge data based on comparison
        const mergedData = this.mergeData(localData, cloudData, comparison);
        
        // Update cloud with merged data
        await this.updateUserData(mergedData);
        
        return {
          action: 'merged',
          message: 'Data synchronized with intelligent merge',
          changes: comparison.changes,
          mergedData
        };
      } else {
        return { 
          action: 'synced', 
          message: 'Data is already in sync',
          changes: { situations: {}, opportunities: {}, events: {} }
        };
      }
    } catch (error) {
      console.error('Error syncing with Pantry:', error);
      throw new Error(`Sync failed: ${error.message}`);
    }
  }

  // Compare local and cloud data intelligently - optimized version
  compareData(localData, cloudData) {
    console.log('🔍 Starting fast data comparison...');
    
    const changes = {
      situations: { added: [], modified: [], deleted: [] },
      opportunities: { added: [], modified: [], deleted: [] },
      events: { added: [], modified: [], deleted: [] }
    };

    // Optimized helper function - single pass comparison
    const compareArrays = (localArray = [], cloudArray = [], type) => {
      console.log(`📊 Comparing ${localArray.length} local vs ${cloudArray.length} cloud ${type}`);
      
      // Create maps for O(1) lookups
      const cloudMap = new Map();
      const localIds = new Set();
      
      // Build cloud map and track which cloud items we've seen
      for (const item of cloudArray) {
        cloudMap.set(item.id, item);
      }
      
      // Single pass through local array
      for (const localItem of localArray) {
        localIds.add(localItem.id);
        const cloudItem = cloudMap.get(localItem.id);
        
        if (!cloudItem) {
          // Item exists in local but not cloud - added
          changes[type].added.push(localItem);
        } else {
          // Both exist - check if modified (quick comparison first)
          if (this.isItemModified(localItem, cloudItem, type)) {
            changes[type].modified.push(localItem);
          }
        }
      }
      
      // Find deleted items (in cloud but not local) - single pass
      for (const cloudItem of cloudArray) {
        if (!localIds.has(cloudItem.id)) {
          changes[type].deleted.push(cloudItem.id);
        }
      }
    };

    // Compare each data type
    compareArrays(localData.situations || [], cloudData.situations || [], 'situations');
    compareArrays(localData.opportunities || [], cloudData.opportunities || [], 'opportunities');
    compareArrays(localData.events || [], cloudData.events || [], 'events');

    const hasChanges = Object.values(changes).some(change => 
      change.added.length > 0 || change.modified.length > 0 || change.deleted.length > 0
    );

    console.log('✅ Comparison complete:', hasChanges ? 'Changes detected' : 'No changes');
    return { hasChanges, changes };
  }

  // Fast item modification check - optimized for performance
  isItemModified(localItem, cloudItem, type) {
    // Quick timestamp check first (most common case)
    const localTime = (localItem.updated_at || localItem.created_at);
    const cloudTime = (cloudItem.updated_at || cloudItem.created_at);
    
    if (localTime && cloudTime) {
      const localMs = new Date(localTime).getTime();
      const cloudMs = new Date(cloudTime).getTime();
      if (localMs > cloudMs) return true;
      if (localMs < cloudMs) return false; // Cloud is newer, don't modify
    }
    
    // Fast content comparison - avoid expensive JSON.stringify
    switch (type) {
      case 'situations':
        return localItem.title !== cloudItem.title || 
               localItem.description !== cloudItem.description ||
               this.arraysDifferent(localItem.tags, cloudItem.tags);
      
      case 'opportunities':
        return localItem.title !== cloudItem.title || 
               localItem.description !== cloudItem.description ||
               localItem.current_level !== cloudItem.current_level ||
               localItem.current_xp !== cloudItem.current_xp ||
               this.arraysDifferent(localItem.tags, cloudItem.tags);
      
      case 'events':
        return localItem.title !== cloudItem.title ||
               localItem.event_description !== cloudItem.event_description ||
               localItem.choice_value !== cloudItem.choice_value ||
               localItem.xp_change !== cloudItem.xp_change ||
               localItem.situation_id !== cloudItem.situation_id;
      
      default:
        return false;
    }
  }

  // Fast array comparison without JSON.stringify
  arraysDifferent(arr1 = [], arr2 = []) {
    if (arr1.length !== arr2.length) return true;
    for (let i = 0; i < arr1.length; i++) {
      if (arr1[i] !== arr2[i]) return true;
    }
    return false;
  }

  // Merge local and cloud data based on comparison
  mergeData(localData, cloudData, comparison) {
    const merged = {
      ...cloudData,
      lastUpdated: Date.now()
    };

    // Merge situations
    merged.situations = this.mergeArray(
      cloudData.situations || [],
      localData.situations || [],
      comparison.changes.situations
    );

    // Merge opportunities
    merged.opportunities = this.mergeArray(
      cloudData.opportunities || [],
      localData.opportunities || [],
      comparison.changes.opportunities
    );

    // Merge events
    merged.events = this.mergeArray(
      cloudData.events || [],
      localData.events || [],
      comparison.changes.events
    );

    return merged;
  }

  // Merge array with changes
  mergeArray(cloudArray, localArray, changes) {
    let result = [...cloudArray];

    // Add new items
    changes.added.forEach(item => {
      result.push(item);
    });

    // Update modified items
    changes.modified.forEach(modifiedItem => {
      const index = result.findIndex(item => item.id === modifiedItem.id);
      if (index !== -1) {
        result[index] = modifiedItem;
      } else {
        result.push(modifiedItem); // Add if not found
      }
    });

    // Remove deleted items
    changes.deleted.forEach(deletedId => {
      result = result.filter(item => item.id !== deletedId);
    });

    return result;
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