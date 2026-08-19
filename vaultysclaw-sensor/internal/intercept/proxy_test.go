package intercept

import (
	"bufio"
	"fmt"
	"io"
	"net"
	"net/http"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/vaultys/VaultysClaw/sdk-go/authz"
	"github.com/vaultys/VaultysClaw/sdk-go/rules"
)

// testRecorder collects events so a test can assert on what the audit trail
// actually said, not just on the byte-level outcome.
type testRecorder struct {
	mu     sync.Mutex
	events []Event
}

func (r *testRecorder) Record(e Event) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.events = append(r.events, e)
}

func (r *testRecorder) all() []Event {
	r.mu.Lock()
	defer r.mu.Unlock()
	return append([]Event(nil), r.events...)
}

// echoServer stands in for an upstream: it echoes whatever it receives, so a
// test can prove bytes actually crossed an established tunnel.
func echoServer(t *testing.T) net.Listener {
	t.Helper()
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("echo listen: %v", err)
	}
	go func() {
		for {
			c, err := ln.Accept()
			if err != nil {
				return
			}
			go func() {
				defer c.Close()
				_, _ = io.Copy(c, c)
			}()
		}
	}()
	t.Cleanup(func() { _ = ln.Close() })
	return ln
}

func startProxy(t *testing.T, cfg Config, attributor Attributor) (*Proxy, *testRecorder) {
	t.Helper()
	rec := &testRecorder{}
	p := &Proxy{
		ConfigFor:  func() Config { return cfg },
		Recorder:   rec,
		Attributor: attributor,
	}
	if err := p.Listen("127.0.0.1:0"); err != nil {
		t.Fatalf("Listen: %v", err)
	}
	go func() { _ = p.Serve() }()
	t.Cleanup(func() { _ = p.Close() })
	return p, rec
}

// connect sends a CONNECT for target and returns the parsed response plus the
// live connection (so an established tunnel can be used).
func connect(t *testing.T, proxyAddr, target string) (*http.Response, net.Conn, *bufio.Reader) {
	t.Helper()
	c, err := net.DialTimeout("tcp", proxyAddr, 5*time.Second)
	if err != nil {
		t.Fatalf("dial proxy: %v", err)
	}
	if _, err := fmt.Fprintf(c, "CONNECT %s HTTP/1.1\r\nHost: %s\r\n\r\n", target, target); err != nil {
		t.Fatalf("write CONNECT: %v", err)
	}
	br := bufio.NewReader(c)
	resp, err := http.ReadResponse(br, nil)
	if err != nil {
		t.Fatalf("read response: %v", err)
	}
	return resp, c, br
}

func openInternetCfg() Config {
	return Config{
		Certs: []authz.Certificate{{
			ID:           "cert-1",
			AgentDID:     "did:vaultys:proxy",
			Capabilities: []authz.Capability{authz.CapInternetAccess},
			Status:       authz.StatusActive,
			IssuedAt:     time.Now().Add(-time.Hour).UnixMilli(),
		}},
		SyncedAt: time.Now(),
	}
}

func TestAllowedRequestTunnelsBytesEndToEnd(t *testing.T) {
	upstream := echoServer(t)
	p, rec := startProxy(t, openInternetCfg(), nil)

	resp, conn, br := connect(t, p.Addr().String(), upstream.Addr().String())
	defer conn.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, want 200", resp.StatusCode)
	}

	// Prove the tunnel actually carries data, rather than merely returning 200.
	if _, err := conn.Write([]byte("ping\n")); err != nil {
		t.Fatalf("write through tunnel: %v", err)
	}
	line, err := br.ReadString('\n')
	if err != nil {
		t.Fatalf("read through tunnel: %v", err)
	}
	if line != "ping\n" {
		t.Errorf("echoed %q, want %q", line, "ping\n")
	}

	events := rec.all()
	if len(events) != 1 {
		t.Fatalf("recorded %d events, want 1", len(events))
	}
	// §5.2.1: an allow is as much an audit record as a denial.
	if !events[0].Allowed || events[0].CertID != "cert-1" || events[0].Reason == "" {
		t.Errorf("event = %+v", events[0])
	}
	if events[0].ClientAddr == "" {
		t.Error("event has no ClientAddr — the socket tuple §5's correlation needs is missing")
	}
}

