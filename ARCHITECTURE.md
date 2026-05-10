# TrustDoc Production Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────────┐
│                      User Browser                            │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  React Frontend (Vite)                                 │  │
│  │  - Identity Setup & Profile Management                 │  │
│  │  - Wallet Connection & Management                       │  │
│  │  - Document Registration & Verification                 │  │
│  │  - Realtime Multi-user Synchronization                  │  │
│  │  - Analytics & Audit Logs Dashboard                     │  │
│  └────────────────────────────────────────────────────────┘  │
└──────────────┬──────────────────────────────────┬─────────────┘
               │                                  │
               │ HTTP/REST                        │ MetaMask/Web3
               ▼                                  ▼
    ┌──────────────────────┐         ┌─────────────────────────┐
    │   Supabase Cloud     │         │  Polygon Amoy Blockchain│
    │  (Backend-as-a-      │         │  (Smart Contracts)       │
    │   Service)           │         │  ┌──────────────────────┐│
    │                      │         │  │ DocumentRegistry.sol  ││
    │  ┌────────────────┐  │         │  │ - registerDocument()  ││
    │  │ PostgreSQL DB  │  │         │  │ - verifyDocument()    ││
    │  │ - profiles     │  │         │  │ - revokeDocument()    ││
    │  │ - documents    │  │         │  │ - getDocuments()      ││
    │  │ - sharing      │  │         │  └──────────────────────┘│
    │  │ - wallets      │  │         └─────────────────────────┘
    │  │ - audit_logs   │  │
    │  │ - activity     │  │         ┌─────────────────────────┐
    │  └────────────────┘  │         │    IPFS (via Pinata)    │
    │                      │         │  - Document Storage      │
    │  ┌────────────────┐  │         │  - Encrypted Files      │
    │  │ Auth System    │  │         └─────────────────────────┘
    │  │ - Email/Pass   │  │
    │  │ - Google OAuth │  │
    │  │ - Sessions     │  │
    │  └────────────────┘  │
    │                      │
    │  ┌────────────────┐  │
    │  │ RLS Policies   │  │
    │  │ - Private data │  │
    │  │ - Shared docs  │  │
    │  │ - Public verify│  │
    │  └────────────────┘  │
    │                      │
    │  ┌────────────────┐  │
    │  │ Realtime       │  │
    │  │ - Subscriptions│  │
    │  │ - Broadcasting │  │
    │  └────────────────┘  │
    └──────────────────────┘
```

## Data Flow Architecture

### 1. User Registration Flow
```
User → Sign Up → Email Verification → Identity Setup → Complete Profile
  ↓                                        ↓
  └─ Create auth.users entry             └─ Create profiles entry
  └─ Create profile record               └─ Set setup_completed = true
```

### 2. Wallet Connection Flow
```
User → Connect Wallet → Sign Message → Verify Signature → Store Session
  ↓                                                           ↓
  └─ Request account from MetaMask                  Create wallet_sessions entry
  └─ Generate nonce message                         Update profiles.wallet_address
  └─ Sign with wallet                               Log audit event
  └─ Verify signature matches
```

### 3. Document Registration Flow
```
File → Hash File → Upload to IPFS → Register on Blockchain → Store in DB
  ↓                    ↓                    ↓                      ↓
  └─ SHA256 hash    └─ Get CID        └─ Send tx            └─ Create documents entry
  └─ Store hash     └─ Metadata       └─ Verify tx          └─ Link to user
                                       └─ Wait confirmation   └─ Set privacy level
```

### 4. Document Verification Flow
```
Hash Input → Query Blockchain → Fetch Metadata → Verify Proof → Return Status
    ↓               ↓                 ↓                ↓             ↓
    └─ Calculate   └─ Get document   └─ IPFS fetch   └─ Check      └─ VERIFIED
      hash           proof            metadata          signature    └─ REVOKED
    └─ Validate     └─ Check owner    └─ Validate     └─ Verify     └─ NOT FOUND
                    └─ Check revoked    issued by       timestamp
```

### 5. Realtime Sync Flow
```
User A Action → Supabase Broadcast → Realtime Subscription → User B UI Update
     ↓                  ↓                    ↓                      ↓
     └─ Updates DB  └─ Triggers event  └─ AppContext listener   └─ Re-render
     └─ Audit log   └─ Notifies all    └─ Invalidate cache      └─ Show feedback
                      connected users   └─ Optimistic update
