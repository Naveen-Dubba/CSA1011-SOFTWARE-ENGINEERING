# Agritrace

Agritrace is a full-stack agricultural supply-chain traceability and produce-management system. It gives farmers, collection centers, processors, distributors, retailers, administrators, and consumers one shared record for a batch's journey from harvest to shelf.

## Features

- JWT login with bcrypt password hashing and role-aware API permissions
- Produce batch registration, search, status updates, and traceability IDs
- Quality inspection and shipment records
- Public product journey lookup
- Dashboard metrics, activity feed, and Chart.js category analytics
- MySQL relational schema with foreign keys, indexes, timestamps, and demo admin access
- Docker Compose deployment with MySQL persistence and Nginx frontend routing

## Stack

React, Vite, React Router, Axios, Chart.js, Node.js, Express, JWT, bcryptjs, MySQL 8, Docker, and Nginx.

## Run With Docker

1. Open the folder in Visual Studio Code: `code .`
2. Start the complete stack: `docker compose up --build`
3. Open http://localhost:8080
4. Sign in with `admin@agritrace.local` and `Admin@123`
5. Stop the stack with `docker compose down` (add `-v` to remove the MySQL volume and reset data).

The API is available at http://localhost:5000/api/health. The frontend Nginx container proxies browser requests from `/api` to the backend service.

## Run Without Docker

### Database

Create a MySQL 8 database/user, then run `database/init.sql`. Copy `backend/.env.example` to `backend/.env` and set the credentials.

### Backend

```powershell
cd backend
npm.cmd install
npm.cmd run dev
```

### Frontend

```powershell
cd frontend
npm.cmd install
npm.cmd run dev
```

For a non-proxied local frontend, set `VITE_API_URL=http://localhost:5000/api` in `frontend/.env`. Vite runs at http://localhost:5173.

## API Surface

- `POST /api/auth/register`, `POST /api/auth/login`
- `GET /api/dashboard`
- `GET/POST /api/batches`, `PUT /api/batches/:id/status`, `DELETE /api/batches/:id`
- `GET /api/traceability/:traceId`
- `GET/POST /api/quality`
- `GET/POST /api/shipments`, `PUT /api/shipments/:id`
- `GET /api/notifications`

Protected endpoints expect `Authorization: Bearer <jwt>`. All SQL calls use parameterized queries. Replace `JWT_SECRET`, database passwords, and CORS origins before production deployment.

## Structure

`frontend/` contains the React application and Nginx image. `backend/` contains the Express API, auth middleware, and database connection. `database/init.sql` contains the relational schema. `docker-compose.yml` starts the frontend, API, and MySQL services on one internal network.
