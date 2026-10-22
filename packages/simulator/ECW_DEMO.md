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

La vue flotte est une scène 3D (three.js, servi en local par le démonstrateur : aucun accès réseau
requis sur le stand) posée sur un terrain généré (collines, forêts, lac, montagnes enneigées — le
même à chaque chargement), avec le quadrillage tactique et les cercles de portée du C2 peints au sol. Boutons en haut à droite : **✦ Seulement RAPACE-07** (masque toutes les
communications qui ne concernent pas RAPACE-07, y compris les attaques visant d'autres drones),
**⏸ Pause rotation** (coupe ou relance la rotation lente automatique ; aussi la touche Espace, et toute prise en main de la caméra la met en pause — le choix est mémorisé),
**◎ Suivre RAPACE-07** (la caméra suit le drone), **⌂ Vue d'ensemble**. Chaque message est un
trait en arc : vert s'il est accepté, rouge avec un ✕ sur le destinataire qui le refuse. Seul un message que le certificat de son propre émetteur interdit s'arrête à mi-chemin : il n'est jamais vraiment parti. Quand
un drone rejette un ordre du tiers radio, un bouclier cyan s'allume autour de lui. Un drone isolé
est enfermé dans une bulle de quarantaine rouge.

La flotte se connecte et s'enregistre, le démonstrateur approuve ses enregistrements avec le
profil de chacun (comme `simulator approve`), et chaque membre récupère son certificat par un vrai
échange Challenger. Comptez une dizaine de secondes avant que tout soit « certifié ».

## Le déroulé (≈ 7 minutes)

La console drone est découpée en quatre onglets. Un point vert sur un onglet indique le contexte
dont RAPACE-07 reçoit actuellement ses ordres ; l'onglet Drone ne fait que regarder et ne change
pas le scénario en cours. La décision, la réponse à incident et le journal restent à droite.

1. **La flotte.** Sur la vue flotte : chaque arc vert est un message signé par son émetteur,
   accompagné d'une preuve de statut signée par le plan de contrôle, et vérifié **hors ligne** par
   son destinataire. Pas de secret partagé, pas d'appel au serveur à chaque message.
2. **C2.** `Décoller`, `Patrouiller`, `Capturer une image` → exécutés. `Larguer la charge`,
   `Désactiver le géorepérage`, `Envoyer vers Internet` → l'ordre du C2 est authentique, mais le
   certificat du drone refuse. LOGI-01, lui, a le droit de larguer : la décision suit le
   certificat, pas l'appareil.
3. **Humain.** Le Sgt Lemaire (fictif) est un humain du registre ; son terminal signe avec sa
   propre clé et ne détient que `fleet:command.flight`. `Décoller` / `Retour base` → exécutés.
   `Capturer une image` → refusé **avant** le drone : le pilote n'a pas le droit de l'ordonner,
   alors que le drone aurait le droit de le faire. Chaque ordre passe deux décisions : celle de
   l'émetteur, celle du drone.
4. **Tiers attaquant — le lien radio.** N'importe quel bouton → l'ordre est rejeté (« usurpation
   d'identité ») avant d'atteindre le drone, alors même que l'attaquant a intercepté la preuve
   authentique du C2. `Rejouer un ordre capturé` → rejeté (rejeu).
   Sur la vue flotte, le tiers apparaît comme une antenne rouge hors du géorepérage : tant que ce
   mode est actif, il attaque aussi d'autres drones toutes les 2,5 s (ordres forgés, et rejeu d'un
   vrai ordre C2 détourné vers un autre destinataire). Chaque tentative est un arc rouge qui atteint
   le drone, où un bouclier et un ✕ marquent le rejet, et le compteur « Tiers radio » montre que toutes sont rejetées.
5. **Tiers attaquant — le drone lui-même.** Le tiers a pris le module de communication et la clé.
   `Partager sa position` et `Image → Analyste IA` sont **acceptés** par la flotte (de fausses
   données entrent dans le système — c'est le risque assumé) ; `Ordonner à RAPACE-03` est refusé
   par le pair (pas de `fleet:command`) ; `Forger une preuve` est refusé (pas signée par le plan
   de contrôle).
6. **La révocation.** `RÉVOQUER LE CERTIFICAT` (ou depuis la console du plan de contrôle). Le
   chronomètre montre la dernière preuve « active » de l'attaquant expirer ; en moins de
   6 secondes, tous les liens de RAPACE-07 passent au rouge : **isolé**. Le reste de la flotte
   continue. L'onglet **Drone** montre ses droits barrés et les pairs qui le refusent.
7. **Après.** Tous les boutons sont refusés, quel que soit l'onglet. Le journal d'audit de la
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

Uniquement dans la base jetable du simulateur (refus explicite sinon) : dix capacités
personnalisées `drone:*` / `fleet:*`, le pilote humain (un acteur `human` en `@sim.invalid`,
propriétaire du terminal pilote), l'espace de travail « Opération SENTINELLE (fictive) »
(preuves TTL 6 s, échec fermé), l'approbation des enregistrements `ecw-…`, et — pour le bouton de
révocation du stand — la révocation du certificat de RAPACE-07 plus son entrée d'audit. Les
identités vivent sous `packages/simulator/.simdata/ecw/` (ignoré par Git).
