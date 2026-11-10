package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"regexp"
	"strings"

	"ict/server/internal/domain"
)

// CustomPlanGenerator 是可替换的生成端口，便于测试时注入假模型。
type CustomPlanGenerator interface {
	GenerateJSON(ctx context.Context, system, user string) (string, error)
}

type CustomPlanService struct {
	Generator CustomPlanGenerator
	Fallback  bool
}

const customPlanSystemPrompt = `你是一个清单设计器。根据用户目标，设计一个可量化的每日清单。
只输出一个 JSON 对象，不要 markdown，不要解释。
结构必须严格如下：
{
  "title": "一级标题，2-8个汉字，例如 备考",
  "icon": "一个 emoji，例如 📚",
  "description": "一句话说明清单目的",
  "skills": [
    {
      "name": "二级标题，例如 阅读",
      "icon": "一个 emoji",
      "unit": "记录单位，例如 篇/页/次/分钟",
      "series": [
        {
          "id": "小写英文_下划线，例如 reading_main",
          "name": "成就系列名，例如 阅读",
          "desc": "成就描述，必须包含 {need} 占位符，例如 阅读累计达到 {need} 页",
          "icon": "一个 emoji",
          "start": 1,
          "end": 20,
          "steps": 5,
          "pointsStart": 20,
          "pointsEnd": 60
        }
      ]
    }
  ]
}
硬性要求：
- 一级标题 2-8 个字；2-4 个二级技能；每个技能 1-3 个成就系列。
- start >= 1；end > start；steps 3-8；点数递增。
- 每个系列独立描述一个可累计指标；desc 必须含 {need}。
- 不要编造用户没有提供的硬性事实；保持通用、可执行。`

var jsonFence = regexp.MustCompile("(?s)^```(?:json)?\\s*(.*?)\\s*```$")

func (s *CustomPlanService) Generate(ctx context.Context, need string) (domain.GeneratedPlan, error) {
	need = strings.TrimSpace(need)
	if len([]rune(need)) < 2 {
		return domain.GeneratedPlan{}, errors.New("need must be at least 2 characters")
	}
	if len([]rune(need)) > 300 {
		need = string([]rune(need)[:300])
	}
	if s == nil || s.Generator == nil {
		if s != nil && s.Fallback {
			return fallbackPlan(need), nil
		}
		return domain.GeneratedPlan{}, errors.New("generator not configured")
	}

	var lastErr error
	prompt := need
	for attempt := 0; attempt < 2; attempt++ {
		content, err := s.Generator.GenerateJSON(ctx, customPlanSystemPrompt, prompt)
		if err != nil {
			if s.Fallback {
				return fallbackPlan(need), nil
			}
			return domain.GeneratedPlan{}, err
		}
		plan, parseErr := parseGeneratedPlan(content)
		if parseErr == nil && domain.NormalizeGeneratedPlan(&plan) {
			return plan, nil
		}
		if parseErr != nil {
			lastErr = parseErr
		} else {
			lastErr = errors.New("generated plan failed validation")
		}
		prompt = fmt.Sprintf("%s\n\n上一次输出不符合要求：%s。请重新只输出一个合法 JSON。", need, lastErr.Error())
	}
	return domain.GeneratedPlan{}, fmt.Errorf("generate custom plan: %w", lastErr)
}

func parseGeneratedPlan(content string) (domain.GeneratedPlan, error) {
	text := strings.TrimSpace(content)
	if match := jsonFence.FindStringSubmatch(text); len(match) == 2 {
		text = strings.TrimSpace(match[1])
	}
	start := strings.Index(text, "{")
	end := strings.LastIndex(text, "}")
	if start < 0 || end <= start {
		return domain.GeneratedPlan{}, errors.New("model did not return a JSON object")
	}
	var plan domain.GeneratedPlan
	if err := json.Unmarshal([]byte(text[start:end+1]), &plan); err != nil {
		return domain.GeneratedPlan{}, fmt.Errorf("decode generated plan: %w", err)
	}
	return plan, nil
}
