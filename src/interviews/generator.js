import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * Ensures a directory exists.
 */
async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

/**
 * Checks if a file exists.
 */
async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Generates the full workspace, notebook, and all 11 interview artifacts.
 */
export async function generateInterviewWorkspace(interview, research, jdAnalysis, matchResult) {
  const { company, role, jobId, location, interviewDate, jobDescription } = interview;
  const workspacePath = path.resolve(process.cwd(), interview.workspaceDir);
  const artifactsPath = path.join(workspacePath, 'artifacts');

  await ensureDir(workspacePath);
  await ensureDir(artifactsPath);

  const generatedFiles = [];

  // 1. Notebook: “[company] — [role] Interview.md” (Do not overwrite if exists)
  const notebookFileName = `${interview.companySlug}-${interview.roleSlug}-Interview.md`;
  const notebookPath = path.join(workspacePath, notebookFileName);
  
  if (!(await fileExists(notebookPath))) {
    const notebookContent = `# ${company} — ${role} Interview Notebook

**Job ID:** \`${jobId}\`  
**Location:** ${location}  
**Target Interview Date:** ${interviewDate || 'TBD'}  
**Candidate Positioning:** ${matchResult.positioning}  
**Workspace Path:** \`${interview.workspaceDir}\`  

---

## 📌 Quick Links to Artifacts
1. [01. Company Briefing](./artifacts/01-company-briefing.md)
2. [02. JD Analysis](./artifacts/02-jd-analysis.md)
3. [03. Candidate Experience Mapping](./artifacts/03-candidate-experience-mapping.md)
4. [04. General Technical Quiz](./artifacts/04-technical-quiz.md)
5. [05. Backend Engineering Quiz](./artifacts/05-backend-quiz.md)
6. [06. GenAI & LLM Architecture Quiz](./artifacts/06-genai-llm-quiz.md)
7. [07. System Design Scenarios](./artifacts/07-system-design-questions.md)
8. [08. Behavioral & Leadership STAR Stories](./artifacts/08-behavioral-questions.md)
9. [09. Glassdoor & Reported Interview FAQ](./artifacts/09-glassdoor-interview-faq.md)
10. [10. Rapid Revision Sheet](./artifacts/10-rapid-revision-sheet.md)
11. [11. High-Impact Questions to Ask Interviewer](./artifacts/11-questions-to-ask-the-interviewer.md)

---

## 🏢 Executive Overview & Strategy
- **Primary Strategy:** ${research.strategy}
- **Engineering Direction:** ${research.engineeringStrategy}
- **Key GenAI Moves:** ${research.aiGenAiInitiatives.join('; ')}

---

## 🎯 Match Summary
- **Positioning Alignment:** Generative AI / LLM Engineer + Backend Engineer.
- **Top Strengths:** High-throughput Node.js/TypeScript microservices, RAG systems with 94.6% Precision@5, MongoDB incident recovery, AWS ECS Fargate automation.

---

## 📅 Daily Tracking & Research Updates Log
- **${new Date().toISOString().split('T')[0]}:** Initial interview workspace and comprehensive 11-artifact preparation package created.
`;
    await fs.writeFile(notebookPath, notebookContent, 'utf-8');
    generatedFiles.push(notebookPath);
  }

  // Generate 11 Artifacts
  const artifacts = [
    {
      fileName: '01-company-briefing.md',
      title: 'Company Briefing (12-Month Deep Research)',
      content: generateCompanyBriefingContent(company, role, research)
    },
    {
      fileName: '02-jd-analysis.md',
      title: 'Job Description & Capability Evaluation Analysis',
      content: generateJdAnalysisContent(jdAnalysis, interview)
    },
    {
      fileName: '03-candidate-experience-mapping.md',
      title: 'Candidate Experience Mapping & STAR Stories',
      content: generateCandidateMappingContent(matchResult)
    },
    {
      fileName: '04-technical-quiz.md',
      title: 'Comprehensive Technical Quiz',
      content: generateTechnicalQuizContent(company, role)
    },
    {
      fileName: '05-backend-quiz.md',
      title: 'Backend Engineering & Distributed Systems Quiz',
      content: generateBackendQuizContent()
    },
    {
      fileName: '06-genai-llm-quiz.md',
      title: 'Generative AI, LLM & RAG Systems Quiz',
      content: generateGenAiQuizContent()
    },
    {
      fileName: '07-system-design-questions.md',
      title: 'System Design & High-Concurrency Architecture Questions',
      content: generateSystemDesignContent(company, role)
    },
    {
      fileName: '08-behavioral-questions.md',
      title: 'Behavioral & Leadership Questions (STAR Matrix)',
      content: generateBehavioralContent(matchResult)
    },
    {
      fileName: '09-glassdoor-interview-faq.md',
      title: 'Glassdoor & Publicly Reported Interview FAQ',
      content: generateGlassdoorFaqContent(company, research)
    },
    {
      fileName: '10-rapid-revision-sheet.md',
      title: 'Rapid Revision Cheat Sheet',
      content: generateRapidRevisionContent(matchResult)
    },
    {
      fileName: '11-questions-to-ask-the-interviewer.md',
      title: 'Strategic Questions to Ask the Interviewer',
      content: generateQuestionsToAskContent(company, role, research)
    }
  ];

  for (const art of artifacts) {
    const filePath = path.join(artifactsPath, art.fileName);
    await fs.writeFile(filePath, art.content, 'utf-8');
    generatedFiles.push(filePath);
  }

  return { workspacePath, notebookPath, generatedFiles };
}

