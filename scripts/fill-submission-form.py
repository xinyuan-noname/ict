#!/usr/bin/env python3
"""Fill the official Huawei ICT submission-info template for checkism."""

from __future__ import annotations

import os
from pathlib import Path

from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml.ns import qn
from docx.shared import Pt

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "docs" / "templates" / "official-submission-form.docx"
OUTPUT = Path(os.environ.get("FORM_OUTPUT", str(ROOT / "docs" / "【赛题1-作品信息收集表】checkism-已填写.docx")))

BODY_FONT = "宋体"
HEAD_FONT = "微软雅黑"


def set_run(run, size: float = 10.0, bold: bool = False, font: str = BODY_FONT) -> None:
    run.font.name = font
    run._element.rPr.rFonts.set(qn("w:eastAsia"), font)
    run.font.size = Pt(size)
    run.bold = bold


def fill_cell(cell, text: str, size: float = 10.0, bold: bool = False, align=WD_ALIGN_PARAGRAPH.LEFT) -> None:
    cell.text = ""
    paragraphs = text.split("\n")
    first = True
    for chunk in paragraphs:
        paragraph = cell.paragraphs[0] if first else cell.add_paragraph()
        first = False
        paragraph.alignment = align
        paragraph.paragraph_format.space_after = Pt(2)
        run = paragraph.add_run(chunk)
        set_run(run, size=size, bold=bold)


def main() -> None:
    if not SOURCE.exists():
        raise SystemExit(f"template not found: {SOURCE}")

    document = Document(str(SOURCE))
    table = document.tables[0]

    fill_cell(table.cell(1, 1), "天津工业大学")
    fill_cell(table.cell(2, 1), "checkism")
    fill_cell(table.cell(4, 1), "李杰")
    fill_cell(table.cell(4, 2), "陈皓庭", bold=True)
    fill_cell(table.cell(4, 3), "白德布鑫", bold=True)
    fill_cell(table.cell(4, 4), "潘振宇", bold=True)
    fill_cell(table.cell(5, 1), "18708477617")
    fill_cell(table.cell(6, 1), "3236256044@qq.com")
    fill_cell(table.cell(7, 1), "请在此插入 1 张约 2MB 的团队合照（提交前补充）")
    fill_cell(table.cell(10, 1), "check · 每日健康清单")
    fill_cell(table.cell(11, 1), "生活应用 / 健康管理")

    introduction = """一、背景与价值
日常健康与学习计划普遍存在入口分散、目标单一、难以坚持的问题：喝水、服药、运动、背单词各自使用不同工具，记录成本高，也看不到长期积累。check 将健康习惯与英语学习放入同一份每日清单，以“记录足够轻、反馈足够快、成就能持续”为设计原则，提供饮水、服药、运动、英语听说读写、洞察统计和分组成就。

产品已实现 Web 与 Android 共用一套 React Native 代码，支持华为账号登录和游客本地预览；英语按“听 / 说 / 读 / 写”拆分二级清单，每条清单独立记录进度和目标；成就由起点、终点和阶数通过对数插值生成，便于扩展；同时新增“自定义”一级入口，用户输入目标后由后端小模型生成一级清单、二级技能和成就。项目重点解决了“计划固定、统计口径单一、成就难扩展”三个问题。

二、华为云 CodeArts 的使用价值
1. 需求理解：通过阅读 README、OpenAPI 契约、port 接口和既有规格文档，将赛题拆分为登录、清单、统计、成就、云资源五类验收项。
2. 代码生成：使用 CodeArts 代码智能体生成 React Native 页面、Go 四层骨架、接口契约和测试样例，再由人工审查边界条件。
3. 项目构建：统一执行 TypeScript 检查、Jest、Go build/test、Webpack 生产构建和 Compose 构建。
4. 问题修复：通过 traceId、统一错误码和失败测试定位问题，修复华为账号依赖、游客零出网、英语技能内容复用、模型输出不合法等问题。
5. 部署上线：提供 Docker 多阶段构建、Compose、Nginx 同源反代、Ollama 模型初始化和华为云 ECS 自动同步脚本；push main 后可由 GitHub Actions 或 CodeArts 流水线执行部署脚本，并在健康检查失败时回滚。当前云上实际部署仍需开通 ECS 并配置域名、SSH 与 AGC 生产凭据，报告中如实标注为待执行。"""
    fill_cell(table.cell(13, 1), introduction, size=9.2)

    technology = """整体采用 React Native + Nginx + Go 标准库四层服务端 + 华为云 ECS/RDS/DCS + Ollama 的架构。客户端按清单注册 Today/Stats/Achievements 面板；服务端按 handler → service → port ← adapter 分层，便于将文件存储替换为 RDS，将模型能力替换为 MaaS 或 Ollama。

模块 1：统一每日清单。饮水按身体档案计算目标；服药按早/中/晚/睡前四时段打卡并支持补打；运动记录步行、骑行、跑步；英语按听/说/读/写分组，清单页与洞察页共享当前技能状态。

模块 2：条目级数据与成就。每条清单独立保存 itemProgress、itemTargets；英语各技能独立保存每日记录、目标值和目标周期（天/周/月），支持“一周 10 章”这类周期目标。成就由 start/end/steps 序列对数插值生成，英语 12 个序列生成 56 个成就，避免逐条硬编码阈值。

模块 3：华为账号与安全。Android 接入 Huawei Account Kit，服务端完成授权码换票、会话签发与校验；游客模式使用本地存储并阻断出网；统一错误码、traceId、限流和密钥扫描构成基础安全与可观测能力。

模块 4：AI 自定义清单。后端 /v1/custom-plans/generate 调用 Ollama qwen2.5:0.5b 的 JSON 模式，生成一级标题、二级技能和成就序列；服务端对 ID、单位、desc、steps 做归一化，失败时按配置回退模板，前端用同一套对数插值渲染成就。

模块 5：部署与可观测。Nginx 同源反代 /v1；Docker Compose 编排 web/authd/ollama/mysql/redis；/v1/health 展示 RDS/Redis/MaaS 探活；GitHub Actions 通过 SSH 执行 deploy/auto-deploy.sh，拉取 origin/main、重建镜像、健康检查并在失败时回滚。

可量化结果：前端 22 个测试文件、120 项测试通过；Go 全包测试通过；英语 12 个成就序列生成 56 项成就；自定义清单可生成 3 个二级技能；本地 qwen2.5:0.5b 生成耗时约 2.3 秒；Android 真机已完成华为账号登录验证。云上 ECS/RDS/DCS 实际部署待在资源开通后执行。"""
    fill_cell(table.cell(14, 1), technology, size=9.2)

    showcase = """Web Demo（部署后）：http://<ECS公网IP或域名>:8088/?demo=guest
Android：华为 PPA-AL20 真机已完成华为账号登录与清单页面验证。
项目截图：docs/screenshots/home.png、data.png、achievements.png、android-checklist.png、android-english.png、android-login-success.png。
演示视频/团队合照：提交前补充到作品附件或在“团队合照”单元格插入。
代码仓库：https://github.com/xinyuan-noname/ict
部署文档：deploy/README.md；模型说明：docs/ollama.md。"""
    fill_cell(table.cell(15, 1), showcase, size=9.2)

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    document.save(str(OUTPUT))
    print(f"wrote {OUTPUT}")


if __name__ == "__main__":
    main()
