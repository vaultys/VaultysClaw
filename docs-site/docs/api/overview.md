# API Overview

VaultysClaw provides a comprehensive REST API for managing agents, workflows, channels, and governance policies. All APIs follow consistent response formats and pagination patterns.

## Response Format

All successful API responses follow a consistent structure:

### List Responses (Paginated)
```json
{
  "items": [],
  "pagination": {
    "total": 100,
    "page": 1,
    "pageSize": 50,
    "totalPages": 2
  }
}
```

### Single Resource Responses
```json
{
  "id": "resource-id",
  "name": "Resource Name",
  "createdAt": "2026-05-28T14:30:45Z",
  "updatedAt": "2026-05-28T14:30:45Z"
}
```

### Error Responses
```json
{
  "error": "Resource not found",
  "code": "NOT_FOUND",
  "statusCode": 404,
  "details": {},
  "timestamp": "2026-05-28T14:30:45Z"
}
```

## Pagination

All list endpoints support standard pagination parameters:

| Parameter | Type | Default | Max | Description |
|-----------|------|---------|-----|-------------|
| `page` | number | 1 | - | 1-indexed page number |
| `pageSize` | number | 50 | 100 | Items per page |
| `sortBy` | string | - | - | Field to sort by |
| `sortDir` | string | desc | - | Sort direction: `asc` or `desc` |

## Searching and Filtering

Most list endpoints support a search parameter `q` for free-text search. Filter parameters are endpoint-specific.

## Common Error Codes

| Code | Status | Description |
|------|--------|-------------|
| `VALIDATION_ERROR` | 400 | Request validation failed |
| `NOT_FOUND` | 404 | Resource not found |
| `UNAUTHORIZED` | 401 | Authentication required |
| `FORBIDDEN` | 403 | Insufficient permissions |