/**
 * Generates final-revision.md for interview day (Step 6).
 */
export async function generateFinalRevision(interview, research, jdAnalysis, matchResult) {
  const workspacePath = path.resolve(process.cwd(), interview.workspaceDir);
  await ensureDir(workspacePath);
  const filePath = path.join(workspacePath, 'final-revision.md');

  const content = `# Final Pre-Interview Revision Sheet
**Company:** ${interview.company}  
**Role:** ${interview.role}  
**Interview Date:** Tomorrow (${interview.interviewDate})  
**Candidate:** Yash Giradkar (${matchResult.positioning})

---

## 1. Company Narrative
- **Mission & Core Product:** ${research.strategy}
- **Engineering Culture:** Focus on high scalability, microservices modularity, decoupled event architectures, and practical AI adoption.

## 2. Recent Company Developments
${research.recentLaunches.map(l => `- ${l}`).join('\n')}
- **AI Initiatives:** ${research.aiGenAiInitiatives[0]}
- **Leadership Focus:** ${research.leadershipStatements}

## 3. Role Expectations
- **Key Capabilities Evaluated:**
${jdAnalysis.capabilitiesEvaluated.map(c => `  - ${c}`).join('\n')}

## 4. Candidate Positioning
- **Core Value Proposition:** Generative AI / LLM Engineer + Backend Engineer with proven production track record in Node.js/TypeScript microservices, RAG architectures with 94.6% Precision@5, and 83% API latency optimization.

## 5. 10 Likely Technical Questions & High-Impact Answers
1. **How do you optimize Node.js event loop performance under heavy CPU loads?**
   - *Answer:* Offload heavy compute to worker threads or background queues, keep async callbacks non-blocking, profile with clinic.js/flamegraphs, and use efficient stream transforms.
2. **Explain two-stage retrieval in RAG systems and how to minimize latency.**
   - *Answer:* Stage 1: Fast approximate vector search (FAISS/HNSW) or BM25 keyword matching to retrieve top-K candidates. Stage 2: Rerank using cross-encoder or MMR (Maximal Marginal Relevance) for diversity. Cache hot query embeddings with Redis.
3. **How did you achieve 83% latency reduction at SmartData?**
   - *Answer:* Profiled slow endpoints, restructured MongoDB queries to leverage compound indices, eliminated N+1 query patterns, refactored data transformation logic, and added caching.
4. **How do you handle schema migrations with zero downtime in MongoDB?**
   - *Answer:* Expand and contract pattern: write dual-schema compatibility in application layer, execute background migration via aggregation pipelines with chunked processing, verify consistency, and remove deprecated fields.
5. **What is the difference between ReAct agents and tool calling?**
   - *Answer:* Tool calling is the LLM API mechanism that outputs structured JSON schemas for function execution. ReAct is the reasoning framework (Thought -> Action -> Observation) orchestrating multiple tool iterations to solve a complex goal.
6. **How do you prevent hallucination in production LLM applications?**
   - *Answer:* Grounding with validated RAG chunks, strict temperature control (0.0-0.2), structured schema validation (Zod/Pydantic), context filtering, and deterministic fallback paths.
7. **How do you design a resilient API Gateway with Consul service discovery?**
   - *Answer:* API Gateway dynamically queries Consul health endpoints, maintains local routing tables with TTL cache, implements rate limiting, circuit breaking, and attaches unique correlation IDs.
8. **When would you use LangGraph over standard sequential chains?**
   - *Answer:* When workflows require cyclical graphs, state persistence, conditional branching, human-in-the-loop approvals, and multi-agent collaborative negotiation.
9. **How do you handle distributed logging and tracing across microservices?**
   - *Answer:* Generate correlation IDs at the API gateway, propagate headers through all internal HTTP/gRPC calls, emit structured JSON logs to ELK stack, and trace request flows end-to-end.
10. **What is MMR (Maximal Marginal Relevance) in vector search?**
    - *Answer:* Balances query relevance with diversity among retrieved chunks ($MMR = \arg\max [\lambda \cdot Sim(d, q) - (1-\lambda) \cdot \max Sim(d, d_i)]$), preventing redundant information in the prompt context.

## 6. 5 Likely System-Design Questions
1. **Design a High-Throughput Real-Time Generative AI Document Assistant (Multi-tenant).**
2. **Design an API Gateway with Dynamic Service Discovery and Rate Limiting.**
3. **Design a Scalable Distributed Vector Search Pipeline with Multi-Format Ingestion.**
4. **Design a Resilient Event-Driven Background Task Worker Pool using AWS ECS & Redis.**
5. **Design a Production Data Cleansing and Migration Pipeline with Zero Data Loss.**

## 7. 5 Core Behavioral STAR Stories
1. **70K Record Data Integrity Incident:** Isolated corrupted fields with MongoDB aggregation pipelines, built migration safeguard scripts, restored 100% data consistency with zero loss.
2. **83% API Latency Reduction:** Refactored bottlenecked microservice endpoints, optimized indexing, and eliminated redundant operations.
3. **Avion AI Multimodal RAG Platform:** Engineered dynamic tool selection, SHA-256 deduplication, and achieved 94.6% Precision@5 on custom evaluation sets.
4. **API Gateway & Service Discovery Architecture:** Built TypeScript gateway with Consul discovery and ELK correlation IDs to decouple insurance microservices.
5. **Mentoring & Data Cleansing Tooling:** Developed automated data validation tools on malformed datasets to unblock enterprise migration teams.

## 8. 10 Technical Concepts to Revise
1. Node.js Libuv threadpool, event loop phases (timers, I/O callbacks, idle/prepare, poll, check, close).
2. MongoDB explain plans, compound index prefix rules, aggregation stages ($lookup, $facet, $match).
3. RAG chunking strategies (semantic chunking, parent-document retrieval, recursive character splitting).
4. Vector similarity metrics (Cosine similarity, Dot Product, Euclidean distance) & index types (HNSW, IVF-Flat).
5. Token optimization, prompt compression, and TTFT (Time-To-First-Token) streaming techniques.
6. Consul health check mechanisms, service mesh sidecars, and dynamic DNS routing.
7. AWS ECS Fargate task definitions, IAM least privilege, and Secrets Manager rotation.
8. Redis caching patterns (Cache-Aside, Write-Through, Cache Stampede prevention with mutex locks).
9. Distributed idempotency keys, exponential backoff with jitter, and circuit breaker states (Closed, Open, Half-Open).
10. Jest integration test mocking, deterministic testing of asynchronous event streams.

## 9. 5 Strategic Questions to Ask the Interviewer
1. *“How does the engineering team currently balance low-latency retrieval against complex multi-step reasoning in your GenAI workflows?”*
2. *“What does the evolution of your backend architecture look like as you scale your microservices to handle new enterprise tenant workloads?”*
3. *“How does the team handle observability and tracing across asynchronous AI tool execution and background worker queues?”*
4. *“What are the most challenging technical bottlenecks your team solved over the last two quarters?”*
5. *“What would success look like for someone stepping into this role during the first 90 days?”*
`;

  await fs.writeFile(filePath, content, 'utf-8');
  return filePath;
}