```

---

## Component Architecture

### Frontend Structure
```
src/
├── pages/
│   ├── Login.jsx              # Email/password authentication
│   ├── AuthRegister.jsx       # Sign up flow
│   ├── IdentitySetup.jsx      # Profile completion (NEW)
│   ├── Dashboard.jsx          # Main app hub
│   ├── Register.jsx           # Document upload
│   ├── Verify.jsx             # Document verification
│   ├── MyDocuments.jsx        # User's documents
│   ├── Analytics.jsx          # Stats & charts
│   ├── Profile.jsx            # User profile
│   ├── Settings.jsx           # Preferences
│   └── AuthCallback.jsx       # OAuth redirect
│
├── components/
│   ├── ProtectedRoute.jsx     # Auth + setup gate
│   ├── RequireWallet.jsx      # Wallet requirement
│   ├── Navbar.jsx             # Top navigation (+ Wallet Management button)
│   ├── Sidebar.jsx            # Left navigation
│   ├── DragDropVerify.jsx     # File drop zone
│   ├── ui/
│   │   ├── Button.jsx         # Styled buttons
│   │   ├── Card.jsx           # Card containers
│   │   ├── SearchInput.jsx    # Search box
│   │   ├── StatusBadge.jsx    # Status indicators
│   │   └── ...
│   └── ...
│
├── modals/
│   ├── DocumentDetailsModal.jsx
│   ├── ProofDetailsModal.jsx
│   ├── ConfirmModal.jsx
│   └── WalletManagementModal.jsx    # (NEW)
│
├── context/
│   ├── AuthContext.jsx        # Authentication state (UPDATED)
│   └── AppContext.jsx         # App state (UPDATED with realtime)
│
├── hooks/
│   ├── useDebouncedValue.js
│   ├── usePolling.js
│   ├── useDocumentFilters.js
│   ├── useRealtimeSubscription.js   # (NEW)
│   └── useDocumentSync.js           # (NEW)
│
├── services/
│   ├── supabaseService.js     # API clients (UPDATED)
│   ├── documentService.js     # Document logic
│   ├── analyticsService.js    # Analytics
│   ├── storageService.js      # Local storage
│   └── ...
│
└── utils/
    ├── contract.js            # Web3 interactions
    ├── hashFile.js            # File hashing
    ├── format.js              # Text formatting
    ├── security.js            # Security utilities
    ├── explorer.js            # Block explorer links
    └── ...
```

### Database Schema Architecture

```
profiles (1 user)
├── user_id (PK)
├── email
├── display_name
├── organization_name (NEW)
├── organization_role (NEW)
├── wallet_address
├── profile_photo_url (NEW)
├── setup_completed (NEW - gates access)
├── bio (NEW)
└── settings

documents (many per user)
├── id (PK)
├── user_id (FK)
├── hash
├── privacy_level (NEW: private/shared/public)
├── description (NEW)
├── file_name (NEW)
└── metadata

wallet_sessions (NEW - many per user)
├── id (PK)
├── user_id (FK)
├── wallet_address
├── verified
└── last_activity_at

document_sharing (NEW - many per document)
├── id (PK)
├── document_id (FK)
├── owner_id (FK)
├── shared_with_user_id (FK, optional)
├── shared_with_wallet (optional)
└── expires_at (optional)

audit_logs (NEW - for compliance)
├── id (PK)
├── user_id (FK)
├── action
├── resource_type
├── resource_id
└── changes

suspicious_activity (NEW - for security)
├── id (PK)
├── user_id (FK)
├── activity_type
├── severity
└── resolved
```

---

## Authentication Flow

### Session Management
```
1. User logs in with email/password
   ↓
2. Supabase returns: access_token, refresh_token
   ↓
3. Frontend stores in session memory
   ↓
4. All API requests include: Authorization: Bearer {access_token}
   ↓
5. Token expires in 1 hour
   ↓
6. Frontend uses refresh_token to get new access_token
   ↓
7. Refresh_token valid for 7 days
```

### OAuth Flow
```
1. User clicks "Sign in with Google"
   ↓
2. Frontend redirects to Supabase OAuth endpoint
   ↓
3. Supabase redirects to Google login
   ↓
4. User authorizes TrustDoc
   ↓
5. Google redirects back to TrustDoc with auth code
   ↓
6. Supabase exchanges code for tokens
   ↓
7. Frontend receives tokens in URL hash
   ↓
8. Frontend stores tokens and redirects to app
```

---

## Wallet Integration Architecture

### Wallet Flow
```
1. User clicks "Connect Wallet"
   ↓
2. App requests account access from MetaMask
   ↓
3. MetaMask shows permission dialog
   ↓
4. User approves
   ↓
5. App gets wallet address
   ↓
6. App generates signing message (includes nonce, timestamp)
   ↓
7. App requests signature from MetaMask
   ↓
