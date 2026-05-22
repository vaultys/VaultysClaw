---
sidebar_position: 6
title: Users
description: Manage users, invitations, and profiles. Create unclaimed users via email invitations or Entra ID sync, then users claim their accounts by scanning a QR code.
---

# Users API

## User object

Every user has a stable internal `id` (UUID). The `did` field is null for unclaimed users who have not yet activated their account by scanning a QR code with the Vaultys wallet. Unclaimed users can be created via:
- **Email invitations**: Admin sends email link, user scans QR to claim
- **Entra ID sync**: Microsoft Graph sync, user gets QR link to claim

```json
{
  "id": "018e4f2a-...",
  "did": "did:vaultys:z6MkAlice...",
  "name": "Alice Smith",
  "email": "alice@acme.com",
  "isOwner": false,
  "isAdmin": true,
  "role": "admin",
  "registeredAt": "2026-01-10T09:00:00Z",
  "entraId": null,
  "claimedAt": null
}
```

For a user provisioned from Entra ID but not yet claimed, `did` is `null` and `entraId` holds the Entra object ID:

```json
{
  "id": "018e4f2a-...",
  "did": null,
  "name": "Bob Jones",
  "email": "bob@acme.com",
  "isOwner": false,
  "isAdmin": false,
  "role": "member",
  "registeredAt": "2026-03-01T08:00:00Z",
  "entraId": "aad-object-id-...",
  "claimedAt": null
}
```

## Get current user

```http
GET /api/users/me
```

**Auth:** Required.

Returns the authenticated user's profile, realm memberships, and capability grants.

### Response

```json
{
  "user": {
    "id": "018e4f2a-...",
    "did": "did:vaultys:z6MkAlice...",
    "name": "Alice Smith",
    "email": "alice@acme.com",
    "isAdmin": true,
    "registeredAt": "2026-01-10T09:00:00Z"
  },
  "realms": [
    {
      "id": "realm_eng",
      "name": "Engineering",
      "slug": "eng",
      "color": "#3b82f6",
      "role": "admin"
    }
  ],
  "grants": [
    {
      "id": "grant_01HZ...",
      "agentDid": null,
      "capabilities": ["api_call", "file_access"],
      "expiresAt": null,
      "createdAt": "2026-01-15T10:00:00Z"
    }
  ]
}
```

## List users

```http
GET /api/users
```

**Auth:** Admin only.

### Query parameters

| Parameter | Type | Description |
|---|---|---|
| `q` | string | Search by name, email, or DID |
| `role` | string | Filter by role (`owner`, `admin`, `manager`, `operator`, `member`) |
| `realm` | string | Filter by realm ID or slug |
| `isAdmin` | boolean | `true` = global admins only, `false` = non-admins only |
| `hasAccount` | boolean | `true` = claimed users (did not null), `false` = unclaimed |
| `page` | integer | Page number (default 1) |
| `pageSize` | integer | Items per page (default 20, max 100) |
| `sortBy` | string | `name`, `email`, or `registeredAt` |
| `sortDir` | string | `asc` or `desc` |

Use `hasAccount=false` to list only Entra-provisioned users who have not yet claimed their account (equivalent to the **Unclaimed** tab in the control-plane UI).

### Response

```json
{
  "users": [
    {
      "id": "018e4f2a-...",
      "did": "did:vaultys:z6MkAlice...",
      "name": "Alice Smith",
      "email": "alice@acme.com",
      "isAdmin": true,
      "role": "admin",
      "registeredAt": "2026-01-10T09:00:00Z",
      "entraId": null,
      "claimedAt": null,
      "realms": [
        { "id": "realm_eng", "name": "Engineering", "slug": "eng", "color": "#3b82f6", "isPrimary": true }
      ],
      "grants": []
    }
  ],
  "total": 24,
  "page": 1,
  "pageSize": 20,
  "totalPages": 2
}
```

## Get a user by DID

```http
GET /api/users/:did
```

**Auth:** Admin only.

Returns full profile including grants. `:did` must be URL-encoded.

## Update a user

```http
PATCH /api/users/:did
```

**Auth:** Owner only.

```json
{
  "name": "Alice M. Smith",
  "email": "alice@acme.com",
  "role": "manager",
  "reportsTo": "018e4f2b-...",
  "description": "Lead of the platform team"
}
```

All fields are optional; omitted fields are unchanged.

## Delete a user

```http
DELETE /api/users/:did
```

**Auth:** Owner only. Cannot delete yourself.

## Unclaimed (Entra-provisioned) users

Users imported from Entra ID have no DID until they claim their account. Use the `/api/users/unclaimed/:id` endpoints to manage them.

### Get an unclaimed user

```http
GET /api/users/unclaimed/:id
```

**Auth:** Admin only.

Returns 404 if the user does not exist or has already claimed their account (use `GET /api/users/:did` for claimed users).

