# API Rate Limits

## Overview

Rate limiting is implemented to protect the API from abuse, DDoS attacks, and brute force attempts. All rate limits are applied per IP address.

## Rate Limit Configuration

### General API Endpoints
- **Limit:** 100 requests per minute per IP
- **Window:** 60 seconds (1 minute)
- **Applies to:** All `/api/*` endpoints (except auth endpoints)

### Authentication Endpoints
- **Limit:** 5 requests per minute per IP
- **Window:** 60 seconds (1 minute)
- **Applies to:** All `/api/auth/*` endpoints
- **Reason:** Prevents brute force attacks on login/registration

## Rate Limit Headers

When a request is made, the following headers are included in the response:

- **X-RateLimit-Limit:** Maximum number of requests allowed in the window
- **X-RateLimit-Remaining:** Number of requests remaining in the current window
- **X-RateLimit-Reset:** Unix timestamp when the rate limit window resets

## Rate Limit Exceeded Response

When the rate limit is exceeded, the API returns:

**Status Code:** `429 Too Many Requests`

**Response Body:**
```json
{
  "message": "Too many requests. Please try again later."
}
```

## Best Practices

1. **Implement Exponential Backoff:** If you receive a 429 response, wait before retrying
2. **Cache Responses:** Cache API responses when possible to reduce requests
3. **Batch Requests:** Combine multiple operations into single requests when possible
4. **Monitor Rate Limits:** Check response headers to track your usage

## Example: Handling Rate Limits

```javascript
// Example: Handle rate limit in frontend
async function makeRequest(url) {
  try {
    const response = await fetch(url);
    
    if (response.status === 429) {
      const retryAfter = response.headers.get('Retry-After') || 60;
      console.log(`Rate limited. Retry after ${retryAfter} seconds`);
      await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
      return makeRequest(url); // Retry
    }
    
    return response.json();
  } catch (error) {
    console.error('Request failed:', error);
    throw error;
  }
}
```

## Rate Limit by Endpoint Type

| Endpoint Type | Limit | Window | Notes |
|--------------|-------|--------|-------|
| General API | 100/min | 60s | All `/api/*` routes |
| Auth Endpoints | 5/min | 60s | Login, register, password reset |
| Health Check | 100/min | 60s | `/health`, `/api/health` |

## Production Considerations

- Rate limits are stored in-memory (per server instance)
- For multi-instance deployments, consider Redis-based rate limiting
- Current implementation works well for single-instance deployments
- Rate limits reset automatically after the time window expires

## Adjusting Rate Limits

Rate limits are configured in `backend/server.js`:

```javascript
// General API: 100 requests/minute
app.use('/api', createRateLimiter({ windowMs: 60000, max: 100 }));

// Auth: 5 requests/minute
app.use('/api/auth', createRateLimiter({ windowMs: 60000, max: 5 }));
```

To adjust limits, modify the `max` parameter in the rate limiter configuration.

---

**Last Updated:** 2025-01-27

