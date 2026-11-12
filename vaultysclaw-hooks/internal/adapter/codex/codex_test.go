package codex

import (
	"reflect"
	"testing"
)

func TestPatchPaths(t *testing.T) {
	patch := "*** Begin Patch\r\n" +
		"*** Update File: a.go\n@@\n-x\n+y\n" +
		"*** Update File: old.go\n*** Move to: new.go\n" +
		"  *** Delete File: gone.go  \n" +
		"*** Add File: a.go\n+dup\n" +
		"*** End Patch\n"
	want := []string{"a.go", "old.go", "new.go", "gone.go"}
	if got := PatchPaths(patch); !reflect.DeepEqual(got, want) {
		t.Fatalf("PatchPaths = %v, want %v (move destination included, duplicates once)", got, want)
	}
	if got := PatchPaths("+*** Add File: smuggled\n"); len(got) != 0 {
		t.Fatalf("a marker inside an added line is content, not a target: %v", got)
	}
}
