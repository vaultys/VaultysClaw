package ingest

import (
	"encoding/json"
	"html/template"
	"log/slog"
	"net/http"
	"time"
)

// PendingInfo describes one connection whose handshake succeeded but
// whose DID isn't yet approved. Defined here (not in internal/vconn) so
// this package can expose/render pending state without importing vconn —
// vconn.Server implements PendingLister/Approver structurally instead.
type PendingInfo struct {
	DID       string    `json:"did"`
	FirstSeen time.Time `json:"firstSeen"`
}

// PendingLister lists connections awaiting operator approval.
type PendingLister interface {
	ListPending() []PendingInfo
}

// Approver approves or rejects a pending connection by DID.
type Approver interface {
	Approve(did string) error
	Reject(did string, reason string) error
}

// Server exposes the reference collector's HTTP surface: a read-only
// dashboard/API (devices, workloads, pending connections) plus whatever
// WebSocket handler the caller supplies for the actual VaultysId-
// authenticated connection (see internal/vconn).
type Server struct {
	store     *Store
	pending   PendingLister
	approver  Approver
	wsHandler http.HandlerFunc
	logger    *slog.Logger
	tmpl      *template.Template
}

func NewServer(store *Store, pending PendingLister, approver Approver, wsHandler http.HandlerFunc, logger *slog.Logger) *Server {
	if logger == nil {
		logger = slog.Default()
	}
	return &Server{
		store:     store,
		pending:   pending,
		approver:  approver,
		wsHandler: wsHandler,
		logger:    logger,
		tmpl:      template.Must(template.New("index").Parse(indexTemplate)),
	}
}

// Routes returns the collector's HTTP handler.
func (s *Server) Routes() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /ws", s.wsHandler)
	mux.HandleFunc("GET /v1/devices", s.handleDevices)
	mux.HandleFunc("GET /v1/workloads", s.handleWorkloads)
	mux.HandleFunc("GET /v1/pending", s.handlePendingList)
	mux.HandleFunc("POST /v1/pending/{did}/approve", s.handlePendingApprove)
	mux.HandleFunc("POST /v1/pending/{did}/reject", s.handlePendingReject)
	mux.HandleFunc("GET /", s.handleIndex)
	return mux
}

func (s *Server) handleDevices(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, s.store.ListDevices())
}

func (s *Server) handleWorkloads(w http.ResponseWriter, r *http.Request) {
	workloads := s.store.ListWorkloads()
	if status := r.URL.Query().Get("status"); status != "" {
		filtered := make([]*Workload, 0, len(workloads))
		for _, wl := range workloads {
			if wl.Status == status {
				filtered = append(filtered, wl)
			}
		}
		workloads = filtered
	}
	writeJSON(w, workloads)
}

func (s *Server) handlePendingList(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, s.pending.ListPending())
}

func (s *Server) handlePendingApprove(w http.ResponseWriter, r *http.Request) {
	did := r.PathValue("did")
	if err := s.approver.Approve(did); err != nil {
		s.logger.Warn("ingest: approve failed", "did", did, "error", err)
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}
	s.logger.Info("ingest: device approved", "did", did)
	w.WriteHeader(http.StatusOK)
}

func (s *Server) handlePendingReject(w http.ResponseWriter, r *http.Request) {
	did := r.PathValue("did")
	if err := s.approver.Reject(did, "rejected by operator"); err != nil {
		s.logger.Warn("ingest: reject failed", "did", did, "error", err)
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}
	s.logger.Info("ingest: device rejected", "did", did)
	w.WriteHeader(http.StatusOK)
}

func writeJSON(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(v)
}

func (s *Server) handleIndex(w http.ResponseWriter, r *http.Request) {
	data := struct {
		Devices   []*Device
		Workloads []*Workload
		Pending   []PendingInfo
	}{
		Devices:   s.store.ListDevices(),
		Workloads: s.store.ListWorkloads(),
		Pending:   s.pending.ListPending(),
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	if err := s.tmpl.Execute(w, data); err != nil {
		s.logger.Error("ingest: template render failed", "error", err)
	}
}

// indexTemplate is a dependency-free read-only view — no JS framework, no
// external assets, nothing to build. html/template auto-escapes every
// field, so process names/command lines (attacker-influenced, in
// principle) can't inject markup. Approve/Reject are plain HTML forms —
// no JS needed for basic operability.
const indexTemplate = `<!doctype html>
<html>
<head>
<title>vaultysclaw-sensor reference collector</title>
<style>
body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; margin: 2rem; color: #222; }
table { border-collapse: collapse; width: 100%; margin-bottom: 2.5rem; }
th, td { border: 1px solid #ddd; padding: 0.4rem 0.6rem; text-align: left; font-size: 0.85rem; vertical-align: top; }
th { background: #f5f5f5; }
.shadow { color: #b00020; font-weight: 600; }
.observed { color: #555; }
small { color: #777; }
form { display: inline; }
button { cursor: pointer; }
</style>
</head>
<body>
<p><em>Standalone reference collector — a demo backend proving the sensor's real VaultysId connection end-to-end, not a hardened multi-tenant system. See docs/vaultysclaw-integration.md for the intended production path.</em></p>

<h1>Pending approval ({{len .Pending}})</h1>
<table>
<tr><th>DID</th><th>First seen</th><th>Action</th></tr>
{{range .Pending}}<tr>
<td>{{.DID}}</td>
<td>{{.FirstSeen}}</td>
<td>
<form method="post" action="/v1/pending/{{.DID}}/approve"><button type="submit">Approve</button></form>
<form method="post" action="/v1/pending/{{.DID}}/reject"><button type="submit">Reject</button></form>
</td>
</tr>
{{end}}
</table>

<h1>Devices ({{len .Devices}})</h1>
<table>
<tr><th>DID</th><th>Hostname</th><th>OS</th><th>First seen</th><th>Last seen</th></tr>
{{range .Devices}}<tr><td>{{.ID}}</td><td>{{.Hostname}}</td><td>{{.OS}}</td><td>{{.FirstSeen}}</td><td>{{.LastSeen}}</td></tr>
{{end}}
</table>

<h1>Workloads ({{len .Workloads}})</h1>
<table>
<tr><th>Process</th><th>Provider</th><th>AI conf.</th><th>Agent conf.</th><th>Status</th><th>MCP servers</th><th>Reasons</th><th>Last seen</th></tr>
{{range .Workloads}}<tr>
<td>{{.ProcessName}}<br><small>{{.Command}}</small></td>
<td>{{.Provider}}</td>
<td>{{.AIConfidence}}</td>
<td>{{.AgentConfidence}}</td>
<td class="{{.Status}}">{{.Status}}</td>
<td>{{range .MCPServers}}{{.}}<br>{{end}}</td>
<td><small>{{range .Reasons}}{{.}}<br>{{end}}</small></td>
<td>{{.LastSeen}}</td>
</tr>
{{end}}
</table>
</body>
</html>
`
