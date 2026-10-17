import * as cheerio from 'cheerio';
import { candidateProfile } from '../interviews/candidateProfile.js';

/**
 * Clean up company name for precision search
 */
function cleanCompanyName(company) {
  return (company || '')
    .replace(/\b(inc|llc|corp|ltd|technologies|systems|labs|ai|io)\b/gi, '')
    .replace(/[^\w\s]/g, '')
    .trim();
}

/**
 * Extracts domain name from URL or company name
 */
function extractDomain(url, company) {
  if (url) {
    try {
      const parsed = new URL(url.startsWith('http') ? url : `https://${url}`);
      let hostname = parsed.hostname.replace(/^www\./, '');
      if (hostname.includes('.') && !hostname.includes('linkedin') && !hostname.includes('google')) {
        return hostname;
      }
    } catch {}
  }
  const clean = cleanCompanyName(company).toLowerCase().replace(/\s+/g, '');
  return `${clean}.com`;
}

/**
 * Performs search engine query and parses organic results
 */
async function searchWeb(query, limit = 5) {
  try {
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      }
    });

    if (!res.ok) return [];
    const html = await res.text();
    const $ = cheerio.load(html);
    const results = [];

    $('.result').each((i, el) => {
      if (results.length >= limit) return;
      const title = $(el).find('.result__title a').text().trim();
      const snippet = $(el).find('.result__snippet').text().trim();
      let rawLink = $(el).find('.result__url').attr('href') || $(el).find('.result__title a').attr('href');

      if (rawLink && rawLink.includes('uddg=')) {
        const match = rawLink.match(/uddg=([^&]+)/);
        if (match) rawLink = decodeURIComponent(match[1]);
      }

      if (title && rawLink && !rawLink.includes('duckduckgo.com')) {
        results.push({ title, snippet, link: rawLink });
      }
    });

    return results;
  } catch (err) {
    console.warn(`[AIEnhancer] Web search query failed "${query}": ${err.message}`);
    return [];
  }
}

/**
 * Fetches company live intelligence:
 * - What it does & core mission
 * - Recent news & headlines
 * - Company passion & engineering culture
 * - Key recent launches / technical milestones
 */
export async function fetchCompanyLiveIntel(company, role = '', link = '') {
  const companyClean = cleanCompanyName(company) || company;
  const domain = extractDomain(link, company);

  console.log(`[AIEnhancer] Fetching live web intelligence for ${company} (${domain})...`);

  // Parallel targeted searches
  const [newsResults, productResults, techResults] = await Promise.all([
    searchWeb(`"${companyClean}" news announcements headlines 2025 2026`, 4),
    searchWeb(`"${companyClean}" what does it do product mission platform`, 4),
    searchWeb(`"${companyClean}" engineering architecture AI initiatives tech stack`, 4)
  ]);

  // Aggregate headlines
  const headlines = [];
  const seenTitles = new Set();
  for (const item of [...newsResults, ...productResults, ...techResults]) {
    const t = item.title.replace(/\s*[-–|].*$/, '').trim();
    if (t && t.length > 10 && !seenTitles.has(t.toLowerCase())) {
      seenTitles.add(t.toLowerCase());
      headlines.push({
        title: item.title,
        snippet: item.snippet,
        link: item.link
      });
    }
    if (headlines.length >= 4) break;
  }

  // Synthesize "What It Does" from product snippets
  let whatItDoes = '';
  if (productResults.length > 0) {
    const topSnippets = productResults.map(r => r.snippet).filter(s => s && s.length > 20);
    whatItDoes = topSnippets[0] || `${company} develops modern software and enterprise platforms.`;
  } else {
    whatItDoes = `${company} is an innovative technology company building high-impact software and AI solutions.`;
  }

  // Synthesize "Company Passion & Mission"
  let passion = '';
  if (techResults.length > 0) {
    passion = techResults[0].snippet || 'Pioneering cutting-edge technology, scalable backend architectures, and high-performance product experiences.';
  } else {
    passion = 'Driving engineering excellence, high-throughput systems, and dependable AI workflow integration.';
  }

  // Synthesize "Key Recent Done / Milestones"
  const recentDone = [];
  for (const item of headlines.slice(0, 3)) {
    if (item.snippet) {
      recentDone.push(item.snippet);
    }
  }
  if (recentDone.length === 0) {
    recentDone.push(`Scaling multi-region cloud infrastructure and expanding core engineering platform capabilities.`);
    recentDone.push(`Advancing AI-driven automation, low-latency API integration, and enterprise customer features.`);
  }

  return {
    company,
    domain,
    whatItDoes,
    headlines,
    passion,
    recentDone
  };
}

