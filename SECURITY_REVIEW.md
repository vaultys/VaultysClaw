# Revue de sécurité — VaultysClaw

*Date : 2026-06-11 | Dernière vérification : 2026-06-11 | Périmètre : packages/control-plane, packages/agent-controller, packages/shared*

---

## Résumé exécutif

L'architecture cryptographique de base (VaultysId, signatures ECDSA sur les intents, chiffrement signcrypt des secrets) est solide. Les problèmes identifiés touchent principalement la couche applicative : exécution de code arbitraire côté serveur via les workflows, absence de contrôle d'accès sur une API de test, et manque de protections défensives (rate-limiting, SSRF, en-têtes de sécurité).

---

## 🔴 CRITIQUE

### 1. ✅ Exécution de code arbitraire — `evaluateCondition()` (`workflow-executor.ts`) — CORRIGÉ

~~`new Function(expression)`~~ → remplacé par `expr-eval` avec les opérateurs dangereux (`in`, `assignment`) explicitement désactivés. Les expressions sont maintenant limitées à l'arithmétique, la comparaison et la logique.

---

### 2. ✅ Sandbox `vm` contournable — `code-runner.ts` — CORRIGÉ

~~`vm.createContext` / `vm.runInContext`~~ → migré vers `isolated-vm` (V8 isolate distinct). Le code s'exécute dans un processus V8 complètement isolé avec `memoryLimit` configuré. Les méthodes `console` sont bridgées via `ivm.Reference` sans exposer d'APIs Node.js.

---

## 🔴 HAUTE SÉVÉRITÉ

### 3. ⚠️ API de test sans authentification — `/api/test/[...path]/route.ts` — PARTIELLEMENT CORRIGÉ

L'API est toujours protégée **uniquement** par `ENABLE_TEST_API=true`. Aucune vérification de session ou de clé API n'a été ajoutée. Elle expose des opérations critiques :
- Approbation d'agents (`POST /api/test/registrations/:id/approve`)
- Envoi d'intents arbitraires (`POST /api/test/intent`)
- Gestion des modèles LLM (`POST /api/test/models`)

