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
	if plan.Title == "" {
		plan.Title = "我的清单"
	}
	if plan.Icon == "" {
		plan.Icon = "✨"
	}
	if len(plan.Skills) == 0 {
		return false
	}
	if len(plan.Skills) > 4 {
		plan.Skills = plan.Skills[:4]
	}
	seenSkill := map[string]bool{}
	for si := range plan.Skills {
		skill := &plan.Skills[si]
		skill.Name = cleanGeneratedText(skill.Name, 16)
		skill.Icon = cleanGeneratedText(skill.Icon, 8)
		skill.Unit = cleanGeneratedText(skill.Unit, 8)
		if skill.Name == "" {
			skill.Name = "技能 " + string(rune('1'+si))
		}
		if skill.Unit == "" {
			skill.Unit = "次"
		}
		if skill.Icon == "" {
			skill.Icon = "🎯"
		}
		if seenSkill[skill.Name] {
			skill.Name = skill.Name + " " + string(rune('1'+si))
		}
		seenSkill[skill.Name] = true
		if len(skill.Series) == 0 {
			skill.Series = []GeneratedSeries{{
				ID: "default_1", Name: skill.Name, Desc: "完成 {need} " + skill.Unit,
				Icon: skill.Icon, Start: 1, End: 20, Steps: 5, PointsStart: 20, PointsEnd: 60,
			}}
		}
		if len(skill.Series) > 4 {
			skill.Series = skill.Series[:4]
		}
		seenSeries := map[string]bool{}
		for xi := range skill.Series {
			series := &skill.Series[xi]
			series.ID = strings.ToLower(cleanGeneratedText(series.ID, 32))
			if !ValidGeneratedID(series.ID) {
				series.ID = "series_" + string(rune('1'+si)) + "_" + string(rune('1'+xi))
			}
			for seenSeries[series.ID] {
				series.ID = series.ID + "_" + string(rune('1'+xi))
			}
			seenSeries[series.ID] = true
			series.Name = cleanGeneratedText(series.Name, 24)
			series.Desc = cleanGeneratedText(series.Desc, 60)
			series.Icon = cleanGeneratedText(series.Icon, 8)
			if series.Name == "" {
				series.Name = skill.Name
			}
			if series.Icon == "" {
				series.Icon = skill.Icon
			}
			if series.Start < 1 {
				series.Start = 1
			}
			if series.End <= series.Start {
				series.End = series.Start + 10
			}
			if series.Steps < 3 {
				series.Steps = 3
			}
			if series.Steps > 8 {
				series.Steps = 8
			}
			if series.PointsStart <= 0 {
				series.PointsStart = 20
			}
			if series.PointsEnd <= series.PointsStart {
				series.PointsEnd = series.PointsStart + (series.Steps-1)*10
			}
			if !strings.Contains(series.Desc, "{need}") {
				if series.Desc == "" {
					series.Desc = "完成 {need} " + skill.Unit
				} else {
					series.Desc += " 达到 {need} " + skill.Unit
				}
			}
		}
	}
	return true
}
