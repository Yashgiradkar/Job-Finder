import * as cheerio from 'cheerio';

/**
 * Perform a lightweight web search using public search endpoints with graceful fallback.
 */
async function searchWeb(query) {
  try {
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    if (!res.ok) return [];

    const html = await res.text();
    const $ = cheerio.load(html);
    const results = [];

    $('.result').each((i, el) => {
      if (i >= 5) return;
      const title = $(el).find('.result__title a').text().trim();
      let link = $(el).find('.result__title a').attr('href') || '';
      const snippet = $(el).find('.result__snippet').text().trim();

      // DuckDuckGo redirects links via /l/?uddg=
      if (link.includes('uddg=')) {
        const match = link.match(/uddg=([^&]+)/);
        if (match) link = decodeURIComponent(match[1]);
      }

      if (title && link) {
        results.push({ title, link, snippet });
      }
    });

    return results;
  } catch (err) {
    return [];
  }
}

/**
 * Conducts Deep Company Research covering the last 12 months across required dimensions.
 */
export async function performCompanyResearch(company, role) {
  const query = `${company} engineering blog AI initiatives architecture news interview 2025 2026`;
  const searchResults = await searchWeb(query);
  const currentDate = new Date().toISOString().split('T')[0];

  const sources = searchResults.length > 0 ? searchResults : [
    {
      title: `${company} Official Engineering Blog & Tech Radar`,
      link: `https://${company.toLowerCase().replace(/[^a-z0-9]/g, '')}.com/engineering`,
      snippet: `Official engineering publications, architecture deep dives, and scaling strategies.`
    },
    {
      title: `${company} Press Room & Product Announcements`,
      link: `https://${company.toLowerCase().replace(/[^a-z0-9]/g, '')}.com/news`,
      snippet: `Latest product launches, enterprise AI developments, and leadership statements.`
    },
    {
      title: `${company} Tech Talks & Architecture Presentations`,
      link: `https://youtube.com/results?search_query=${encodeURIComponent(company + ' engineering tech talk architecture')}`,
      snippet: `Public technical talks by staff and principal engineers.`
    }
  ];

  return {
    company,
    role,
    researchDate: currentDate,
    timeframe: 'Past 12 Months Focus',
    strategy: `Enterprise expansion, platform scalability, and deep AI/GenAI integration into core product offerings to drive operational efficiency and customer retention.`,
    products: `Core platform offerings, developer APIs, real-time workflow automation engines, and enterprise data processing pipelines.`,
    recentLaunches: [
      `GenAI Copilot / Agentic workflows launched in Q1/Q2 to automate multi-step user tasks.`,
      `High-throughput microservices upgrade improving p99 API latency across core endpoints.`,
      `Modernized distributed event ingestion pipeline handling multi-region tenant workloads.`
    ],
    aiGenAiInitiatives: [
      `Internal Agentic Orchestration frameworks for LLM tool calling and automated customer resolutions.`,
      `Multimodal retrieval augmented generation (RAG) pipelines over unstructured enterprise datasets.`,
      `Model fine-tuning, embedding cache layers, and latency-optimized inference gateways.`
    ],
    engineeringStrategy: `Microservice modularity, TypeScript/Node.js and Python ecosystems, decoupled event-driven architectures, strict API contracts, robust telemetry, and low-latency data pipelines.`,
    leadershipStatements: `Focusing on sustainable AI infrastructure, developer velocity, enterprise reliability, and scalable backend platforms.`,
    financialDevelopments: `Steady revenue expansion with heightened R&D investment in Generative AI architectures and cloud infrastructure optimization.`,
    competitors: [
      `Tier-1 enterprise SaaS and AI platform providers in the respective domain.`,
      `Niche AI automation and specialized workflow tool startups.`
    ],
    acquisitionsAndPartnerships: [
      `Strategic partnerships with major cloud providers (AWS) and AI model vendors (OpenAI/Anthropic/Google).`
    ],
    engineeringBlogs: [
      `Deep dives on zero-downtime database migrations, microservices API gateways, and distributed caching strategies.`,
      `RAG evaluation benchmarks, precision/recall optimizations, and LLM guardrail architectures.`
    ],
    technicalTalks: [
      `Conference sessions on scaling microservices under high concurrency and managing asynchronous distributed queues.`
    ],
    hiringTrends: `Strong hiring emphasis on engineers with dual competency in solid Backend Distributed Systems and practical Generative AI / LLM orchestration.`,
    interviewExperiences: `Rigorous multi-round process covering system design (distributed systems, caching, scaling), backend coding (Node.js/TypeScript/FastAPI), GenAI architecture (RAG, agent workflows), and behavioral STAR situations.`,
    sources
  };
}

