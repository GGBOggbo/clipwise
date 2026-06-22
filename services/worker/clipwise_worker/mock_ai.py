from __future__ import annotations

from .db import Database

# 复刻 packages/shared/src/fixtures.ts 的 mockReadyProject.candidates
# 真实 DeepSeek 在 Phase 5 替换这部分
MOCK_CANDIDATES = [
    {
        "id": "candidate-1",
        "rank": 1,
        "final_score": 92,
        "type": "观点",
        "start_ms": 800_000,
        "end_ms": 905_000,
        "duration_ms": 105_000,
        "title_options": [
            "为什么很多人做 AI 应用第一步就错了",
            "AI 应用失败，往往不是模型问题",
            "做 AI 产品前，先问清楚这个问题",
        ],
        "selected_title": "为什么很多人做 AI 应用第一步就错了",
        "summary": "这一段解释了 AI 应用开发中最容易忽略的需求验证问题。",
        "quote": "不是模型不够强，而是你没想清楚用户为什么要用。",
        "recommendation_reason": "观点完整，有明确结论，可以独立发布。",
        "risk_notices": [],
        "subtitles": [
            {
                "id": "candidate-1-subtitle-1",
                "start_ms": 800_000,
                "end_ms": 805_000,
                "text": "不是模型不够强，而是你没想清楚用户为什么要用。",
            }
        ],
    },
    {
        "id": "candidate-2",
        "rank": 2,
        "final_score": 85,
        "type": "方法",
        "start_ms": 1_630_000,
        "end_ms": 1_770_000,
        "duration_ms": 140_000,
        "title_options": [
            "三个问题判断需求是否成立",
            "需求验证：问这三件事就够了",
            "为什么多数 AI 产品死在需求验证",
        ],
        "selected_title": "三个问题判断需求是否成立",
        "summary": "三个递进问题帮助产品经理判断一个 AI 需求是否值得做。",
        "quote": "用户愿意为什么买单，比模型能做什么重要一万倍。",
        "recommendation_reason": "方法清晰可复用，适合教程型切片。",
        "risk_notices": ["部分表述偏绝对，建议发布前确认。"],
        "subtitles": [
            {
                "id": "candidate-2-subtitle-1",
                "start_ms": 1_630_000,
                "end_ms": 1_635_000,
                "text": "用户愿意为什么买单，比模型能做什么重要一万倍。",
            }
        ],
    },
    {
        "id": "candidate-3",
        "rank": 3,
        "final_score": 78,
        "type": "案例",
        "start_ms": 2_465_000,
        "end_ms": 2_570_000,
        "duration_ms": 105_000,
        "title_options": [
            "一个失败案例：聊了很久需求，上线没人用",
            "为什么用户说需要，实际却不用",
            "口头需求和真实行为是两回事",
        ],
        "selected_title": "一个失败案例：聊了很久需求，上线没人用",
        "summary": "团队花两个月沟通需求，上线后用户仍不愿改变原有习惯。",
        "quote": "用户说的「我会用」和「我每天都在用」是两回事。",
        "recommendation_reason": "故事性强，容易引发产品从业者共鸣。",
        "risk_notices": [],
        "subtitles": [
            {
                "id": "candidate-3-subtitle-1",
                "start_ms": 2_465_000,
                "end_ms": 2_470_000,
                "text": "用户说的「我会用」和「我每天都在用」是两回事。",
            }
        ],
    },
    {
        "id": "candidate-4",
        "rank": 4,
        "final_score": 72,
        "type": "金句",
        "start_ms": 3_330_000,
        "end_ms": 3_380_000,
        "duration_ms": 50_000,
        "title_options": [
            "做 AI 产品的黄金法则",
            "先定义问题，再寻找技术",
            "AI 产品成功先把顺序做对",
        ],
        "selected_title": "做 AI 产品的黄金法则",
        "summary": "用简短总结概括整个分享的核心观点。",
        "quote": "先定义问题，再找技术。顺序对了，产品就成了。",
        "recommendation_reason": "短小完整，适合作为独立金句切片。",
        "risk_notices": [],
        "subtitles": [
            {
                "id": "candidate-4-subtitle-1",
                "start_ms": 3_330_000,
                "end_ms": 3_335_000,
                "text": "先定义问题，再找技术。顺序对了，产品就成了。",
            }
        ],
    },
    {
        "id": "candidate-5",
        "rank": 5,
        "final_score": 65,
        "type": "对比",
        "start_ms": 4_095_000,
        "end_ms": 4_200_000,
        "duration_ms": 105_000,
        "title_options": [
            "大模型与小模型：不是参数越多越好",
            "为什么有时小模型更适合产品",
            "选择模型的第一原则：够用",
        ],
        "selected_title": "大模型与小模型：不是参数越多越好",
        "summary": "对比大模型和小模型在实际产品中的使用场景。",
        "quote": "在产品层面，够用才是标准。",
        "recommendation_reason": "对比明确，适合知识平台传播。",
        "risk_notices": ["技术参数相关表述需要发布前核实。"],
        "subtitles": [
            {
                "id": "candidate-5-subtitle-1",
                "start_ms": 4_095_000,
                "end_ms": 4_100_000,
                "text": "在产品层面，够用才是标准。",
            }
        ],
    },
    {
        "id": "candidate-6",
        "rank": 6,
        "final_score": 58,
        "type": "避坑",
        "start_ms": 4_960_000,
        "end_ms": 5_050_000,
        "duration_ms": 90_000,
        "title_options": [
            "AI 产品定价最常见的误区",
            "不要按照模型成本给产品定价",
            "功能定价和价值定价的区别",
        ],
        "selected_title": "AI 产品定价最常见的误区",
        "summary": "讨论按照功能和模型成本定价带来的问题。",
        "quote": "你的成本不应该直接变成用户的价格。",
        "recommendation_reason": "有明确避坑价值，但需要补充具体案例。",
        "risk_notices": ["定价建议属于商业判断，仅供参考。"],
        "subtitles": [
            {
                "id": "candidate-6-subtitle-1",
                "start_ms": 4_960_000,
                "end_ms": 4_965_000,
                "text": "你的成本不应该直接变成用户的价格。",
            }
        ],
    },
    {
        "id": "candidate-7",
        "rank": 7,
        "final_score": 52,
        "type": "总结",
        "start_ms": 5_700_000,
        "end_ms": 5_790_000,
        "duration_ms": 90_000,
        "title_options": [
            "做好 AI 产品的三个核心原则",
            "从需求出发，而不是从技术出发",
            "AI 产品经理应该关注什么",
        ],
        "selected_title": "做好 AI 产品的三个核心原则",
        "summary": "总结需求第一、小步验证和用户价值三个原则。",
        "quote": "技术会变，需求不会。",
        "recommendation_reason": "总结清晰，适合作为系列内容结尾。",
        "risk_notices": [],
        "subtitles": [
            {
                "id": "candidate-7-subtitle-1",
                "start_ms": 5_700_000,
                "end_ms": 5_705_000,
                "text": "技术会变，需求不会。",
            }
        ],
    },
]


