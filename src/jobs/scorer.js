/**
 * Candidate skill taxonomy and weighted scoring engine.
 */

export const candidateSkillsTaxonomy = {
  aiLlm: [
    'generative ai', 'genai', 'llm', 'llms', 'rag', 'retrieval augmented generation',
    'langchain', 'langgraph', 'ai agents', 'agentic ai', 'agentic systems',
    'prompt engineering', 'embeddings', 'vector search', 'vector database', 'faiss',
    'pinecone', 'llm applications', 'llm evaluation', 'openai', 'anthropic', 'gemini'
  ],
  backend: [
    'node.js', 'nodejs', 'typescript', 'javascript', 'nestjs', 'express', 'express.js',
    'python', 'fastapi', 'rest api', 'rest apis', 'microservices', 'api gateway',
    'distributed systems', 'system design', 'backend'
  ],
  databases: [
    'mongodb', 'postgresql', 'postgres', 'mysql', 'redis', 'aggregation pipeline',
    'data migrations'
  ],
  cloudDevops: [
    'aws', 'docker', 'kubernetes', 'ci/cd', 'ecs', 'ec2', 's3', 'cdn', 'github actions'
  ],
  engineering: [
    'system design', 'api design', 'performance optimization', 'scalability',
    'observability', 'security', 'event-driven architecture', 'message queues',
    'kafka', 'redis'
  ]
};

/**
 * Categorizes the role based on title and content.
 */
export function categorizeRole(title = '', description = '') {
  const text = `${title} ${description}`.toLowerCase();
  const categories = [];

  if (text.includes('generative ai') || text.includes('genai')) categories.push('Generative AI');
  if (text.includes('llm') || text.includes('large language model')) categories.push('LLM Engineer');
  if (text.includes('ai engineer') || text.includes('applied ai') || text.includes('agentic')) categories.push('AI Engineer');
  if (text.includes('machine learning') || text.includes('ml engineer')) categories.push('Machine Learning');
  if (text.includes('ai platform') || text.includes('llm platform')) categories.push('AI Platform');
  if (text.includes('backend') || text.includes('node') || text.includes('python')) categories.push('Backend');
  if (text.includes('full stack') || text.includes('fullstack')) categories.push('Full Stack');
  if (text.includes('distributed') || text.includes('microservices')) categories.push('Distributed Systems');
  if (text.includes('developer platform') || text.includes('platform engineer')) categories.push('Developer Platform');
  if (text.includes('data infrastructure') || text.includes('ai infra')) categories.push('Data/AI Infrastructure');

  if (categories.length === 0) {
    categories.push('Software Engineer');
  }

  return categories;
}

/**
 * Calculates weighted match score and skill breakdown.
 */
export function scoreJobMatch(job, experienceEval, locationEval) {
  const text = `${job.title} ${job.description || ''} ${job.responsibilities?.join(' ') || ''} ${job.requiredSkills?.join(' ') || ''} ${job.preferredSkills?.join(' ') || ''}`.toLowerCase();
  const title = (job.title || '').toLowerCase();

  // 1. Role Relevance Score (0–100, weight: 25%)
  let roleScore = 40;
  if (title.includes('generative ai') || title.includes('llm') || title.includes('genai')) {
    roleScore = 100;
  } else if (title.includes('ai engineer') || title.includes('applied ai') || title.includes('agent')) {
    roleScore = 95;
  } else if (title.includes('backend') || title.includes('api gateway') || title.includes('distributed')) {
    roleScore = 90;
  } else if (title.includes('full stack') || title.includes('platform engineer') || title.includes('software engineer')) {
    roleScore = 75;
  }

  // 2. Skill Match Score (0–100, weight: 30%)
  const allCandidateSkills = [
    ...candidateSkillsTaxonomy.aiLlm,
    ...candidateSkillsTaxonomy.backend,
    ...candidateSkillsTaxonomy.databases,
    ...candidateSkillsTaxonomy.cloudDevops,
    ...candidateSkillsTaxonomy.engineering
  ];

  const matchedSkills = [];
  const requiredSkillsMatched = [];
  const preferredSkillsMatched = [];
  const missingSkills = [];

  for (const skill of allCandidateSkills) {
    if (text.includes(skill.toLowerCase())) {
      matchedSkills.push(skill);
    }
  }

  // Check against explicit job required/preferred skills
  if (job.requiredSkills && Array.isArray(job.requiredSkills)) {
    for (const req of job.requiredSkills) {
      if (allCandidateSkills.some(cs => req.toLowerCase().includes(cs.toLowerCase()) || cs.toLowerCase().includes(req.toLowerCase()))) {
        requiredSkillsMatched.push(req);
      } else {
        missingSkills.push(req);
      }
    }
  }

  if (job.preferredSkills && Array.isArray(job.preferredSkills)) {
    for (const pref of job.preferredSkills) {
      if (allCandidateSkills.some(cs => pref.toLowerCase().includes(cs.toLowerCase()))) {
        preferredSkillsMatched.push(pref);
      }
    }
  }

  const uniqueMatched = [...new Set(matchedSkills)];
  const skillScore = Math.min(100, Math.round((uniqueMatched.length / 10) * 100));

  // 3. AI / LLM Relevance Score (0–100, weight: 20%)
  const matchedAi = candidateSkillsTaxonomy.aiLlm.filter(s => text.includes(s));
  const aiScore = Math.min(100, Math.round((matchedAi.length / 4) * 100));

  // 4. Backend Relevance Score (0–100, weight: 10%)
  const matchedBackend = candidateSkillsTaxonomy.backend.filter(s => text.includes(s));
  const backendScore = Math.min(100, Math.round((matchedBackend.length / 3) * 100));

  // 5. Experience Compatibility Score (0–100, weight: 10%)
  let experienceScore = 50;
  if (experienceEval.isAccepted) {
    if (experienceEval.minYears >= 2 && (experienceEval.maxYears <= 5 || experienceEval.maxYears === null)) {
      experienceScore = 100;
    } else {
      experienceScore = 80;
    }
  } else {
    experienceScore = 10;
  }

  // 6. Location Compatibility Score (0–100, weight: 5%)
  const locationScore = locationEval.isIndiaOrRemote ? 100 : 70;

  // Weighted overall calculation:
  // Role relevance: 25%
  // Skill match: 30%
  // AI/LLM relevance: 20%
  // Backend relevance: 10%
  // Experience compatibility: 10%
  // Location compatibility: 5%
  const overallMatchScore = Math.round(
    (roleScore * 0.25) +
    (skillScore * 0.30) +
    (aiScore * 0.20) +
    (backendScore * 0.10) +
    (experienceScore * 0.10) +
    (locationScore * 0.05)
  );

  const roleCategory = categorizeRole(job.title, job.description);

  return {
    overallMatchScore,
    roleMatchScore: roleScore,
    skillMatchScore: skillScore,
    aiLlmRelevanceScore: aiScore,
    backendRelevanceScore: backendScore,
    experienceMatchScore: experienceScore,
    locationMatchScore: locationScore,
    matchedSkills: uniqueMatched,
    missingSkills: [...new Set(missingSkills)],
    requiredSkillsMatched,
    preferredSkillsMatched,
    roleCategory
  };
}
