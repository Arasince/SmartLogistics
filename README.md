# SmartCargo

SmartCargo is a full-stack logistics SaaS prototype for reducing empty truck capacity and empty miles. It tracks packages with QR codes, tracks truck capacity by weight and volume, and recommends extra loads based on route, destination, remaining volume, and remaining weight.

This is a demo prototype, not production software. Authentication is simulated with a selected demo user stored in frontend `localStorage`; the backend receives that user as an `X-User-Id` header and enforces simple company isolation.

## Stack

- Frontend: Next.js, TypeScript
- Backend: FastAPI, Python
- Database: SQLite
- ORM: SQLAlchemy
- QR generation: Python `qrcode`

## Run Backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python seed.py
uvicorn app.main:app --reload --port 8000
```

Backend API: `http://localhost:8000`

QR images are served from `http://localhost:8000/qr_codes/<package_code>.png`.

## Run Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend app: `http://localhost:3000`

The frontend calls the backend through a local Next.js proxy at `/api/backend`, which forwards to
`http://localhost:8000` by default. If the backend runs somewhere else:

```bash
BACKEND_URL=http://localhost:8000 npm run dev
```

## Test Frontend on Netlify

This repo includes `netlify.toml` for deploying the Next.js frontend from `frontend/`.
Netlify will run:

```bash
cd frontend
npm run build
```

Set this Netlify environment variable before deploying:

```bash
BACKEND_URL=https://your-deployed-fastapi-backend.example.com
```

The current FastAPI + SQLite backend is not deployed by Netlify as a long-running Python service. For Netlify testing,
host the backend separately, then point `BACKEND_URL` at it. The Next.js API route in `frontend/app/api/backend`
proxies browser requests to that backend, including QR image requests.

If browser requests call the backend directly instead of using the proxy, also allow the Netlify origin on the backend:

```bash
FRONTEND_ORIGINS=https://your-site.netlify.app,http://localhost:3000,http://127.0.0.1:3000
```

## Deploy Backend on Render

Create a Render Web Service for the FastAPI backend.

Render settings:

```text
Root Directory: backend
Build Command: pip install -r requirements.txt && python seed.py
Start Command: uvicorn app.main:app --host 0.0.0.0 --port $PORT
```

Backend entry file:

```text
backend/app/main.py
```

Framework:

```text
FastAPI running with Uvicorn
```

Required Render environment variables:

```text
FRONTEND_ORIGINS=https://your-netlify-site.netlify.app
FRONTEND_ORIGIN_REGEX=https://.*\.netlify\.app
```

After Render deploys, copy the Render backend URL into Netlify:

```text
BACKEND_URL=https://your-render-service.onrender.com
```

The backend dependencies are in `backend/requirements.txt`.

## Seed Database

From `backend/`:

```bash
python seed.py
```

The seed resets `smartcargo.db`, recreates all tables, inserts demo data, and generates QR codes. Seeded QR codes store only `package_code`; full package details are always fetched from the backend.

## Demo Users

- Platform admin: `platform@smartcargo.demo`
- Company admin: `cem@araslogistics.com`
- Warehouse: `deniz@araslogistics.com`
- Manager: `ece@araslogistics.com`
- Driver: `mert@araslogistics.com`

Use the landing page demo login buttons to switch roles.

## Seeded Data

- Companies: Aras Logistics, Atlas Freight
- Users: platform admin, company admin, warehouse, manager, driver, pending employee, rejected employee, Atlas admin
- Trucks: 3 total, including Aras Istanbul to Ankara and Istanbul to Izmir trucks
- Packages: 12 total with mixed destinations, categories, priorities, weights, volumes, and safety flags
- Some packages are already loaded so capacity and recommendation panels have useful starting data

## Core Prototype Flows

- Platform admin can create and view companies.
- Company admin can approve or reject pending employee join requests.
- Warehouse can create packages, generate QR codes, assign packages to trucks, and simulate QR scans.
- Manager can inspect truck capacity and route-based load recommendations.
- Driver can view assigned truck, loaded packages, remaining capacity, update current city, and see suggested pickup loads.

## Recommendation Logic

Recommendations include unassigned packages from the same company when:

- Package weight fits remaining truck weight.
- Package volume fits remaining truck volume.
- Destination equals the truck route end or is inside a hardcoded route corridor.
- Hazardous packages are not recommended when the truck already carries food or fragile packages.
- Cold-chain packages require `cold_chain_supported=true` on the truck.

Prototype route corridors:

- Istanbul to Ankara: Kocaeli, Sakarya, Duzce, Bolu, Ankara
- Istanbul to Izmir: Bursa, Balikesir, Manisa, Izmir
- Ankara to Istanbul: Bolu, Duzce, Sakarya, Kocaeli, Istanbul

## API Notes

Important endpoints include:

- `POST /companies`
- `GET /companies`
- `POST /users/register`
- `GET /companies/{company_id}/join-requests`
- `POST /companies/{company_id}/trucks`
- `GET /trucks/{truck_id}/capacity`
- `POST /companies/{company_id}/packages`
- `GET /packages/code/{package_code}`
- `POST /packages/{package_id}/assign-to-truck/{truck_id}`
- `POST /packages/scan`
- `GET /trucks/{truck_id}/recommendations`

## Next Steps

- Real authentication and authorization
- Real GPS tracking
- Map integration
- Real QR camera scanning
- Multi-company trusted marketplace
- ML-based optimization later
