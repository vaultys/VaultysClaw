Note d'analyse · 19 octobre 2026

# Délégation de jetons OAuth aux agents IA : ce que VaultysClaw doit en tirer

Synthèse du draft IETF « Delegation Tokens for Agentic AI Systems in OAuth-Based Authorization Architectures », confrontée à l'état actuel de VaultysClaw, avec des recommandations d'implémentation et un cas d'usage complet.

1 · Synthèse

## Le document en bref

Le draft est une **analyse d'écarts**, pas une spécification. OAuth 2.0 a été conçu pour un modèle « un humain autorise un client, une fois, en un saut ». Les agents IA cassent ce modèle : ils sous-délèguent à d'autres agents, agissent longtemps sans humain, traversent des frontières d'organisation. Le document énonce 15 exigences (R0 à R14), les découpe en 103 sous-exigences et mesure ce que couvrent 31 mécanismes existants.

**103**sous-exigences évaluées

**31**mécanismes (18 RFC, 9 drafts, 4 prior art)

**46**sans couverture RFC normative (45 %)

**3**sans aucune couverture, drafts compris

Sa conclusion centrale : le manque est **compositionnel**. Les briques existent (token exchange RFC 8693, `authorization_details` RFC 9396, DPoP, introspection, révocation), mais rien ne dit comment les assembler en chaîne de délégation vérifiable. Pour 43 des 46 trous, des drafts (AIP, Attenuating Tokens, Token Exchange Extension) ou des systèmes à capacités (ZCAP-LD, Biscuit, Macaroons) proposent déjà un motif réutilisable.

Figure 1. Le manque central du draft. OAuth sait échanger un jeton contre un autre, mais ne relie pas les deux : la révocation, la durée et le périmètre ne se propagent pas le long de la chaîne.

### Les quatre familles d'écarts

| Groupe | Exigences | Ce qui manque à OAuth | Écart RFC |
| --- | --- | --- | --- |
| G1 Chaîne | R0 identité, R1 délégation ≠ usurpation, R4 rôles, R11 re-délégation | Pas de rôle « délégant » ni « délégué », pas de règle d'ascendance, pas de profondeur max ni d'interdiction de re-déléguer. Le claim `act` imbriqué existe mais sans sémantique de validation. | 41 % |
| G2 Cycle de vie | R2 périmètre, R3 point d'application, R5 durée, R6 révocation, R10 atténuation | Aucune garantie que l'autorité en aval ⊆ l'autorité en amont, ni que `exp` aval ≤ `exp` amont. Pas de révocation en cascade, de sous-arbre ou partielle. Rien sur une révocation pendant une exécution en cours (« exécution zombie »). | 45 % |
| G3 Validation | R7 validation, R8 sécurité de l'artefact, R9 liaison | Pas de procédure pour valider une chaîne de bout en bout, ni de règle de transfert d'un artefact entre agents, ni de liaison à une instance de workload précise. | 33 % |
| G4 Traçabilité | R12 provenance, R13 supervision humaine, R14 échecs | Pas de notion de provenance d'exécution ou d'appels d'outils. Aucune approbation humaine *pendant* l'exécution (R13 est le seul écart RFC total). Pas de codes d'erreur propres à la délégation. | 60 % |

Figure 2. Couverture RFC des 103 sous-exigences (annexe B, table 1 du draft). Plus la barre rouge est longue, plus l'exigence demande de texte normatif nouveau. La supervision humaine (R13) est le seul écart quasi total.

### Les trois trous que personne ne couvre

- **R3 :** répartir les responsabilités d'application entre plateformes d'agents hétérogènes, opérées indépendamment.
- **R8 :** coordonner la détection, le rayon d'impact et la reprise après compromission d'une chaîne, entre domaines de confiance.
- **R12 :** une provenance d'exécution qui relie l'autorité déléguée aux événements de sécurité produits par l'agent (décisions, appels d'outils, contexte modèle).

**Lecture pour VaultysClaw.** Ces trois trous tombent pile sur ce qui distingue le produit. Les identités DID sont globales et liées à une clé, le capteur et le proxy sont des points d'application indépendants de la plateforme d'agent, et le ledger signé permet la vérification hors ligne. VaultysClaw peut devenir une implémentation de référence de la « spécification compagnon » que le draft appelle.

2 · Existant

## Où en est VaultysClaw, exigence par exigence

Le dépôt contient déjà le terrain préparé : `CapabilityCertificate.delegatedByDid`, `parentCertId`, `parentCertHash`, le marqueur `delegation` et la capacité `non_delegatable`. Tout cela est inerte : aucun code d'émission ne les remplit. `Actor.ownerDid` est descriptif et n'est pas lu par `resolvePermission`.

