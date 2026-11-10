package domain

import (
	"regexp"
	"strings"
)

// GeneratedPlan 是用户通过自然语言生成的清单。
// 一级标题即 Plan.Title；二级标题即 Skills[].Name。
type GeneratedPlan struct {
	Title       string           `json:"title"`
	Icon        string           `json:"icon"`
	Description string           `json:"description"`
	Skills      []GeneratedSkill `json:"skills"`
}

type GeneratedSkill struct {
	Name   string            `json:"name"`
	Icon   string            `json:"icon"`
	Unit   string            `json:"unit"`
	Series []GeneratedSeries `json:"series"`
}

// GeneratedSeries 只描述成就区间；具体阈值由客户端用同一套对数插值生成。
type GeneratedSeries struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Desc        string `json:"desc"`
	Icon        string `json:"icon"`
	Start       int    `json:"start"`
	End         int    `json:"end"`
	Steps       int    `json:"steps"`
	PointsStart int    `json:"pointsStart"`
	PointsEnd   int    `json:"pointsEnd"`
}

var generatedIDPattern = regexp.MustCompile(`^[a-z][a-z0-9_]{0,31}$`)

func ValidGeneratedID(s string) bool {
	return generatedIDPattern.MatchString(s)
}

func cleanGeneratedText(s string, maxRunes int) string {
	s = strings.TrimSpace(s)
	runes := []rune(s)
	if len(runes) > maxRunes {
		s = string(runes[:maxRunes])
	}
	return s
}

// NormalizeGeneratedPlan 清洗模型输出并做硬性约束；返回 false 时调用方应重试或报错。
func NormalizeGeneratedPlan(plan *GeneratedPlan) bool {
	if plan == nil {
		return false
	}
	plan.Title = cleanGeneratedText(plan.Title, 24)
	plan.Icon = cleanGeneratedText(plan.Icon, 8)
	plan.Description = cleanGeneratedText(plan.Description, 80)
	if plan.Title == "" || len([]rune(plan.Title)) < 2 || len(plan.Skills) == 0 || len(plan.Skills) > 4 {
		return false
	}
	if plan.Icon == "" {
		plan.Icon = "✨"
	}
	seenSkill := map[string]bool{}
	for si := range plan.Skills {
		skill := &plan.Skills[si]
		skill.Name = cleanGeneratedText(skill.Name, 16)
		skill.Icon = cleanGeneratedText(skill.Icon, 8)
		skill.Unit = cleanGeneratedText(skill.Unit, 8)
		if skill.Name == "" || skill.Unit == "" || len(skill.Series) == 0 || len(skill.Series) > 4 {
			return false
		}
		if skill.Icon == "" {
			skill.Icon = "🎯"
		}
		if seenSkill[skill.Name] {
			return false
		}
		seenSkill[skill.Name] = true
		seenSeries := map[string]bool{}
		for xi := range skill.Series {
			series := &skill.Series[xi]
			series.ID = strings.ToLower(cleanGeneratedText(series.ID, 32))
			if !ValidGeneratedID(series.ID) {
				return false
			}
			series.Name = cleanGeneratedText(series.Name, 24)
			series.Desc = cleanGeneratedText(series.Desc, 60)
			series.Icon = cleanGeneratedText(series.Icon, 8)
			if series.Name == "" || series.Desc == "" {
				return false
			}
			if series.Icon == "" {
				series.Icon = skill.Icon
			}
			if series.Start < 1 || series.End <= series.Start || series.Steps < 3 || series.Steps > 8 {
				return false
			}
			if series.PointsStart <= 0 {
				series.PointsStart = 20
			}
			if series.PointsEnd <= series.PointsStart {
				series.PointsEnd = series.PointsStart + (series.Steps-1)*10
			}
			if seenSeries[series.ID] {
				return false
			}
			seenSeries[series.ID] = true
			if !strings.Contains(series.Desc, "{need}") {
				series.Desc += " 达到 {need} " + skill.Unit
			}
		}
	}
	return true
}
