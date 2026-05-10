# TrustDoc

TrustDoc is a Web3 document verification SaaS built with:
- React + Vite + TailwindCSS
- Ethers.js + Hardhat + Solidity
- Polygon Amoy
- Supabase Auth + Database + Realtime
- MetaMask wallet integration

## Production Docs

- Final audit + architecture + deployment checklist: `FINAL_PRODUCTION_AUDIT_REPORT.md`
- Deployment guide: `PRODUCTION_DEPLOYMENT_GUIDE.md`
- Privacy model: `PRIVACY_MODEL.md`
- Security checklist: `SECURITY_CHECKLIST.md`
- Supabase schema: `frontend/supabase/schema.sql`
- Supabase realtime/storage setup: `frontend/supabase/realtime_setup.sql`

## Local Setup

### 1) Smart contract workspace

```bash
npm install
npx hardhat compile
```

### 2) Frontend workspace

```bash
cd frontend
npm install
npm run dev
```

## Build

```bash
cd frontend
npm run build
```