| Exigence | État | Aujourd'hui | À construire |
| --- | --- | --- | --- |
| R0 Identité | Couvert | DID VaultysId, globaux, liés à une clé, handshake Challenger | Identités éphémères de sous-agent (DID par tâche, durée courte) |
| R1 vs usurpation | Partiel | `ownerDid` descriptif seulement | Sujet (humain) et acteur (agent) distincts dans chaque artefact |
| R2 Périmètre | Partiel | `CertScope` (resource, resourcePattern, maxUses, purpose), capacités `vendor:action` au niveau outil | Liaison à un workflow ou une transaction ; monotonie garantie |
| R3 Application | Fort | Gates de `packages/policy`, capteur, proxy tier-1, supervision de harness | Désigner explicitement quel point applique quelle contrainte |
| R4 Rôles | Absent | Certificat B conçu, non construit | Délégant, délégué, ascendance |
| R5 Durée | Partiel | Expiration et renouvellement | `exp` enfant ≤ `exp` parent, sur toute la chaîne |
| R6 Révocation | Partiel | Révocation au ledger, kill switches, `cert_status_response` signé | Cascade, sous-arbre, partielle, comportement en cours d'exécution |
| R7 Validation | Partiel | Vérification hors ligne (packcert), stapling du statut | Validation de chaîne et de profondeur |
| R8 Artefact | Partiel | Artefacts signés et co-signés | Règles de dérivation et de transfert, réponse à compromission |
| R9 Liaison | Fort | Preuve de possession de clé ; corrélation processus par le capteur | Lier explicitement la chaîne à l'instance de workload |
| R10 Atténuation | Absent | Aucune | Algèbre d'atténuation vérifiable |
| R11 Re-délégation | Minimal | `non_delegatable` sur tout le certificat | Profondeur max, liste des capacités re-délégables |
| R12 Provenance | Partiel | Journal d'audit via `recordEvent`, télémétrie capteur | Enregistrement de décision signé et chaîné, lié à la chaîne de délégation |
| R13 Humain | Prévu | Mode `assist` au plan de la supervision de harness (phase 4) | Classement allow / ask / block, reçu d'approbation signé |
| R14 Échecs | Absent | Aucun code dédié | Taxonomie d'erreurs de délégation |

3 · Recommandations

## Comment l'implémenter

Elles respectent les règles du dépôt : `packages/policy` et `packages/trust` restent purs ; `CertificateStatus` garde ses quatre valeurs ; toute fixture de `conformance/` est consommée par TypeScript et par Go.

Figure 3. Architecture cible. L'autorité passe par les co-signatures (en couleur). Le control plane ne signe pas les délégations, il les enregistre et publie leur statut. Tout le trafic des agents traverse un point d'application qui vérifie la chaîne sans appel réseau et renvoie ses décisions signées.

### Construire le certificat de délégation B, enrichi de contraintes

R4 · R5 · R8 · R11

Le design actuel (B co-signé par délégant et délégué, référence à A via `parentCertHash`) est bon. Il faut y ajouter un bloc de contraintes explicite, et embarquer les ancêtres packés dans B pour qu'un vérifieur valide toute la chaîne sans réseau.

```
{
  type: "delegation",
  subjectDid,        // l'humain à l'origine (A₁), recopié à chaque saut
  delegatedByDid,    // = parent.agentDid
  agentDid,          // le délégué
  parentCertHash,
  capabilities,      // ⊆ parent.capabilities
  scope,             // CertScope atténué
  expiresAt,         // ≤ parent.expiresAt
  maxDepth,          // profondeur restante, strictement décroissante
  redelegable,       // sous-ensemble de capabilities re-délégables ([] = terminal)
  approval?,         // voir recommandation 5
  chain: [packcert…] // ancêtres jusqu'au certificat racine co-signé par le control plane
}
```

### Écrire l'algèbre d'atténuation dans `packages/policy`

R2 · R10 · R7

Une seule fonction pure, `isAttenuationOf(child, parent)`, appelée à l'émission et à chaque vérification :

- capacités : inclusion stricte, et aucune capacité si le parent porte `non_delegatable` ;
- `resource` doit correspondre au `resourcePattern` du parent ; un pattern enfant doit être un préfixe plus long ;
- `maxUses`, `expiresAt`, `maxDepth` : minimum ;
- approbation : `allow` \< `ask` \< `block`, l'enfant ne peut que monter ;
- capacités custom filtrées contre le registre, comme aujourd'hui (`filterAgainstRegistry`).

Figure 4. L'atténuation se lit comme un emboîtement. Chaque certificat doit tenir entièrement dans son parent. Ajouter `payment.prepare` à C le ferait sortir de B, et la vérification répondrait `redelegation_forbidden`.

Créer `conformance/delegation-vectors.json` et le port Go dans `sdk-go/authz`, sur le modèle des 37 vecteurs de permission existants.

### Notariser chaque délégation au ledger