8. MetaMask shows signature request
   ↓
9. User approves
   ↓
10. App receives signature
    ↓
11. App verifies signature matches address
    ↓
12. App saves wallet session to database
    ↓
13. User can now register documents
```

### Multi-Wallet Support
```
User can connect up to 5 wallets:
- Wallet A (primary)
- Wallet B (backup)
- Wallet C (mobile)
- Wallet D (team)
- Wallet E (archive)

Each wallet:
- Has independent signature
- Has independent document list
- Can be disconnected anytime
- Has last activity timestamp
```

---

## Privacy & Access Control

### Document Privacy Levels

```
PRIVATE (default)
├── Owner: Can read, update, delete, share
├── Others: Cannot access at all
└── Blockchain: Hash only, metadata hidden

SHARED
├── Owner: Can read, update, delete, adjust shares
├── Shared Users: Can read/verify only
├── Shared Wallets: Can verify only
└── Blockchain: Hash visible, metadata hidden (RLS protected)

PUBLIC
├── Owner: Can read, update, revoke only
├── Anyone: Can verify with hash/link
└── Blockchain: Hash visible, any verification allowed
```

### Access Control Matrix

```
                  | Private | Shared | Public
────────────────────────────────────────────
Owner             | ✓ All   | ✓ All  | ✓ All
Shared User       | ✗       | ✓ View | ✓ View
Other User        | ✗       | ✗      | ✓ Verify
Anonymous         | ✗       | ✗      | ✓ Verify
```

---

## Realtime Synchronization Architecture

### Subscription Model
```
Document Changes:
1. User A updates document privacy
   ↓
2. Supabase broadcasts to all subscribers
   ↓
3. User A's AppContext updates immediately
   ↓
4. User B receives realtime event
   ↓
5. User B's AppContext invalidates cache
   ↓
6. User B's UI re-renders with new data
```

### Polling Fallback
```
When realtime unavailable:
- Every 15 seconds, check for updates
- Compare with cached version
- Only update if changed
- Reduces server load
- UI remains responsive
```

### Cache Invalidation
```
When data changes:
1. Document added/updated/deleted
2. Invalidate documents cache
3. Refetch from database
4. Update UI
5. Broadcast to other tabs (BroadcastChannel API)
```

---

## Performance Considerations

### Frontend Optimization
- Route-based code splitting
- Lazy component loading
- Image optimization
- CSS minification (Tailwind)
- Font optimization
- Asset compression

### Database Optimization
- Indexed queries
- RLS for security without performance penalty
- Realtime subscriptions (pooled connections)
- Polling as fallback

### Blockchain Optimization
- Batch verification when possible
- Caching verification results
- Using indexed events
- Fallback RPC URLs for redundancy

---

## Security Layers

```
Layer 1: Transport
├── HTTPS enforced
└── All cookies secure/httpOnly

Layer 2: Authentication
├── Email verification
├── Password requirements
└── Session expiration

Layer 3: Authorization
├── Row-level security (RLS)
├── Wallet signature verification
└── Document ownership checks

Layer 4: Data Protection
├── PII not exposed in blockchain
├── Files encrypted in transit
└── Audit logging all access

Layer 5: Smart Contract
├── Owner verification
├── Hash validation
└── Revocation support
```

---

## Deployment Architecture

### Frontend Deployment
```
Git Push
  ↓
GitHub Webhook
  ↓
Vercel Build
  ├─ npm install
  ├─ npm run build
  ├─ Tests (optional)
  └─ Optimization
  ↓
Global CDN
├─ Edge caching
├─ DDoS protection
└─ Automatic HTTPS
```

### Backend Deployment
```
Supabase Managed
├─ PostgreSQL (auto-scaling)
├─ Auth system (built-in)
├─ Realtime engine (built-in)
└─ Edge functions (optional)

Backups
├─ Daily automated
├─ Point-in-time recovery
└─ Retained 30 days
```

### Blockchain
```
Polygon Amoy Testnet
├─ Smart contract immutable
├─ Transaction history permanent
├─ Block explorer: amoy.polygonscan.com
└─ Verified contract code
```

---

## Monitoring Architecture

```
Frontend
├─ Error tracking (Sentry optional)
├─ Performance monitoring
└─ User analytics

Backend
├─ Database metrics
├─ API response times
├─ RLS policy violations
└─ Auth failures

Blockchain
├─ Transaction monitoring
├─ Gas price tracking
└─ Network status
```

---

This architecture ensures:
- ✅ Secure data isolation
- ✅ Scalable to thousands of users
- ✅ Real-time collaboration
- ✅ Complete audit trail
- ✅ Production-ready reliability