/**
 * Calls Google Gemini API
 */
async function callGeminiApi(apiKey, model, systemPrompt, userMessage) {
  const modelName = model || 'gemini-1.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [
        {
          role: 'user',
          parts: [
            { text: `${systemPrompt}\n\n${userMessage}` }
          ]
        }
      ],
      generationConfig: {
        temperature: 0.35,
        maxOutputTokens: 2048,
        responseMimeType: 'application/json'
      }
    })
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini API error (${res.status}): ${errText}`);
  }

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Empty response received from Gemini API');
  return text;
}

/**
 * Calls OpenAI API
 */
async function callOpenAiApi(apiKey, model, systemPrompt, userMessage) {
  const modelName = model || 'gpt-4o-mini';
  const url = 'https://api.openai.com/v1/chat/completions';

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: modelName,
      temperature: 0.35,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage }
      ]
    })
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`OpenAI API error (${res.status}): ${errText}`);
  }

  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content;
  if (!text) throw new Error('Empty response received from OpenAI API');
  return text;
}

/**
 * Calls Anthropic Claude API
 */
async function callAnthropicApi(apiKey, model, systemPrompt, userMessage) {
  const modelName = model || 'claude-3-5-sonnet-20241022';
  const url = 'https://api.anthropic.com/v1/messages';

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: modelName,
      max_tokens: 2048,
      temperature: 0.35,
      system: systemPrompt,
      messages: [
        { role: 'user', content: `${userMessage}\n\nRespond with strict valid JSON only.` }
      ]
    })
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Anthropic API error (${res.status}): ${errText}`);
  }

  const data = await res.json();
  const text = data?.content?.[0]?.text;
  if (!text) throw new Error('Empty response received from Anthropic API');
  return text;
}

/**
 * Calls Local Ollama API
 */
