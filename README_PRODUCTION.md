# TrustDoc - Production-Ready Web3 Document Verification Platform

**Version**: 1.0.0 Production  
**Status**: Ready for Deployment  
**Last Updated**: 2026-05-08

## 🎯 Overview

TrustDoc is a blockchain-based document verification platform built with React, Supabase, and Solidity. It provides cryptographic proof of document authenticity while maintaining complete user privacy through a sophisticated privacy model and row-level security.

### Key Features
- ✅ **User Identity System** - Complete profile setup and organization management
- ✅ **Wallet Management** - Connect, verify, and manage multiple wallets
- ✅ **Document Registration** - Register documents on Polygon Amoy blockchain
- ✅ **Document Verification** - Verify authenticity without exposing private data
- ✅ **Realtime Multi-User Sync** - WebSocket-based realtime synchronization
- ✅ **Privacy Levels** - Private, Shared, and Public document access
- ✅ **Audit Logging** - Complete compliance-ready audit trails
- ✅ **Security Hardening** - Production-grade security measures
- ✅ **GDPR Compliant** - Full data portability and deletion support

---

## 🏗️ Architecture

```
Frontend (React + Vite)
    ↓
    ├─ Supabase Auth (Email/OAuth)
    ├─ PostgreSQL (RLS Protected)
    ├─ Realtime Subscriptions
    └─ Storage (Private Buckets)
    ↓
MetaMask → Polygon Amoy Smart Contract
    ↓
IPFS (Pinata) - Encrypted File Storage
```

**For detailed architecture**, see [ARCHITECTURE.md](./ARCHITECTURE.md)

---

## 📋 System Requirements

### Development
- Node.js 18+ (20 recommended)
- npm 9+
- MetaMask browser extension
- Git

### Production
- Supabase project (free tier supported)
- Polygon Amoy RPC access (Alchemy, Infura, or QuickNode)
- Vercel account (or any Node.js host)
- IPFS/Pinata account for file storage
- Custom domain (optional)

---

## 🚀 Quick Start

### 1. Local Development Setup

```bash
# Clone repository
git clone https://github.com/your-org/trustdoc.git
cd trustdoc

# Frontend setup
cd frontend
npm install

# Copy environment template
cp .env.example .env.local

# Update .env.local with development values
# (see Environment Configuration section)

# Start development server
npm run dev

# Frontend runs on http://localhost:5173
```

### 2. Smart Contract Setup

```bash
cd ..  # Back to root

# Install Hardhat dependencies
npm install

# Copy environment
cp .env.example .env

# Update .env with your private key and RPC URL

# Compile contract
npx hardhat compile

# Deploy to Polygon Amoy
npx hardhat run scripts/deploy.js --network amoy

# Copy contract address to frontend .env
```

### 3. Supabase Setup

1. Create project at https://supabase.com
2. Go to SQL Editor
3. Paste contents of `frontend/supabase/schema.sql`
4. Execute SQL
5. Copy API credentials to frontend `.env.local`

### 4. First Login

1. Navigate to http://localhost:5173
2. Click "Sign Up"
3. Enter email and password
4. Verify email
5. Complete identity setup (name and organization)
6. Connect wallet
7. Register your first document

---

## 🔐 Environment Configuration

### Frontend (.env.local)

```bash
# Supabase
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...

# Blockchain
VITE_AMOY_RPC_URL=https://polygon-amoy.g.alchemy.com/v2/your-key
VITE_CONTRACT_ADDRESS=0x...

# App
VITE_APP_ORIGIN=http://localhost:5173
VITE_ENV=development

# IPFS
VITE_PINATA_JWT=your-jwt-token
VITE_PINATA_GATEWAY=https://gateway.pinata.cloud
```

### Backend (Hardhat .env)

```bash
AMOY_RPC_URL=https://polygon-amoy.g.alchemy.com/v2/your-key
PRIVATE_KEY=0x... # Never commit this!
```

**Full reference**: See [.env.example](./frontend/.env.example)

---

## 📚 Documentation