Si `ENABLE_TEST_API` est activé accidentellement en production (CI/CD, copie d'env), la plateforme est entièrement compromise sans authentification.

**Correction recommandée :** ajouter une vérification de session admin dans `guard()` :
```typescript
async function guard(req: NextRequest): Promise<NextResponse | null> {
  if (!TEST_API_ENABLED) return NextResponse.json({ error: "Test API is disabled" }, { status: 404 });
  const auth = await getAuthContext(req);
  if (!auth?.isGlobalAdmin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return null;
}
```

---

### 4. ✅ Intent exécuté sans vérification si `serverPublicKey` est absent — CORRIGÉ

`verifyIntentSignature()` retourne maintenant `false` (bloquant) quand la clé publique est absente, au lieu de continuer avec un simple warning. L'intent est rejeté et un ACK d'échec est renvoyé au control plane.

---

### 5. ✅ Absence de protection SSRF — `http-request.ts` — CORRIGÉ

`assertNotSSRF()` implémentée avec : blocage des schémas non-HTTP(S), vérification directe des IPs privées (regex sur les plages RFC 1918, link-local, loopback), et résolution DNS complète (`all: true`) pour bloquer les hostnames qui pointent vers des adresses internes.

---

## 🟡 SÉVÉRITÉ MOYENNE

### 6. ✅ Injection SQL dans les requêtes raw PostgreSQL — `agent.dao.ts` — CORRIGÉ

`sortDir` est maintenant sanitisé par `const safeSortDir = sortDir === "asc" ? "ASC" : "DESC"` avant interpolation. La variable `safeSortDir` ne peut prendre que ces deux valeurs quelles que soient les entrées.

---

### 7. Flags de rôle mis en cache dans le JWT

Les champs `isAdmin` / `isOwner` sont encodés dans le JWT à la connexion. Si un admin est rétrogradé (ou un compte compromis révoqué), les droits restent valides jusqu'à l'expiration du token (durée par défaut next-auth : 30 jours).

**Correction recommandée :** lors de chaque requête sensible, revalider le rôle depuis la base :
```typescript
// Dans getAuthContext(), après récupération du JWT :
const freshUser = await UserDAO.findByDid(did);
const isGlobalAdmin = freshUser.isAdmin || freshUser.isOwner;
```
Ou réduire la durée de session à 1–4h.

---

### 8. Absence de rate-limiting sur l'authentification

Aucune limitation de débit sur :
- `POST /api/auth/[...nextauth]` (tentatives de connexion)
- `POST /api/user/connect` (initiation QR)
- `POST /api/api-keys` (création de clés)

**Correction recommandée :** utiliser [upstash/ratelimit](https://github.com/upstash/ratelimit) ou un middleware express de rate-limit sur ces routes.

---

## 🟢 SÉVÉRITÉ FAIBLE / AMÉLIORATIONS

### 9. ❌ `console.log` avec DIDs en production — `web/auth.ts` — NON CORRIGÉ

```typescript
console.log(d.user_did, did, agentDid, d.agent_did);
```
Log de debug toujours présent, exposant des DIDs dans les logs système.

**Correction :** remplacer par `logger.debug(...)` ou supprimer.

---

### 10. Absence d'en-têtes de sécurité HTTP

Aucun `Content-Security-Policy`, `X-Frame-Options`, `X-Content-Type-Options`, ou `Strict-Transport-Security` n'est configuré. Next.js ne les ajoute pas par défaut.

**Correction :** ajouter dans `next.config.js` :
```javascript
headers: async () => [{
  source: "/(.*)",
  headers: [
    { key: "X-Frame-Options", value: "DENY" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Content-Security-Policy", value: "default-src 'self'..." },
  ]
}]
```

---

### 11. ❌ Secret serveur stocké en clair dans la table `settings` — NON CORRIGÉ

Le `serverSecret` (clé privée VaultysId, racine de toute la cryptographie) est toujours stocké en clair dans SQLite/PostgreSQL. Un dump DB expose toutes les clés chiffrées avec lui.

**Correction :** stocker dans une variable d'environnement ou un secret manager (Vault, AWS Secrets Manager, 1Password Secrets Automation).

---

## Points positifs notables

| Mécanisme | Implémentation |
|---|---|
| Auth agents via VaultysId (ECDSA challenge-response) | ✅ Solide |
| Signature ECDSA de chaque intent, vérifiée par l'agent | ✅ Solide |
| Hachage SHA-256 des clés API (jamais stockées en clair) | ✅ Correct |
| `timingSafeEqual` pour la vérification HMAC des webhooks | ✅ Correct |
| Path traversal bloqué dans `file-ops.ts` via `safePath()` | ✅ Correct |
| Chiffrement signcrypt des credentials (S3, SMTP, etc.) | ✅ Bonne idée |
| `execFile` (pas `exec`) dans `shell.ts` — évite l'injection shell | ✅ Correct |

---

## Récapitulatif des priorités

| # | Sévérité | Fichier | Statut |
|---|---|---|---|
| 1 | 🔴 CRITIQUE | `workflow-executor.ts` | ✅ Corrigé — `expr-eval` |
| 2 | 🔴 CRITIQUE | `code-runner.ts` | ✅ Corrigé — `isolated-vm` |
| 3 | 🔴 HAUTE | `/api/test/route.ts` | ⚠️ Partiel — ajouter vérif session admin |
| 4 | 🔴 HAUTE | `agent.ts` | ✅ Corrigé — bloque si clé absente |
| 5 | 🔴 HAUTE | `http-request.ts` | ✅ Corrigé — `assertNotSSRF()` |
| 6 | 🟡 MOYENNE | `agent.dao.ts` | ✅ Corrigé — `safeSortDir` |
| 7 | 🟡 MOYENNE | `auth-config.ts` | ❌ En attente |
| 8 | 🟡 MOYENNE | Routes auth | ❌ En attente |
| 9 | 🟢 FAIBLE | `web/auth.ts` | ❌ En attente — supprimer console.log |
| 10 | 🟢 FAIBLE | `next.config.js` | ❌ En attente |
| 11 | 🟢 FAIBLE | `settings` table | ❌ En attente — externaliser `serverSecret` |
