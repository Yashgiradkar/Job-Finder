/**
 * Experience evaluation against candidate profile (2–4 years target).
 */

export function evaluateExperience(job) {
  const text = `${job.title} ${job.experienceRequirement || ''} ${job.description || ''} ${job.responsibilities?.join(' ') || ''}`.toLowerCase();
  
  // Patterns for explicit years of experience
  // e.g., "2-4 years", "2 to 5 years", "3+ years", "minimum 2 years", "at least 3 years"
  const rangePattern = /(?:(\d+)\s*(?:-|to|–)\s*(\d+))\s*(?:\+)?\s*(?:years?|yrs?)/i;
  const plusPattern = /(?:(?:minimum|at\s*least|min)?\s*(\d+)\s*\+\s*(?:years?|yrs?))/i;
  const singlePattern = /(?:(?:minimum|at\s*least|min)\s*(\d+)\s*(?:years?|yrs?))/i;

  let minYears = null;
  let maxYears = null;
  let explicitMatch = false;
  let rawExperienceStr = job.experienceRequirement || null;

  const rangeMatch = text.match(rangePattern);
  if (rangeMatch) {
    minYears = parseInt(rangeMatch[1], 10);
    maxYears = parseInt(rangeMatch[2], 10);
    explicitMatch = true;
    rawExperienceStr = rawExperienceStr || rangeMatch[0];
  } else {
    const plusMatch = text.match(plusPattern);
    if (plusMatch) {
      minYears = parseInt(plusMatch[1], 10);
      maxYears = minYears + 3; // Estimated upper range
      explicitMatch = true;
      rawExperienceStr = rawExperienceStr || plusMatch[0];
    } else {
      const singleMatch = text.match(singlePattern);
      if (singleMatch) {
        minYears = parseInt(singleMatch[1], 10);
        maxYears = minYears + 2;
        explicitMatch = true;
        rawExperienceStr = rawExperienceStr || singleMatch[0];
      }
    }
  }

  const titleLower = (job.title || '').toLowerCase();
  const isSeniorStaff = titleLower.includes('principal') || 
                       titleLower.includes('staff') || 
                       titleLower.includes('lead') || 
                       titleLower.includes('director') || 
                       titleLower.includes('head of') ||
                       titleLower.includes('senior');

  const isJuniorIntern = titleLower.includes('intern') || 
                         titleLower.includes('trainee') || 
                         titleLower.includes('graduate 2026') ||
                         titleLower.includes('new grad');

  if (explicitMatch) {
    // Evaluation rules for explicit requirements
    // Candidate range: 2-4 years
    if (minYears >= 5) {
      return {
        isAccepted: false,
        minYears,
        maxYears,
        experienceRequirement: rawExperienceStr,
        experienceConfidence: 'explicit',
        rejectionReason: `Requires ${minYears}+ years experience (exceeds candidate 2–4 years target)`
      };
    }

    if (maxYears !== null && maxYears < 2 && isJuniorIntern) {
      return {
        isAccepted: false,
        minYears,
        maxYears,
        experienceRequirement: rawExperienceStr,
        experienceConfidence: 'explicit',
        rejectionReason: 'Intern / New Grad role not suitable for experienced 2–4 year candidate'
      };
    }

    // Overlaps 2-4 years (e.g. 1-3, 2-4, 2-5, 1-5, 2+, 3+)
    return {
      isAccepted: true,
      minYears,
      maxYears,
      experienceRequirement: rawExperienceStr,
      experienceConfidence: 'explicit',
      rejectionReason: null
    };
  }

  // Inferred experience if not explicitly stated
  if (isSeniorStaff) {
    return {
      isAccepted: false,
      minYears: 5,
      maxYears: 8,
      experienceRequirement: null,
      experienceConfidence: 'inferred',
      rejectionReason: 'Senior/Staff/Lead/Principal role normally requires substantially > 4 years'
    };
  }

  if (isJuniorIntern) {
    return {
      isAccepted: false,
      minYears: 0,
      maxYears: 1,
      experienceRequirement: null,
      experienceConfidence: 'inferred',
      rejectionReason: 'Internship / New grad role'
    };
  }

  // Default: mid-level software engineer suitable for 2-4 years
  return {
    isAccepted: true,
    minYears: 2,
    maxYears: 4,
    experienceRequirement: rawExperienceStr || null,
    experienceConfidence: 'inferred',
    rejectionReason: null
  };
}