| Document | Purpose |
|----------|---------|
| [PRODUCTION_DEPLOYMENT_GUIDE.md](./PRODUCTION_DEPLOYMENT_GUIDE.md) | Complete deployment walkthrough |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | System design and data flows |
| [PRIVACY_MODEL.md](./PRIVACY_MODEL.md) | Privacy levels and access control |
| [SECURITY_CHECKLIST.md](./SECURITY_CHECKLIST.md) | Pre-launch security verification |
| [.env.example](./frontend/.env.example) | Environment variable reference |

---

## 🔄 Key Workflows

### User Registration & Onboarding

```
Sign Up (Email) → Email Verification → Identity Setup → Wallet Connection → Dashboard
```

### Document Registration

```
Select File → Hash File → Upload to IPFS → Register on Blockchain → Store in DB
```

### Document Verification

```
Input Hash → Query Blockchain → Fetch Metadata → Verify Authenticity → Display Status
```

### Realtime Sync

```
User A Updates Doc → Supabase Event → Broadcast → User B Notified → UI Updates
```

---

## 🎨 UI/UX Features

### Dark Pastel Premium Design
- Gradient text and backgrounds
- Glassmorphism cards
- Smooth animations
- Responsive mobile design
- Accessibility optimized

### Components
- `DragDropVerify` - File verification interface
- `WalletManagementModal` - Wallet management
- `DocumentDetailsModal` - Document information
- `StatusBadge` - Connection status
- `Pagination` - Document list pagination
- `SearchInput` - Document search
- `Button` & `Card` - Base components

---

## 🛡️ Security

### Built-In Protection

✅ **Authentication**
- Email verification required
- Strong password requirements
- Session expiration (1 hour)
- Refresh token rotation

✅ **Authorization**
- Row-level security on all tables
- Wallet signature verification
- Owner checks on smart contract

✅ **Data Protection**
- HTTPS enforced
- Encryption at rest
- File validation on upload
- PII never on blockchain

✅ **Audit Trail**
- All actions logged
- Suspicious activity detection
- User access history
- Compliance-ready exports

### Privacy Levels

1. **PRIVATE** - Only owner sees metadata
2. **SHARED** - Specific users/wallets can verify
3. **PUBLIC** - Anyone can verify with hash

**See [PRIVACY_MODEL.md](./PRIVACY_MODEL.md) for details**

---

## 🚀 Production Deployment

### 1. Frontend → Vercel

```bash
# Option A: CLI
vercel deploy --prod

# Option B: Git Push (Recommended)
# Push to GitHub, Vercel auto-deploys
```

### 2. Backend → Supabase

```bash
# Run schema migrations
# Configure RLS policies
# Enable Realtime
# Configure Storage buckets
```

### 3. Smart Contract → Polygon Amoy

```bash
npx hardhat run scripts/deploy.js --network amoy
# Save contract address
```

### 4. Configure Environment

Update production environment variables in:
- Vercel Dashboard
- Supabase Settings
- GitHub Secrets

**Complete walkthrough**: [PRODUCTION_DEPLOYMENT_GUIDE.md](./PRODUCTION_DEPLOYMENT_GUIDE.md)

---

## 📊 Database Schema

### Core Tables

| Table | Purpose | Rows per User |
|-------|---------|---------------|
| `profiles` | User information | 1 |
| `documents` | User's documents | 1,000s |
| `wallet_sessions` | Connected wallets | 1-5 |
| `document_sharing` | Sharing permissions | 100s |
| `verification_history` | Verification log | 1,000s |
| `audit_logs` | Compliance log | 10,000s |

### Security
- RLS enabled on all tables
- Users can only access own data
- Shared documents via explicit permissions
- Public documents queryable by anyone

**Full schema**: `frontend/supabase/schema.sql`

---

## 🔌 API Integration

### Smart Contract Functions

```javascript
// Register document
await contract.registerDocument(
  hash,      // bytes32
  cid,       // IPFS CID
  docType,   // "diploma", "license", etc
  issuedBy   // issuer name
);

// Verify document
const [exists, owner, timestamp, issuedBy, revoked] = 
  await contract.verifyDocument(hash);

// Revoke document
await contract.revokeDocument(hash);

// Get user's documents
const docs = await contract.getDocumentsByOwner(address);
```

