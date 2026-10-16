/**
 * Candidate Profile for Yash Giradkar
 * Positioning: Generative AI / LLM Engineer + Backend Engineer
 * Strictly preserves true background; never invents experience.
 */

export const candidateProfile = {
  name: 'Yash Giradkar',
  email: 'yashgiradkar02@gmail.com',
  phone: '7030144323',
  linkedin: 'https://www.linkedin.com/in/yash-giradkar-42936b1b5/',
  github: 'https://github.com/Yashgiradkar',
  portfolio: 'https://yashgiradkar.netlify.app/',
  
  positioning: 'Generative AI / LLM Engineer + Backend Engineer',
  
  coreExperience: [
    'Node.js',
    'TypeScript',
    'NestJS',
    'Express',
    'MongoDB',
    'Microservices',
    'API Gateway',
    'Distributed systems',
    'RAG',
    'LangChain',
    'LangGraph',
    'AI agents',
    'LLM applications',
    'AWS',
    'Docker',
    'CI/CD',
    'Performance optimization'
  ],

  skillsByCategory: {
    languages: ['TypeScript', 'JavaScript', 'Python', 'SQL'],
    backend: ['Node.js', 'NestJS', 'Express.js', 'FastAPI', 'Django', 'Convex'],
    databases: ['MongoDB', 'PostgreSQL', 'Redis', 'Pinecone', 'FAISS', 'MongoDB Aggregations'],
    cloudDevops: ['AWS (EC2, S3, Fargate, ECS, EKS, IAM, SecretsManager)', 'Docker', 'Git', 'GitHub Actions', 'CI/CD'],
    frontend: ['React', 'Next.js', 'Redux', 'Jotai', 'TailwindCSS', 'Turborepo'],
    aiLlm: [
      'LLMs', 'OpenAI', 'LangChain', 'LangGraph', 'Multi-Agent Systems', 'Multimodal RAG',
      'Tool Calling / Function Calling', 'ReAct Agents', 'Voice AI', 'Human-in-the-Loop (HITL)',
      'Prompt Engineering', 'Vector Embeddings', 'MMR Retrieval', 'Context Filtering'
    ],
    architecture: [
      'Microservices', 'API Gateway', 'REST APIs', 'Multi-Tenant SaaS',
      'System Design', 'WebSockets', 'Consul Service Discovery', 'Distributed Systems',
      'SOAP/XML Integration', 'Correlation IDs & ELK Stack'
    ]
  },

  workHistory: [
    {
      company: 'SmartData Enterprises',
      role: 'Software Associate Level II',
      period: 'September 2024 – Present',
      location: 'Nagpur',
      highlights: [
        {
          title: 'Backend API & Document Workflow Optimization',
          detail: 'Optimized backend APIs and document-processing workflows through application logic and query optimizations, reducing API response latency by 83%.'
        },
        {
          title: 'Production Data-Integrity Incident Resolution',
          detail: 'Repaired 70K+ corrupted records during a production data-integrity incident using MongoDB aggregation pipelines, implemented validation checks and migration safeguards to restore data consistency.'
        },
        {
          title: 'Microservice API Gateway & Service Discovery',
          detail: 'Built and maintained a production-grade TypeScript API Gateway for insurance microservices, using Consul service discovery to implement dynamic request routing and resolving production incidents and service-integration issues.'
        },
        {
          title: 'Centralized Observability & Logging',
          detail: 'Leveraged the ELK Stack and correlation IDs for centralized log analysis across services, following request flows across API, service, and database operations to diagnose production issues and accelerate root-cause analysis.'
        },
        {
          title: 'Data Cleansing & Automated Validation',
          detail: 'Improved data quality and migration readiness by analyzing Excel datasets for malformed and boundary-inconsistent records, automated data cleansing/validation workflows, and generated structured analysis reports.'
        },
        {
          title: 'Automated Testing & Reliability',
          detail: 'Strengthened backend reliability with Jest-based automated testing, developing unit tests, data-validation test suites, and SOAP endpoint validation tests for critical financial workflows.'
        }
      ]
    }
  ],

  projects: [
    {
      name: 'Avion AI Customer Support Platform',
      url: 'https://aivon-dashboard.vercel.app/',
      technologies: ['Next.js', 'Convex', 'Turborepo', 'Clerk', 'VapiAI', 'RAG', 'AWS Secrets Manager', 'Svix'],
      highlights: [
        'Built a multi-tenant AI customer support SaaS with organization-level access control and a Convex-backed autonomous support agent.',
        'Engineered dynamic tool selection across Search, Escalate, and Resolve with two-stage, multi-model response synthesis.',
        'Evaluated RAG retrieval against a labeled evaluation set, achieving 94.6% Precision@5.',
        'Implemented multimodal RAG processing for PDFs, images, and HTML with context filtering, per-tenant namespace isolation, and SHA-256 content deduplication.',
        'Built an AI-assisted omnichannel support system combining reactive real-time chat, VapiAI WebRTC voice calls, and an LLM-powered Operator Copilot, reducing agent response drafting time by 40%.',
        'Implemented an enterprise BYOK security architecture using AWS Secrets Manager and Svix-verified billing webhooks.'
      ]
    },
    {
      name: 'Multi-Document RAG Chatbot',
      technologies: ['Python', 'FastAPI', 'LangChain', 'FAISS', 'Google Gemini', 'Docker', 'AWS Fargate', 'GitHub Actions'],
      highlights: [
        'Developed a multi-document RAG API using FastAPI, Python, and LangChain, implementing session-scoped FAISS indexes with Google embedding models and Maximal Marginal Relevance (MMR) search.',
        'Reduced retrieval latency by 30% and improved retrieval accuracy by 25% through optimized embedding and MMR-based retrieval workflows.',
        'Containerized application with Docker and automated deployment to AWS ECS Fargate using a GitHub Actions CI/CD pipeline.'
      ]
    }
  ],

  education: {
    degree: 'B.Tech, Computer Science & Engineering',
    institution: 'S.B. Jain Institute of Technology, Management & Research',
    period: '2020 – 2024'
  }
};
