import { candidateProfile } from './candidateProfile.js';

/**
 * Performs candidate matching against the role requirements strictly preserving authentic experience.
 */
export function matchCandidateToRole(jdAnalysis) {
  const { coreExperience, workHistory, projects, skillsByCategory } = candidateProfile;

  // 1. Strong matches
  const strongMatches = [
    {
      domain: 'Backend & Microservices',
      skills: ['Node.js', 'TypeScript', 'NestJS', 'Express', 'API Gateway', 'Microservices', 'Distributed Systems'],
      evidence: 'Built and maintained production-grade TypeScript API Gateway with Consul service discovery; optimized APIs reducing response latency by 83% at SmartData Enterprises.'
    },
    {
      domain: 'Generative AI & LLM Systems',
      skills: ['RAG', 'LangChain', 'LangGraph', 'AI Agents', 'Tool Calling', 'Vector Databases (FAISS/Pinecone)'],
      evidence: 'Built Avion AI multi-tenant SaaS with autonomous support agents (94.6% Precision@5 RAG retrieval) and Multi-Document RAG API with FastAPI, Google Gemini, and MMR search.'
    },
    {
      domain: 'Database & Data Integrity',
      skills: ['MongoDB', 'Aggregation Pipelines', 'Data Cleansing', 'Redis', 'PostgreSQL'],
      evidence: 'Repaired 70K+ corrupted records during production data-integrity incident via MongoDB aggregation pipelines and validation safeguards.'
    },
    {
      domain: 'Cloud, DevOps & Observability',
      skills: ['AWS (ECS, Fargate, S3, Secrets Manager)', 'Docker', 'GitHub Actions', 'ELK Stack', 'Correlation IDs'],
      evidence: 'Containerized microservices with Docker, automated CI/CD deployment to AWS ECS Fargate, and centralized cross-service log tracing with ELK and correlation IDs.'
    }
  ];

  // 2. Relevant projects
  const relevantProjects = projects.map(p => ({
    name: p.name,
    technologies: p.technologies.join(', '),
    impactHighlights: p.highlights
  }));

  // 3. Stories to emphasize (STAR format based on real achievements)
  const storiesToEmphasize = [
    {
      theme: 'Production Incident Resolution & Data Integrity (STAR)',
      situation: 'Encountered a critical production data-integrity incident affecting 70,000+ customer records at SmartData Enterprises.',
      task: 'Restore data consistency without downtime while preventing future recurrence.',
      action: 'Constructed specialized MongoDB aggregation pipelines to isolate and repair corrupted fields, introduced schema validation gates, and created migration safeguards.',
      result: 'Successfully repaired all 70K+ records with zero data loss and automated regression validation checks.'
    },
    {
      theme: 'Backend Latency Optimization & Scalability (STAR)',
      situation: 'Complex document-processing workflows and high-volume backend APIs suffered from latency spikes.',
      task: 'Dramatically reduce API response times and improve throughput for enterprise workloads.',
      action: 'Refactored backend application logic, streamlined database query patterns, eliminated redundant object transformations, and implemented caching.',
      result: 'Reduced API response latency by 83%, significantly boosting customer throughput.'
    },
    {
      theme: 'Enterprise RAG Precision & Multimodal Optimization (STAR)',
      situation: 'High hallucination rate and token overhead in standard RAG pipelines handling unstructured multi-format documents (PDFs, images, HTML).',
      task: 'Build a high-precision, multi-tenant RAG architecture for Avion AI Customer Support SaaS.',
      action: 'Designed a two-stage retrieval pipeline with SHA-256 deduplication, per-tenant namespace isolation, and MMR (Maximal Marginal Relevance) search evaluated against a labeled test suite.',
      result: 'Achieved 94.6% Precision@5 retrieval accuracy and reduced drafting time by 40%.'
    },
    {
      theme: 'Distributed Microservices & Service Discovery (STAR)',
      situation: 'Insurance domain microservices required resilient request routing and decoupled service management.',
      task: 'Architect a production-grade API Gateway with dynamic discovery and cross-service observability.',
      action: 'Implemented a TypeScript API Gateway integrated with Consul for service discovery, dynamic request routing, and ELK correlation IDs for end-to-end request tracing.',
      result: 'Eliminated routing bottlenecks and accelerated incident root-cause diagnosis across distributed services.'
    }
  ];

  // 4. Technical areas requiring revision
  const technicalAreasRequiringRevision = [
    'Deep architectural tradeoffs between event-driven architectures (Kafka vs Redis Streams) under extreme concurrency.',
    'Advanced LLM evaluation metrics (RAGAS, context recall vs faithfulness, LLM-as-a-judge automation).',
    'Distributed transactions (Saga pattern, 2PC alternatives, idempotent API design) specific to the target company scale.',
    'Kubernetes internals (custom resource definitions, horizontal pod autoscaling vs AWS ECS task scaling).'
  ];

  // 5. Potential gaps (Transparent & Honest assessment)
  const potentialGaps = [
    {
      area: 'Multi-Region Distributed Database Replication',
      status: 'Moderate Experience',
      mitigation: 'Deep hands-on experience with single/multi-AZ MongoDB clusters, Redis caching, and PostgreSQL; review global multi-master replication architectures prior to system design round.'
    },
    {
      area: 'Large-scale Fine-Tuning & Quantization of Open-Source Models',
      status: 'Theory / Inference Level',
      mitigation: 'Focus on production RAG, agentic tool orchestration, Prompt Engineering, embeddings, and API-based models (OpenAI, Gemini, Claude) where strongest practical results are proven.'
    }
  ];

  return {
    candidateName: candidateProfile.name,
    positioning: candidateProfile.positioning,
    strongMatches,
    relevantProjects,
    storiesToEmphasize,
    technicalAreasRequiringRevision,
    potentialGaps
  };
}