async function callOllamaApi(ollamaUrl, model, systemPrompt, userMessage) {
  const endpoint = `${(ollamaUrl || 'http://localhost:11434').replace(/\/+$/, '')}/api/chat`;
  const modelName = model || 'llama3.2';

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: modelName,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `${userMessage}\n\nOutput ONLY strict valid JSON.` }
      ],
      stream: false,
      format: 'json',
      options: { temperature: 0.35 }
    })
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Ollama API error (${res.status}): ${errText}`);
  }

  const data = await res.json();
  return data?.message?.content;
}

/**
 * Built-in Intelligent Generative Synthesizer (Zero-Key Hybrid Engine).
 * Weaves the live-researched company facts, passion, headlines, and Yash's profile into an ultra-sharp cold email.
 */
function generateWithBuiltin({ company, role, recipientName, companyIntel, userPrompt }) {
  const firstName = (recipientName || '').trim().split(/\s+/)[0] || 'there';
  const roleDisplay = role ? role.trim() : 'Generative AI & Backend Engineer';
  const companyName = company || 'your team';

  // Extract cleanest company news hook
  let newsHook = '';
  if (companyIntel.headlines && companyIntel.headlines.length > 0) {
    const top = companyIntel.headlines[0];
    const cleanHeadline = top.title.replace(/\s*[-–|].*$/, '').trim();
    if (cleanHeadline && cleanHeadline.length < 90) {
      newsHook = `specially inspired by your work around <i>"${cleanHeadline}"</i>`;
    }
  }
  if (!newsHook && companyIntel.recentDone && companyIntel.recentDone.length > 0) {
    newsHook = `noticing your recent momentum in ${companyIntel.recentDone[0].slice(0, 100)}...`;
  }
  if (!newsHook) {
    newsHook = `following your engineering developments and product innovations`;
  }

  // Core company what it does summary
  const whatItDoesSnippet = companyIntel.whatItDoes 
    ? companyIntel.whatItDoes.replace(/\.\s.*$/, '.') 
    : `transforming how modern teams build and operate at scale.`;

  const subject = `${candidateProfile.name} — ${roleDisplay} at ${companyName} (${candidateProfile.positioning})`;

  const html = `
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 14.5px; line-height: 1.6; color: #111827; max-width: 580px; margin: 0 auto; padding: 4px;">
  <p style="margin-bottom: 14px;">Hi ${firstName},</p>

  <p style="margin-bottom: 14px;">
    I've been closely following ${companyName} — ${newsHook}. What stands out most about ${companyName} is how your team is ${whatItDoesSnippet}
  </p>

  <p style="margin-bottom: 14px;">
    Over the past 2–4 years, my focus has been on high-throughput backend infrastructure and production Generative AI systems. A few key highlights of what I've delivered:
  </p>

  <p style="margin-bottom: 8px;">&bull; <b>Agentic AI & RAG:</b> Multi-agent orchestration (LangChain, LangGraph), dynamic tool-calling, and hybrid vector retrieval achieving <b>94.6% Precision@5</b> (Avion AI Support Platform).</p>
  <p style="margin-bottom: 8px;">&bull; <b>High-Concurrency Backend:</b> Node.js, TypeScript, NestJS API Gateways and Python/FastAPI microservices (reduced production API latency by <b>83%</b>).</p>
  <p style="margin-bottom: 14px;">&bull; <b>Production Infrastructure:</b> Scalable MongoDB aggregations (repaired 70K+ records during an incident), PostgreSQL, Redis caching, Docker, and automated AWS (ECS/Fargate) CI/CD.</p>

  <p style="margin-bottom: 14px;">
    I have attached my resume for your review. Would you or an engineering manager on the team have 10 minutes this week for a brief introductory sync?
  </p>

  <p style="margin-top: 20px; font-size: 14px; color: #374151;">
    Best regards,<br>
    <strong style="color: #111827;">${candidateProfile.name}</strong><br>
    Generative AI & Backend Systems Engineer<br>
    <a href="${candidateProfile.portfolio}" style="color: #2563eb; text-decoration: none;">Portfolio</a> &bull; 
    <a href="${candidateProfile.linkedin}" style="color: #2563eb; text-decoration: none;">LinkedIn</a> &bull; 
    <a href="${candidateProfile.github}" style="color: #2563eb; text-decoration: none;">GitHub</a>
    ${candidateProfile.phone ? ` &bull; ${candidateProfile.phone}` : ''}
  </p>
</div>
`;

  const text = `Hi ${firstName},

I've been closely following ${companyName} — ${newsHook.replace(/<[^>]+>/g, '')}. What stands out most about ${companyName} is how your team is ${whatItDoesSnippet}

Over the past 2–4 years, my focus has been on high-throughput backend infrastructure and production Generative AI systems. A few key highlights of what I've delivered:

• Agentic AI & RAG: Multi-agent orchestration (LangChain, LangGraph), dynamic tool-calling, and hybrid vector retrieval achieving 94.6% Precision@5 (Avion AI Support Platform).
• High-Concurrency Backend: Node.js, TypeScript, NestJS API Gateways and Python/FastAPI microservices (reduced production API latency by 83%).
• Production Infrastructure: Scalable MongoDB aggregations (repaired 70K+ records during an incident), PostgreSQL, Redis caching, Docker, and automated AWS (ECS/Fargate) CI/CD.

