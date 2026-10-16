export const config = {
  lookbackHours: Number(process.env.LOOKBACK_HOURS || 48),
  minMatchScore: Number(process.env.MIN_MATCH_SCORE || 55),
  autoApply: String(process.env.AUTO_APPLY).toLowerCase() === 'true',
  headless: String(process.env.HEADLESS ?? 'true').toLowerCase() !== 'false',
  resumePath: process.env.RESUME_PATH,
  email: {
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 465),
    secure: String(process.env.SMTP_SECURE).toLowerCase() === 'true',
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
    to: process.env.EMAIL_TO
  }
};

export const skillGroups = {
  ai: [
    'generative ai', 'genai', 'llm', 'llm engineering', 'rag', 'retrieval augmented generation',
    'langchain', 'llamaindex', 'faiss', 'embeddings', 'vector database', 'semantic search',
    'mmr', 'ai agents', 'agentic ai', 'agentic systems', 'prompt engineering',
    'openai', 'anthropic', 'gemini', 'google gemini', 'multimodal rag'
  ],
  backend: [
    'node.js', 'nodejs', 'typescript', 'javascript', 'nestjs', 'express', 'fastapi',
    'rest api', 'microservices', 'api gateway', 'distributed systems', 'system design',
    'backend', 'backend engineer', 'software engineer'
  ],
  data: [
    'mongodb', 'postgresql', 'sql', 'redis', 'aggregation pipeline', 'database optimization',
    'data migration', 'vector database'
  ],
  cloud: [
    'aws', 'ecs', 'ecs fargate', 'docker', 'kubernetes', 'github actions', 'ci/cd',
    'observability', 'sentry', 'prometheus', 'grafana'
  ],
  product: [
    'ai platform', 'ai application', 'saas', 'multi-tenant', 'real-time systems',
    'automation', 'developer experience', 'platform engineering'
  ]
};

export const targetTitles = [
  'Generative AI Engineer', 'AI Engineer', 'LLM Engineer', 'GenAI Engineer',
  'Machine Learning Engineer', 'Applied AI Engineer', 'AI/ML Engineer',
  'Backend Engineer', 'Backend Software Engineer', 'Software Engineer',
  'Platform Engineer', 'AI Platform Engineer', 'Full Stack Engineer'
];

export const portals = [
  // Add company career pages here. Keep this allowlist explicit.
  // { company: 'Example', url: 'https://example.com/careers', selectors: {...} }
];