func TestDeniedRequestGets403WithTheReason(t *testing.T) {
	upstream := echoServer(t)
	cfg := openInternetCfg()
	cfg.Rules = &rules.Set{Rules: []rules.Rule{
		{ID: "deny-all", Subject: rules.SubjectAny, Hosts: []string{"127.0.0.1"}, Effect: rules.EffectDeny},
	}}
	p, rec := startProxy(t, cfg, nil)

	resp, conn, _ := connect(t, p.Addr().String(), upstream.Addr().String())
	defer conn.Close()
	if resp.StatusCode != http.StatusForbidden {
		t.Fatalf("status = %d, want 403", resp.StatusCode)
	}
	body, _ := io.ReadAll(resp.Body)
	if !strings.Contains(string(body), "deny-all") {
		t.Errorf("body = %q, want it to name the rule", body)
	}

	events := rec.all()
	if len(events) != 1 || events[0].Allowed || events[0].RuleID != "deny-all" {
		t.Errorf("events = %+v", events)
	}
}

func TestNonConnectMethodsAreRefusedNotHalfSupported(t *testing.T) {
	// The G1 lesson: an absolute-form GET is a different mode, and
	// half-supporting it is how a rule-matching bypass appears. Refuse plainly.
	p, _ := startProxy(t, openInternetCfg(), nil)

	for _, line := range []string{
		"GET http://evil.example/ HTTP/1.1\r\nHost: evil.example\r\n\r\n",
		"GET //evil.example/x HTTP/1.1\r\nHost: evil.example\r\n\r\n",
		"POST http://evil.example/ HTTP/1.1\r\nHost: evil.example\r\nContent-Length: 0\r\n\r\n",
	} {
		c, err := net.Dial("tcp", p.Addr().String())
		if err != nil {
			t.Fatalf("dial: %v", err)
		}
		if _, err := io.WriteString(c, line); err != nil {
			t.Fatalf("write: %v", err)
		}
		resp, err := http.ReadResponse(bufio.NewReader(c), nil)
		if err != nil {
			t.Fatalf("read response: %v", err)
		}
		if resp.StatusCode == http.StatusOK {
			t.Errorf("request %q was accepted with 200", strings.SplitN(line, "\r\n", 2)[0])
		}
		_ = c.Close()
	}
}

func TestMalformedConnectTargetsAreRejected(t *testing.T) {
	p, _ := startProxy(t, openInternetCfg(), nil)

	for _, target := range []string{
		"example.com",       // no port
		"example.com:",      // empty port
		"example.com:0",     // port 0
		"example.com:99999", // port out of range
		"example.com:https", // non-numeric port
		":443",              // no host
	} {
		c, err := net.Dial("tcp", p.Addr().String())
		if err != nil {
			t.Fatalf("dial: %v", err)
		}
		fmt.Fprintf(c, "CONNECT %s HTTP/1.1\r\nHost: %s\r\n\r\n", target, target)
		resp, err := http.ReadResponse(bufio.NewReader(c), nil)
		if err != nil {
			t.Fatalf("target %q: read response: %v", target, err)
		}
		if resp.StatusCode != http.StatusBadRequest {
			t.Errorf("target %q: status = %d, want 400", target, resp.StatusCode)
		}
		_ = c.Close()
	}
}

func TestParseAuthorityAcceptsIPv6AndNormalisesHosts(t *testing.T) {
	got, err := parseAuthority("[2606:4700::1111]:443")
	if err != nil {
		t.Fatalf("IPv6 authority: %v", err)
	}
	if got.Host != "2606:4700::1111" || got.Port != 443 {
		t.Errorf("dest = %+v", got)
	}

	// A fully-qualified name's trailing root dot must not create a second,
	// differently-spelled destination that rules would miss.
	got, err = parseAuthority("api.openai.com.:443")
	if err != nil {
		t.Fatalf("FQDN authority: %v", err)
	}
	if got.Host != "api.openai.com" {
		t.Errorf("host = %q, want the trailing dot stripped", got.Host)
	}
}

func TestOversizedPreambleIsRejected(t *testing.T) {
	// G10: no unbounded reads on the request path.
	p, _ := startProxy(t, openInternetCfg(), nil)

	c, err := net.Dial("tcp", p.Addr().String())
	if err != nil {
		t.Fatalf("dial: %v", err)
	}
	defer c.Close()

	fmt.Fprintf(c, "CONNECT example.com:443 HTTP/1.1\r\nHost: example.com\r\n")
	// A header far larger than maxPreamble. The proxy must refuse rather than
	// buffer it.
	fmt.Fprintf(c, "X-Filler: %s\r\n\r\n", strings.Repeat("A", maxPreamble*2))

	_ = c.SetReadDeadline(time.Now().Add(5 * time.Second))
	resp, err := http.ReadResponse(bufio.NewReader(c), nil)
	if err != nil {
		// A dropped connection is an acceptable refusal too.
		return
	}
	if resp.StatusCode == http.StatusOK {
		t.Error("an oversized preamble was accepted with 200")
	}
}