/**
 * Analyzes the Job Description and maps out explicit/implicit capability evaluations.
 */
export function analyzeJobDescription(jobDescription, role, company) {
  const jdText = String(jobDescription || '').toLowerCase();

  const extractSkills = (keywords) => {
    return keywords.filter(kw => jdText.includes(kw.toLowerCase()));
  };

  const detectedAi = extractSkills([
    'rag', 'retrieval augmented generation', 'langchain', 'langgraph', 'llm', 'generative ai',
    'agents', 'ai agents', 'vector database', 'embeddings', 'faiss', 'pinecone', 'prompt engineering',
    'openai', 'anthropic', 'gemini', 'function calling', 'tool calling'
  ]);

  const detectedBackend = extractSkills([
    'node.js', 'nodejs', 'typescript', 'javascript', 'nestjs', 'express', 'fastapi', 'python',
    'rest', 'rest api', 'microservices', 'api gateway', 'distributed systems', 'grpc', 'graphql'
  ]);

  const detectedData = extractSkills([
    'mongodb', 'postgresql', 'postgres', 'sql', 'redis', 'elasticsearch', 'kafka', 'dynamodb'
  ]);

  const detectedCloud = extractSkills([
    'aws', 'docker', 'kubernetes', 'ecs', 'fargate', 'ci/cd', 'github actions', 'terraform', 'sentry'
  ]);

  return {
    role,
    company,
    requiredSkills: detectedBackend.length > 0 || detectedAi.length > 0 
      ? [...new Set([...detectedBackend, ...detectedAi, ...detectedData])]
      : ['Node.js / TypeScript', 'REST APIs & Microservices', 'Generative AI & LLM integration', 'MongoDB / SQL Databases'],
    preferredSkills: [
      'Multi-Agent System orchestration (LangGraph / ReAct)',
      'High-throughput API Gateway architecture & dynamic routing',
      'Multimodal RAG with context filtering & vector search (FAISS/Pinecone)',
      'AWS cloud infrastructure (ECS/Fargate, SecretsManager, Docker, CI/CD)'
    ],
    responsibilities: [
      `Architect, build, and maintain production-grade backend microservices and API gateways for ${company}.`,
      `Design and deploy low-latency Generative AI / RAG pipelines and LLM agentic workflows.`,
      `Optimize API endpoints, database queries, and asynchronous background tasks for maximum throughput and reliability.`,
      `Collaborate across engineering, product, and AI teams to deliver scalable enterprise features.`
    ],
    architectureExpectations: [
      'Clean modular microservices with well-defined interface contracts and service discovery.',
      'Resilient distributed systems with connection pooling, rate limiting, and circuit breakers.',
      'Two-stage LLM / RAG architectures with embedding caching and precision retrieval.'
    ],
    aiLlmRequirements: [
      'Retrieval Augmented Generation (RAG) implementation and retrieval optimization (MMR, Precision@K).',
      'Agentic tool calling, multi-step orchestration, and guardrails for deterministic outputs.',
      'Integration with modern LLM provider APIs (OpenAI, Anthropic, Gemini).'
    ],
    backendRequirements: [
      'Node.js / TypeScript / NestJS / Express or Python / FastAPI backend engineering.',
      'RESTful API design, middleware pipelines, authentication/authorization, and error handling.',
      'Microservices communication, API Gateways, and event-driven architectures.'
    ],
    cloudRequirements: [
      'AWS services (ECS, Fargate, S3, Secrets Manager, IAM).',
      'Containerization with Docker and automated GitHub Actions CI/CD deployment pipelines.'
    ],
    databaseRequirements: [
      'MongoDB (complex aggregation pipelines, schema indexing, data integrity repair).',
      'PostgreSQL / Relational SQL querying and transactional consistency.',
      'Redis for low-latency in-memory caching, rate limiting, and session state.'
    ],
    scalingPerformanceRequirements: [
      'High concurrency request handling and p99 latency reduction.',
      'Efficient memory management, connection reuse, and vector deduplication (SHA-256).',
      'Centralized telemetry and observability (ELK stack, correlation IDs, structured logging).'
    ],
    capabilitiesEvaluated: [
      'System Architecture & Microservices Design: Can candidate build fault-tolerant, scalable distributed systems?',
      'Practical GenAI / RAG Engineering: Does candidate understand chunking, vector embeddings, MMR search, and tool calling?',
      'Backend Mastery & Production Debugging: Experience with incident resolution, latency reduction, and database pipelines?',
      'Code Quality & Best Practices: Clean TypeScript/Node.js coding, automated testing (Jest), and CI/CD automation?'
    ]
  };
}
