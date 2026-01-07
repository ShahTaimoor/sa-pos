# API Documentation

## Base URL

- **Development:** `http://localhost:5000`
- **Production:** `https://api.yourdomain.com`

## Authentication

All protected endpoints require authentication via JWT token.

### Authentication Methods

1. **HTTP-Only Cookie** (Recommended)
   - Token is automatically sent with requests when `withCredentials: true`
   - Set during login: `POST /api/auth/login`

2. **Authorization Header** (Fallback)
   ```
   Authorization: Bearer <token>
   ```

### Getting a Token

```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "password123"
}
```

**Response:**
```json
{
  "message": "Login successful",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "...",
    "email": "user@example.com",
    "role": "admin"
  }
}
```

## Rate Limits

- **General API:** 100 requests/minute per IP
- **Auth Endpoints:** 5 requests/minute per IP

See [API_RATE_LIMITS.md](./API_RATE_LIMITS.md) for details.

## Common Response Formats

### Success Response
```json
{
  "success": true,
  "data": { ... }
}
```

### Error Response
```json
{
  "success": false,
  "error": {
    "message": "Error message",
    "code": "ERROR_CODE",
    "statusCode": 400
  }
}
```

### Pagination Response
```json
{
  "items": [ ... ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 100,
    "pages": 10
  }
}
```

## Endpoints

### Health Check

#### GET /health
Check server health status.

**Response:**
```json
{
  "status": "OK",
  "message": "POS Backend Server is running",
  "timestamp": "2025-01-27T10:30:00.000Z",
  "environment": "development",
  "port": 5000,
  "database": {
    "status": "connected",
    "connected": true
  },
  "uptime": 3600
}
```

### Authentication

#### POST /api/auth/login
Login user and get JWT token.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

#### POST /api/auth/register
Register a new user (admin only).

### Products

#### GET /api/products
Get all products with filtering and pagination.

**Query Parameters:**
- `page` - Page number (default: 1)
- `limit` - Items per page (default: 10)
- `search` - Search term
- `category` - Filter by category
- `status` - Filter by status

#### POST /api/products
Create a new product.

**Request Body:**
```json
{
  "name": "Product Name",
  "description": "Product description",
  "price": 99.99,
  "category": "category_id",
  "inventory": {
    "currentStock": 100,
    "minStock": 10
  }
}
```

### Sales

#### GET /api/sales
Get all sales with filtering.

#### POST /api/sales
Create a new sale.

### Inventory

#### GET /api/inventory
Get inventory items.

#### GET /api/inventory/summary
Get inventory summary statistics.

#### GET /api/inventory/low-stock
Get low stock items.

## Error Codes

| Code | Status | Description |
|------|--------|-------------|
| `VALIDATION_ERROR` | 400 | Request validation failed |
| `UNAUTHORIZED` | 401 | Authentication required |
| `FORBIDDEN` | 403 | Insufficient permissions |
| `NOT_FOUND` | 404 | Resource not found |
| `DUPLICATE_ENTRY` | 409 | Resource already exists |
| `TOO_MANY_REQUESTS` | 429 | Rate limit exceeded |
| `INTERNAL_SERVER_ERROR` | 500 | Server error |

## Request ID

All requests include a unique request ID in the response header:
```
X-Request-ID: 550e8400-e29b-41d4-a716-446655440000
```

Use this ID when reporting issues or debugging.

## Compression

API responses are automatically compressed using gzip when supported by the client.

## CORS

CORS is configured to allow requests from:
- `https://sa.wiserconsulting.info` (production)
- `http://localhost:3000` (development)
- `http://localhost:5173` (Vite dev server)
- Custom origins via `ALLOWED_ORIGINS` environment variable

---

**Note:** This is a basic API documentation. For complete Swagger/OpenAPI documentation, see the Swagger setup guide.

**Last Updated:** 2025-01-27

