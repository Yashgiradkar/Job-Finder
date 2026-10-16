/**
 * Evaluates and categorizes location and remote policy.
 */
export function evaluateLocation(locationStr = '', remotePolicyCompany = '') {
  const loc = String(locationStr || '').trim();
  const locLower = loc.toLowerCase();

  let category = 'International';
  let isIndia = false;
  let isRemote = false;

  if (locLower.includes('remote')) {
    isRemote = true;
  }

  if (
    locLower.includes('bengaluru') || locLower.includes('bangalore')
  ) {
    category = 'Bengaluru';
    isIndia = true;
  } else if (locLower.includes('pune')) {
    category = 'Pune';
    isIndia = true;
  } else if (locLower.includes('mumbai')) {
    category = 'Mumbai';
    isIndia = true;
  } else if (locLower.includes('hyderabad')) {
    category = 'Hyderabad';
    isIndia = true;
  } else if (
    locLower.includes('gurgaon') || locLower.includes('noida') || locLower.includes('delhi') || locLower.includes('ncr')
  ) {
    category = 'Delhi NCR';
    isIndia = true;
  } else if (locLower.includes('chennai')) {
    category = 'Chennai';
    isIndia = true;
  } else if (
    locLower.includes('kolkata') || locLower.includes('ahmedabad') || locLower.includes('jaipur') ||
    locLower.includes('kochi') || locLower.includes('chandigarh') || locLower.includes('indore') ||
    locLower.includes('surat') || locLower.includes('nagpur') || locLower.includes('goa') ||
    locLower.includes('trivandrum') || locLower.includes('thiruvananthapuram')
  ) {
    category = 'Other India';
    isIndia = true;
  } else if (locLower.includes('india')) {
    category = isRemote ? 'Remote India' : 'India';
    isIndia = true;
  } else if (isRemote && (locLower.includes('anywhere') || locLower.includes('global') || (!locLower.includes('us') && !locLower.includes('uk')))) {
    category = 'Remote';
  }

  const isIndiaOrRemote = isIndia || isRemote || category === 'Remote';

  return {
    rawLocation: loc || 'Unspecified',
    locationCategory: category,
    isRemote,
    isIndia,
    isIndiaOrRemote,
    companyRemotePolicy: remotePolicyCompany
  };
}

/**
 * Categorizes job posting freshness.
 */
export function evaluateFreshness(postedAtDate = null, referenceDate = new Date()) {
  if (!postedAtDate) {
    return {
      postedAt: null,
      freshness: 'Unknown',
      isRecent48h: false
    };
  }

  const posted = new Date(postedAtDate);
  if (isNaN(posted.getTime())) {
    return {
      postedAt: null,
      freshness: 'Unknown',
      isRecent48h: false
    };
  }

  const diffMs = referenceDate.getTime() - posted.getTime();
  const diffDays = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));

  let freshness = 'Unknown';
  if (diffDays <= 1) freshness = '0–1 days';
  else if (diffDays <= 3) freshness = '2–3 days';
  else if (diffDays <= 7) freshness = '4–7 days';
  else if (diffDays <= 14) freshness = '8–14 days';
  else if (diffDays <= 30) freshness = '15–30 days';
  else freshness = '30+ days';

  const isRecent48h = diffDays <= 2;

  return {
    postedAt: posted.toISOString().split('T')[0],
    freshness,
    isRecent48h,
    ageDays: diffDays
  };
}
