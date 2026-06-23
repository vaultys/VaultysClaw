import { useState } from "react";
import {
  Terminal,
  ChevronDown,
  ChevronRight,
  Package,
  Container,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { CodeBlock } from "./CodeBlock";

type SetupFlavour = "docker" | "kubernetes";

const DOCKER_QUICKSTART = `docker run -d \\
  --name peerjs-server \\
  --restart unless-stopped \\
  -p 9000:9000 \\
  peerjs/peerjs-server:latest`;

const DOCKER_COMPOSE = `services:
  peerjs-server:
    image: peerjs/peerjs-server:latest
    container_name: peerjs-server
    restart: unless-stopped
    ports:
      - "9000:9000"
    environment:
      # Optional: set a secret so only authorised peers can connect
      # PEERJS_KEY: "your-secret-key"
      PEERJS_EXPIRE_TIMEOUT: "5000"
      PEERJS_ALIVE_TIMEOUT: "60000"`;

const DOCKER_NGINX = `# Reverse-proxy snippet (nginx) — put PeerJS behind TLS
location /peerjs/ {
    proxy_pass         http://peerjs-server:9000/;
    proxy_http_version 1.1;
    proxy_set_header   Upgrade    $http_upgrade;
    proxy_set_header   Connection "upgrade";
    proxy_set_header   Host       $host;
}`;

const K8S_MANIFEST = `apiVersion: apps/v1
kind: Deployment
metadata:
  name: peerjs-server
  namespace: default          # change if needed
  labels:
    app: peerjs-server
spec:
  replicas: 1
  selector:
    matchLabels:
      app: peerjs-server
  template:
    metadata:
      labels:
        app: peerjs-server
    spec:
      containers:
        - name: peerjs-server
          image: peerjs/peerjs-server:latest
          ports:
            - containerPort: 9000
          env:
            - name: PEERJS_EXPIRE_TIMEOUT
              value: "5000"
            - name: PEERJS_ALIVE_TIMEOUT
              value: "60000"
          resources:
            requests:
              cpu: "50m"
              memory: "64Mi"
            limits:
              cpu: "200m"
              memory: "128Mi"
---
apiVersion: v1
kind: Service
metadata:
  name: peerjs-server
  namespace: default
spec:
  selector:
    app: peerjs-server
  ports:
    - port: 9000
      targetPort: 9000
  type: ClusterIP          # use LoadBalancer or NodePort to expose externally`;

const K8S_APPLY = `kubectl apply -f peerjs-server.yaml

# Verify it started
kubectl rollout status deployment/peerjs-server
kubectl get pods -l app=peerjs-server`;

const K8S_INGRESS = `# Optional: expose via an Ingress (requires cert-manager for TLS)
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: peerjs-server
  annotations:
    nginx.ingress.kubernetes.io/proxy-read-timeout: "3600"
    nginx.ingress.kubernetes.io/proxy-send-timeout: "3600"
    # cert-manager.io/cluster-issuer: letsencrypt-prod  # uncomment for TLS
spec:
  rules:
    - host: peerjs.your-domain.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: peerjs-server
                port:
                  number: 9000`;

export function PeerjsSetupGuide({
  configuredUrl,
}: {
  configuredUrl: string | null;
}) {
  const [open, setOpen] = useState(!configuredUrl);
  const [flavour, setFlavour] = useState<SetupFlavour>("docker");

  const internalUrl =
    flavour === "docker"
      ? "http://localhost:9000"
      : "http://peerjs-server.default.svc.cluster.local:9000";

  return (
    <div className="rounded-xl border border-neutral-200 bg-background-100 overflow-hidden">
      {/* Accordion header */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-background-200/50 transition-colors"
      >
        <Terminal size={16} className="text-secondary-500 shrink-0" />
        <div className="flex-1 min-w-0">
          <span className="text-sm font-semibold text-foreground">
            Self-host a PeerJS signaling server
          </span>
          <p className="text-xs text-foreground-500 mt-0.5">
            Run your own relay for maximum privacy and no rate limits — Docker
            or Kubernetes
          </p>
        </div>
        {open ? (
          <ChevronDown size={15} className="text-foreground-500 shrink-0" />
        ) : (
          <ChevronRight size={15} className="text-foreground-500 shrink-0" />
        )}
      </button>

      {open && (
        <div className="border-t border-neutral-200 px-5 pb-5 pt-4 space-y-5">
          {/* Flavour tabs */}
          <div className="flex gap-1 bg-background border border-neutral-200 rounded-lg p-1 w-fit">
            {(
              [
                {
                  id: "docker" as SetupFlavour,
                  icon: <Package size={13} />,
                  label: "Docker",
                },
                {
                  id: "kubernetes" as SetupFlavour,
                  icon: <Container size={13} />,
                  label: "Kubernetes",
                },
              ] as const
            ).map(({ id, icon, label }) => (
              <button
                key={id}
                onClick={() => setFlavour(id)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors",
                  flavour === id
                    ? "bg-secondary-600 text-white"
                    : "text-foreground-500 hover:text-foreground hover:bg-background-200"
                )}
              >
                {icon}
                {label}
              </button>
            ))}
          </div>

          {/* Docker instructions */}
          {flavour === "docker" && (
            <div className="space-y-4">
              <div className="space-y-2">
                <p className="text-xs font-semibold text-foreground">
                  1. Quick start
                </p>
                <CodeBlock code={DOCKER_QUICKSTART} />
              </div>

              <div className="space-y-2">
                <p className="text-xs font-semibold text-foreground">
                  2. Or with Docker Compose
                </p>
                <p className="text-xs text-foreground-500">
                  Save as{" "}
                  <code className="font-mono bg-background-200 px-1 rounded">
                    docker-compose.yml
                  </code>{" "}
                  then run{" "}
                  <code className="font-mono bg-background-200 px-1 rounded">
                    docker compose up -d
                  </code>
                  .
                </p>
                <CodeBlock code={DOCKER_COMPOSE} language="yaml" />
              </div>

              <div className="space-y-2">
                <p className="text-xs font-semibold text-foreground">
                  3. Put it behind a reverse proxy (optional but recommended)
                </p>
                <p className="text-xs text-foreground-500">
                  PeerJS uses WebSocket upgrades — make sure your proxy forwards
                  the{" "}
                  <code className="font-mono bg-background-200 px-1 rounded">
                    Upgrade
                  </code>{" "}
                  header.
                </p>
                <CodeBlock code={DOCKER_NGINX} language="nginx" />
              </div>

              <div className="bg-primary-50 border border-primary-200 rounded-lg px-4 py-3 space-y-1.5">
                <p className="text-xs font-semibold text-primary-700">
                  4. Point this control plane at your server
                </p>
                <p className="text-xs text-primary-700/80">
                  Open the configuration panel above (⚙) and set the signaling
                  server URL to:
                </p>
                <code className="block text-xs font-mono bg-primary-100 border border-primary-200 rounded px-3 py-1.5 text-primary-800">
                  {internalUrl}
                </code>
                <p className="text-xs text-primary-700/70">
                  If you added a reverse proxy with TLS, use the{" "}
                  <code className="font-mono">https://</code> URL instead. Then
                  click Start.
                </p>
              </div>
            </div>
          )}

          {/* Kubernetes instructions */}
          {flavour === "kubernetes" && (
            <div className="space-y-4">
              <div className="space-y-2">
                <p className="text-xs font-semibold text-foreground">
                  1. Apply the manifest
                </p>
                <p className="text-xs text-foreground-500">
                  Save as{" "}
                  <code className="font-mono bg-background-200 px-1 rounded">
                    peerjs-server.yaml
                  </code>{" "}
                  and apply it.
                </p>
                <CodeBlock code={K8S_MANIFEST} language="yaml" />
              </div>

              <div className="space-y-2">
                <p className="text-xs font-semibold text-foreground">
                  2. Deploy and verify
                </p>
                <CodeBlock code={K8S_APPLY} />
              </div>

              <div className="space-y-2">
                <p className="text-xs font-semibold text-foreground">
                  3. Expose externally (optional)
                </p>
                <p className="text-xs text-foreground-500">
                  If the control plane runs <em>inside</em> the same cluster,
                  the ClusterIP service is enough and you can skip this step.
                  For external agents, add an Ingress:
                </p>
                <CodeBlock code={K8S_INGRESS} language="yaml" />
              </div>

              <div className="bg-primary-50 border border-primary-200 rounded-lg px-4 py-3 space-y-1.5">
                <p className="text-xs font-semibold text-primary-700">
                  4. Point this control plane at your server
                </p>
                <p className="text-xs text-primary-700/80">
                  Open the configuration panel above (⚙) and set the signaling
                  server URL. Use the internal cluster DNS if running in the
                  same cluster:
                </p>
                <code className="block text-xs font-mono bg-primary-100 border border-primary-200 rounded px-3 py-1.5 text-primary-800">
                  {internalUrl}
                </code>
                <p className="text-xs text-primary-700/70">
                  Or use your Ingress hostname (e.g.{" "}
                  <code className="font-mono">
                    https://peerjs.your-domain.com
                  </code>
                  ) for cross-cluster or external agents. Then click Start.
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
