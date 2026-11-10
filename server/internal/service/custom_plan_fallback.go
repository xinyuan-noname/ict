package service

import (
	"strings"

	"ict/server/internal/domain"
)

// fallbackPlan 仅在未配置 Ollama 或 Ollama 暂不可用时启用（OLLAMA_FALLBACK=1）。
// 它保证 App 在没有模型的环境里仍能走通“生成清单 -> 展示成就”的链路。
func fallbackPlan(need string) domain.GeneratedPlan {
	title := strings.TrimSpace(need)
	if title == "" {
		title = "我的清单"
	}
	runes := []rune(title)
	if len(runes) > 10 {
		title = string(runes[:10])
	}
	return domain.GeneratedPlan{
		Title:       title,
		Icon:        "✨",
		Description: "根据你的需求生成的可执行清单",
		Skills: []domain.GeneratedSkill{
			{
				Name: "学习",
				Icon: "📚",
				Unit: "次",
				Series: []domain.GeneratedSeries{
					{
						ID: "study_main", Name: "学习", Desc: "完成 {need} 次学习",
						Icon: "📚", Start: 1, End: 20, Steps: 5, PointsStart: 20, PointsEnd: 60,
					},
				},
			},
			{
				Name: "练习",
				Icon: "🎯",
				Unit: "次",
				Series: []domain.GeneratedSeries{
					{
						ID: "practice_main", Name: "练习", Desc: "完成 {need} 次练习",
						Icon: "🎯", Start: 1, End: 20, Steps: 5, PointsStart: 20, PointsEnd: 60,
					},
				},
			},
			{
				Name: "复盘",
				Icon: "📝",
				Unit: "次",
				Series: []domain.GeneratedSeries{
					{
						ID: "review_main", Name: "复盘", Desc: "完成 {need} 次复盘",
						Icon: "📝", Start: 1, End: 10, Steps: 3, PointsStart: 20, PointsEnd: 60,
					},
				},
			},
		},
	}
}