R6 · R8 · R12

Garder le principe « l'autorité vient de A, pas du control plane », mais exiger que B soit **enregistré** au ledger (message `delegation_register`) avant d'être honoré en ligne. Sans cela, le control plane ne voit pas les sous-arbres et ne peut ni les révoquer, ni tracer la provenance, ni coordonner une compromission (le trou R8). Une délégation purement hors ligne peut rester permise, à condition d'une durée très courte (par exemple 15 minutes) et d'être réservée aux capacités qui l'autorisent.

### Rendre la révocation en cascade par construction

R6 · R5

- **Cascade dérivée :** un vérifieur contrôle le statut de *chaque* ancêtre. Révoquer A invalide tout le sous-arbre sans rien écrire sur les descendants, donc sans cinquième statut.
- `cert_status_response` étendu : une seule réponse signée qui porte le statut de chaque maillon de la chaîne.
- Révocation partielle : émettre un B′ plus étroit puis révoquer B.
- Kill switch : l'exemption humaine porte sur l'acteur feuille. Une chaîne qui part d'un humain et aboutit à un agent est suspendue avec l'agent.
- En cours d'exécution : chaque point d'application revérifie à chaque appel d'outil, et le control plane pousse un `cert_revoked` aux détenteurs connectés.

### Ajouter l'approbation humaine pendant l'exécution

R13 · R12

Étendre `CertScope` avec `approval: { mode: "allow" | "ask" | "block", approverDid, when? }`, où `when` exprime un déclencheur (montant, destination, capacité). Quand le point d'application rencontre `ask`, il suspend l'action et l'approbateur répond depuis le portail. Sa réponse est un **reçu d'approbation signé par sa VaultysId**, lié à l'id de B et au hash de l'action. C'est le mode `assist` déjà prévu dans la supervision de harness, rendu portable.

### Produire une provenance d'exécution signée

R12 · trou non couvert du corpus

Chaque décision d'un point d'application devient un enregistrement signé par ce point (capteur, proxy, SDK) : ids de la chaîne, outil, `argsHash`, décision, id du reçu d'approbation, version du harness ou du modèle détectée par le capteur. Les enregistrements sont chaînés par hash et remontent par la télémétrie existante. Côté vie privée, on hache les arguments, on fixe une rétention et on n'expose la chaîne qu'aux parties qui en ont besoin, comme le recommande la section 10 du draft.

### Définir les codes d'échec

R14

`delegation_chain_invalid`, `delegation_depth_exceeded`, `redelegation_forbidden`, `attenuation_violation`, `delegation_revoked_upstream`, `approval_denied`, `approval_timeout`, `suspended`. Ils sont partagés par le protocole WS, le SDK TypeScript et `sdk-go`.

### Ouvrir un pont OAuth vers les API classiques

R0 · R7 · R9 · interopérabilité

Les API tierces ne connaissent pas VaultysId. Le control plane joue le rôle d'Authorization Server :

- un endpoint **token exchange** (RFC 8693) prend une chaîne VaultysClaw et émet un JWT court (RFC 9068) ;
- dans ce JWT, `sub` est le DID humain, `act` imbriqué reprend les agents, `authorization_details` (RFC 9396) dérive des capacités, `aud` désigne l'API (RFC 8707) ;
- `cnf` lie le jeton à la clé de l'agent (DPoP, RFC 9449), et `exp` reste ≤ au minimum de la chaîne ;
- un endpoint d'**introspection** (RFC 7662) consulte le ledger, ce qui étend la cascade de révocation aux serveurs tiers ;
- des métadonnées AS (RFC 8414) et un JWKS sont publiés.

### Brancher les événements

R12 · exploitation

Ajouter `delegation.created`, `delegation.revoked`, `approval.requested`, `approval.decided` et `delegation.violation`, en suivant la check-list du CLAUDE.md : catalogue, `recordEvent`, payload, renderer, exemple de doc.

4 · Cas d'usage

## Clôture fournisseurs avec un agent et un sous-agent

**Contexte.** Chez Acme, Claire est responsable comptable. Chaque fin de mois, elle confie à un agent de clôture le rapprochement des factures fournisseurs et la préparation des paiements dans l'ERP. Pour lire les PDF, l'agent lance un sous-agent OCR jetable. L'ERP expose une API OAuth classique. Les capacités sont des capacités custom du registre : `acme:invoice.read`, `acme:payment.prepare`, `acme:payment.execute`.

### La chaîne de délégation

A · Claire (human)

certificat racine, co-signé par le control plane · expire dans 1 an

`invoice.read` `payment.prepare` `payment.execute`

B · délégation co-signée Claire + agent · 72 h · maxDepth 1

closing-agent (openclaw)

invoice.read sur sharepoint://factures/2026-10/\* · payment.execute en ask au-delà de 5 000 €

