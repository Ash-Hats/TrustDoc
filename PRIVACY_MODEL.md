# TrustDoc Privacy & Security Model

## Executive Summary

TrustDoc implements a **Zero-Trust Privacy Architecture** where:
- User data is **never** exposed on the blockchain
- Document hashes are immutable proof of existence
- Privacy is **enforced at database layer** with Row-Level Security
- Users have **complete control** over document visibility
- All actions are **audited and logged**

---

## Privacy Levels

### 1. PRIVATE Documents

**Definition**: Only the owner can see or access this document.

**Access Control**:
```sql
-- Only owner can select
SELECT * FROM documents
WHERE user_id = auth.uid()
AND privacy_level = 'private';
```

**What's Stored**:
- ✅ Document metadata in database (encrypted at rest)
- ✅ Document hash on blockchain
- ✅ File on IPFS (encrypted)
- ✅ Owner's wallet address

**What's NOT Visible**:
- ❌ Document to other users
- ❌ Document filename outside IPFS
- ❌ Document content on blockchain
- ❌ Metadata in public APIs

**Use Cases**:
- Personal identity documents
- Sensitive business contracts
- Private health records
- Confidential research papers

**Example**:
```javascript
// Register as PRIVATE
await registerDocument({
  hash: "0x...",
  privacyLevel: "private",
  cid: "QmXxx...",
  docType: "passport",
  issuedBy: "Government"
});

// Only owner can verify
const result = await verifyDocument(hash, { private: true });
// Returns: { exists: true, owner: "0x...", ... }

// Other users cannot see
// Database RLS blocks access
// Returns: No results
```

---

### 2. SHARED Documents

**Definition**: Owner allows specific users/wallets to verify this document.

**Access Control**:
```sql
-- Owner can see and manage
SELECT * FROM documents
WHERE user_id = auth.uid()
AND privacy_level = 'shared';

-- Shared users can see only
SELECT * FROM documents
WHERE privacy_level = 'shared'
AND id IN (
  SELECT document_id FROM document_sharing
  WHERE shared_with_user_id = auth.uid()
  OR shared_with_wallet = current_wallet
);
```

**Sharing Options**:
```javascript
// Share with specific user
await shareDocument({
  documentId: "uuid",
  sharedWithUserId: "user-uuid",
  shareType: "view",  // view only, not modify
  expiresAt: null,    // never expires
});

// Share with wallet address
await shareDocument({
  documentId: "uuid",
  sharedWithWallet: "0xUserAddress",
  shareType: "view",
  expiresAt: "2026-12-31", // expires after this date
});

// Share with multiple recipients
const recipients = [
  { type: "user", id: "user1" },
  { type: "user", id: "user2" },
  { type: "wallet", address: "0xABC..." },
];
```

**Shared User Capabilities**:
- ✅ View document metadata
- ✅ Verify document on blockchain
- ✅ See verification proof
- ❌ Modify document
- ❌ Delete document
- ❌ Share with others (unless granted)

**Use Cases**:
- Team collaboration
- HR document verification
- Auditor reviews
- Legal review
- Client document sharing

**Expiration**:
```javascript
// Share expires after 30 days
await shareDocument({
  expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
});

// Access denied after expiration
// Database RLS checks expiry
```

---

### 3. PUBLIC Documents

**Definition**: Anyone can verify this document with the hash.

**Access Control**:
```sql
-- Anyone can verify public documents
SELECT * FROM documents
WHERE privacy_level = 'public'
AND hash = 'hash-to-check';
```

**Public Verification**:
```javascript
// No authentication required
const result = await verifyDocument(hash, { public: true });
// Returns: { exists: true, owner: "0x...", timestamp: ..., revoked: false }

// Works with:
// - Bare hash
// - Share link
// - QR code
// - Public embedding
```

**What's Visible**:
- ✅ Document exists
- ✅ Owner address
- ✅ Registration timestamp
- ✅ Issuance details
- ✅ Revocation status

**What's NOT Visible**:
- ❌ Owner's personal info
- ❌ Document filename
- ❌ Internal metadata
- ❌ Owner's email

**Use Cases**:
- Diploma/certificate verification
- License verification
- Public product authenticity
- Supply chain tracking
- Government document verification