```json
{
  "id": "018e4f2a-...",
  "did": null,
  "name": "Bob Jones",
  "email": "bob@acme.com",
  "role": "member",
  "reportsTo": null,
  "description": null,
  "registeredAt": "2026-03-01T08:00:00Z",
  "entraId": "aad-object-id-...",
  "claimedAt": null,
  "realms": [
    { "id": "realm_ops", "name": "Operations", "slug": "ops", "color": "#f59e0b", "isPrimary": false }
  ]
}
```

### Update an unclaimed user

```http
PATCH /api/users/unclaimed/:id
```

**Auth:** Admin only.

Same fields as `PATCH /api/users/:did` except `reportsTo` is accepted as-is.

### Delete an unclaimed user

```http
DELETE /api/users/unclaimed/:id
```

**Auth:** Admin only.

Removes the provisioned record. The user can be re-added by running another Entra sync.

## Generate a claim QR code

```http
POST /api/server/entra/send-qr
```

**Auth:** Admin only.

Creates a time-limited P2P registration session for an unclaimed user and optionally sends it by email.

```json
{
  "userId": "018e4f2a-...",
  "sendByEmail": true
}
```

### Response

```json
{
  "qrUrl": "https://wallet.vaultys.net/#...",
  "token": "abc123...",
  "serverDid": "did:vaultys:z6MkServer...",
  "emailSent": true
}
```

Poll `GET /api/user/listen/:token` to track the claim status:

| `status` value | Meaning |
|---|---|
| `-1` | Session pending — wallet has not connected yet |
| `2` | Success — user claimed their account |
| `-2` | Failed or expired |

Once status is `2`, the user's `did`, `public_key`, and `claimed_at` fields are set and they can log in normally.

## Capability grants

Grants allow non-admin users to send intents with specific capabilities. **Grants require the user to have a VaultysID** (`did` must not be null).

### Create a grant

```http
POST /api/users/:did/grants
```

**Auth:** Global admin.

```json
{
  "agentDid": "did:vaultys:z6MkAgent...",
  "capabilities": ["api_call", "file_access"],
  "expiresAt": "2026-12-31T23:59:59Z"
}
```

Set `agentDid` to `null` to grant access to all agents.

### List grants for a user

```http
GET /api/users/:did/grants
```

**Auth:** Admin only.

### Revoke a grant

```http
DELETE /api/users/:did/grants/:grantId
```

**Auth:** Admin only.

The associated delegation certificate is immediately invalidated.

## Email Invitations

Send invitations to new users via email. Invitations create unclaimed user records and generate unique registration links.

### Send email invitation

```http
POST /api/users/invite/email
```

**Auth:** Owner only.

**Request:**
```json
{
  "email": "alice@company.com",
  "name": "Alice Johnson",
  "role": "manager"
}
```

**Response:**
```json
{
  "token": "uuid-string",
  "userId": "uuid-string"
}
```

Creates an unclaimed user record with the provided name, email, and role. If an active invitation already exists for this email, the old token is deleted and a new one is generated.

### Get invitation details

```http
GET /api/invitations/:token
```

**Auth:** Public (no authentication required).

Returns invitation details for a user who received an email link.

**Response:**
```json
{
  "email": "alice@company.com",
  "name": "Alice Johnson",
  "role": "manager"
}
```

**Errors:**
- `404`: Token not found or expired (7+ days old)

### Generate QR from invitation

```http
POST /api/users/invite/from-email
```

**Auth:** Public (no authentication required).

Called by the invitation acceptance page to generate a QR code for wallet scanning.

**Request:**
```json
{
  "token": "uuid-string"
}
```

**Response:**
```json
{
  "qrUrl": "https://wallet.vaultys.net/#...",
  "connectionString": "...",
  "inviteToken": "cert-connection-token",
  "serverDid": "did:vaultys:..."
}
```

The `inviteToken` is used for polling the registration status via `/api/user/listen/:inviteToken`.

**Errors:**
- `404`: Token not found or expired
- `500`: Failed to generate registration certificate

### Delete invitation

```http
POST /api/invitations/:token/delete
```

**Auth:** Public (no authentication required).

Deletes an invitation token after successful registration. Called automatically when the user completes the wallet connection.

**Response:**
```json
{
  "success": true
}
```

## Direct QR Invitations

Generate a QR code immediately without requiring an email.

### Generate QR code

```http
GET /api/users/invite
```

**Auth:** Owner only.

Creates a registration certificate and P2P session. Returns a connection string for generating a QR code.

**Response:**
```json
{
  "connectionString": "...",
  "token": "cert-token-for-polling",
  "key": "cert-key",
  "serverDid": "did:vaultys:..."
}
```

The QR code format is:
```
{walletUrl}/#${connectionString}&protocol=p2p&service=auth&did=${serverDid}
```

Poll `/api/user/listen/:token` to check registration status.