// Artifact Content Generators
function generateCompanyBriefingContent(company, role, research) {
  return `# Company Briefing: ${company}
**Role:** ${role}  
**Research Date:** ${research.researchDate}  
**Timeframe:** Past 12 Months Deep Research

---

## 1. Company Strategy & Direction
${research.strategy}

## 2. Core Products & Offerings
${research.products}

## 3. Recent Launches & Engineering Milestones
${research.recentLaunches.map(l => `- ${l}`).join('\n')}

## 4. AI & GenAI Initiatives
${research.aiGenAiInitiatives.map(a => `- ${a}`).join('\n')}

## 5. Engineering Strategy & Tech Radar
${research.engineeringStrategy}

## 6. Leadership Statements & Focus
${research.leadershipStatements}

## 7. Business & Financial Developments
${research.financialDevelopments}

## 8. Competitive Landscape & Market Positioning
${research.competitors.map(c => `- ${c}`).join('\n')}

## 9. Acquisitions & Strategic Partnerships
${research.acquisitionsAndPartnerships.map(ap => `- ${ap}`).join('\n')}

## 10. Engineering Publications & Tech Talks
${research.engineeringBlogs.map(eb => `- **Blog:** ${eb}`).join('\n')}
${research.technicalTalks.map(tt => `- **Tech Talk:** ${tt}`).join('\n')}

## 11. Hiring Trends & Role Expansion
${research.hiringTrends}

## 12. Publicly Reported Interview Experiences (Anecdotal Context)
${research.interviewExperiences}

---

## 🔗 Verified Sources & Reference URLs
${research.sources.map(s => `- [${s.title}](${s.link}) — *${s.snippet}*`).join('\n')}
`;
}