I have attached my resume for your review. Would you or an engineering manager on the team have 10 minutes this week for a brief introductory sync?

Best regards,
${candidateProfile.name}
${candidateProfile.positioning}
Portfolio: ${candidateProfile.portfolio} | LinkedIn: ${candidateProfile.linkedin} | GitHub: ${candidateProfile.github} | Phone: ${candidateProfile.phone}
`;

  return {
    subject,
    html,
    text,
    providerUsed: 'builtin_hybrid_generator'
  };
}

/**
 * Main Orchestrator: Enhances cold outreach email using Company Live Data + User Prompt + LLM.
 */
export async function enhanceEmailWithPrompt(options = {}) {
  const {
    company,
    role,
    recipientName,
    link,
    userPrompt,
    provider = 'gemini',
    apiKey,
    model
  } = options;

  if (!company) {
    throw new Error('Company name is required for AI enhancement.');
  }

  // 1. Fetch Company Live Intel
  const companyIntel = await fetchCompanyLiveIntel(company, role, link);

  // 2. Prepare structured context for LLM
  const systemPrompt = `You are an elite, highly persuasive Technical Career Strategist and Executive Outreach Specialist.
Your mission is to generate a hyper-personalized, eye-catching, and enterprise-grade cold email from Yash Giradkar to an engineering leader or recruiter at ${company}.

CANDIDATE TRUE PROFILE (NEVER INVENT EXPERIENCES):
- Name: ${candidateProfile.name}
- Email: ${candidateProfile.email} | Phone: ${candidateProfile.phone}
- Positioning: ${candidateProfile.positioning} (2–4 years target experience)
- Links: Portfolio (${candidateProfile.portfolio}), LinkedIn (${candidateProfile.linkedin}), GitHub (${candidateProfile.github})
- Key Verified Metrics:
  * Reduced production API response latency by 83% at SmartData Enterprises using Node.js, TypeScript, NestJS API Gateway, Python/FastAPI microservices.
  * Built Avion AI Customer Support Platform (multi-tenant SaaS, autonomous agents with LangChain/LangGraph, dynamic tool selection, 94.6% Precision@5 RAG retrieval, WebRTC voice AI).
  * Multi-Document RAG Chatbot: session-scoped FAISS indexes with Google Gemini embeddings & MMR search, containerized with Docker & deployed to AWS ECS Fargate via GitHub Actions CI/CD.
  * Resolved 70K+ corrupted records in a live production data-integrity incident using MongoDB aggregation pipelines.

OUTPUT SPECIFICATION:
You MUST respond with a valid JSON object matching this schema:
{
  "subject": "Compelling, specific, non-spammy subject line",
  "html": "<div style=\\"...\\">Complete responsive HTML email body with clean inline styling matching candidate signature and links</div>",
  "text": "Plain text version of the email",
  "companyHighlightsUsed": [
    "Specific headline or company initiative integrated into the email"
  ],
  "reasoning": "Brief explanation of how the company data was tailored with Yash's profile"
}

