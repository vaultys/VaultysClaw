# VaultysClaw Architecture

## Overview

VaultysClaw uses a **WebSocket-based architecture** for real-time, bidirectional communication between the control plane and agent controllers. This replaces the HTTP request/response model with persistent, low-latency connections.

## System Components

### Control Plane (Port 3000 + 8080)

1. **Next.js HTTP Server** (Port 3000)
   - React UI dashboard
   - REST API for management (`/api/*`)
   - Database integrations

2. **WebSocket Server** (Port 8080)
   - Accepts agent connections
   - Manages connected agents
   - Routes intents to agents
   - Receives execution results
   - Distributes policies

### Agent Controller

1. **Express HTTP Server** (Port 3001)
   - Health checks (`/health`)
   - Test endpoints (`/execute`)
   - Local action execution

2. **WebSocket Client**
   - Connects to control plane WebSocket server
   - Auto-reconnect with backoff
   - Persistent connection lifecycle

## Message Types

### Registration

**Agent → Control Plane**
```json
{
  "messageId": "register-1234567890",
  "type": "register",
  "agentId": "agent-1",
  "payload": {
    "name": "agent-1",
    "version": "0.0.1",
    "capabilities": ["file_access", "api_call"],
    "publicKey": "pk_..."
  },
  "timestamp": "2024-04-27T10:00:00Z"
}
```

**Control Plane → Agent**
```json
{
  "messageId": "ack-1234567890",
  "type": "register_ack",
  "agentId": "agent-1",
  "payload": {
    "success": true,
    "agentId": "agent-1",
    "message": "Registration successful"
  },
  "timestamp": "2024-04-27T10:00:00Z"
}
```

### Intent Distribution

**Control Plane → Agent**
```json
{
  "messageId": "intent-123",
  "type": "intent",
  "agentId": "agent-1",
  "payload": {
    "id": "intent-123",
    "action": "read_file",
    "params": {
      "path": "/data/file.txt"
    },
    "timestamp": "2024-04-27T10:00:00Z"
  },
  "timestamp": "2024-04-27T10:00:00Z",
  "signature": "sig_..."
}
```

**Agent → Control Plane**
```json
{
  "messageId": "result-123",
  "type": "result",
  "agentId": "agent-1",
  "payload": {
    "intentId": "intent-123",
    "status": "success",
    "output": {
      "content": "file contents..."
    },
    "executedAt": "2024-04-27T10:00:01Z"
  },
  "timestamp": "2024-04-27T10:00:01Z",
  "signature": "sig_..."
}
```

### Policy Updates

**Control Plane → Agent(s)**
```json
{
  "messageId": "policy-456",
  "type": "policy_update",
  "agentId": "agent-1",
  "payload": {
    "id": "policy-123",
    "agentId": "agent-1",
    "capabilities": ["file_access", "api_call"],
    "resourceLimits": {
      "maxMemoryMb": 512
    },
    "signature": "sig_..."
  },
  "timestamp": "2024-04-27T10:00:00Z"
}
```

**Agent → Control Plane (Ack)**
```json
{
  "messageId": "policy-ack-456",
  "type": "policy_ack",
  "agentId": "agent-1",
  "payload": {
    "messageId": "policy-456",
    "success": true
  },
  "timestamp": "2024-04-27T10:00:00Z"
}
```

### Heartbeat

**Agent → Control Plane** (Every 30 seconds)
```json
{
  "messageId": "heartbeat-789",
  "type": "heartbeat",
  "agentId": "agent-1",
  "payload": {
    "uptime": 1256.42,
    "memory": {
      "rss": 52428800,
      "heapUsed": 26214400
    }
  },
  "timestamp": "2024-04-27T10:00:30Z"
}
```

**Control Plane → Agent** (Pong response)
```json
{
  "messageId": "pong-789",
  "type": "pong",
  "agentId": "agent-1",
  "payload": {
    "timestamp": "2024-04-27T10:00:30Z"
  },
  "timestamp": "2024-04-27T10:00:30Z"
}
```

## Connection Lifecycle

```
┌─────────────────────────────────────────────────────────┐
│                    Agent Startup                        │
└─────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────┐
│    Load Config & Initialize VaultysId                  │
└─────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────┐
│    Attempt WebSocket Connection ws://localhost:8080    │
└─────────────────────────────────────────────────────────┘
                            ↓
                    ┌──────────┴──────────┐
                    ↓                     ↓
            ┌──────────────┐      ┌──────────────┐
            │ Connected    │      │ Connection   │
            │              │      │ Failed       │
            └──────────────┘      └──────────────┘
                    ↓                     ↓
          ┌─────────────────┐   Wait 5s + Retry
          │ Send Register   │
          │ Message         │
          └─────────────────┘
                    ↓
          ┌─────────────────┐
          │ Receive Ack     │
          └─────────────────┘
                    ↓
          ┌─────────────────┐
          │ Connected =     │
          │ true            │
          └─────────────────┘
                    ↓
          ┌─────────────────┐
          │ Start Heartbeat │
          │ Every 30s       │
          └─────────────────┘
                    ↓
          ┌─────────────────┐
          │ Wait for        │
          │ Intents/Policies│
          │ (Event Loop)    │
          └─────────────────┘
```

## Intent Execution Flow