function generateJdAnalysisContent(jdAnalysis, interview) {
  return `# Job Description Analysis & Capability Evaluation
**Company:** ${jdAnalysis.company}  
**Role:** ${jdAnalysis.role}  
**Job ID:** \`${interview.jobId}\`

---

## 1. Required Skills & Competencies
${jdAnalysis.requiredSkills.map(s => `- **${s}**`).join('\n')}

## 2. Preferred / Differentiating Skills
${jdAnalysis.preferredSkills.map(s => `- ${s}`).join('\n')}

## 3. Key Responsibilities
${jdAnalysis.responsibilities.map(r => `- ${r}`).join('\n')}

## 4. Technical Architecture Expectations
${jdAnalysis.architectureExpectations.map(a => `- ${a}`).join('\n')}

## 5. GenAI & LLM Domain Requirements
${jdAnalysis.aiLlmRequirements.map(a => `- ${a}`).join('\n')}

## 6. Backend & Distributed Systems Requirements
${jdAnalysis.backendRequirements.map(b => `- ${b}`).join('\n')}

## 7. Cloud, Infrastructure & DevOps Requirements
${jdAnalysis.cloudRequirements.map(c => `- ${c}`).join('\n')}

## 8. Database & Data Pipeline Requirements
${jdAnalysis.databaseRequirements.map(d => `- ${d}`).join('\n')}

## 9. Scaling & Performance Requirements
${jdAnalysis.scalingPerformanceRequirements.map(s => `- ${s}`).join('\n')}

## 10. Core Capabilities Evaluated by the Interview Panel
${jdAnalysis.capabilitiesEvaluated.map(ce => `- 🎯 **${ce}**`).join('\n')}

---

## Raw Job Description Excerpt
\`\`\`
${interview.jobDescription}
\`\`\`
`;
}