// stubAttributor reports a fixed attribution, standing in for the observe role.
type stubAttributor struct {
	result *rules.Attribution
	calls  int
	mu     sync.Mutex
}

func (s *stubAttributor) Attribute(net.Addr) *rules.Attribution {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.calls++
	return s.result
}

func (s *stubAttributor) callCount() int {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.calls
}

func TestAttributionIsResolvedLazily(t *testing.T) {
	upstream := echoServer(t)

	// A rule set of subject:any rules must never trigger a socket lookup —
	// that laziness is the §5.2 property that keeps the common case cheap.
	anyOnly := openInternetCfg()
	anyOnly.Rules = &rules.Set{Rules: []rules.Rule{
		{ID: "deny-openai", Subject: rules.SubjectAny, Hosts: []string{".openai.com"}, Effect: rules.EffectDeny},
	}}
	attr := &stubAttributor{result: &rules.Attribution{IsGovernedAgent: true}}
	p, _ := startProxy(t, anyOnly, attr)

	_, conn, _ := connect(t, p.Addr().String(), upstream.Addr().String())
	conn.Close()
	if attr.callCount() != 0 {
		t.Errorf("attributor was called %d times for a subject:any-only rule set", attr.callCount())
	}

	// A subject-scoped rule matching this destination does trigger it.
	scoped := openInternetCfg()
	scoped.Rules = &rules.Set{Rules: []rules.Rule{
		{ID: "agents-deny", Subject: rules.SubjectAgent, Hosts: []string{"127.0.0.1"}, Effect: rules.EffectDeny},
	}}
	attr2 := &stubAttributor{result: &rules.Attribution{IsGovernedAgent: true}}
	p2, rec2 := startProxy(t, scoped, attr2)

	resp, conn2, _ := connect(t, p2.Addr().String(), upstream.Addr().String())
	defer conn2.Close()
	if attr2.callCount() != 1 {
		t.Errorf("attributor called %d times, want 1", attr2.callCount())
	}
	if resp.StatusCode != http.StatusForbidden {
		t.Errorf("status = %d, want 403 for a governed agent under a deny rule", resp.StatusCode)
	}
	if events := rec2.all(); len(events) != 1 || events[0].AttributionMissing {
		t.Errorf("events = %+v", events)
	}
}

func TestAttributionMissPassesButIsRecorded(t *testing.T) {
	upstream := echoServer(t)
	cfg := openInternetCfg()
	cfg.Rules = &rules.Set{Rules: []rules.Rule{
		{ID: "agents-deny", Subject: rules.SubjectAgent, Hosts: []string{"127.0.0.1"}, Effect: rules.EffectDeny},
	}}
	// An attributor that cannot resolve the socket: the §5.2 fail-open.
	p, rec := startProxy(t, cfg, &stubAttributor{result: nil})

	resp, conn, _ := connect(t, p.Addr().String(), upstream.Addr().String())
	defer conn.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, want 200 — an unresolvable subject must fail open", resp.StatusCode)
	}

	events := rec.all()
	if len(events) != 1 {
		t.Fatalf("recorded %d events, want 1", len(events))
	}
	if !events[0].AttributionMissing {
		t.Error("AttributionMissing = false — the ungoverned pass was recorded as a clean one")
	}
}

func TestUnreachableUpstreamIsDistinguishedFromADenial(t *testing.T) {
	// An allowed request that never reached its upstream is not a denial, and
	// conflating them would misreport what enforcement actually did.
	p, rec := startProxy(t, openInternetCfg(), nil)

	// Port 1 on loopback: allowed by the certificate, nothing listening.
	resp, conn, _ := connect(t, p.Addr().String(), "127.0.0.1:1")
	defer conn.Close()
	if resp.StatusCode != http.StatusBadGateway {
		t.Fatalf("status = %d, want 502", resp.StatusCode)
	}

	events := rec.all()
	if len(events) != 1 {
		t.Fatalf("recorded %d events, want 1", len(events))
	}
	if !events[0].Allowed {
		t.Error("the event says the request was denied; it was allowed and then failed to connect")
	}
	if events[0].Error == "" {
		t.Error("the transport failure was not recorded")
	}
}