```
┌──────────────────────────────────────────────────────┐
│           Control Plane REST API                     │
│    POST /api/intents                                 │
└──────────────────────────────────────────────────────┘
                          ↓
        ┌───────────────────────────────────────┐
        │ getWSServer().sendIntentToAgent()     │
        └───────────────────────────────────────┘
                          ↓
            ┌──────────────────────────────┐
            │ Find connected agent         │
            │ Send via WebSocket           │
            └──────────────────────────────┘
                          ↓
┌──────────────────────────────────────────────────────┐
│              Agent Receipt                           │
│    wsConnection.on('message', handleMessage)         │
└──────────────────────────────────────────────────────┘
                          ↓
        ┌───────────────────────────────────┐
        │ handleIntent(message)             │
        │ - Verify signature                │
        │ - Check policy/capability         │
        │ - Validate resource limits        │
        └───────────────────────────────────┘
                          ↓
               ┌──────────┴──────────┐
               ↓                     ↓
          ┌────────────┐        ┌────────────┐
          │ Allowed    │        │ Denied     │
          └────────────┘        └────────────┘
               ↓                     ↓
        ┌──────────────────┐    ┌────────────┐
        │ executeAction()  │    │ sendAck()  │
        │ sendResult()     │    │ (error)    │
        │ sendAck()        │    └────────────┘
        └──────────────────┘
                ↓
┌──────────────────────────────────────────────────────┐
│        Control Plane Receipt                         │
│    wsServer.on('message', handleMessage)             │
└──────────────────────────────────────────────────────┘
                         ↓
        ┌───────────────────────────────────┐
        │ handleResult(message)             │
        │ - Verify signature                │
        │ - Store in database               │
        │ - Trigger next task if applicable │
        └───────────────────────────────────┘
```

## Advantages vs HTTP

| Feature        | WebSocket          | HTTP                          |
| -------------- | ------------------ | ----------------------------- |
| Connection     | Persistent         | Negotiated per request        |
| Latency        | Low (10-50ms)      | Higher (100-500ms)            |
| Overhead       | Minimal            | Headers, TLS negotiation      |
| Real-time Push | ✅ Native           | ⚠️ Polling required            |
| Bidirectional  | ✅ Full duplex      | ⚠️ Request-response            |
| Scalability    | Good (10K+ agents) | Limited by connection pooling |
| Complexity     | Moderate           | Simple                        |

## Security Considerations

1. **TLS for Production** (wss:// over WSS)
   - All WebSocket connections must use TLS in production
   - Environment-aware: ws:// for dev, wss:// for prod

2. **Message Signing**
   - All intents signed by control plane
   - All results signed by agents
   - Verification using VaultysId

3. **Policy Enforcement**
   - Agents verify policy signatures
   - Agents check capabilities before executing
   - Control plane rate-limits intents per agent

4. **Connection State**
   - Agents maintain ephemeral state
   - No session reuse across connections
   - Heartbeat validates connection health

## Scalability

### Single Control Plane
- **Agents**: 1,000-10,000 concurrent connections
- **Throughput**: 1,000-5,000 intents/second
- **Latency**: <100ms p95

### Multiple Control Planes (Future)
- **Sharding**: Agents assigned to control plane by hash(agentId)
- **Clustering**: Control planes communicate via message queue
- **Load Balancing**: Round-robin DNS for control plane endpoints

## Future Enhancements

1. **Message Queuing**
   - Redis/RabbitMQ for queued intents
   - Guaranteed delivery

2. **End-to-End Encryption**
   - TLS for transport
   - Encrypted payloads for sensitive data

3. **Agent Clustering**
   - Multiple agent instances for redundancy
   - Load balancing within cluster

4. **Monitoring & Observability**
   - WebSocket metrics
   - Connection pool monitoring
   - Message throughput tracking

## File Structure

```
packages/
├── control-plane/
│   ├── lib/
│   │   └── ws-server.ts        # WebSocket server implementation
│   ├── app/
│   │   └── api/
│   │       ├── agents/route.ts # Agent management
│   │       ├── intents/route.ts # Intent distribution
│   │       └── policies/route.ts # Policy management
│   ├── server.ts               # Custom HTTP + WS server
│   └── package.json
│
├── agent-controller/
│   ├── src/
│   │   ├── index.ts            # Express + WebSocket client
│   │   └── config.ts           # Configuration loading
│   └── package.json
│
└── shared/
    └── src/
        └── types.ts            # Shared message types
```

## Testing the Architecture

### 1. Health Check
```bash
curl http://localhost:3001/health
```

### 2. List Connected Agents
```bash
curl http://localhost:3000/api/agents
```

### 3. Send Intent
```bash
curl -X POST http://localhost:3000/api/intents \
  -H "Content-Type: application/json" \
  -d '{
    "agentId": "agent-ts-1234567890",
    "action": "echo",
    "params": {"msg": "test"}
  }'
```

### 4. WebSocket Debugging
Use browser DevTools or wscat:
```bash
npm install -g wscat
wscat -c ws://localhost:8080
```

Then send a manual message:
```json
{"messageId": "test-1", "type": "register", "payload": {...}}
```

---

See [SECURITY.md](./SECURITY.md) for security details and [DEVELOPMENT.md](./DEVELOPMENT.md) for development setup.
