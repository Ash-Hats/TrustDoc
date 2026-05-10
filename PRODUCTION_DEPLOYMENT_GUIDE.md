# TrustDoc Production Deployment Guide

## Table of Contents
1. [Architecture Overview](#architecture-overview)
2. [Database Setup](#database-setup)
3. [Supabase Configuration](#supabase-configuration)
4. [Smart Contract Deployment](#smart-contract-deployment)
5. [Frontend Deployment](#frontend-deployment)
6. [Environment Configuration](#environment-configuration)
7. [Security Hardening](#security-hardening)
8. [Monitoring & Logging](#monitoring--logging)
9. [Performance Optimization](#performance-optimization)
10. [Troubleshooting](#troubleshooting)

---

## Architecture Overview

TrustDoc is a blockchain-based document verification platform with three main components:

### Components
- **Frontend**: React + Vite (Vercel-ready)
- **Backend**: Supabase (PostgreSQL + Auth + Storage)
- **Blockchain**: Solidity smart contract (Polygon Amoy)

### Data Flow
```
User (Browser) → Frontend (React) → Supabase Auth → Supabase DB
                    ↓
            MetaMask/Wallet
                    ↓
         Smart Contract (Polygon Amoy)
```

### Privacy Model
- **Private**: Only owner can see
- **Shared**: Selected users/wallets can verify
- **Public**: Anyone with hash can verify

---

## Database Setup

### 1. Create Supabase Project

1. Go to https://supabase.com
2. Click "New Project"
3. Fill in project details:
   - Name: `trustdoc-production`
   - Database password: Use strong password (save securely)
   - Region: Choose closest to your users
4. Click "Create new project"

### 2. Run Database Schema

1. Wait for project to initialize
2. Go to SQL Editor
3. Copy entire contents of `frontend/supabase/schema.sql`
4. Paste into SQL Editor
5. Click "Run"

### 3. Enable Required Extensions

```sql
-- Already included in schema.sql, but verify:
create extension if not exists pgcrypto;
```

### 4. Enable RLS (Row Level Security)

RLS is already configured in schema. Verify:

```sql
-- Check RLS is enabled
select tablename, rowsecurity
from pg_tables
where schemaname = 'public';
```

All tables should show `rowsecurity = true`.

### 5. Create Storage Buckets

1. Go to Storage (left sidebar)
2. Create two buckets:
   - `documents` (private)
   - `profile-photos` (private)

### 6. Configure Storage RLS

For `documents` bucket:
```sql
-- Allow users to upload their own documents
create policy "Users can upload own documents"
on storage.objects for insert
with (check) (auth.uid()::text = (storage.foldername(name))[1]);

-- Allow users to read their own documents
create policy "Users can read own documents"
on storage.objects for select
using (auth.uid()::text = (storage.foldername(name))[1]);
```

For `profile-photos` bucket:
```sql
create policy "Users can upload own photos"
on storage.objects for insert
with (check) (auth.uid()::text = (storage.foldername(name))[1]);

create policy "Users can read photos"
on storage.objects for select
using (true);
```

---

## Supabase Configuration

### 1. Authentication Setup

1. Go to Authentication → Providers
2. Enable Email provider:
   - Toggle "Email"
   - Keep "Email confirmations" ON
3. Enable Google OAuth (optional):
   - Click "Google"
   - Add credentials from Google Cloud Console
   - Add authorized redirect URI: `https://your-domain.com/auth/callback`

### 2. Email Templates

1. Go to Email Templates
2. Update `Confirm signup` template with your branding
3. Update `Reset Password` template with your branding

### 3. Webhooks (Optional - for background jobs)

```
Endpoint: https://your-api.com/webhooks/supabase
Events: auth.user.created, auth.user.updated, auth.user.deleted
```

### 4. Get API Keys

1. Go to Settings → API
2. Copy:
   - **Project URL** → `VITE_SUPABASE_URL`
   - **Anon Key** → `VITE_SUPABASE_ANON_KEY`
   - **Service Role Key** (keep secret, never share)

### 5. Configure CORS

1. Go to Settings → API
2. Add your frontend URL to CORS whitelist:
   ```
   http://localhost:5173
   https://your-domain.com
   https://www.your-domain.com
   ```

---

## Smart Contract Deployment

### 1. Prepare Environment

```bash
cd z:\TrustDoc
cp .env.example .env
```

Update `.env`:
```
AMOY_RPC_URL=https://polygon-amoy.g.alchemy.com/v2/your-key
PRIVATE_KEY=0x... (your deployer account private key)
```

### 2. Fund Deployer Account

1. Get your deployer address: `hardhat accounts`
2. Go to https://faucet.polygon.technology/
3. Enter address and request MATIC tokens
4. Wait for confirmation

### 3. Deploy Contract

```bash
npm install

# Compile
npx hardhat compile

# Deploy to Amoy
npx hardhat run scripts/deploy.js --network amoy
```

Output will show:
```
✅ Contract deployed to: 0x...
```

### 4. Verify Contract

```bash
npx hardhat verify --network amoy 0x... 
```

### 5. Save Contract Address

Update frontend `.env`:
```
VITE_CONTRACT_ADDRESS=0x... (from deployment)
```

### 6. Test Contract

```bash
npx hardhat test
```

---

## Frontend Deployment

### 1. Prepare Build

```bash
cd frontend

# Create .env.local with production values
cp .env.example .env.local
# Update with production Supabase/Blockchain credentials

# Build
npm run build

# Test build locally
npm run preview
```

### 2. Deploy to Vercel

#### Option A: Via CLI
```bash
# Install Vercel CLI
npm install -g vercel

# Deploy
vercel deploy --prod
```

#### Option B: Via Git (Recommended)
1. Push code to GitHub
2. Go to https://vercel.com/import
3. Select your repository
4. Set environment variables in Vercel dashboard
5. Click Deploy

#### Environment Variables on Vercel

In Vercel Dashboard → Settings → Environment Variables, add:

```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_AMOY_RPC_URL=https://polygon-amoy.g.alchemy.com/v2/your-key
VITE_CONTRACT_ADDRESS=0x...
VITE_APP_ORIGIN=https://your-domain.com
VITE_PINATA_JWT=your-jwt-token
VITE_PINATA_GATEWAY=https://gateway.pinata.cloud
```

### 3. Configure Domain

1. In Vercel → Settings → Domains
2. Add your custom domain
3. Update DNS records (follow Vercel's instructions)
4. Enable HTTPS (automatic)

### 4. Test Production Build

```bash
# Visit https://your-domain.com
# Test all features:
- Sign up and login
- Complete identity setup
- Connect wallet
- Register document
- Verify document
```

---

## Environment Configuration

### Frontend (.env.local or .env.production)

```bash
# Supabase
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...

# Blockchain
VITE_AMOY_RPC_URL=https://polygon-amoy.g.alchemy.com/v2/your-key
VITE_CONTRACT_ADDRESS=0x...

# App
VITE_APP_ORIGIN=https://your-domain.com
VITE_ENV=production
VITE_DEBUG=false

# IPFS
VITE_PINATA_JWT=your-jwt-token
VITE_PINATA_GATEWAY=https://gateway.pinata.cloud

# Features
VITE_ENABLE_REALTIME_SYNC=true
VITE_ENABLE_WALLET_MANAGEMENT=true
VITE_ENABLE_AUDIT_LOGS=true

# Rate limiting
VITE_API_RATE_LIMIT_PER_MINUTE=60
VITE_DOCUMENT_UPLOAD_LIMIT_MB=100
```

### Backend (.env for Hardhat)

```bash
AMOY_RPC_URL=https://polygon-amoy.g.alchemy.com/v2/your-key
PRIVATE_KEY=0x... (keep secret!)
```

---

## Security Hardening

### 1. Database Security

✅ RLS Enabled: All tables use row-level security
✅ Policies: Only users can access their data
✅ Encryption: Enable encryption at rest (Supabase default)

**Verify:**
```sql
select * from pg_policies;
```

### 2. Authentication Security

- ✅ Email verification required
- ✅ Session expiration: 1 hour
- ✅ Refresh token rotation enabled
- ✅ Password requirements enforced

**Test:**
```bash
# Try signup without email verification
# Try using expired session token
# Try refresh token without access token
```

### 3. API Security

- ✅ CORS restricted to domain
- ✅ RLS enforced
- ✅ Anon key limited (no delete/update)
- ✅ Service role key stored securely

### 4. Blockchain Security

- ✅ Contract functions require owner check
- ✅ Hash verification prevents forgery
- ✅ Signature validation for wallet operations
- ✅ Contract verified on PolygonScan

### 5. File Upload Security

Implement in frontend:
```javascript
// Validate file type
const ALLOWED_TYPES = ['application/pdf', 'image/png', 'image/jpeg'];
if (!ALLOWED_TYPES.includes(file.type)) {
  throw new Error('Invalid file type');
}

// Validate file size
const MAX_SIZE = 100 * 1024 * 1024; // 100MB
if (file.size > MAX_SIZE) {
  throw new Error('File too large');
}

// Hash file for verification
const hash = await hashFile(file);
```

### 6. Rate Limiting (Recommend implementing)

```javascript
// Frontend
const maxRequests = 60; // per minute
const timeWindow = 60000;

// Backend (Supabase Functions)
const limiter = require('express-rate-limit');
const apiLimiter = limiter({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 100 // 100 requests per windowMs
});

app.use('/api/', apiLimiter);
```

---

## Monitoring & Logging

### 1. Supabase Monitoring

1. Go to Supabase Dashboard → Monitoring
2. Check:
   - Database performance
   - API usage
   - Real-time connections
   - Auth requests

### 2. Audit Logging

TrustDoc automatically logs all actions to `audit_logs` table:
```sql
select * from audit_logs
order by created_at desc
limit 100;
```

### 3. Error Tracking (Optional)

Integrate Sentry:

```bash
npm install @sentry/react
```

```javascript
import * as Sentry from "@sentry/react";

Sentry.init({
  dsn: import.meta.env.VITE_SENTRY_DSN,
  environment: import.meta.env.VITE_ENV,
});
```

### 4. Analytics (Optional)

Integrate Google Analytics:

```javascript
import { initializeApp } from 'firebase/app';
import { getAnalytics } from 'firebase/analytics';

const firebaseConfig = {
  // Your config
};

const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
```

---

## Performance Optimization

### 1. Frontend Optimization

✅ Lazy loading routes
✅ Code splitting
✅ Image optimization
✅ CSS minification
✅ Asset compression

**Vercel handles most automatically**

### 2. Database Optimization

✅ Indexes created on:
- `profiles.wallet_address`
- `documents.user_id, timestamp`
- `documents.hash`
- `verification_history.user_id, created_at`

**Add custom index if needed:**
```sql
create index idx_custom on documents (custom_field);
```

### 3. Caching Strategy

```javascript
// Browser cache
Cache-Control: max-age=3600, must-revalidate

// API responses
useRealtimeSubscription({
  enabled: true,
  cacheMs: 30000, // 30 second cache
})
```

### 4. Realtime Optimization

```javascript
// Polling fallback (every 15 seconds)
usePollingSubscription({
  interval: 15000,
  fetchFn: fetchDocuments,
})
```

---

## Troubleshooting

### 1. MetaMask Connection Issues

**Problem**: "MetaMask not found" error

**Solution**:
- Ensure MetaMask extension is installed
- Check if localhost:5173 is added to MetaMask's dapp connections
- Try clearing browser cache
- Restart MetaMask

### 2. Document Upload Fails

**Problem**: IPFS upload timeout

**Solution**:
```javascript
// Check Pinata JWT is valid
// Verify VITE_PINATA_JWT in .env
// Check network connectivity
// Try different gateway
```

### 3. Contract Interaction Fails

**Problem**: "Call revert without error" or gas issues

**Solution**:
```javascript
// Ensure wallet is on Polygon Amoy network
// Verify contract address is correct
// Check wallet has MATIC for gas
// Verify contract function parameters
```

### 4. Database Connection Issues

**Problem**: "Connection refused" or "RLS violation"

**Solution**:
```sql
-- Check RLS policies
select * from pg_policies;

-- Check user permissions
select * from profiles where user_id = auth.uid();

-- Verify JWT token is valid
```

### 5. Auth Callback Loop

**Problem**: Infinite redirect on `/auth/callback`

**Solution**:
- Verify `VITE_APP_ORIGIN` matches deployed URL
- Check Google OAuth redirect URI is correct
- Ensure `/#/...` hash is properly parsed
- Check browser console for errors

---

## Production Checklist

- [ ] Supabase project created and configured
- [ ] Database schema deployed
- [ ] RLS policies verified
- [ ] Smart contract deployed to Polygon Amoy
- [ ] Frontend built and tested locally
- [ ] Environment variables configured
- [ ] Vercel deployment configured
- [ ] Custom domain connected
- [ ] HTTPS enabled
- [ ] Email verification working
- [ ] Wallet connection tested
- [ ] Document registration works
- [ ] Document verification works
- [ ] Realtime sync tested
- [ ] Error tracking configured
- [ ] Database backups enabled
- [ ] Monitoring set up
- [ ] Security audit completed
- [ ] Performance optimized
- [ ] Documentation updated

---

## Support & Resources

- **Supabase Docs**: https://supabase.com/docs
- **Hardhat Docs**: https://hardhat.org/docs
- **Polygon Docs**: https://wiki.polygon.technology/
- **Vercel Docs**: https://vercel.com/docs
- **React Docs**: https://react.dev

---

## Version History

- **v1.0.0** (2026-05-08) - Initial production release
- Production-ready database schema
- Complete wallet management system
- Realtime synchronization support
- Comprehensive security hardening
- Full deployment automation