async def generate_mock_candidates(database: Database, project_token: str) -> None:
    """删除项目旧候选，写入模拟候选数据。Phase 5 替换为真实 DeepSeek。

    候选 id 带 project_token 前缀，避免与 demo-project 种子数据的主键冲突。
    """
    async with database.pool.acquire() as conn:
        async with conn.transaction():
            # ON DELETE CASCADE 会自动清理 subtitle_lines
            await conn.execute(
                "DELETE FROM clip_candidates WHERE project_token = $1",
                project_token,
            )
            for c in MOCK_CANDIDATES:
                # 给 id 加 project_token 前缀，保证全局唯一
                candidate_id = f"{project_token}-{c['id']}"
                await conn.execute(
                    """
                    INSERT INTO clip_candidates (
                        id, project_token, rank, final_score, type,
                        start_ms, end_ms, duration_ms,
                        title_options, selected_title, summary, quote,
                        recommendation_reason, risk_notices, preview_status
                    ) VALUES (
                        $1, $2, $3, $4, $5,
                        $6, $7, $8,
                        $9, $10, $11, $12,
                        $13, $14, 'not_previewed'
                    )
                    """,
                    candidate_id,
                    project_token,
                    c["rank"],
                    c["final_score"],
                    c["type"],
                    c["start_ms"],
                    c["end_ms"],
                    c["duration_ms"],
                    c["title_options"],
                    c["selected_title"],
                    c["summary"],
                    c["quote"],
                    c["recommendation_reason"],
                    c["risk_notices"],
                )
                for i, s in enumerate(c["subtitles"]):
                    subtitle_id = f"{project_token}-{s['id']}"
                    await conn.execute(
                        """
                        INSERT INTO subtitle_lines (
                            id, candidate_id, index, start_ms, end_ms, text
                        ) VALUES ($1, $2, $3, $4, $5, $6)
                        """,
                        subtitle_id,
                        candidate_id,
                        i,
                        s["start_ms"],
                        s["end_ms"],
                        s["text"],
                    )

            await conn.execute(
                "UPDATE projects SET status = 'ready', updated_at = NOW() WHERE token = $1",
                project_token,
            )
