// Package detector implements deterministic, explainable AI/agent
// classification over a correlation.Observation. No LLM is involved
// anywhere in this package — every score traces back to a fixed,
// documented rule and carries a human-readable reason.
package detector

import "math"

// Weight tiers for detection signals, per the design spec's
// strong/medium/weak signal classes.
const (
	WeightStrong = 0.9
	WeightMedium = 0.55
	WeightWeak   = 0.2
)

// Signal is one piece of evidence contributing to a confidence score.
type Signal struct {
	Weight float64
	Reason string
}

// Combine reduces a set of signals to a single confidence in [0,1] via a
// noisy-OR: confidence = 1 - product(1 - weight). This is deterministic,
// monotonically increases as more independent evidence stacks (matching
// the spec's "python repeatedly calling OpenAI -> very high" style
// examples), and never needs an arbitrary clamp since each factor is
// already in [0,1].
func Combine(signals []Signal) (float64, []string) {
	if len(signals) == 0 {
		return 0, nil
	}
	product := 1.0
	reasons := make([]string, 0, len(signals))
	for _, s := range signals {
		w := s.Weight
		if w < 0 {
			w = 0
		}
		if w > 1 {
			w = 1
		}
		product *= 1 - w
		reasons = append(reasons, s.Reason)
	}
	return round2(1 - product), reasons
}

func round2(v float64) float64 {
	return math.Round(v*100) / 100
}
