# WhistleGuard — Confidential Anonymous Reporting System

A production-grade backend API for anonymous, confidential reporting within organizations. Built with **Node.js**, **Express**, and **SQLite**.

People may have information that needs to be reported but may not feel safe revealing their identity. WhistleGuard enables anyone to submit confidential reports without creating an account, track their case anonymously, and allows moderators to review and act upon reports — all while maintaining complete reporter privacy.

---

## Table of Contents

- [Features](#features)
- [Architecture](#architecture)
- [Setup Instructions](#setup-instructions)
- [API Endpoints](#api-endpoints)
- [How Anonymity is Maintained](#how-anonymity-is-maintained)
- [Example Requests and Responses](#example-requests-and-responses)
- [Status Workflow](#status-workflow)
- [Running Tests](#running-tests)
- [Design Decisions](#important-assumptions-and-design-decisions)

---

## Features

| Feature | Description |
|---|---|
| **Anonymous Reporting** | Submit reports without accounts or identity |
| **Secure Case Codes** | 64-bit cryptographic codes for report tracking |
| **Status Workflow** | SUBMITTED → UNDER_REVIEW → RESOLVED/DISMISSED → CLOSED |
| **Moderator Dashboard** | View, filter, search, and manage reports |
| **JWT Authentication** | Secure moderator access with role-based authorization |
| **Rate Limiting** | Protection against spam and brute-force attacks |
| **Swagger/OpenAPI** | Interactive API documentation at `/api-docs` |
| **Automated Tests** | 36 test cases covering all endpoints |
| **Permanent Case Closure** | Ability to permanently close resolved/dismissed cases |
| **Search and Filtering** | Filter by category, status, and search descriptions |

---

## Architecture

```
whistleguard/
├── server.js                  # Entry point
├── src/
│   ├── app.js                 # Express app with middleware
│   ├── database.js            # SQLite setup, schema, seeding
│   ├── utils.js               # Case code generation, status validation
│   ├── swagger.js             # OpenAPI/Swagger configuration
│   ├── middleware/
│   │   ├── auth.js            # JWT authentication & authorization
│   │   └── validate.js        # Request validation middleware
│   └── routes/
│       ├── reports.js         # Public: submit & track reports
│       └── moderator.js       # Protected: manage reports
├── tests/
│   └── api.test.js            # Comprehensive test suite
├── .env                       # Environment configuration
└── package.json
```

---

## Setup Instructions

### Prerequisites
- **Node.js** v18+ (v20+ recommended)
- **npm** v9+

### 1. Clone and Install

```bash
git clone <repo-url>
cd whistleguard
npm install
```

### 2. Configure Environment

A `.env` file is provided with development defaults. For production, update:

```env
PORT=3000
JWT_SECRET=your-strong-random-secret-here
DEFAULT_MODERATOR_USERNAME=admin
DEFAULT_MODERATOR_PASSWORD=a-strong-password
```

### 3. Start the Server

```bash
# Development (with auto-restart)
npm run dev

# Production
npm start
```

The server starts at `http://localhost:3000`.
Swagger docs are available at `http://localhost:3000/api-docs`.

### 4. Default Moderator

On first run, a default admin moderator is auto-created:
- **Username:** `admin`
- **Password:** `admin123`

> **Warning:** Change these credentials in production via the `.env` file.

---

## API Endpoints

### Public Endpoints (No Authentication Required)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/health` | Health check |
| `POST` | `/api/reports` | Submit an anonymous report |
| `GET` | `/api/reports/:caseCode` | Track report status by case code |

### Moderator Endpoints (JWT Required)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/moderator/login` | Authenticate and get JWT token |
| `GET` | `/api/moderator/reports` | View all reports (with filters) |
| `GET` | `/api/moderator/reports/:id` | View single report with history |
| `PATCH` | `/api/moderator/reports/:id/status` | Update report status |
| `GET` | `/api/moderator/stats` | Dashboard statistics |

### Admin-Only Endpoints (Admin JWT Required)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/moderator/register` | Register a new moderator |

### Documentation

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api-docs` | Swagger UI (interactive docs) |
| `GET` | `/api-docs.json` | OpenAPI JSON specification |

---

## How Anonymity is Maintained

WhistleGuard is designed with **privacy-by-design** principles:

1. **No Account Required**: Reports are submitted without any registration, login, or account creation.

2. **No Identity Storage**: The database schema does not contain any fields for reporter name, email, IP address, or any personally identifiable information (PII).

3. **Cryptographic Case Codes**: Each report is assigned a `WG-XXXXXXXX-XXXXXXXX` code generated using `crypto.randomBytes(8)` — providing **64 bits of entropy** (18.4 quintillion possible codes), making them practically impossible to guess or enumerate.

4. **No IP Logging**: The application does not log or store IP addresses. Morgan logging in development mode only logs request paths, not client IPs.

5. **No Session Tracking**: There are no cookies, sessions, or fingerprinting mechanisms.

6. **API Response Sanitization**: All API responses — both public and moderator-facing — are explicitly constructed to exclude any identity-related fields. Moderators can see report content but have no way to identify the reporter.

7. **Rate Limiting**: Prevents brute-force enumeration of case codes (max 100 requests per 15-minute window).

8. **Helmet Security Headers**: HTTP security headers prevent various attack vectors.

---

## Example Requests and Responses

### 1. Submit an Anonymous Report

```bash
curl -X POST http://localhost:3000/api/reports \
  -H "Content-Type: application/json" \
  -d '{
    "category": "harassment",
    "description": "I witnessed repeated verbal harassment in the 3rd floor meeting room during weekly standups over the past three weeks.",
    "evidence_url": "https://drive.google.com/file/evidence-recording"
  }'
```

**Response (201):**
```json
{
  "success": true,
  "message": "Report submitted successfully. Save your case code to track progress.",
  "data": {
    "case_code": "WG-A3F8B21C-D5E9F047",
    "status": "SUBMITTED",
    "created_at": "2024-01-15 10:30:00"
  }
}
```

### 2. Track Report Status

```bash
curl http://localhost:3000/api/reports/WG-A3F8B21C-D5E9F047
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "case_code": "WG-A3F8B21C-D5E9F047",
    "category": "harassment",
    "status": "UNDER_REVIEW",
    "is_closed": false,
    "created_at": "2024-01-15 10:30:00",
    "updated_at": "2024-01-16 14:00:00",
    "updates": [
      {
        "status": "UNDER_REVIEW",
        "message": "Your report is being reviewed by our investigation team.",
        "timestamp": "2024-01-16 14:00:00"
      }
    ]
  }
}
```

### 3. Moderator Login

```bash
curl -X POST http://localhost:3000/api/moderator/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "admin",
    "password": "admin123"
  }'
```

**Response (200):**
```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "moderator": {
      "id": 1,
      "username": "admin",
      "role": "admin"
    }
  }
}
```

### 4. View Reports (with Filters)

```bash
# All reports
curl http://localhost:3000/api/moderator/reports \
  -H "Authorization: Bearer <token>"

# Filtered by category and status
curl "http://localhost:3000/api/moderator/reports?category=harassment&status=SUBMITTED&page=1&limit=10" \
  -H "Authorization: Bearer <token>"

# Search in descriptions
curl "http://localhost:3000/api/moderator/reports?search=verbal+abuse" \
  -H "Authorization: Bearer <token>"
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "reports": [
      {
        "id": 1,
        "case_code": "WG-A3F8B21C-D5E9F047",
        "category": "harassment",
        "description": "I witnessed repeated verbal harassment...",
        "evidence_url": "https://drive.google.com/file/evidence-recording",
        "status": "SUBMITTED",
        "is_closed": 0,
        "created_at": "2024-01-15 10:30:00",
        "updated_at": "2024-01-15 10:30:00"
      }
    ],
    "pagination": {
      "total": 1,
      "page": 1,
      "limit": 20,
      "total_pages": 1
    }
  }
}
```

### 5. Update Report Status

```bash
curl -X PATCH http://localhost:3000/api/moderator/reports/1/status \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "status": "UNDER_REVIEW",
    "message": "Your report is being investigated by our ethics committee."
  }'
