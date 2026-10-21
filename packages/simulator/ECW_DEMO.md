# Démonstrateur ECW — Opération SENTINELLE

Une flotte autonome fictive (8 drones de reconnaissance, 1 drone logistique, 2 robots terrestres,
2 agents IA, 1 poste de commandement C2) et la console d'un drone, RAPACE-07, dont chaque bouton
est accordé ou refusé selon son certificat — puis compromis, puis coupé de la flotte par
révocation.

Rien n'est simulé côté sécurité : chaque membre est un `ActorRuntime` du SDK avec sa propre
VaultysID, ses certificats sont réellement émis par le plan de contrôle, ses preuves de statut
réellement signées, et chaque décision d'un pair est une vérification de signature. Seuls la
radio (un bus en mémoire), les positions et l'attaquant sont simulés.

## Lancer

```bash
pnpm simulator:up      # terminal 1 : base + plan de contrôle isolés (3003 / ws 8083)
pnpm demo:ecw          # terminal 2 : le démonstrateur (localhost:3012)
```

- **http://localhost:3012** — la vue flotte (à projeter sur le grand écran).
- **http://localhost:3012/drone** — la console de RAPACE-07 (à piloter).
- **http://localhost:3003** — le plan de contrôle. Créez-y un administrateur au premier lancement
  (`/login`) si vous voulez montrer la console ; le démonstrateur fonctionne sans.

La flotte se connecte et s'enregistre, le démonstrateur approuve ses enregistrements avec le
profil de chacun (comme `simulator approve`), et chaque membre récupère son certificat par un vrai
échange Challenger. Comptez une dizaine de secondes avant que tout soit « certifié ».

## Le déroulé (≈ 6 minutes)

1. **La flotte.** Sur la vue flotte : chaque trait vert est un message signé par son émetteur,
   accompagné d'une preuve de statut signée par le plan de contrôle, et vérifié **hors ligne** par
   son destinataire. Pas de secret partagé, pas d'appel au serveur à chaque message.
2. **Les droits.** Console drone, mode *Opérateur légitime* : `Décoller`, `Patrouiller`,
   `Capturer une image` → exécutés. `Larguer la charge`, `Désactiver le géorepérage`,
   `Envoyer vers Internet` → refusés par le certificat. Montrez que LOGI-01, lui, a le droit de
   larguer : la décision suit le certificat, pas l'appareil.
3. **Le lien radio.** Mode *Tiers sur le lien radio* : n'importe quel bouton → l'ordre est
   rejeté (« usurpation d'identité ») avant d'atteindre le drone, alors même que l'attaquant a
   intercepté la preuve authentique du C2. `Rejouer un ordre C2 capturé` → rejeté (rejeu).
4. **La compromission.** Mode *Drone compromis* : le tiers a pris le module de communication et
   la clé. `Partager sa position` et `Image → Analyste IA` sont **acceptés** par la flotte (de
   fausses données entrent dans le système — c'est le risque assumé) ; `Ordonner à RAPACE-03` est
   refusé par le pair (pas de `fleet:command`) ; `Forger une preuve` est refusé (pas signée par le
   plan de contrôle). Le drone compromis inonde aussi l'analyste IA de faux contacts : visible sur
   la carte.
5. **La révocation.** `RÉVOQUER LE CERTIFICAT` (ou depuis la console du plan de contrôle). Le
   chronomètre montre la dernière preuve « active » de l'attaquant expirer ; en moins de
   6 secondes, tous les liens de RAPACE-07 passent au rouge : **isolé**. Le reste de la flotte
   continue. Le contrôleur de vol applique la révocation et rentre à la base.
6. **Après.** Tous les boutons sont refusés, quel que soit le mode. Le journal d'audit de la
   console montre la révocation. `Réinitialiser` crée un nouveau RAPACE-07 (identité neuve) ;
   l'ancien reste révoqué dans le registre.

## Le modèle de sécurité, sans ambiguïté

| Couche | Ce qu'elle arrête | Ce qu'elle n'arrête pas |
|---|---|---|
| Signature de l'ordre (C2) | Injection et usurpation sur le lien radio ; rejeu | — |
| Certificat du drone (contrôle embarqué) | Toute action hors profil | Rien si le contrôleur de vol lui-même est compromis |
| Vérification par les pairs | Messages d'un drone non autorisé, preuve forgée, preuve expirée | Un drone compromis **non encore révoqué**, dans la limite de ses droits |
| Révocation | Toute confiance de la flotte, au plus tard un TTL (6 s) après | La neutralisation physique de l'appareil |

- **Un tiers peut compromettre un drone via son outil de communication.** Le démonstrateur le
  montre au lieu de le nier : il agit alors avec *les droits de ce drone*, ce qui justifie le
  moindre privilège.
- **La révocation ne demande pas la coopération du drone.** Un attaquant peut rejouer sa dernière
  preuve valide ; elle expire au bout du TTL, et tout pair la refuse ensuite. Le TTL est la borne
  de la fenêtre d'exposition — un réglage par espace de travail.
- **Hypothèse affichée** : le contrôleur de vol est un composant de confiance distinct du module
  de communication. S'il est compromis aussi, seuls les pairs et le C2 restent des barrières.

## Ce que le démonstrateur écrit en base

Uniquement dans la base jetable du simulateur (refus explicite sinon) : neuf capacités
personnalisées `drone:*` / `fleet:*`, l'espace de travail « Opération SENTINELLE (fictive) »
(preuves TTL 6 s, échec fermé), l'approbation des enregistrements `ecw-…`, et — pour le bouton de
révocation du stand — la révocation du certificat de RAPACE-07 plus son entrée d'audit. Les
identités vivent sous `packages/simulator/.simdata/ecw/` (ignoré par Git).