### Supabase Queries

```javascript
// Get user's documents
const { data } = await supabase
  .from('documents')
  .select('*')
  .eq('user_id', userId);

// Share document
const { data } = await supabase
  .from('document_sharing')
  .insert([{
    document_id: docId,
    owner_id: userId,
    shared_with_user_id: recipientId,
    share_type: 'view'
  }]);
```

---

## 🎯 Use Cases

### 1. Educational Institutions
- Issue and verify diplomas
- Prevent credential fraud
- Reduce verification time

### 2. Government Agencies
- Issue digital IDs
- Verify licenses
- Prevent document forgery

### 3. Healthcare
- Issue prescriptions
- Verify provider credentials
- Track medical records

### 4. Legal/Compliance
- Notarize documents
- Verify contracts
- Maintain audit trail

### 5. Supply Chain
- Track product authenticity
- Verify provenance
- Combat counterfeiting

---

## 🐛 Troubleshooting

### MetaMask Not Connected
- Ensure MetaMask extension installed
- Check localhost:5173 in MetaMask
- Try refreshing page
- Check console for errors

### Document Upload Fails
- Verify PINATA_JWT is valid
- Check network connectivity
- Try different gateway
- Check file size limits

### Blockchain Errors
- Verify wallet on Polygon Amoy network
- Ensure wallet has MATIC for gas
- Check contract address is correct
- Verify RPC URL is working

### Database Errors
- Check Supabase credentials
- Verify RLS policies
- Check auth token expiration
- Review browser console

**Full troubleshooting**: [PRODUCTION_DEPLOYMENT_GUIDE.md](./PRODUCTION_DEPLOYMENT_GUIDE.md#troubleshooting)

---

## 📈 Performance

### Frontend Optimization
- Route-based code splitting
- Lazy component loading
- Image optimization
- CSS minification

### Database Optimization
- Indexed queries
- Efficient RLS policies
- Connection pooling
- Real-time subscriptions

### Blockchain Optimization
- Batch verification
- Result caching
- Indexed events
- Fallback RPC URLs

---

## 🔄 Realtime Features

### Live Updates
- Document status changes instant
- Verification results live
- Multi-tab sync via BroadcastChannel
- Polling fallback (every 15 seconds)

### Notifications
- Document shared notifications
- Verification status updates
- Activity logs
- Security alerts

---

## 💾 Backups & Recovery

### Automated Backups
- Daily database backups
- 30-day retention
- Point-in-time recovery
- Encrypted storage

### Manual Backup
```bash
# Export user data
curl -H "Authorization: Bearer $TOKEN" \
  https://your-project.supabase.co/rest/v1/profiles \
  > backup.json
```

---

## 🤝 Contributing

1. Fork repository
2. Create feature branch
3. Make changes
4. Add tests
5. Submit pull request

---

## 📄 License

MIT License - See LICENSE file

---

## 💬 Support

- **Documentation**: See docs/ folder
- **Issues**: GitHub Issues
- **Email**: support@trustdoc.app
- **Community**: Discord (if applicable)

---

## 🎓 Learning Resources

### Blockchain
- [Polygon Docs](https://wiki.polygon.technology/)
- [Ethers.js Guide](https://docs.ethers.org/)
- [Solidity Docs](https://docs.soliditylang.org/)

### Backend
- [Supabase Docs](https://supabase.com/docs)
- [PostgreSQL Guide](https://www.postgresql.org/docs/)
- [RLS Tutorial](https://supabase.com/docs/guides/auth/row-level-security)

### Frontend
- [React Docs](https://react.dev)
- [Vite Guide](https://vitejs.dev/)
- [Tailwind CSS](https://tailwindcss.com/)

---

## 🎉 Roadmap

- [ ] Multi-signature support
- [ ] NFT integration
- [ ] Advanced analytics
- [ ] White-label version
- [ ] Mobile app
- [ ] Mainnet deployment
- [ ] Additional blockchain support
- [ ] AI-powered document analysis

---

**TrustDoc v1.0.0** - Built for production, scaled for millions.

