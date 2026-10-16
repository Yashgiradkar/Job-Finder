import fs from 'node:fs';
import path from 'node:path';
import { config } from '../../config.js';

/**
 * Determines the most appropriate resume variant for a matched job.
 */
export function matchResumeForJob(roleCategories = [], jobTitle = '', jobDescription = '') {
  const text = `${jobTitle} ${jobDescription}`.toLowerCase();
  
  let resumeName = 'Generative_AI_LLM_Engineer';

  const isAiPrimary = roleCategories.includes('Generative AI') || 
                      roleCategories.includes('LLM Engineer') || 
                      roleCategories.includes('AI Engineer') ||
                      text.includes('rag') || text.includes('llm') || text.includes('agent');

  const isBackendPrimary = roleCategories.includes('Backend') || 
                          roleCategories.includes('Distributed Systems') || 
                          text.includes('api gateway') || text.includes('microservices');

  const isFullStack = roleCategories.includes('Full Stack') || 
                      (text.includes('frontend') && text.includes('react') && isBackendPrimary);

  if (isAiPrimary && isBackendPrimary) {
    resumeName = 'Generative_AI_LLM_Engineer';
  } else if (isAiPrimary) {
    resumeName = 'Generative_AI_LLM_Engineer';
  } else if (isBackendPrimary) {
    resumeName = 'Backend_Engineer';
  } else if (isFullStack) {
    resumeName = 'Full_Stack_Engineer';
  } else {
    resumeName = 'Needs_Resume_Variant';
  }

  // Check actual file existence
  const configuredPath = config.resumePath || './Yash_Giradkar_Resume.pdf';
  const resolvedPath = path.resolve(process.cwd(), configuredPath);
  const exists = fs.existsSync(resolvedPath);

  return {
    resumeName,
    resumePath: exists ? configuredPath : null,
    isFileAvailable: exists
  };
}
