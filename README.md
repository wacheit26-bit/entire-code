# Wache — B2B Wholesale Platform

Wache is a full-stack wholesale electronics platform for **Wache Electronics**. It connects business owners (wholesalers) with inventory sourced through regional warehouses and retail shops across **Cameroon** and **USA**, with role-based admin, sales, and warehouse workflows.

---

## Table of contents

- [Tech stack](#tech-stack)
- [Project structure](#project-structure)
- [Getting started](#getting-started)
- [Environment variables](#environment-variables)
- [User roles](#user-roles)
- [Application features](#application-features)
- [Admin dashboard](#admin-dashboard)
- [USA vs Cameroon regional rules](#usa-vs-cameroon-regional-rules)
- [Warehouse & inventory workflow](#warehouse--inventory-workflow)
- [Backend API overview](#backend-api-overview)
- [Deployment](#deployment)
- [Recent updates summary](#recent-updates-summary)

---

## Tech stack

| Layer | Technologies |
|-------|--------------|
| **Frontend** | React 18, Vite, React Router, Axios |
| **Backend** | Node.js, Express 5, MongoDB (Mongoose) |
| **Auth** | JWT access tokens, HTTP-only refresh cookies |
| **Media** | Cloudinary (product images) |
| **PDF** | jsPDF + jsPDF-AutoTable (order exports) |
| **Integrations** | WhatsApp notifications/broadcasts, in-app notifications |

---

## Project structure

```
Wache/
├── src/                    # React frontend (Vite)
│   ├── api/                # Axios API clients
│   ├── components/         # UI components (admin, sales, shared)
│   ├── context/            # Auth & notification providers
│   ├── hooks/              # Custom React hooks
│   ├── pages/              # Route pages (login, admin, cart, etc.)
│   ├── styles/             # Global CSS, responsive system, themes
│   └── utils/              # Helpers (PDF, catalog merge, IME export, etc.)
├── server/                 # Express API
│   └── src/
│       ├── config/         # DB, CORS, Cloudinary, WhatsApp
│       ├── controllers/    # Route handlers
│       ├── middleware/     # JWT, roles, errors, logging
│       ├── models/         # Mongoose schemas
│       ├── routes/         # API route definitions
│       ├── service/        # Notifications, WhatsApp, order queue
│       └── utils/          # IME, warehouse routing, helpers
├── public/                 # Static assets & Netlify redirects
├── netlify.toml            # Frontend deploy config
└── .env.example            # Frontend env template
```

---

## Getting started

### Prerequisites

- Node.js 18+
- MongoDB (local or Atlas)
- Cloudinary account (for product image uploads)

### 1. Backend

```bash
cd server
npm install
# Create server/.env with MONGODB_URI, JWT secrets, Cloudinary keys, etc.
npm run dev
```

The API runs on **http://localhost:5000** by default.

### 2. Frontend

```bash
npm install
npm run dev
```

The app runs on **http://localhost:5173**. Vite proxies `/api` to the backend.

### 3. Production build

```bash
npm run build    # outputs to dist/
npm run preview  # preview production build locally
```

---

## Environment variables

### Frontend (`.env` or Netlify env)

| Variable | Purpose |
|----------|---------|
| `VITE_API_ORIGINS` | Comma-separated API origins for dual failover (primary + backup) |
| `VITE_API_ORIGIN` | Legacy single origin (still supported) |
| `VITE_PREORDER_PLACEHOLDER_PRODUCT_ID` | Optional MongoDB id for preorder placeholder products |

See `.env.example` for defaults pointing at production and Render backup.

### Backend (`server/.env`)

Typical keys include:

- `MONGODB_URI` — MongoDB connection string
- `ACCESS_TOKEN_SECRET` / `REFRESH_TOKEN_SECRET` — JWT signing
- `CLOUDINARY_*` — Image upload credentials
- WhatsApp / notification service credentials (as configured in `server/src/config/`)

---

## User roles

| Role | Description |
|------|-------------|
| **Wholesaler** | B2B buyer; browses catalog, cart, checkout, preorders; account starts **pending** until admin activates |
| **Admin** | Full platform management — warehouses, inventory, orders, accounts, sales team |
| **Salesman** | Assigned to one or more shops; sales dashboard and shop-scoped order tools |

Admins are further scoped by **region** (USA vs Cameroon) based on their profile `businessAddress`. See [Regional rules](#usa-vs-cameroon-regional-rules).

---

## Application features

### Authentication & accounts

- **Login** with JWT session and automatic token refresh (`PersistLogin`)
- **Wholesaler signup** with required fields: name, business name, city (Bamenda / Yaounde / Douala), phone, WhatsApp, password; optional email
- **Forgot password** flow
- **Pending account notice** for wholesalers awaiting admin approval
- **Admin: Add account** — create and immediately activate a wholesaler from the Accounts tab (`POST /api/admin/wholesalers`)
- **Admin: Activate / reject / suspend** wholesaler accounts
- **Role-based routing** — admin dashboard, sales page, or wholesaler storefront

### Wholesaler storefront

- Product catalog with search, filters, sorting, and pagination
- Product cards with image rotation, pricing tiers, stock visibility
- **Cart** (server-synced) with buy and offer flows
- **Checkout blocking** for pending accounts
- **Preorder requests** for out-of-stock or unlisted items
- **Order feedback** modal after purchase
- **Notifications inbox** with unread counts in header
- **My Account** profile page
- Light theme shell for wholesaler/admin roles
- Responsive layout system (see `TESTING-RESPONSIVE.md`)

### Orders

- Wholesaler order placement (buy + negotiated offers)
- Admin **Orders** panel: pending offers, accept/reject, month filter
- **Download PDF** — monthly order export from Admin and Sales pages
- Order status normalization (pending, accepted, rejected, etc.)
- Business location routing (Bamenda, Yaounde, Douala) for fulfillment
- Direct sale recording for walk-in retail (admin)

### Notifications

- In-app notification inbox (`NotificationInboxContext`)
- Server-side notification service for order and account events
- WhatsApp integration for product/order broadcasts (server services)

### Product catalog & inventory

- Rich product schema: brand, type, capacity, color, SIM, country, IME codes, images
- Cloudinary multi-image upload (up to 5 images per product)
- **Add Inventory** panel — single upload, bulk upload, pricing modal
- **Edit product** modal from admin inventory view
- Catalog merge utilities for storefront vs warehouse stock
- Products with `price > 0` and non-travelling status visible to wholesalers
- **Bulk shipment** tracking with batch codes and arrival marking

---

## Admin dashboard

Access via `/admin` when logged in as admin. Sidebar sections:

| Tab | Purpose |
|-----|---------|
| **Dashboard** | KPI overview — products, units, value, monthly revenue, retail vs wholesale split, shop drill-down |
| **Warehouses** | Grid dashboard (3 columns); main + sub warehouses; hub actions per location |
| **Shops** | Sub-warehouse (retail shop) management |
| **Orders** | Order list, accept/reject offers, month filter, **Download PDF** |
| **Inventory** | Product list across locations; edit/delete; pricing |
| **Direct sale** | Record walk-in sales at a shop |
| **Sales team** | Create salespeople, assign shops |
| **Accounts** | Pending / verified wholesalers, search, activate, **Add account** |
| **Analytics** | Extended reporting views |

### Admin UI improvements

- Coursue-inspired dashboard design with KPI cards and charts
- Mobile-responsive admin sidebar with backdrop overlay
- **Sign Out** button with loading state (fixed logout flow)
- Warehouse grid: add tile + warehouses in **3 columns per row**
- **Add Inventory** removed from sidebar (still reachable from Warehouses tab)
- Region badge: **USA WACHE** vs **Cameroon account** on admin profile

---

## USA vs Cameroon regional rules

Admin capabilities depend on the admin’s registered business address (`useAdminAccountRegion`).

### USA admin

- Upload inventory directly to the **USA main warehouse** (no shop required)
- USA warehouse shows **“X uploaded”** / **“zero uploaded”** instead of “travelling”
- **Send to warehouse** — transfer stock from USA main to a regional main warehouse (not Send to Shop on USA)
- Full upload, receive, and transfer permissions on USA main

### Cameroon admin at USA warehouse

- **Read-only** on USA inventory (view + stock requests only)
- Cannot upload or send stock from USA

### Shops & stock requests

- Shops **cannot** request stock from USA warehouses
- Only **regional main warehouses** can request stock from USA
- Shop-to-shop transfers follow existing hub rules

---

## Warehouse & inventory workflow

Each warehouse has a **Hub** with action cards:

| Action | Description |
|--------|-------------|
| **Receive stock** | Mark incoming bulk shipments or travelling units as arrived |
| **Send to Shop** | Transfer ready stock from main warehouse to a sub-warehouse (shop) |
| **Send to warehouse** | Transfer from USA main to a regional main warehouse |
| **Stock requests** | Shops request stock; mains can request from USA |
| **IME lookup** | Search inventory at a location by IME or serial (`GET /admin/warehouses/:id/lookup?ime=`) |
| **Add inventory** | Upload products with IME codes and cost price |

### IME tracking

- IME codes stored per product unit on warehouse arrival
- **Lookup** available on all warehouse/shop hubs
- **CSV export** of IME manifest when sending stock to a shop (`shopTransferImeExport.js`)
- Server utilities: `productIme.js`, `productWarehouseArrival.js`

### Bulk shipments

- Batch codes for grouped imports
- Track shipment status, mark arrived, assign destination warehouse
- Integrated with receive-stock flow in warehouse hub

---

## Backend API overview

Base path: `/api`

| Prefix | Routes |
|--------|--------|
| `/auth` | Login, refresh, password reset |
| `/register` | Public user registration (wholesaler, salesman) |
| `/users` | Profiles, activate, wholesalers list, salesman shop assignments |
| `/admin` | Dashboard stats, wholesaler CRUD, warehouses, hub actions, bulk shipments |
| `/products` | Catalog CRUD, search, bulk create, stock, images |
| `/cart` | Server-side cart |
| `/orders` | Order placement, accept/reject, listing |
| `/sales` | Salesperson shop endpoints |

### Key admin warehouse endpoints

```
GET    /admin/warehouses/overview
GET    /admin/warehouses/:id/hub
GET    /admin/warehouses/:id/lookup?ime=
POST   /admin/warehouses/:id/receive-stock
POST   /admin/warehouses/:id/transfer-to-shop
POST   /admin/warehouses/:id/transfer-to-warehouse
POST   /admin/warehouses/:id/stock-requests
PATCH  /admin/stock-requests/:requestId
POST   /admin/wholesalers          ← admin create wholesaler (active)
```

All `/admin/*` routes require JWT + admin role.

---

## Deployment

| Component | Platform |
|-----------|----------|
| **Frontend** | Netlify (`netlify.toml`, SPA redirects in `public/_redirects`) |
| **Backend** | Render (`watcher3-u8aw.onrender.com`) with primary at `wach.wacheelectronics.com` |
| **Failover** | Frontend tries primary API origin, falls back to backup (`VITE_API_ORIGINS`) |

After backend changes, **redeploy the server** on Render for new routes (lookup, transfer-to-warehouse, create wholesaler, etc.) to take effect in production.

---

## Recent updates summary

Everything below reflects work completed on this application during recent development sessions.

### Admin dashboard & navigation

- [x] New **Dashboard** tab with KPI cards, monthly revenue chart, shop breakdown
- [x] Restructured sidebar: Dashboard, Warehouses, Shops, Orders, Inventory, Direct sale, Sales team, Accounts, Analytics
- [x] Removed **Add Inventory** from sidebar (access via Warehouses tab)
- [x] Warehouse grid layout — **3 columns per row** with add tile
- [x] Fixed **Sign Out** button (loading state, reliable logout)
- [x] Region detection: USA vs Cameroon admin accounts with correct labels
- [x] Coursue-style visual refresh across admin panels

### Orders

- [x] Visible **Download PDF** button on Orders list header (admin + sales)
- [x] Monthly order filtering and PDF export (`ordersMonthlyPdf.js`)
- [x] Improved order hero / toolbar styling

### Accounts

- [x] **Add account** button on Accounts tab
- [x] Modal form to create wholesaler with all signup fields (name, business, city, phone, WhatsApp, email, password)
- [x] Admin-created accounts are **active immediately** (no pending approval)
- [x] Pending / Verified tabs, search, activate, registration detail modal

### USA warehouse flow

- [x] USA main warehouse: upload without requiring a shop
- [x] Display **“X uploaded”** instead of “travelling” for USA warehouses
- [x] **Send to warehouse** action (USA → regional main), not Send to Shop on USA
- [x] Cameroon admins: read-only at USA (view + request only)
- [x] Shops blocked from requesting USA stock; only regional mains can request from USA
- [x] Fixed Add Inventory crash (`usaMainId` used before definition in `AddInventoryPanel.jsx`)

### IME & stock transfer

- [x] **IME Lookup** panel on all warehouse/shop hubs
- [x] IME codes tracked on product warehouse arrival
- [x] **CSV download** of IME manifest when transferring stock to a shop
- [x] New endpoint: `POST /admin/warehouses/:id/transfer-to-warehouse`
- [x] `destinationMainWarehouse` field on inventory for cross-region transfers

### Inventory & products

- [x] Add Inventory panel with single + bulk upload, IME entry, pricing modal
- [x] Brand/phone catalog helpers for admin product entry
- [x] Edit product modal, delete product, catalog event refresh
- [x] Bulk shipment tracking with batch codes and arrival workflow

### Sales team

- [x] Create salesperson form with shop assignments
- [x] Reassign shops anytime via `SalespersonShopAssignments`
- [x] Sales page with order tools and PDF download

### Wholesaler experience

- [x] Signup with business city dropdown (Bamenda, Yaounde, Douala)
- [x] Pending account banner until admin activates
- [x] Server-synced cart, offers, preorders
- [x] Notification inbox in header
- [x] Responsive design system with dark mode and touch-target guidelines

### Auth & infrastructure

- [x] JWT auth with refresh token rotation
- [x] Dual API origin failover (`apiBaseUrl.js`)
- [x] Auth snapshot persistence across refresh
- [x] Netlify SPA routing and production build chunking
- [x] Express 5 API with role middleware, rate limiting, CORS, Cloudinary uploads

### Bug fixes

| Issue | Fix |
|-------|-----|
| Add Inventory “Something went wrong” | Moved `usaMainId` definition before `canUpload` in `AddInventoryPanel.jsx` |
| USA account showed “Cameroon account” | Improved profile parsing + USA address detection |
| `ADMIN_BRAND_OPTIONS` crash | Correctly map `{ value, label }` objects |
| Missing PDF button | Added to Orders panel header |

---

## Related docs

- [`TESTING-RESPONSIVE.md`](./TESTING-RESPONSIVE.md) — Responsive layout testing checklist
- [`.env.example`](./.env.example) — Frontend environment template

---

## License

Private — Wache Electronics.
