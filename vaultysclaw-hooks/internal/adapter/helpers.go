package adapter

import (
	"bufio"
	"encoding/json"
	"strings"
)

// Helpers for adapters whose harness documents tool arguments loosely. Each
// errs towards *more* decisions: a missed path is an undecided action, an
// over-read one only adds a check.

// FirstString returns the first non-blank string among keys in m.
func FirstString(m map[string]any, keys ...string) string {
	for _, k := range keys {
		if s, ok := m[k].(string); ok && strings.TrimSpace(s) != "" {
			return s
		}
	}
	return ""
}

// Object decodes tool arguments that a harness may send either as a JSON
// object or as a JSON string containing one. Absent arguments are an empty map.
func Object(raw json.RawMessage) (map[string]any, error) {
	out := map[string]any{}
	if len(raw) == 0 || string(raw) == "null" {
		return out, nil
	}
	var s string
	if json.Unmarshal(raw, &s) == nil {
		if strings.TrimSpace(s) == "" {
			return out, nil
		}
		raw = json.RawMessage(s)
	}
	if err := json.Unmarshal(raw, &out); err != nil {
		return nil, err
	}
	return out, nil
}

// JSON encodes v, which must be encodable.
func JSON(v any) json.RawMessage {
	b, _ := json.Marshal(v)
	return b
}

// FileInput is the canonical input of a file tool.
func FileInput(path string) json.RawMessage { return JSON(map[string]string{"file_path": path}) }

// PatchPaths lists every path an OpenAI-style apply_patch envelope touches, in
// order, without duplicates: added, updated, deleted, and move destinations.
//
// Deliberately more lenient than the harnesses' own parsers (surrounding
// whitespace is ignored): a marker this misses but the harness accepts would
// be an undecided write, while one this over-reads only adds a decision.
func PatchPaths(patch string) []string {
	prefixes := []string{"*** Add File: ", "*** Update File: ", "*** Delete File: ", "*** Move to: "}
	seen := map[string]bool{}
	var out []string
	sc := bufio.NewScanner(strings.NewReader(patch))
	sc.Buffer(make([]byte, 0, 64*1024), 8*1024*1024)
	for sc.Scan() {
		line := strings.TrimSpace(sc.Text())
		for _, pre := range prefixes {
			if strings.HasPrefix(line, pre) {
				if path := strings.TrimSpace(strings.TrimPrefix(line, pre)); path != "" && !seen[path] {
					seen[path] = true
					out = append(out, path)
				}
			}
		}
	}
	return out
}