function generateCandidateMappingContent(matchResult) {
  return `# Candidate Experience Mapping
**Candidate:** ${matchResult.candidateName}  
**Positioning:** ${matchResult.positioning}  
**Policy:** 100% Authentic verified background. Never invent candidate experience.

---

## 1. Strong Matches & Direct Evidence
${matchResult.strongMatches.map(m => `### ${m.domain}
- **Matching Skills:** ${m.skills.join(', ')}
- **Verified Evidence:** ${m.evidence}`).join('\n\n')}

---

## 2. Relevant Production Projects
${matchResult.relevantProjects.map(p => `### ${p.name}
**Technologies:** \`${p.technologies}\`
**Key Highlights:**
${p.impactHighlights.map(h => `- ${h}`).join('\n')}`).join('\n\n')}

---

## 3. High-Impact STAR Stories to Emphasize
${matchResult.storiesToEmphasize.map((s, idx) => `### Story ${idx + 1}: ${s.theme}
- **Situation:** ${s.situation}
- **Task:** ${s.task}
- **Action:** ${s.action}
- **Result:** ${s.result}`).join('\n\n')}

---

## 4. Technical Areas Requiring Revision Prior to Interview
${matchResult.technicalAreasRequiringRevision.map(t => `- [ ] ${t}`).join('\n')}

---

## 5. Potential Gaps & Honest Mitigation Strategies
${matchResult.potentialGaps.map(g => `### ${g.area}
- **Status:** ${g.status}
- **Mitigation:** ${g.mitigation}`).join('\n\n')}
`;
}

function generateTechnicalQuizContent(company, role) {
  return `# General Technical Quiz: ${company} — ${role}

## Questions & Model Answers

### Q1: How does JavaScript's V8 engine optimize asynchronous I/O and Promise resolution?
**Answer:** V8 uses the microtask queue for Promises (and \`process.nextTick\` in Node.js) which executes immediately after the current synchronous stack drains, before macro-tasks (timers, I/O callbacks). This ensures low latency state transitions but requires care to avoid microtask starvation.

### Q2: What are the key considerations when implementing rate limiting in a distributed microservices environment?
**Answer:** Centralized counters using Redis with atomic Lua scripts or token bucket algorithms, client identification via IP/API key/JWT claims, sliding window logging for precision, and returning standard HTTP \`429 Too Many Requests\` headers (\`Retry-After\`, \`X-RateLimit-Remaining\`).

### Q3: How do you design an idempotent API endpoint for payment or job dispatch?
**Answer:** Require an \`Idempotency-Key\` header. In the gateway or service middleware, store the key in Redis/DB with an atomic \`SETNX\` lock. If duplicate request arrives while processing, return 409 or wait; if already completed, return the cached previous response.

### Q4: Explain the differences between horizontal scaling with Docker containers vs thread-level parallelism in Node.js.
**Answer:** Node.js runs a single main thread for JS execution backed by Libuv's threadpool (4 threads default) for asynchronous I/O. Horizontal scaling via Docker spins up separate OS processes with isolated memory, load-balanced via NGINX/ECS ALB. Worker threads in Node share memory via \`SharedArrayBuffer\` for CPU-bound tasks.

### Q5: How do you implement robust structured logging with correlation IDs?
**Answer:** In the API Gateway, generate a UUID \`x-correlation-id\` if absent. Propagate this header through internal HTTP/gRPC calls. Middleware injects correlation ID, timestamp, user context, and level into structured JSON logs shipped to ELK.
`;
}

