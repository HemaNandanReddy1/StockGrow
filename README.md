# StockGrow — Smart Inventory & Sales Intelligence

**Deployment:** Follow [`DEPLOYMENT_GUIDE.md`](DEPLOYMENT_GUIDE.md) for the complete GitHub + MongoDB Atlas + Render steps. This package includes the login / create-business page.

A full-stack inventory management application for small businesses. Built with React, Node.js, Express and MongoDB.

## Features

- Inventory CRUD with search, category and barcode/SKU fields.
- Low-stock alerts using each product's minimum-stock threshold.
- Sales recording with atomic stock deduction and persistent sales history.
- Restock suggestions based on the last 30 days of sales and a 14-day target stock cover (minimum 2× minimum-stock threshold).
- Sales revenue and units-sold trend charts.
- Admin/staff authentication with JWT and password hashing.
- Business-level data isolation; each business can store up to 100,000 products.
- Barcode scanning using the browser Barcode Detection API (requires a supported browser and HTTPS/localhost).
- PWA app-shell caching and a local pending-write queue for basic offline operation.
- Paginated API reads, database indexes, aggregation-based dashboard metrics, compression, security headers and rate limiting.

## Requirements

- Node.js 20 or newer
- MongoDB 6+ (local or MongoDB Atlas)

## Run locally (Windows PowerShell)

### 1. Backend

```powershell
cd STOCKGROW\backend
Copy-Item .env.example .env
```

Edit `backend/.env` and set `MONGO_URI` and a long random `JWT_SECRET` (at least 32 characters).

```powershell
npm install
npm run dev
```

The API runs at `http://localhost:5000`.

### 2. Frontend (open a second PowerShell window)

```powershell
cd STOCKGROW\frontend
npm install
npm run dev
```

Open the Vite URL shown in the terminal (normally `http://localhost:5173`). The Vite development server proxies `/api` to port 5000.

### 3. First login

Choose **Create business**. The first account created becomes that business's administrator. Admins can create staff/admin accounts from the Team page. Staff can manage products and record sales; only admins can delete products or create team accounts.

## API overview

| Method | Endpoint | Access | Purpose |
|---|---|---|---|
| POST | `/api/auth/register` | Public | Create business + first admin |
| POST | `/api/auth/login` | Public | Login |
| GET | `/api/auth/me` | Authenticated | Current user |
| POST | `/api/users` | Admin | Create staff/admin |
| GET/POST | `/api/products` | Authenticated | List/create products |
| PUT/DELETE | `/api/products/:id` | Authenticated / Admin | Update/delete product |
| GET | `/api/products/low-stock` | Authenticated | Low-stock items |
| POST/GET | `/api/sales` | Authenticated | Record/list sales |
| GET | `/api/dashboard` | Authenticated | Dashboard totals |
| GET | `/api/analytics/trends` | Authenticated | Sales trend data |
| GET | `/api/analytics/restock` | Authenticated | Restock suggestions |

Send `Authorization: Bearer <token>` with authenticated requests. Product and sales queries are always scoped to the authenticated user's business.

## GitHub upload

1. Make sure `.env` is not in the project folder you upload. Only `.env.example` belongs in Git.
2. Do not upload `node_modules` or build output.
3. From the project root:

```powershell
git init
git add .
git commit -m "Complete StockGrow inventory management system"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/StockGrow.git
git push -u origin main
```

## Deployment outline

- Create a MongoDB Atlas database and copy its connection string.
- Deploy `backend` as a Node web service with build command `npm install`, start command `npm start`, and environment variables `MONGO_URI`, `JWT_SECRET`, `CLIENT_URL`, `NODE_ENV=production`.
- Deploy `frontend` as a static site with build command `npm install && npm run build`, publish directory `dist`, and `VITE_API_URL=https://YOUR-BACKEND-DOMAIN/api`.
- Configure the backend `CLIENT_URL` to the deployed frontend origin. Ensure the frontend host rewrites unknown paths to `index.html` if client-side routes are added later.
- Barcode camera access requires HTTPS in production.

## Important engineering notes / honest constraint status

- **100K products per business:** the API reserves an atomic per-business inventory counter before creating an item and releases it if creation fails; deletes decrement the counter. All inventory reads/writes are business-scoped. Existing deployments should reconcile `inventoryCount` against the actual product count before upgrading.
- **1M daily transactions:** the API is designed with indexed business/date/product queries, pagination, aggregation, compression and atomic stock updates. This is not a throughput guarantee. You must run a load test on the actual hosting tier and MongoDB cluster before claiming that 1 million transactions/day is achieved. At that volume, use a replica set/sharded cluster, connection-pool tuning, monitoring, queue-based processing and tested capacity planning.
- **Offline-first:** the PWA caches the application shell and retains the last loaded dashboard/product snapshot. Product create/update/delete and sale requests made offline are queued in browser local storage and replayed when connectivity returns. This is basic offline support, not full multi-device conflict resolution; do not queue high-value operations on shared/public devices.
- **Barcode scanning:** relies on the native `BarcodeDetector` API, which is not supported by every browser. Manual barcode entry remains available as a fallback.
- **Prediction:** the current restock recommendation is a transparent sales-velocity heuristic, not a trained machine-learning model. It uses 30-day units sold, average daily demand, a 14-day target cover and the minimum-stock floor.

## Security checklist before production

- Use a unique strong `JWT_SECRET`; never commit `.env`.
- Restrict CORS to your frontend origin.
- Use HTTPS and a protected MongoDB Atlas network/access policy.
- Add password reset, email verification, audit logs and automated backups before real customer use.
- Test permissions with separate admin and staff accounts.