```

**Response (200):**
```json
{
  "success": true,
  "message": "Report status updated to \"UNDER_REVIEW\".",
  "data": {
    "id": 1,
    "case_code": "WG-A3F8B21C-D5E9F047",
    "category": "harassment",
    "status": "UNDER_REVIEW",
    "is_closed": false,
    "updated_at": "2024-01-16 14:00:00"
  }
}
```

### 6. Invalid Status Transition

```bash
curl -X PATCH http://localhost:3000/api/moderator/reports/1/status \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"status": "CLOSED"}'
```

**Response (400):**
```json
{
  "success": false,
  "error": "Invalid status transition from \"SUBMITTED\" to \"CLOSED\".",
  "allowed_transitions": ["UNDER_REVIEW"]
}
```

---

## Status Workflow

```
┌──────────┐     ┌──────────────┐     ┌──────────┐     ┌────────┐
│ SUBMITTED│────>│ UNDER_REVIEW │────>│ RESOLVED │────>│ CLOSED │
└──────────┘     └──────────────┘     └──────────┘     └────────┘
                        │                                   ^
                        │              ┌───────────┐        │
                        └─────────────>│ DISMISSED │────────┘
                                       └───────────┘
```

- **SUBMITTED**: Initial state when a report is created
- **UNDER_REVIEW**: Moderator has started reviewing the report
- **RESOLVED**: Investigation complete, action taken
- **DISMISSED**: Report reviewed but no action warranted
- **CLOSED**: Case permanently closed (cannot be modified)

---

## Running Tests

```bash
npm test
```

The test suite runs **36 tests** covering:
- Health check endpoint
- Moderator authentication (login, invalid credentials)
- Anonymous report submission (valid/invalid data, validation)
- Case code tracking (valid, non-existent, invalid format)
- Moderator report management (listing, filtering, searching)
- Status transitions (valid workflow, invalid transitions, permanent closure)
- Admin-only access control
- Dashboard statistics
- Error handling (404, invalid JSON, bad tokens)
- Privacy verification (no identity leakage in any response)

---

## Important Assumptions and Design Decisions

### Architecture
- **SQLite** chosen for zero-configuration setup — no separate database server needed. Easily replaceable with PostgreSQL/MySQL for production scale.
- **Synchronous SQLite** via `better-sqlite3` — simpler and faster than async alternatives for single-server deployments.
- **WAL mode** enabled for better concurrent read performance.

### Security
- **bcrypt (12 rounds)** for moderator password hashing.
- **JWT tokens** with configurable expiration for stateless authentication.
- **Helmet.js** for secure HTTP headers (HSTS, CSP, X-Frame-Options, etc.).
- **Rate limiting** at multiple levels: global (100/15min), report submission (10/15min), login (10/15min).
- **Input validation** via `express-validator` on every endpoint.
- **Request body size limit** (10KB) to prevent payload attacks.

### Privacy
- **No IP logging** — the system deliberately avoids storing or logging client IP addresses.
- **No accounts for reporters** — zero identity footprint.
- **Case codes use `crypto.randomBytes()`** — CSPRNG with 64-bit entropy, not UUIDs or sequential IDs.
- **Explicit field selection** in all SQL queries — never `SELECT *` in API responses to prevent accidental data leakage.

### Status Machine
- Status transitions are enforced server-side with a strict state machine — no arbitrary status changes allowed.
- **CLOSED** is a terminal state that cannot be reverted, ensuring case integrity.

### Assumptions
- Single-server deployment (SQLite limitation); switch to PostgreSQL for horizontal scaling.
- Moderator registration requires an existing admin — no self-registration to prevent unauthorized access.
- The `evidence_url` field accepts URLs only — file upload would require additional storage infrastructure.
- All timestamps are in UTC.

---

## License

ISC