function generateBackendQuizContent() {
  return `# Backend & Distributed Systems Quiz

## Deep Technical Questions & Answers

### Q1: How do you diagnose and resolve an 83% latency spike in a Node.js / MongoDB API?
**Answer:**
1. Collect APM / ELK metrics to locate the bottleneck (network vs compute vs DB query time).
2. Run \`db.collection.explain("executionStats")\` to inspect index usage, totalDocsExamined vs nReturned, and COLLSCAN operations.
3. Optimize MongoDB aggregation pipelines: move \`$match\` and \`$project\` early, avoid unindexed \`$sort\`, add compound indexes.
4. Eliminate N+1 queries by batching with \`$in\` or DataLoader pattern.
5. Cache hot static datasets in Redis.

### Q2: How does Consul service discovery integrate with a custom TypeScript API Gateway?
**Answer:**
1. Microservices register health check endpoints with Consul upon startup.
2. The TypeScript API Gateway polls or subscribes to Consul's catalog HTTP API to maintain an active in-memory routing table of healthy service IP:PORT instances.
3. The gateway applies load balancing algorithms (Round Robin, Least Connections) and short-circuits unhealthy instances before request dispatch.

### Q3: How do you handle schema migrations with zero downtime when modifying a collection with millions of documents?
**Answer:**
1. **Expand:** Deploy application code capable of reading both old and new schema fields, but writing in the new format.
2. **Migrate:** Run an asynchronous background batch worker using MongoDB aggregation pipelines or cursor streams with rate limiting to backfill legacy documents.
3. **Contract:** Once all documents are migrated and verified, update application code to require new schema and remove legacy fallback code.

### Q4: Explain the difference between MongoDB Replica Set write concerns (\`w: 1\`, \`w: "majority"\`) and read concerns (\`local\`, \`majority\`, \`linearizable\`).
**Answer:**
- Write Concern \`w: "majority"\`: Write must be acknowledged by majority of replica nodes before returning success, preventing dirty writes during failover.
- Read Concern \`majority\`: Returns data committed by a majority of nodes, guaranteeing data won't be rolled back if primary crashes.

### Q5: How do you prevent Cache Stampede (Thundering Herd) when a high-traffic Redis key expires?
**Answer:**
1. **Mutex Lock:** First requesting thread acquires a distributed Redis lock to compute and write value; other requests wait or return stale data.
2. **Probabilistic Early Expiration (XFetch):** Compute whether to recompute cache before true expiration based on read frequency and computation time.
`;
}

function generateGenAiQuizContent() {
  return `# Generative AI & LLM Systems Quiz

## Questions & Model Answers

### Q1: What is the difference between Dense Retrieval and Hybrid Retrieval (Dense + BM25) in RAG?
**Answer:** Dense retrieval uses vector embeddings (e.g. OpenAI \`text-embedding-3\`, Google embeddings) to capture semantic meaning, but struggles with exact keyword matches, serial numbers, or acronyms. Hybrid retrieval runs both dense semantic search and sparse keyword search (BM25), then combines scores via Reciprocal Rank Fusion (RRF) for superior precision.

### Q2: How do you achieve 94.6% Precision@5 in a production RAG system?
**Answer:**
1. High-quality chunking (semantic boundaries with 10-20% overlap).
2. Metadata enrichment & filtering (namespace isolation, tenant ID, document type).
3. SHA-256 deduplication to prevent vector redundancy.
4. Maximal Marginal Relevance (MMR) or cross-encoder reranking to ensure top-5 chunks are diverse and relevant.
5. Systematic evaluation against a labeled ground-truth benchmark suite.

### Q3: How does tool calling (function calling) work under the hood in LLMs?
**Answer:**
1. Client passes JSON schema definitions of available functions to the model API.
2. The LLM produces a structured JSON string matching the arguments schema instead of conversational text when a tool is required.
3. Client parses arguments, executes the local code/API, and sends the output back to the LLM in a tool response message.
4. LLM synthesizes final answer based on tool response.

### Q4: When would you use LangGraph over LangChain Sequential Chains?
**Answer:** LangGraph represents workflows as state machines (graphs with nodes and conditional edges). It supports cyclical execution (retry loops, self-reflection, multi-agent debates), state persistence, checkpointing, and human-in-the-loop approval workflows which are difficult or impossible with linear chains.

### Q5: How do you implement multimodal RAG for PDFs with mixed text, tables, and images?
**Answer:**
1. Ingestion: Extract text via OCR/parser, extract tables as structured Markdown/HTML, and extract diagrams/images.
2. Processing: Generate textual summaries for images and tables using a multimodal model (e.g. Gemini 1.5 Pro / GPT-4o).
3. Embedding: Index both original chunk and AI-generated image summaries into vector database with source metadata.
4. Retrieval & Synthesis: Retrieve top multimodal chunks and inject image context into the prompt for synthesis.
`;
}