re-délégable : `invoice.read` uniquement

C · délégation co-signée agent + sous-agent · 2 h · maxDepth 0

ocr-worker (éphémère)

DID générée pour la tâche · maxUses 500 · terminal

`invoice.read` sur le même pattern

### Déroulé

1. **Délégation à l'agent.** Depuis le portail, Claire choisit une période et un plafond. Le control plane propose B. Claire et l'agent le co-signent par un échange Challenger, puis B est notarisé au ledger. `isAttenuationOf(B, A)` passe. R1 R2 R4 R5 R10 R11
2. **Sous-délégation éphémère.** L'agent génère une VaultysId pour ocr-worker et lui délègue C. S'il essayait d'y mettre `payment.prepare`, la vérification renverrait `redelegation_forbidden`, car cette capacité ne figure pas dans `redelegable`. Il ne peut pas non plus prolonger au-delà de 72 h. R0 (identité éphémère) R11 R14
3. **Lecture des factures.** ocr-worker présente C et sa chaîne embarquée au proxy qui garde SharePoint. Le proxy vérifie hors ligne les signatures, les hashes parents, l'atténuation, la profondeur et le statut stapled de chaque maillon. Il décompte `maxUses`. R3 R7 R9
4. **Appel à l'ERP.** L'agent échange B contre un jeton ERP (RFC 8693). Le JWT porte `sub` = DID de Claire, `act.sub` = closing-agent, `authorization_details` de type `acme_payment` avec un plafond, `aud` = erp, un DPoP lié à la clé de l'agent et une durée de 10 min. L'ERP sait qui agit, et pour le compte de qui. R0 R1 R7 R9 interop
5. **Paiement de 12 400 €.** Le montant dépasse le seuil, donc le point d'application suspend l'action et notifie Claire. Elle valide depuis le portail en signant un reçu lié à l'id de B et au hash du lot de paiement. L'agent exécute en présentant ce reçu. Sans réponse sous 4 h, l'action échoue avec `approval_timeout`. R13 R14
6. **Trace.** Chaque décision produit un enregistrement signé : chaîne A→B(→C), outil, `argsHash`, reçu d'approbation, version du harness. L'auditeur peut répondre à « qui a payé ce fournisseur, sous quelle autorité et avec quelle validation humaine ». R12
7. **Incident.** Le capteur voit ocr-worker contacter une destination inconnue. L'admin révoque C : le sous-agent est coupé à son prochain appel (`delegation_revoked_upstream`) et l'agent principal continue. Si l'agent principal lui-même était compromis, Claire révoquerait B. C tomberait alors par cascade, et les JWT ERP issus de B passeraient à `active: false` à l'introspection, leur durée de 10 min bornant le cas sans introspection. Un kill switch du workspace finance suspendrait toute la chaîne d'un coup, Claire restant connectée pour le désarmer. R6 R8 kill switch

Figure 5. Étape 5 en détail. Le point d'application retient l'action jusqu'à recevoir un reçu signé par la VaultysId de Claire. Sans reçu sous 4 h, il rejette avec `approval_timeout` ; un refus donne `approval_denied`.

Figure 6. Étape 7, révocation en cascade. Seul B est marqué révoqué au ledger. C et le JWT tombent parce que leurs vérifieurs remontent jusqu'à B. Un kill switch du workspace finance produirait le même effet sur B, C et le JWT, sans écriture au ledger, tandis que Claire, humaine, reste exemptée.

5 · Séquencement

## Feuille de route proposée

**Phase 1 · Noyau pur**

- Format de B et `isAttenuationOf` dans `packages/policy`
- Parcours de chaîne dans `resolvePermission`
- Vecteurs de conformance et port Go

**Phase 2 · Control plane**

- Émission co-signée et notarisation
- Statut de chaîne, cascade, kill switch sur la feuille
- Codes d'erreur et événements webhook

**Phase 3 · Humain et preuve**

- `approval` dans `CertScope`, reçus signés
- Mode `assist` branché au portail
- Enregistrements de décision chaînés

**Phase 4 · Interop OAuth**

- Token exchange, introspection, métadonnées AS
- DPoP et `authorization_details`
- Démo ERP de bout en bout

Le cas d'usage ci-dessus peut servir de démonstrateur à la fin de chaque phase. Les étapes 1 à 3 et 7 fonctionnent à la fin de la phase 2, les étapes 5 et 6 à la fin de la phase 3, l'étape 4 à la fin de la phase 4.

6 · Annexe
dépôt VaultysClaw : `packages/policy/src/types.ts`, `packages/policy/src/certs/delegation.ts`, `packages/controlplane/CLAUDE.md` (« Actor categories, devices & delegation »), `docs/CERTIFICATE_WEB_OF_TRUST.md`, `docs/HARNESS_SUPERVISOR.md`.