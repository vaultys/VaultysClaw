package intercept

import (
	"bufio"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/vaultys/vaultysclaw-sensor/internal/rules"
)

const (
	// maxPreamble bounds the CONNECT request line plus headers. The earlier
	// proxy implementation read request bodies with no limit at all, which is a
	// plain denial of service (G10); a tunnel preamble needs kilobytes, so
	// anything larger is either broken or hostile.
	maxPreamble = 8 << 10
	// preambleTimeout bounds how long a client may take to send that preamble,
	// so an idle or slowloris connection cannot hold a slot indefinitely.
	preambleTimeout = 10 * time.Second
	// dialTimeout bounds the upstream connection attempt.
	dialTimeout = 15 * time.Second
)

// Event is one audit record. Emitted for *every* decision including passes —
// §5.2.1 is explicit that a silent pass-through is the one outcome this design
// cannot afford, so an allow is as much a record as a denial.
type Event struct {
	At          time.Time `json:"at"`
	Destination string    `json:"destination"`
	Allowed     bool      `json:"allowed"`
	Reason      string    `json:"reason,omitempty"`
	RuleID      string    `json:"ruleId,omitempty"`
	CertID      string    `json:"certId,omitempty"`
	// AttributionMissing marks an ungoverned pass under §5.2's fail-open, so the
	// coverage gap is countable rather than invisible.
	AttributionMissing bool `json:"attributionMissing,omitempty"`
	// RawIPDestination marks a destination hostname rules could not cover.
	RawIPDestination bool `json:"rawIpDestination,omitempty"`
	// ClientAddr is the local socket the request arrived on. In `system` mode
	// this is the loopback tuple the observe role joins against a PID (§5) —
	// recorded even in `explicit` mode so the audit shape does not change
	// between deployment modes.
	ClientAddr string `json:"clientAddr,omitempty"`
	// Error records a transport failure after an allow decision. An allowed
	// request that never reached its upstream is not the same as a denied one,
	// and conflating them would misreport enforcement.
	Error string `json:"error,omitempty"`
	// SpoolGap is how many events were lost immediately before this one, set by
	// the recorder rather than the request path. A gap marker travels in the
	// same stream as the events it interrupts so the hole is visible to whoever
	// reads the audit trail — a drop counter in a metrics endpoint nobody reads
	// is the same as a silent drop (§5.2.1).
	SpoolGap int `json:"spoolGap,omitempty"`
}

// Recorder receives audit events. Implementations must not block the request
// path for long and must never drop an event silently — see FileSpool.
type Recorder interface {
	Record(Event)
}

// Attributor resolves which process owns a local socket, for subject-scoped
// rules (§5). Nil in `explicit` mode, where every caller was pointed here
// deliberately and there is nothing to attribute (§5.2.3).
//
// Returning nil means "could not determine", which Decide treats as an audited
// fail-open — never as "not an agent".
type Attributor interface {
	Attribute(clientAddr net.Addr) *rules.Attribution
}

// Proxy is the tier-1 CONNECT listener.
type Proxy struct {
	// ConfigFor supplies the current decision inputs. A function rather than a
	// value so a config push takes effect on the next request without
	// restarting the listener or locking anything here.
	ConfigFor func() Config
	Recorder  Recorder
	// Attributor is optional; see the interface.
	Attributor Attributor
	// IdleTimeout bounds how long an established tunnel may sit idle. Zero
	// leaves tunnels open indefinitely, which is what long-lived streaming
	// connections need.
	IdleTimeout time.Duration

	listener net.Listener
	wg       sync.WaitGroup
	closing  chan struct{}
	once     sync.Once
}

// Listen binds the proxy to addr. Serve then accepts until Close.
func (p *Proxy) Listen(addr string) error {
	ln, err := net.Listen("tcp", addr)
	if err != nil {
		return fmt.Errorf("intercept: listening on %s: %w", addr, err)
	}
	p.listener = ln
	p.closing = make(chan struct{})
	return nil
}