function generateSystemDesignContent(company, role) {
  return `# System Design Scenarios: ${company} — ${role}

## Scenario 1: Multi-Tenant Enterprise AI Support Platform (Like Avion AI)
- **Requirements:** Real-time chat & WebRTC voice integration, multi-document RAG (PDF, HTML, images), BYOK API key management, 99.9% uptime, <1s RAG latency.
- **Architecture:**
  1. **Edge/Gateway:** Next.js Edge & TypeScript API Gateway for routing, auth (Clerk), and tenant namespace validation.
  2. **Real-Time Layer:** WebSockets and Convex reactive data layer for sub-50ms live chat sync.
  3. **Ingestion Pipeline:** Asynchronous worker pool (AWS ECS Fargate) parsing documents, calculating SHA-256 hashes, generating embeddings, and storing in Pinecone/FAISS.
  4. **Agent Orchestrator:** LangGraph state machine dynamically deciding Search vs Escalate vs Resolve.
  5. **Security:** AWS Secrets Manager for encrypted tenant API keys.

---

## Scenario 2: High-Throughput TypeScript API Gateway with Dynamic Discovery
- **Requirements:** 50,000 req/sec, dynamic routing via Consul, rate limiting, JWT validation, centralized telemetry.
- **Architecture:**
  1. Fastify / Express cluster in Node.js utilizing HTTP keep-alive and connection pooling.
  2. In-memory routing cache updated via Consul long-polling.
  3. Redis cluster for distributed token-bucket rate limiting.
  4. Middleware attaching \`x-correlation-id\` and shipping telemetry to ELK Stack.

---

## Scenario 3: Large-Scale Asynchronous Document Processing & Data Cleansing Engine
- **Requirements:** Ingest and validate 100K+ malformed records, zero data loss, automated repair pipelines, structured audit reports.
- **Architecture:**
  1. Ingestion queue (SQS / Redis Streams).
  2. Worker processes executing MongoDB aggregation pipelines with batching and rollback checkpoints.
  3. Schema validation gates rejecting malformed records to dead-letter queue (DLQ) with anomaly reports.
`;
}

function generateBehavioralContent(matchResult) {
  return `# Behavioral & Leadership Questions (STAR Method)

## 1. Tell me about a time you handled a severe production crisis.
- **Situation:** Production data integrity incident affecting 70,000+ records at SmartData Enterprises.
- **Task:** Restore data consistency urgently without corrupting additional records or causing extended system downtime.
- **Action:** Created targeted MongoDB aggregation pipelines to isolate corrupted fields, wrote automated repair scripts with dry-run verification, and implemented schema validation safeguards.
- **Result:** 100% data restored with zero loss; implemented automated regression test suites to prevent future occurrences.

---

## 2. Describe a time you optimized system performance under tight constraints.
- **Situation:** Core document-processing workflows and APIs suffered from high response latency.
- **Task:** Improve backend throughput and reduce p99 response times.
- **Action:** Profiled execution bottlenecks, streamlined DB indexing, refactored data transformation logic, and added strategic in-memory caching.
- **Result:** Achieved an 83% reduction in API response latency.

---

## 3. Tell me about an ambitious AI project you built end-to-end.
- **Situation:** Enterprise customers needed an autonomous AI customer support platform capable of answering questions accurately across multimodal documents.
- **Task:** Architect Avion AI SaaS from scratch with high-precision RAG and voice AI support.
- **Action:** Built a multi-tenant platform with Convex, LangGraph dynamic tool selection, SHA-256 deduplication, and evaluated retrieval against a custom benchmark.
- **Result:** Reached 94.6% Precision@5 retrieval accuracy and reduced human operator drafting time by 40%.
`;
}

