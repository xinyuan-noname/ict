package service

import (
	"context"
	"errors"
	"testing"
)

type fakePlanGenerator struct {
	outputs []string
	calls   int
	err     error
}

func (f *fakePlanGenerator) GenerateJSON(context.Context, string, string) (string, error) {
	if f.err != nil {
		return "", f.err
	}
	if f.calls >= len(f.outputs) {
		return "", errors.New("no output")
	}
	out := f.outputs[f.calls]
	f.calls++
	return out, nil
}

const validPlanJSON = `{
  "title": "备考",
  "icon": "📚",
  "description": "每天推进一点",
  "skills": [
    {
      "name": "阅读",
      "icon": "📖",
      "unit": "页",
      "series": [
        {
          "id": "reading_main",
          "name": "阅读",
          "desc": "阅读累计达到 {need} 页",
          "icon": "📖",
          "start": 10,
          "end": 300,
          "steps": 5,
          "pointsStart": 20,
          "pointsEnd": 60
        }
      ]
    }
  ]
}`

func TestCustomPlanGenerate(t *testing.T) {
	gen := &fakePlanGenerator{outputs: []string{validPlanJSON}}
	svc := &CustomPlanService{Generator: gen}
	plan, err := svc.Generate(context.Background(), "每天读一点书")
	if err != nil {
		t.Fatalf("Generate: %v", err)
	}
	if plan.Title != "备考" || len(plan.Skills) != 1 || plan.Skills[0].Series[0].ID != "reading_main" {
		t.Fatalf("unexpected plan: %+v", plan)
	}
}

func TestCustomPlanRetriesInvalidJSON(t *testing.T) {
	gen := &fakePlanGenerator{outputs: []string{"not json", validPlanJSON}}
	svc := &CustomPlanService{Generator: gen}
	if _, err := svc.Generate(context.Background(), "读书"); err != nil {
		t.Fatalf("Generate after retry: %v", err)
	}
	if gen.calls != 2 {
		t.Fatalf("expected 2 calls, got %d", gen.calls)
	}
}

func TestCustomPlanRejectsEmptyNeed(t *testing.T) {
	svc := &CustomPlanService{Generator: &fakePlanGenerator{outputs: []string{validPlanJSON}}}
	if _, err := svc.Generate(context.Background(), " "); err == nil {
		t.Fatal("expected error for empty need")
	}
}