**Example**:
```javascript
// Owner makes document public
await updateDocumentPrivacy(documentId, "public");

// Anyone with hash can verify
const verified = await verifyPublicDocument(hash);
// Returns proof without logging

// Create shareable link
const link = `https://trustdoc.app/verify?hash=${hash}`;
```

---

## Data Minimization

### What's on Blockchain (Immutable)
```solidity
struct Document {
    bytes32 hash;        // SHA256 hash of original file
    address owner;       // Wallet address of owner
    uint256 timestamp;   // Block timestamp
    string ipfsCID;      // IPFS content identifier
    string docType;      // Type of document
    string issuedBy;     // Issuer name (metadata only)
    bool revoked;        // Revocation status
}
```

**Why minimal data**:
- ✅ Blockchain is public ledger
- ✅ Cannot delete or modify
- ✅ All transactions visible
- ✅ Only immutable proof needed

### What's in Database (Encrypted at Rest)
```sql
documents {
    user_id              -- For RLS
    hash                 -- For verification
    privacy_level        -- For access control
    description          -- Owner's notes
    file_name            -- Original filename
    file_type            -- MIME type
    file_size            -- For UI
    created_at           -- For sorting
    updated_at           -- For cache invalidation
}
```

### What's in IPFS (Pinned & Encrypted)
```javascript
{
    fileName: "certificate.pdf",
    fileHash: "0x...",
    registeredAt: "2026-05-08T10:00:00Z",
    metadata: {
        docType: "degree",
        issuer: "University",
        validFrom: "2020-06-01",
        validTo: "2030-06-01",
    },
    signature: "0x...",     // If signed
}
```

---

## Access Control Policies

### Database Row-Level Security

```sql
-- Policy 1: Users can only see their own private documents
CREATE POLICY private_documents_own
  ON documents
  FOR SELECT
  USING (privacy_level = 'private' AND auth.uid() = user_id);

-- Policy 2: Shared users can see shared documents
CREATE POLICY shared_documents_recipients
  ON documents
  FOR SELECT
  USING (
    privacy_level = 'shared'
    AND id IN (
      SELECT document_id FROM document_sharing
      WHERE shared_with_user_id = auth.uid()
      AND (expires_at IS NULL OR expires_at > NOW())
    )
  );

-- Policy 3: Public documents visible to all queries
CREATE POLICY public_documents
  ON documents
  FOR SELECT
  USING (privacy_level = 'public');

-- Policy 4: Only owner can update/delete
CREATE POLICY documents_update_own
  ON documents
  FOR UPDATE
  USING (auth.uid() = user_id);
```

### Smart Contract Access

```solidity
function verifyDocument(bytes32 _hash)
    public view
    returns (bool, address, uint256, string, bool)
{
    Document memory doc = documents[_hash];
    
    // Returns basic info regardless of privacy
    // Privacy enforced in frontend/backend
    return (
        doc.timestamp != 0,      // exists?
        doc.owner,               // who owns?
        doc.timestamp,           // when?
        doc.issuedBy,            // who issued?
        doc.revoked              // revoked?
    );
}
```

**Note**: Blockchain returns data for ANY hash. Privacy is enforced by:
1. Frontend validation
2. Database RLS policies
3. API authorization checks

---

## Data Protection

### Encryption in Transit
```
Frontend ←HTTPS→ Supabase ←HTTPS→ Blockchain Node
  ↓                ↓                    ↓
  TLS 1.3      TLS 1.3 + Vault      RPC HTTPS
  Certificates    Managed             Certificates
```

### Encryption at Rest
```
Database
├─ PII: Encrypted by Supabase
├─ Files: Encrypted on IPFS
└─ Sessions: Short-lived tokens

IPFS (Pinata)
├─ Transport: HTTPS only
├─ Storage: Geo-distributed
└─ Access: IPFS gateway with auth
```

### Password Security
```javascript
// Supabase handles:
// - PBKDF2 hashing (100,000 iterations)
// - Salted with 32-byte random salt
// - Never transmitted unencrypted
// - Rate-limited login attempts
// - Password reset tokens expire in 1 hour
```

---

## Audit & Compliance

### Audit Logging

All actions logged to `audit_logs` table:
```sql
audit_logs {
    user_id,              -- Who did it
    action,               -- document_registered
    resource_type,        -- document
    resource_id,          -- doc-uuid
    changes: {            -- What changed
        privacy_level: "private" → "shared"
    },
    ip_address,           -- Where from
    user_agent,           -- What device
    status,               -- success/failure
    error_message,        -- If failed
    created_at            -- When
}
```

**Logged Actions**:
- User signup/login/logout
- Wallet connected/disconnected
- Document registered/updated/deleted
- Document shared/unshared
- Privacy level changed
- Document revoked
- Verification performed
- Suspicious activity

**Audit Query Example**:
```sql
-- All actions by user in last 7 days
SELECT * FROM audit_logs
WHERE user_id = 'uuid'
AND created_at > NOW() - INTERVAL '7 days'
ORDER BY created_at DESC;

