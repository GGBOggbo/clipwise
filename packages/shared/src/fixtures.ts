import type { ClipCandidate, ClipType, ClipwiseProject } from "./domain";

type CandidateSeed = {
  id: string;
  rank: number;
  finalScore: number;
  type: ClipType;
  startMs: number;
  endMs: number;
  titles: [string, string, string];
  summary: string;
  quote: string;
  recommendationReason: string;
  riskNotices?: string[];
};

function createCandidate(seed: CandidateSeed): ClipCandidate {
  return {
    id: seed.id,
    rank: seed.rank,
    finalScore: seed.finalScore,
    type: seed.type,
    startMs: seed.startMs,
    endMs: seed.endMs,
    durationMs: seed.endMs - seed.startMs,
    titleOptions: seed.titles,
    selectedTitle: seed.titles[0],
    summary: seed.summary,
    quote: seed.quote,
    recommendationReason: seed.recommendationReason,
    riskNotices: seed.riskNotices ?? [],
    subtitles: [
      {
        id: `${seed.id}-subtitle-1`,
        startMs: seed.startMs,
        endMs: seed.startMs + 5_000,
        text: seed.quote,
      },
    ],
    previewStatus: "not_previewed",
  };
}

export const mockReadyProject: ClipwiseProject = {
  token: "demo-project",
  status: "ready",
  videoConnectionStatus: "missing",
  sourceFileName: "AI产品需求验证直播回放.mp4",
  sourceFileSize: 1_280_000_000,
  durationMs: 6_180_000,
  expiresAt: "2026-06-29T23:59:59+08:00",
  regenerationCount: 0,
  candidates: [
    createCandidate({
      id: "candidate-1",
      rank: 1,
      finalScore: 92,
      type: "观点",
      startMs: 800_000,
      endMs: 905_000,
      titles: [
        "为什么很多人做 AI 应用第一步就错了",
        "AI 应用失败，往往不是模型问题",
        "做 AI 产品前，先问清楚这个问题",
      ],
      summary: "这一段解释了 AI 应用开发中最容易忽略的需求验证问题。",
      quote: "不是模型不够强，而是你没想清楚用户为什么要用。",
      recommendationReason: "观点完整，有明确结论，可以独立发布。",
    }),
    createCandidate({
      id: "candidate-2",
      rank: 2,
      finalScore: 85,
      type: "方法",
      startMs: 1_630_000,
      endMs: 1_770_000,
      titles: [
        "三个问题判断需求是否成立",
        "需求验证：问这三件事就够了",
        "为什么多数 AI 产品死在需求验证",
      ],
      summary: "三个递进问题帮助产品经理判断一个 AI 需求是否值得做。",
      quote: "用户愿意为什么买单，比模型能做什么重要一万倍。",
      recommendationReason: "方法清晰可复用，适合教程型切片。",
      riskNotices: ["部分表述偏绝对，建议发布前确认。"],
    }),
    createCandidate({
      id: "candidate-3",
      rank: 3,
      finalScore: 78,
      type: "案例",
      startMs: 2_465_000,
      endMs: 2_570_000,
      titles: [
        "一个失败案例：聊了很久需求，上线没人用",
        "为什么用户说需要，实际却不用",
        "口头需求和真实行为是两回事",
      ],
      summary: "团队花两个月沟通需求，上线后用户仍不愿改变原有习惯。",
      quote: "用户说的「我会用」和「我每天都在用」是两回事。",
      recommendationReason: "故事性强，容易引发产品从业者共鸣。",
    }),
    createCandidate({
      id: "candidate-4",
      rank: 4,
      finalScore: 72,
      type: "金句",
      startMs: 3_330_000,
      endMs: 3_380_000,
      titles: [
        "做 AI 产品的黄金法则",
        "先定义问题，再寻找技术",
        "AI 产品成功先把顺序做对",
      ],
      summary: "用简短总结概括整个分享的核心观点。",
      quote: "先定义问题，再找技术。顺序对了，产品就成了。",
      recommendationReason: "短小完整，适合作为独立金句切片。",
    }),
    createCandidate({
      id: "candidate-5",
      rank: 5,
      finalScore: 65,
      type: "对比",
      startMs: 4_095_000,
      endMs: 4_200_000,
      titles: [
        "大模型与小模型：不是参数越多越好",
        "为什么有时小模型更适合产品",
        "选择模型的第一原则：够用",
      ],
      summary: "对比大模型和小模型在实际产品中的使用场景。",
      quote: "在产品层面，够用才是标准。",
      recommendationReason: "对比明确，适合知识平台传播。",
      riskNotices: ["技术参数相关表述需要发布前核实。"],
    }),
    createCandidate({
      id: "candidate-6",
      rank: 6,
      finalScore: 58,
      type: "避坑",
      startMs: 4_960_000,
      endMs: 5_050_000,
      titles: [
        "AI 产品定价最常见的误区",
        "不要按照模型成本给产品定价",
        "功能定价和价值定价的区别",
      ],
      summary: "讨论按照功能和模型成本定价带来的问题。",
      quote: "你的成本不应该直接变成用户的价格。",
      recommendationReason: "有明确避坑价值，但需要补充具体案例。",
      riskNotices: ["定价建议属于商业判断，仅供参考。"],
    }),
    createCandidate({
      id: "candidate-7",
      rank: 7,
      finalScore: 52,
      type: "总结",
      startMs: 5_700_000,
      endMs: 5_790_000,
      titles: [
        "做好 AI 产品的三个核心原则",
        "从需求出发，而不是从技术出发",
        "AI 产品经理应该关注什么",
      ],
      summary: "总结需求第一、小步验证和用户价值三个原则。",
      quote: "技术会变，需求不会。",
      recommendationReason: "总结清晰，适合作为系列内容结尾。",
    }),
  ],
};