// Addr returns the bound address, useful when Listen was given port 0.
func (p *Proxy) Addr() net.Addr {
	if p.listener == nil {
		return nil
	}
	return p.listener.Addr()
}

// Serve accepts connections until Close. It returns nil on a clean shutdown.
func (p *Proxy) Serve() error {
	for {
		conn, err := p.listener.Accept()
		if err != nil {
			select {
			case <-p.closing:
				return nil
			default:
			}
			// A single failed accept is not a reason to stop serving every
			// other client.
			if ne, ok := err.(net.Error); ok && ne.Timeout() {
				continue
			}
			return fmt.Errorf("intercept: accept: %w", err)
		}
		p.wg.Add(1)
		go func() {
			defer p.wg.Done()
			p.handle(conn)
		}()
	}
}

// Close stops accepting and waits for in-flight connections to finish.
func (p *Proxy) Close() error {
	var err error
	p.once.Do(func() {
		close(p.closing)
		err = p.listener.Close()
	})
	p.wg.Wait()
	return err
}

func (p *Proxy) handle(client net.Conn) {
	defer client.Close()

	if err := client.SetReadDeadline(time.Now().Add(preambleTimeout)); err != nil {
		return
	}

	// http.ReadRequest parses the authority-form target of a CONNECT correctly,
	// including header edge cases. Using it rather than splitting the request
	// line by hand is deliberate: the earlier implementation's worst finding
	// (G1) came from resolving a client-supplied target with string and URL
	// operations that accepted forms it never intended to handle.
	br := bufio.NewReaderSize(io.LimitReader(client, maxPreamble), maxPreamble)
	req, err := http.ReadRequest(br)
	if err != nil {
		writeStatus(client, http.StatusBadRequest, "malformed request")
		return
	}

	if req.Method != http.MethodConnect {
		// Only tunnels are served here. An absolute-form GET is a different
		// mode with different semantics, and half-supporting it is exactly how
		// a rule-matching bypass appears — refuse it plainly instead.
		writeStatus(client, http.StatusMethodNotAllowed,
			"this proxy serves CONNECT tunnels only; tier-1 interception does not proxy plaintext HTTP")
		return
	}

	dest, err := parseAuthority(req.Host)
	if err != nil {
		writeStatus(client, http.StatusBadRequest, err.Error())
		return
	}

	// Clear the preamble deadline: the tunnel's own timeouts take over.
	if err := client.SetReadDeadline(time.Time{}); err != nil {
		return
	}

	var attribution *rules.Attribution
	cfg := p.ConfigFor()
	// Attribution is resolved lazily — only if the rule set has a
	// subject-scoped rule that could match this destination (§5.2).
	if p.Attributor != nil && cfg.Rules != nil && needsAttribution(cfg.Rules, dest) {
		attribution = p.Attributor.Attribute(client.RemoteAddr())
	}

	now := time.Now()
	out := Decide(cfg, dest, attribution, now)

	event := Event{
		At:                 now,
		Destination:        dest.String(),
		Allowed:            out.Allowed,
		Reason:             out.Reason,
		RuleID:             out.RuleID,
		CertID:             out.GrantingCertID,
		AttributionMissing: out.AttributionMissing,
		RawIPDestination:   out.RawIPDestination,
	}
	if client.RemoteAddr() != nil {
		event.ClientAddr = client.RemoteAddr().String()
	}

	if !out.Allowed {
		p.record(event)
		// 403 with the reason in the body: an agent's operator needs to be able
		// to see why, and a bare refusal produces support tickets instead of
		// understanding.
		writeStatus(client, http.StatusForbidden, out.Reason)
		return
	}

	upstream, err := net.DialTimeout("tcp", dest.String(), dialTimeout)
	if err != nil {
		event.Error = err.Error()
		p.record(event)
		writeStatus(client, http.StatusBadGateway, "upstream unreachable")
		return
	}
	defer upstream.Close()

	if _, err := client.Write([]byte("HTTP/1.1 200 Connection Established\r\n\r\n")); err != nil {
		event.Error = err.Error()
		p.record(event)
		return
	}
	p.record(event)

	// Anything the client pipelined after the CONNECT preamble is already in
	// br's buffer and must be forwarded, or the first bytes of the TLS
	// handshake would be dropped.
	if n := br.Buffered(); n > 0 {
		if buffered, err := br.Peek(n); err == nil {
			if _, err := upstream.Write(buffered); err != nil {
				return
			}
		}
	}

	p.tunnel(client, upstream)
}