EMAIL GUIDELINES:
- Concise & Punchy: 140–210 words.
- Tone: Confident, technical, respectful, no fluff, no clichés ("I hope you are doing well").
- Hook: Specifically reference what ${company} does, its mission/passion, and recent headlines/initiatives.
- Bridge: Connect ${company}'s current trajectory with Yash's real engineering achievements (83% API latency reduction, Avion AI multi-agent RAG 94.6% precision).
- Call-to-Action: Direct and frictionless (e.g. 10-minute sync this week).
- Signature: Include Yash's verified links (Portfolio, LinkedIn, GitHub).`;

  const userMessage = `TARGET RECIPIENT:
Company: ${company}
Target Role: ${role || 'Generative AI & Backend Systems Engineer'}
Recipient Name: ${recipientName || 'Hiring Leader'}
Job / Career URL: ${link || 'https://' + companyIntel.domain}

LIVE RESEARCHED COMPANY INTELLIGENCE:
- What ${company} Does: ${companyIntel.whatItDoes}
- Company Mission & Passion: ${companyIntel.passion}
- Recent News & Headlines:
${companyIntel.headlines.map(h => `  * ${h.title}: ${h.snippet}`).join('\n') || '  * Scaling enterprise AI and backend systems'}
- Recent Milestones / Done:
${companyIntel.recentDone.map(d => `  * ${d}`).join('\n')}

USER CUSTOM PROMPT / INSTRUCTIONS:
${userPrompt || 'Research company latest data, what it does, its headlines, passion, and key things recently done, and integrate seamlessly with my personalized background (Generative AI/LLM & Backend Systems Engineer). Make it unique, eye-catching, and high conversion.'}`;

  // 3. Check which provider to use
  let resolvedApiKey = apiKey;
  if (!resolvedApiKey) {
    if (provider === 'gemini') resolvedApiKey = process.env.GEMINI_API_KEY;
    else if (provider === 'openai') resolvedApiKey = process.env.OPENAI_API_KEY;
    else if (provider === 'anthropic') resolvedApiKey = process.env.ANTHROPIC_API_KEY;
  }

  // If user selected builtin or no API key is available for cloud LLM, use Builtin Synthesizer
  if (provider === 'builtin' || (!resolvedApiKey && provider !== 'ollama')) {
    console.log(`[AIEnhancer] Using Built-in Zero-Key Synthesizer for ${company}...`);
    const builtinResult = generateWithBuiltin({
      company,
      role,
      recipientName,
      companyIntel,
      userPrompt
    });

    return {
      success: true,
      subject: builtinResult.subject,
      html: builtinResult.html,
      text: builtinResult.text,
      companyIntel,
      providerUsed: 'builtin_hybrid_generator',
      note: 'Generated using Built-in Company Web Intelligence Engine (Enter an API Key in LLM Settings for Gemini / OpenAI / Claude).'
    };
  }

  // 4. Call external LLM provider
  try {
    let rawJsonText = '';

    if (provider === 'gemini') {
      rawJsonText = await callGeminiApi(resolvedApiKey, model, systemPrompt, userMessage);
    } else if (provider === 'openai') {
      rawJsonText = await callOpenAiApi(resolvedApiKey, model, systemPrompt, userMessage);
    } else if (provider === 'anthropic') {
      rawJsonText = await callAnthropicApi(resolvedApiKey, model, systemPrompt, userMessage);
    } else if (provider === 'ollama') {
      rawJsonText = await callOllamaApi(options.ollamaUrl, model, systemPrompt, userMessage);
    } else {
      throw new Error(`Unsupported LLM provider: ${provider}`);
    }

    // Clean markdown codeblocks if wrapped
    let cleaned = (rawJsonText || '').trim();
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
    }

    const parsed = JSON.parse(cleaned);

    return {
      success: true,
      subject: parsed.subject,
      html: parsed.html,
      text: parsed.text || parsed.html.replace(/<[^>]+>/g, ' '),
      companyIntel,
      companyHighlightsUsed: parsed.companyHighlightsUsed || [],
      reasoning: parsed.reasoning || '',
      providerUsed: provider
    };
  } catch (err) {
    console.warn(`[AIEnhancer] Cloud LLM call failed (${err.message}). Falling back gracefully to Built-in Synthesizer.`);
    const fallback = generateWithBuiltin({
      company,
      role,
      recipientName,
      companyIntel,
      userPrompt
    });

    return {
      success: true,
      subject: fallback.subject,
      html: fallback.html,
      text: fallback.text,
      companyIntel,
      providerUsed: 'builtin_fallback',
      warning: `LLM API call failed: ${err.message}. High-quality personalized draft generated using Built-in Intelligence Engine.`
    };
  }
}