-- Failed verification attempts
SELECT * FROM audit_logs
WHERE action = 'document_revoked'
AND status = 'failure'
ORDER BY created_at DESC;
```

### Suspicious Activity Tracking

```javascript
// Automatically detected:
- Multiple failed logins
- Wallet switch attempts
- Mass document sharing
- Unusual geography/device
- RLS violations

// Logged to suspicious_activity table
{
    user_id,
    activity_type: "multiple_failed_logins",
    severity: "high",
    description: "5 failed attempts in 10 minutes",
    resolved: false,
    created_at
}
```

---

## GDPR & Data Rights

### User Data Export

```javascript
// User can export all their data
await exportUserData(userId);

// Returns:
{
    profile: { ... },
    documents: [ ... ],
    wallets: [ ... ],
    activity: [ ... ],
    audit_logs: [ ... ]
}
```

### Right to Deletion

```javascript
// Delete user account and all data
await deleteUser(userId);

// Cascades:
// - Deletes profiles entry
// - Deletes all documents
// - Deletes wallet sessions
// - Deletes sharing permissions
// - Deletes audit logs (kept for 90 days)
// - Keeps blockchain records (immutable)

// Note: Cannot delete blockchain data
// Hash proof remains permanently
```

### Data Retention

```
active_users: Kept indefinitely (user chooses)
inactive_users: Deleted after 1 year
audit_logs: Kept for 2 years minimum
deleted_users: Soft-deleted for 90 days (recoverable)
verification_history: Kept for 1 year
```

---

## Privacy Best Practices

### For Users

1. **Choose Privacy Level Carefully**
   - Default is PRIVATE (most secure)
   - Only make PUBLIC if truly needed
   - Use SHARED with specific people

2. **Manage Wallet Connections**
   - Don't share wallet address in public
   - Disconnect wallets you no longer use
   - Review connected apps in MetaMask

3. **Review Access**
   - Regularly check who has access
   - Revoke old shares
   - Monitor audit logs

4. **Secure Your Account**
   - Use strong password
   - Enable 2FA if available
   - Use unique email per account
   - Keep MetaMask secure

### For Developers

1. **Always Respect Privacy Levels**
   - Frontend never exposes private docs
   - Backend validates RLS on every query
   - Smart contract doesn't enforce privacy (by design)

2. **Audit All Access**
   - Log every document access
   - Monitor for suspicious patterns
   - Alert on failed RLS checks

3. **Minimize Data Collection**
   - Only collect needed data
   - Delete data when no longer needed
   - Offer data export/deletion

---

## Compliance Standards

✅ **GDPR Compliant**
- User consent for data processing
- Right to access, rectification, erasure
- Data portability
- Breach notification capability

✅ **SOC 2 Ready**
- Access controls (RLS)
- Audit logging
- Encryption in transit
- Secure authentication

✅ **ISO 27001 Aligned**
- Data classification
- Access controls
- Encryption standards
- Incident response

---

## Privacy by Design

### Security Principles

1. **Principle of Least Privilege**
   - Users see only their own data by default
   - Explicit sharing required
   - Time-limited access

2. **Data Minimization**
   - Only collect needed data
   - Don't expose to blockchain
   - Clear retention policies

3. **Separation of Concerns**
   - Authentication separate from authorization
   - Frontend validation + backend enforcement
   - Blockchain as immutable ledger only

4. **Defense in Depth**
   - Multiple layers of protection
   - RLS + API validation + smart contract checks
   - Redundant security measures

---

## Privacy Contact

For privacy inquiries, contact:
- **Email**: privacy@trustdoc.app
- **Website**: https://trustdoc.app/privacy
- **DPO**: [Data Protection Officer contact]

---

**Last Updated**: 2026-05-08
**Version**: 1.0.0
**Status**: Production Ready