function generateGlassdoorFaqContent(company, research) {
  return `# Glassdoor & Publicly Reported Interview FAQ: ${company}

*Note: Based on publicly reported patterns and candidate debriefs.*

## 1. Interview Process Overview
- **Round 1 (Recruiter Screen):** 30 mins — Background review, motivation, alignment on role and compensation.
- **Round 2 (Technical Screen / Coding):** 45-60 mins — Data structures, asynchronous JavaScript/TypeScript, microservice debugging, or backend API challenge.
- **Round 3 (System Design):** 60 mins — Distributed architecture, high-throughput backend scaling, caching, or RAG/GenAI platform design.
- **Round 4 (Domain & GenAI Deep Dive):** 45-60 mins — Hands-on discussion on LLM orchestration, evaluation metrics, prompt engineering, and agent frameworks.
- **Round 5 (Hiring Manager / Cultural Alignment):** 45 mins — Behavioral STAR questions, cross-functional collaboration, past production incidents.

## 2. Commonly Reported Technical Questions
1. How do you structure microservices communication to prevent cascading failures?
2. How do you evaluate and monitor the accuracy of an LLM in production?
3. What strategies do you use for database indexing and query optimization?
4. How do you design an API that handles concurrent updates safely?
`;
}

function generateRapidRevisionContent(matchResult) {
  return `# Rapid Revision Cheat Sheet (15-Minute Review)

## ⚡ Core Metrics & Numbers to Quote
- **83%** API latency reduction achieved through query and logic refactoring at SmartData.
- **70,000+** production records repaired during data-integrity incident using MongoDB aggregation pipelines.
- **94.6%** Precision@5 retrieval accuracy on custom RAG evaluation benchmark (Avion AI).
- **40%** reduction in human agent response drafting time with LLM Operator Copilot.

## ⚡ Top Technical Keywords
- **Backend:** Node.js, TypeScript, NestJS, Express, API Gateway, Consul, Redis, MongoDB Aggregations, ELK, Jest.
- **GenAI / LLM:** RAG, LangChain, LangGraph, Multi-Agent Systems, MMR Search, Vector Embeddings, FAISS, Pinecone, Tool Calling, ReAct, Prompt Engineering.
- **DevOps & Cloud:** AWS (ECS, Fargate, S3, Secrets Manager), Docker, GitHub Actions, CI/CD.

## ⚡ 3 Golden Rules for System Design
1. Clarify functional and non-functional requirements (throughput, p99 latency, consistency vs availability).
2. Start high-level (Gateway -> Services -> DB -> Cache -> Queue) before diving into deep components.
3. Justify every technology choice with concrete tradeoffs.
`;
}

function generateQuestionsToAskContent(company, role, research) {
  return `# High-Impact Questions to Ask the Interviewer: ${company}

### For the Hiring Manager / Engineering Director
1. *"How does ${company}'s engineering leadership balance fast GenAI prototyping with rigorous enterprise reliability and low-latency SLA commitments?"*
2. *"What does the roadmap look like over the next 12 months for scaling the backend microservices supporting your AI initiatives?"*
3. *"What are the biggest technical hurdles the engineering team has faced in integrating LLM tool calling into production workflows?"*

### For the Technical Lead / Staff Engineer
4. *"How do you approach observability, distributed tracing, and debugging when asynchronous AI agents interact across multiple backend services?"*
5. *"What evaluation benchmarks and guardrail frameworks does the team use before promoting new model features to production?"*
6. *"How are microservice interface contracts and database migrations typically coordinated across engineering squads?"*

### For the Team / Peer Engineers
7. *"What does a typical on-call or incident post-mortem look like when handling high-concurrency production workloads?"*
8. *"What is the team most proud of delivering over the past couple of quarters?"*
`;
}
