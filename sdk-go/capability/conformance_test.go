package capability

import (
	"encoding/json"
	"os"
	"testing"
)

const vectorsPath = "../../conformance/capability-names.json"

// The shared table both this package and packages/policy run. A name accepted
// here and rejected there (or the reverse) means one implementation would let a
// deployment register a capability the other can never resolve.
type nameVectors struct {
	Version int `json:"version"`
	Cases   []struct {
		Name  string `json:"name"`
		Valid bool   `json:"valid"`
		Why   string `json:"$why"`
	} `json:"cases"`
}

func loadVectors(t *testing.T) nameVectors {
	t.Helper()
	raw, err := os.ReadFile(vectorsPath)
	if err != nil {
		t.Fatalf("reading %s: %v", vectorsPath, err)
	}
	var v nameVectors
	if err := json.Unmarshal(raw, &v); err != nil {
		t.Fatalf("parsing %s: %v", vectorsPath, err)
	}
	if v.Version != 1 {
		t.Fatalf("unsupported vectors version %d", v.Version)
	}
	if len(v.Cases) == 0 {
		t.Fatal("no cases in the shared table — a silently empty suite proves nothing")
	}
	return v
}

func TestCustomNameConformance(t *testing.T) {
	v := loadVectors(t)
	for _, c := range v.Cases {
		t.Run(c.Name, func(t *testing.T) {
			if got := IsCustom(c.Name); got != c.Valid {
				t.Errorf("IsCustom(%q) = %v, want %v (%s)", c.Name, got, c.Valid, c.Why)
			}
		})
	}
}

func TestBuiltinsAreNeverCustom(t *testing.T) {
	for _, b := range Builtins {
		if IsCustom(b) {
			t.Errorf("built-in %q must not be a custom name — no built-in contains a colon", b)
		}
		if !IsValid(b) {
			t.Errorf("built-in %q must be a valid capability name", b)
		}
	}
}

func TestFilterAgainstRegistry(t *testing.T) {
	registry := map[string]struct{}{
		"acme:invoice.approve": {},
		"acme:invoice.read":    {},
	}

	tests := []struct {
		name string
		in   []string
		want []string
	}{
		{"built-ins pass through untouched", []string{"file_access", "api_call"}, []string{"file_access", "api_call"}},
		{"a registered custom name is kept", []string{"acme:invoice.approve"}, []string{"acme:invoice.approve"}},
		{"an unregistered custom name is dropped", []string{"acme:invoice.delete"}, []string{}},
		{"order is preserved through a mixed set",
			[]string{"api_call", "acme:invoice.delete", "acme:invoice.read"},
			[]string{"api_call", "acme:invoice.read"}},
		{"a malformed name is dropped", []string{"acme:", "nonsense", ""}, []string{}},
		{"case variants do not match a registered name", []string{"ACME:invoice.approve"}, []string{}},
		{"empty input yields empty output", []string{}, []string{}},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := FilterAgainstRegistry(tc.in, registry)
			if len(got) != len(tc.want) {
				t.Fatalf("got %v, want %v", got, tc.want)
			}
			for i := range got {
				if got[i] != tc.want[i] {
					t.Fatalf("got %v, want %v", got, tc.want)
				}
			}
		})
	}
}

// A malformed name must stay unresolvable even if a registry row were corrupted
// by hand to contain it — the grammar check comes first, deliberately.
func TestMalformedNameIsDroppedEvenIfRegistered(t *testing.T) {
	registry := map[string]struct{}{"acme:": {}}
	if got := FilterAgainstRegistry([]string{"acme:"}, registry); len(got) != 0 {
		t.Errorf("got %v, want []", got)
	}
}
