# 🔐 Cloud Sync with JWT Authentication

This branch adds secure cloud synchronization using JWT authentication and Pantry.cloud storage.

## ✨ Features

### 🔐 **JWT Authentication**
- Client-side JWT token generation and verification
- Secure user identification using email + Pantry ID
- 24-hour token expiration with automatic refresh
- Local storage for persistent sessions

### ☁️ **Pantry.cloud Integration**
- Free cloud storage for user data (getpantry.cloud)
- JSON data storage for opportunities, events, situations, and stats
- Automatic data synchronization between devices
- No server setup required - purely client-side

### 🚦 **Rate Limiting**
- **1 request per minute maximum** to Pantry API
- Intelligent request queuing system
- Visual rate limit status indicators
- Prevents API abuse and quota exhaustion

### 🔄 **Smart Sync System**
- Compares local vs cloud data timestamps
- Automatic conflict resolution (newest wins)
- Bidirectional sync (upload/download)
- Sync status notifications

## 🚀 Getting Started

### 1. Install Dependencies
```bash
npm install jsonwebtoken jose
```

### 2. Set up Environment Variables
```bash
# Copy the example file
cp .env.example .env

# Edit .env and set your JWT secret
VITE_JWT_SECRET=your-super-secret-jwt-key-here
```

### 3. Get a Pantry ID
1. Visit [getpantry.cloud](https://getpantry.cloud/)
2. Click "Create New Pantry"
3. Copy your unique Pantry ID
4. Use it in the app to connect your cloud storage

## 🎯 How to Use

### **Connecting Cloud Storage**
1. Click the **"Connect Cloud"** button in the app header
2. Enter your email address (for identification)
3. Enter your Pantry ID from getpantry.cloud
4. Click "Connect Storage"

### **Syncing Data**
1. Once connected, click the **"Sync"** button
2. Data will automatically sync between local and cloud
3. Status messages show sync progress and results
4. Rate limiting prevents too frequent requests

### **Rate Limiting**
- Maximum 1 request per minute to Pantry API
- Queue shows pending requests
- Timer displays when next request is allowed
- Prevents API quota exhaustion

## 🏗️ Technical Architecture

### **Components Structure**
```
src/
├── services/
│   ├── authService.js      # JWT authentication logic
│   └── pantryService.js    # Pantry.cloud API integration
├── contexts/
│   └── AuthContext.jsx     # React context for auth state
├── components/
│   ├── LoginModal.jsx      # Authentication modal
│   ├── LoginModal.css      # Modal styling
│   ├── CloudSyncButton.jsx # Sync button component
│   └── CloudSyncButton.css # Button styling
└── .env.example           # Environment variables template
```

### **Services Overview**

#### **AuthService** (`authService.js`)
- JWT token generation using JOSE library
- Token verification and expiration handling
- Local storage management
- User session persistence

#### **PantryService** (`pantryService.js`)
- Rate-limited HTTP requests to Pantry API
- Request queuing system (1 req/min max)
- CRUD operations for user data
- Automatic conflict resolution

#### **AuthContext** (`AuthContext.jsx`)
- React context for authentication state
- Login/logout functionality
- Data sync orchestration
- Rate limit status tracking

### **Data Flow**
1. User authenticates with email + Pantry ID
2. JWT token generated and stored locally
3. Local data exported from IndexedDB
4. Rate-limited sync request to Pantry.cloud
5. Timestamp comparison for conflict resolution
6. Data updated in local or cloud as needed

## 🔒 Security Features

### **JWT Tokens**
- HS256 algorithm for signing
- 24-hour expiration time
- Automatic refresh when needed
- Secure local storage

### **Data Privacy**
- No sensitive data stored on external servers
- Email used only for user identification
- Pantry ID required for storage access
- Client-side encryption with JWT

### **Rate Limiting**
- Prevents API abuse
- Protects against quota exhaustion
- Queue system for multiple requests
- Visual feedback for users

## 📡 API Integration

### **Pantry.cloud Endpoints**
- `GET /apiv1/pantry/{pantryId}/basket/user-data` - Load data
- `POST /apiv1/pantry/{pantryId}/basket/user-data` - Save new data
- `PUT /apiv1/pantry/{pantryId}/basket/user-data` - Update data
- `DELETE /apiv1/pantry/{pantryId}/basket/user-data` - Delete data

### **Rate Limiting Implementation**
```javascript
const RATE_LIMIT_INTERVAL = 60000; // 1 minute
const canMakeRequest = () => {
  const timeSinceLastRequest = Date.now() - lastRequestTime;
  return timeSinceLastRequest >= RATE_LIMIT_INTERVAL;
};
```

### **Request Queue System**
- FIFO queue for pending requests
- Automatic processing with delays
- Promise-based request handling
- Error propagation and retry logic

## 🎨 UI Components

### **Cloud Sync Button**
- Shows connection status
- Displays sync progress
- Rate limit countdown timer
- User email and logout option

### **Login Modal**
- Email and Pantry ID input
- Help section with setup instructions
- Error handling and validation
- Responsive design

### **Status Indicators**
- ☁️ Disconnected
- 🔄 Syncing
- ✅ Success
- ❌ Error
- ⏱️ Rate Limited

## 🔧 Development Notes

### **Environment Variables**
- `VITE_JWT_SECRET` - Secret key for JWT signing
- Must be changed in production
- Keep secure and never commit to repo

### **Local Storage Keys**
- `lpt_auth_token` - JWT authentication token
- `lpt_user_data` - Cached user information

### **Error Handling**
- Network failures gracefully handled
- Rate limit errors with helpful messages
- Token expiration auto-refresh
- Sync conflict resolution

## 🚨 Important Limitations

1. **Pantry.cloud Free Tier**: Limited storage and requests
2. **Rate Limiting**: Maximum 1 request per minute
3. **No Real-time Sync**: Manual sync required
4. **Client-side Only**: No server-side validation
5. **Token Security**: Stored in localStorage (XSS risk)

## 🔄 Future Enhancements

- [ ] Background sync with service workers
- [ ] Offline-first sync with conflict resolution
- [ ] Multiple cloud storage providers
- [ ] Real-time synchronization
- [ ] Data encryption at rest
- [ ] Automatic sync scheduling
- [ ] Sync activity logs
- [ ] Data export/import features

## 📝 Usage Example

```javascript
// Connect to cloud storage
const { login, syncData } = useAuth();
await login('user@example.com', 'your-pantry-id');

// Sync data
const localData = await exportLocalData();
const result = await syncData(localData);
console.log(result.message); // "Data synced successfully"
```

This implementation provides secure, rate-limited cloud synchronization while maintaining the app's offline-first architecture!