// tunnel copies bytes both ways until either side closes. Tier 1 never inspects
// the stream — that is the whole point of not holding a CA.
func (p *Proxy) tunnel(client, upstream net.Conn) {
	done := make(chan struct{}, 2)
	copyOne := func(dst, src net.Conn) {
		defer func() { done <- struct{}{} }()
		if p.IdleTimeout > 0 {
			_ = src.SetReadDeadline(time.Now().Add(p.IdleTimeout))
		}
		_, _ = io.Copy(dst, readTimeoutConn{src, p.IdleTimeout})
		// Half-close so the peer observes EOF rather than waiting on a
		// connection the other direction still holds open.
		if cw, ok := dst.(interface{ CloseWrite() error }); ok {
			_ = cw.CloseWrite()
		}
	}
	go copyOne(upstream, client)
	go copyOne(client, upstream)

	select {
	case <-done:
	case <-p.closing:
	}
}

// readTimeoutConn refreshes the read deadline on every successful read, turning
// a fixed deadline into an idle timeout.
type readTimeoutConn struct {
	net.Conn
	idle time.Duration
}

func (c readTimeoutConn) Read(b []byte) (int, error) {
	if c.idle > 0 {
		if err := c.Conn.SetReadDeadline(time.Now().Add(c.idle)); err != nil {
			return 0, err
		}
	}
	return c.Conn.Read(b)
}

func (p *Proxy) record(e Event) {
	if p.Recorder != nil {
		p.Recorder.Record(e)
	}
}

// needsAttribution reports whether any subject-scoped rule could match dest, so
// the socket lookup happens only when its answer can change the decision.
func needsAttribution(set *rules.Set, dest rules.Destination) bool {
	for _, r := range set.Rules {
		if !r.Subject.NeedsAttribution() {
			continue
		}
		for _, h := range r.Hosts {
			if rules.MatchHost(h, dest.Host) {
				return true
			}
		}
	}
	return false
}

// parseAuthority parses a CONNECT target's authority into a destination.
//
// Strict on purpose: a missing port, a non-numeric port, a port outside 1–65535,
// or an empty host is refused rather than defaulted. A proxy that guesses at a
// malformed target is a proxy whose rules can be addressed around.
func parseAuthority(authority string) (rules.Destination, error) {
	if authority == "" {
		return rules.Destination{}, errors.New("CONNECT target is empty")
	}
	host, portStr, err := net.SplitHostPort(authority)
	if err != nil {
		return rules.Destination{}, fmt.Errorf("CONNECT target %q is not host:port", authority)
	}
	host = strings.TrimSuffix(strings.TrimSpace(host), ".")
	if host == "" {
		return rules.Destination{}, errors.New("CONNECT target has an empty host")
	}
	port, err := strconv.Atoi(portStr)
	if err != nil || port < 1 || port > 65535 {
		return rules.Destination{}, fmt.Errorf("CONNECT target has an invalid port %q", portStr)
	}
	return rules.Destination{Host: host, Port: port}, nil
}

func writeStatus(w io.Writer, code int, body string) {
	fmt.Fprintf(w,
		"HTTP/1.1 %d %s\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Length: %d\r\nConnection: close\r\n\r\n%s",
		code, http.StatusText(code), len(body)+1, body+"\n",
	)
}
