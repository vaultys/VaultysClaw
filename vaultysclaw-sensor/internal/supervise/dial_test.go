package supervise

import (
	"net"
	"time"
)

func dialUnix(path string) (net.Conn, error) {
	return net.DialTimeout("unix", path, 2*time.Second)
}
