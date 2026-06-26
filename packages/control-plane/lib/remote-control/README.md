# Remote control (phone → agent)

Lets a user drive a VaultysClaw agent from a consumer messaging app. **Telegram**
is implemented (Bot API, long-polling); WhatsApp is planned via the same shape.

Inspired by [openclaw](https://github.com/openclaw/openclaw)'s multi-channel
gateway, but deliberately lean: instead of porting its plugin SDK, an inbound
message is routed straight through the control plane's existing streaming chat
path (`AgentWSServer.sendChatToAgent`), so the LLM, tools, memory, skills,
policies, and token budgets all apply unchanged.

## Flow

```
Phone (Telegram) ──getUpdates──▶ TelegramConnector
                                    │  allow-list check (deny by default)
                                    │  resolve target agent (per-chat → default)
                                    ▼
                       wsServer.sendChatToAgent(agentDid, "tg:<chatId>", [user msg])
                                    │  agent streams chat_response chunks
                                    ▼
                       buffer chunks ──sendMessage──▶ Phone (split at 4096 chars)
```

One conversation per chat (`tg:<chatId>`) so the agent keeps context. The
model's internal reasoning (`thinking` chunks) is dropped from the reply.

## Files

- `telegram-api.ts` — thin Bot API client over `fetch` (`getUpdates`,
  `sendMessage`, `getMe`) + `splitForTelegram` chunking.
- `telegram-connector.ts` — `TelegramConnector`: long-poll loop, access control,
  agent routing, reply assembly.
- `types.ts` — config shape + `isChatAllowed` / `resolveAgentForChat` helpers.
- `index.ts` — lifecycle (`startRemoteControl` / `stopRemoteControl`),
  config load/save via `SettingsDAO` (token encrypted in the vault), and
  `reconcileTelegramConnector` (start/stop on config change).

Wired into `server.ts` startup (after the WS server) and SIGTERM shutdown.

## Configuration

Admin-only REST API:

| Method | Path | Purpose |
|---|---|---|
| `GET`  | `/api/remote-control/telegram` | Current config (token redacted, live `running` flag) |
| `PUT`  | `/api/remote-control/telegram` | Update config (token, allow-list, target agent) |
| `POST` | `/api/remote-control/telegram/test` | Validate a bot token via `getMe` |

`PUT` reconciles the live connector immediately, so token / allow-list / agent
edits take effect without a restart.

### Settings keys (`SettingsDAO`)

| Key | Value |
|---|---|
| `remote_control.telegram.enabled` | `"true"` / `"false"` |
| `remote_control.telegram.token_enc` | vault-encrypted bot token |
| `remote_control.telegram.allowed_chats` | JSON `string[]` of chat ids |
| `remote_control.telegram.default_agent` | agent DID |
| `remote_control.telegram.agent_by_chat` | JSON `Record<chatId, did>` |

The bot token also falls back to the `TELEGRAM_BOT_TOKEN` env var when no DB
token is set.

## Quick start

1. Create a bot with [@BotFather](https://t.me/BotFather), get the token.
2. As an admin, `PUT /api/remote-control/telegram`:
   ```json
   {
     "enabled": true,
     "botToken": "123456:ABC...",
     "allowedChatIds": ["<your-telegram-chat-id>"],
     "defaultAgentDid": "did:vaultys:<agent>"
   }
   ```
   (Get your chat id by messaging the bot once and checking the logs, or use a
   bot like `@userinfobot`.)
3. Message the bot from your phone — it replies as the configured agent.

## Adding WhatsApp later

Mirror this module: a `whatsapp-connector.ts` using `baileys` (QR login, session
persisted/encrypted like the token here), the same `isChatAllowed` /
`resolveAgentForChat` access model, and the same `sendChatToAgent` routing.
Extend the `index.ts` lifecycle and the `remote-control` contract.
