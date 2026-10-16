/**
 * AI Job Hunter — Mission Control UI Client Application
 */

// Application State
const state = {
  currentTab: 'tab-jobs',
  currentView: 'matched', // 'matched' | 'all' | 'rejected'
  jobs: [],
  filteredJobs: [],
  queue: [],
  interviews: [],
  outreach: { recipients: [], history: [] },
  selectedJob: null,
  activeDossier: null,
  stats: {}
};

// --------------------------------------------------------------------------
// Initialization & Event Listeners
// --------------------------------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
  setupNavigation();
  setupFilterListeners();
  setupDrawerAndModal();
  setupSSELogStream();
  loadAllData();
});

// Setup Tab Navigation
function setupNavigation() {
  const navButtons = document.querySelectorAll('.nav-item');
  navButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetTab = btn.getAttribute('data-tab');
      switchTab(targetTab);
    });
  });

  document.getElementById('btnRefreshAll')?.addEventListener('click', () => {
    loadAllData();
  });

  document.getElementById('btnQuickScan')?.addEventListener('click', () => {
    switchTab('tab-workflows');
  });

  document.getElementById('btnClearTerminal')?.addEventListener('click', () => {
    document.getElementById('terminalOutput').innerHTML = '<div class="terminal-line text-muted">Terminal cleared.</div>';
  });

  document.getElementById('btnCancelWorkflow')?.addEventListener('click', cancelWorkflow);

  document.getElementById('btnReloadReport')?.addEventListener('click', loadReportContent);

  // View switch buttons (Matched vs All vs Rejected)
  document.getElementById('btnViewMatched')?.addEventListener('click', (e) => setView('matched', e.target));
  document.getElementById('btnViewAll')?.addEventListener('click', (e) => setView('all', e.target));
  document.getElementById('btnViewRejected')?.addEventListener('click', (e) => setView('rejected', e.target));

  // Export JSON
  document.getElementById('btnExportJobsJson')?.addEventListener('click', exportJobsJson);
}

function switchTab(tabId) {
  state.currentTab = tabId;
  document.querySelectorAll('.nav-item').forEach(b => {
    b.classList.toggle('active', b.getAttribute('data-tab') === tabId);
  });
  document.querySelectorAll('.tab-pane').forEach(p => {
    p.classList.toggle('active', p.id === tabId);
  });

  if (tabId === 'tab-report') loadReportContent();
  if (tabId === 'tab-queue') loadQueueData();
  if (tabId === 'tab-outreach') loadOutreachData();
  if (tabId === 'tab-interviews') loadInterviewsData();
}

function setView(viewType, targetBtn) {
  state.currentView = viewType;
  document.querySelectorAll('.btn-group .btn').forEach(b => b.classList.remove('active'));
  targetBtn.classList.add('active');

  const titleMap = {
    matched: 'Master Matched Jobs',
    all: 'All Discovered Openings',
    rejected: 'Filtered / Rejected Roles'
  };
  const subMap = {
    matched: 'Showing candidate-aligned opportunities (Score ≥ 50)',
    all: 'All discovered openings across scanned portals',
    rejected: 'Roles filtered out by experience (5+ YOE), low match, or location'
  };

  document.getElementById('jobsTableTitle').textContent = titleMap[viewType];
  document.getElementById('jobsTableSubtitle').textContent = subMap[viewType];

  loadJobsData(viewType);
}

// --------------------------------------------------------------------------
// Real-time SSE Log Stream
// --------------------------------------------------------------------------
function setupSSELogStream() {
  const terminal = document.getElementById('terminalOutput');
  const statusDot = document.getElementById('statusDot');
  const statusText = document.getElementById('statusText');
  const runnerBadge = document.getElementById('badgeRunnerStatus');

  try {
    const evtSource = new EventSource('/api/action/stream');

    evtSource.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        const line = document.createElement('div');
        line.className = `terminal-line ${payload.type || ''}`;
        line.textContent = payload.message;
        terminal.appendChild(line);
        terminal.scrollTop = terminal.scrollHeight;

        if (payload.type === 'system') {
          statusDot.className = 'status-pulse busy';
          statusText.textContent = 'Workflow Running';
          runnerBadge.className = 'nav-badge badge-warning';
          runnerBadge.textContent = 'Running';
        } else if (payload.type === 'success' || payload.type === 'error') {
          statusDot.className = 'status-pulse';
          statusText.textContent = 'System Ready';
          runnerBadge.className = 'nav-badge badge-active';
          runnerBadge.textContent = 'Idle';
          // Auto refresh stats on finish
          setTimeout(loadAllData, 1000);
        }
      } catch {
        const line = document.createElement('div');
        line.className = 'terminal-line';
        line.textContent = event.data;
        terminal.appendChild(line);
        terminal.scrollTop = terminal.scrollHeight;
      }
    };

    evtSource.onerror = () => {
      // Reconnection handled automatically by browser
    };
  } catch (err) {
    console.error('SSE initialization error:', err);
  }
}

// --------------------------------------------------------------------------
// Data Loading
// --------------------------------------------------------------------------
async function loadAllData() {
  await Promise.all([
    loadStats(),
    loadJobsData(state.currentView),
    loadQueueData(),
    loadOutreachData(),
    loadInterviewsData()
  ]);
}

async function loadStats() {
  try {
    const res = await fetch('/api/stats');
    const json = await res.json();
    if (json.success) {
      state.stats = json.data;
      document.getElementById('statDiscovered').textContent = json.data.totalDiscovered || 0;
      document.getElementById('statMatched').textContent = json.data.matchedCount || 0;
      document.getElementById('statQueue').textContent = json.data.queueCount || 0;
      document.getElementById('statRecent').textContent = json.data.recentCount || 0;
      document.getElementById('statRejected').textContent = json.data.rejectedCount || 0;

      document.getElementById('badgeMatchedCount').textContent = json.data.matchedCount || 0;
      document.getElementById('badgeQueueCount').textContent = json.data.queueCount || 0;
      document.getElementById('badgeOutreachCount').textContent = json.data.outreachCount || 0;
      document.getElementById('badgeInterviewCount').textContent = json.data.interviewCount || 0;

      const btnMatched = document.getElementById('btnViewMatched');
      if (btnMatched) btnMatched.textContent = `Matched (${json.data.matchedCount || 0})`;
    }
  } catch (err) {
    console.error('Error loading stats:', err);
  }
}

async function loadJobsData(type = 'matched') {
  const tbody = document.getElementById('jobsTableBody');
  tbody.innerHTML = '<tr><td colspan="10" class="text-center py-6 text-muted">Fetching job records...</td></tr>';

  try {
    const res = await fetch(`/api/jobs?type=${type}`);
    const json = await res.json();
    if (json.success) {
      state.jobs = json.jobs || [];
      applyJobFilters();
    }
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="10" class="text-center py-6 text-rose">Error loading jobs: ${err.message}</td></tr>`;
  }
}

// --------------------------------------------------------------------------
// Filters and Table Rendering
// --------------------------------------------------------------------------
function setupFilterListeners() {
  const searchInput = document.getElementById('jobSearchInput');
  const catSelect = document.getElementById('filterCategory');
  const locSelect = document.getElementById('filterLocation');
  const scoreSelect = document.getElementById('filterMinScore');

  [searchInput, catSelect, locSelect, scoreSelect].forEach(el => {
    el?.addEventListener('input', applyJobFilters);
    el?.addEventListener('change', applyJobFilters);
  });
}

function applyJobFilters() {
  const query = (document.getElementById('jobSearchInput')?.value || '').toLowerCase().trim();
  const category = document.getElementById('filterCategory')?.value || 'all';
  const location = document.getElementById('filterLocation')?.value || 'all';
  const minScore = parseInt(document.getElementById('filterMinScore')?.value || '0', 10);

  state.filteredJobs = state.jobs.filter(job => {
    // Search query
    if (query) {
      const matchText = `${job.company} ${job.title} ${job.location} ${(job.matchedSkills || []).join(' ')} ${job.salaryRange || ''}`.toLowerCase();
      if (!matchText.includes(query)) return false;
    }

    // Category filter
    if (category !== 'all') {
      const cats = job.roleCategory || [];
      if (!cats.some(c => c.toLowerCase().includes(category.toLowerCase()))) return false;
    }

    // Location filter
    if (location !== 'all') {
      const loc = (job.location || '').toLowerCase();
      const cat = (job.locationCategory || '').toLowerCase();
      if (location === 'Remote' && !job.remote && !loc.includes('remote') && cat !== 'remote') return false;
      if (location === 'Bengaluru' && !loc.includes('bengaluru') && !loc.includes('bangalore') && cat !== 'bengaluru') return false;
      if (location === 'India' && !loc.includes('india') && !cat.includes('india') && cat !== 'bengaluru') return false;
      if (location === 'International' && (loc.includes('india') || cat.includes('india'))) return false;
    }

    // Min Score
    const score = job.overallMatchScore ?? (state.currentView === 'rejected' ? 0 : 70);
    if (score < minScore) return false;

    return true;
  });

  renderJobsTable();
}

function renderJobsTable() {
  const tbody = document.getElementById('jobsTableBody');
  const countDisplay = document.getElementById('jobsCountDisplay');

  if (state.filteredJobs.length === 0) {
    tbody.innerHTML = '<tr><td colspan="10" class="text-center py-6 text-muted">No jobs matching current search/filter criteria.</td></tr>';
    countDisplay.textContent = `Showing 0 of ${state.jobs.length} jobs`;
    return;
  }

  countDisplay.textContent = `Showing ${state.filteredJobs.length} of ${state.jobs.length} jobs`;

  tbody.innerHTML = state.filteredJobs.map(job => {
    const score = job.overallMatchScore ?? '—';
    const scoreClass = score >= 90 ? 'score-100' : score >= 75 ? 'score-high' : score >= 55 ? 'score-med' : 'score-low';
    const remoteBadge = job.remote ? '<span class="badge badge-emerald">🌐 Remote</span>' : '<span class="badge badge-secondary">Office/Hybrid</span>';
    const skillsHtml = (job.matchedSkills || []).slice(0, 3).map(s => `<span class="skill-tag">${escapeHtml(s)}</span>`).join('');
    const extraCount = (job.matchedSkills || []).length > 3 ? `<span class="text-dim text-xs">+${(job.matchedSkills || []).length - 3}</span>` : '';

    return `
      <tr onclick="openJobDrawer('${escapeHtml(job.jobId)}')">
        <td><span class="score-badge ${scoreClass}">${score}%</span></td>
        <td><strong>${escapeHtml(job.company || '—')}</strong></td>
        <td>
          <div style="font-weight: 600; color: #fff;">${escapeHtml(job.title || '—')}</div>
          <div style="font-size: 0.75rem; color: var(--text-dim);">${escapeHtml(job.department || 'Engineering')}</div>
        </td>
        <td>
          <div>${escapeHtml(job.location || 'Unspecified')}</div>
          <div>${remoteBadge}</div>
        </td>
        <td>${escapeHtml(job.experienceRequirement || '2–4 yrs')}</td>
        <td><strong>${escapeHtml(job.salaryRange || '—')}</strong></td>
        <td>${skillsHtml} ${extraCount}</td>
        <td><span class="badge badge-secondary">${escapeHtml(job.freshness || 'Recent')}</span></td>
        <td><code>${escapeHtml(job.resumeName || 'Default')}</code></td>
        <td>
          <button class="btn btn-xs btn-outline" onclick="event.stopPropagation(); openJobDrawer('${escapeHtml(job.jobId)}')">Details</button>
        </td>
      </tr>
    `;
  }).join('');
}

// --------------------------------------------------------------------------
// Slide-Over Job Detail Drawer
// --------------------------------------------------------------------------
function setupDrawerAndModal() {
  const overlay = document.getElementById('drawerOverlay');
  const drawer = document.getElementById('jobDrawer');
  const btnClose = document.getElementById('btnCloseDrawer');

  const closeDrawer = () => {
    drawer.classList.remove('open');
    overlay.classList.remove('open');
  };

  overlay?.addEventListener('click', closeDrawer);
  btnClose?.addEventListener('click', closeDrawer);

  // Modal setup
  const modalOverlay = document.getElementById('dossierModalOverlay');
  const btnCloseModal = document.getElementById('btnCloseModal');
  btnCloseModal?.addEventListener('click', () => modalOverlay.classList.remove('open'));
  modalOverlay?.addEventListener('click', (e) => {
    if (e.target === modalOverlay) modalOverlay.classList.remove('open');
  });
}

function openJobDrawer(jobId) {
  const job = state.jobs.find(j => j.jobId === jobId) || state.queue.find(j => j.jobId === jobId);
  if (!job) return;

  state.selectedJob = job;

  document.getElementById('drawerTitle').textContent = job.title;
  document.getElementById('drawerCompany').textContent = job.company;
  const matchBadge = document.getElementById('drawerMatchBadge');
  const score = job.overallMatchScore ?? 0;
  matchBadge.textContent = `${score}% Match`;
  matchBadge.className = `badge ${score >= 75 ? 'badge-emerald' : score >= 55 ? 'badge-amber' : 'badge-rose'}`;

  // Build drawer body
  const body = document.getElementById('drawerBody');
  body.innerHTML = `
    <!-- Score Breakdown -->
    <h4 style="font-size: 0.85rem; color: var(--text-muted); text-transform: uppercase;">Candidate Match Weighting (Step 5)</h4>
    <div class="score-breakdown-grid">
      <div class="score-box">
        <div class="score-box-num text-emerald">${job.roleMatchScore ?? '—'}%</div>
        <div class="score-box-label">Role (25%)</div>
      </div>
      <div class="score-box">
        <div class="score-box-num text-emerald">${job.skillMatchScore ?? '—'}%</div>
        <div class="score-box-label">Skills (30%)</div>
      </div>
      <div class="score-box">
        <div class="score-box-num text-blue">${job.aiLlmRelevanceScore ?? '—'}%</div>
        <div class="score-box-label">AI/LLM (20%)</div>
      </div>
      <div class="score-box">
        <div class="score-box-num text-blue">${job.backendRelevanceScore ?? '—'}%</div>
        <div class="score-box-label">Backend (10%)</div>
      </div>
      <div class="score-box">
        <div class="score-box-num text-amber">${job.experienceMatchScore ?? '—'}%</div>
        <div class="score-box-label">Exp (10%)</div>
      </div>
      <div class="score-box">
        <div class="score-box-num text-purple">${job.locationMatchScore ?? '—'}%</div>
        <div class="score-box-label">Location (5%)</div>
      </div>
    </div>

    <!-- Metadata Grid -->
    <div style="background: rgba(255,255,255,0.03); border: 1px solid var(--border-subtle); border-radius: var(--radius-sm); padding: 1rem; margin: 1.25rem 0; font-size: 0.85rem;">
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem;">
        <div><strong>Job ID:</strong> <code>${escapeHtml(job.jobId)}</code></div>
        <div><strong>Location:</strong> ${escapeHtml(job.location || 'Remote')} ${job.remote ? '(🌐 Remote)' : ''}</div>
        <div><strong>Experience Req:</strong> ${escapeHtml(job.experienceRequirement || '2–4 years')}</div>
        <div><strong>Salary Range:</strong> ${escapeHtml(job.salaryRange || 'Not Disclosed')}</div>
        <div><strong>Posted:</strong> ${escapeHtml(job.freshness || job.postedAt || 'Recent')}</div>
        <div><strong>Assigned Resume:</strong> <code>${escapeHtml(job.resumeName || 'Generative_AI_LLM_Engineer')}</code></div>
        <div><strong>Application Status:</strong> <span class="badge badge-amber">${escapeHtml(job.applicationStatus || 'not_applied')}</span></div>
        <div><strong>Public Contact:</strong> ${job.hrEmail ? `<a href="mailto:${escapeHtml(job.hrEmail)}">${escapeHtml(job.hrEmail)}</a>` : 'Standard Career Portal'}</div>
      </div>
    </div>

    <!-- Matched Skills -->
    <div style="margin-bottom: 1.25rem;">
      <h4 style="font-size: 0.85rem; color: #34d399; margin-bottom: 0.5rem;">✓ Matched Candidate Skills (${(job.matchedSkills || []).length}):</h4>
      <div>${(job.matchedSkills || []).map(s => `<span class="skill-tag" style="background: rgba(16, 185, 129, 0.15); color: #34d399;">${escapeHtml(s)}</span>`).join('') || '<span class="text-dim">None detected</span>'}</div>
    </div>

    <!-- Missing Skills -->
    ${job.missingSkills && job.missingSkills.length > 0 ? `
      <div style="margin-bottom: 1.25rem;">
        <h4 style="font-size: 0.85rem; color: #fb7185; margin-bottom: 0.5rem;">✗ Missing Required Skills (${job.missingSkills.length}):</h4>
        <div>${job.missingSkills.map(s => `<span class="skill-tag" style="background: rgba(244, 63, 94, 0.15); color: #fb7185;">${escapeHtml(s)}</span>`).join('')}</div>
      </div>
    ` : ''}

    <!-- Job Description -->
    <div>
      <h4 style="font-size: 0.85rem; color: var(--text-muted); text-transform: uppercase; margin-bottom: 0.5rem;">Job Description:</h4>
      <div style="font-size: 0.85rem; line-height: 1.6; color: #cbd5e1; background: #030712; padding: 1rem; border-radius: var(--radius-sm); border: 1px solid var(--border-subtle);">
        ${escapeHtml(job.description || 'Full JD not indexed.')}
      </div>
    </div>
  `;

  // Drawer Action Buttons
  const btnApplyLink = document.getElementById('btnDrawerApplyLink');
  btnApplyLink.href = job.jobUrl || '#';

  const btnApprove = document.getElementById('btnDrawerApprove');
  btnApprove.onclick = () => updateJobStatus(job.jobId, 'approved');

  const btnReject = document.getElementById('btnDrawerReject');
  btnReject.onclick = () => updateJobStatus(job.jobId, 'rejected');

  document.getElementById('drawerOverlay').classList.add('open');
  document.getElementById('jobDrawer').classList.add('open');
}

async function updateJobStatus(jobId, status) {
  try {
    const res = await fetch('/api/application/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobId, status })
    });
    const json = await res.json();
    if (json.success) {
      alert(`Job application status updated to: ${status}`);
      document.getElementById('drawerOverlay').classList.remove('open');
      document.getElementById('jobDrawer').classList.remove('open');
      loadAllData();
    } else {
      alert(`Could not update: ${json.error}`);
    }
  } catch (err) {
    alert(`Error: ${err.message}`);
  }
}

// --------------------------------------------------------------------------
// Application Queue Tab
// --------------------------------------------------------------------------
async function loadQueueData() {
  const container = document.getElementById('queueCardsContainer');
  container.innerHTML = '<div class="text-center py-6 text-muted">Loading application queue...</div>';

  try {
    const res = await fetch('/api/jobs?type=queue');
    const json = await res.json();
    if (json.success) {
      state.queue = json.jobs || [];
      renderQueueCards();
    }
  } catch (err) {
    container.innerHTML = `<div class="text-center py-6 text-rose">Error: ${err.message}</div>`;
  }
}

function renderQueueCards() {
  const container = document.getElementById('queueCardsContainer');
  if (state.queue.length === 0) {
    container.innerHTML = '<div class="card text-center py-6 text-muted">No high-priority jobs in queue right now.</div>';
    return;
  }

  container.innerHTML = state.queue.map(job => {
    return `
      <div class="queue-card">
        <div>
          <div class="queue-card-top">
            <div>
              <span class="queue-company">${escapeHtml(job.company)}</span>
              <h4 class="queue-role">${escapeHtml(job.title)}</h4>
            </div>
            <span class="score-badge score-100">${job.overallMatchScore}%</span>
          </div>

          <div class="queue-meta">
            <div>📍 <strong>Location:</strong> ${escapeHtml(job.location || 'Remote')} ${job.remote ? '(🌐 Remote)' : ''}</div>
            <div>💼 <strong>Exp:</strong> ${escapeHtml(job.experienceRequirement || '2–4 years')}</div>
            <div>💰 <strong>Salary:</strong> ${escapeHtml(job.salaryRange || '30–60 LPA (est.)')}</div>
            <div>📄 <strong>Resume:</strong> <code>${escapeHtml(job.resumeName || 'Default')}</code></div>
          </div>

          <div style="margin-bottom: 0.75rem;">
            ${(job.matchedSkills || []).slice(0, 4).map(s => `<span class="skill-tag">${escapeHtml(s)}</span>`).join('')}
          </div>
        </div>

        <div class="queue-card-actions">
          <button class="btn btn-xs btn-emerald" onclick="updateJobStatus('${escapeHtml(job.jobId)}', 'approved')">✓ Approve</button>
          <button class="btn btn-xs btn-secondary" onclick="openJobDrawer('${escapeHtml(job.jobId)}')">View Details</button>
          <a href="${escapeHtml(job.jobUrl || '#')}" target="_blank" class="btn btn-xs btn-primary">Apply &rarr;</a>
        </div>
      </div>
    `;
  }).join('');
}

// --------------------------------------------------------------------------
// Cold Outreach & Referrals Tab
// --------------------------------------------------------------------------
async function loadOutreachData() {
  const tbody = document.getElementById('outreachRecipientsBody');
  const historyTbody = document.getElementById('historyTableBody');

  try {
    const res = await fetch('/api/outreach');
    const json = await res.json();
    if (json.success) {
      state.outreach = json;

      // Recipients
      if ((json.recipients || []).length > 0) {
        tbody.innerHTML = json.recipients.map((r, i) => `
          <tr>
            <td><strong>${escapeHtml(r.Name || '—')}</strong></td>
            <td>${escapeHtml(r.Company || 'ByteDance')}</td>
            <td><a href="mailto:${escapeHtml(r.Email)}">${escapeHtml(r.Email || '—')}</a></td>
            <td><span class="badge badge-indigo">${escapeHtml(r.Role || 'Backend Engineer')}</span></td>
            <td>
              <button class="btn btn-xs btn-outline" onclick="previewRecipientEmail(${i})">Preview</button>
            </td>
          </tr>
        `).join('');

        // Preview first row
        previewRecipientEmail(0);
      } else {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center py-4 text-muted">No recipients in list.xlsx.</td></tr>';
      }

      // History
      if ((json.history || []).length > 0) {
        historyTbody.innerHTML = json.history.map(h => `
          <tr>
            <td>${new Date(h.timestamp).toLocaleTimeString()}</td>
            <td>${escapeHtml(h.recipient)}</td>
            <td>${escapeHtml(h.company)}</td>
            <td>${escapeHtml(h.role)}</td>
            <td><span class="badge badge-emerald">${escapeHtml(h.status)}</span></td>
          </tr>
        `).join('');
      }
    }
  } catch (err) {
    console.error('Error loading outreach:', err);
  }
}

function previewRecipientEmail(index) {
  const r = state.outreach.recipients[index];
  if (!r) return;

  document.getElementById('previewRecipient').textContent = `${r.Name} <${r.Email}>`;
  document.getElementById('previewSubject').textContent = `Request for an Interview Opportunity - ${r.Role} at ${r.Company}`;
}

function confirmLiveOutreach() {
  if (confirm('Are you sure you want to trigger live email outreach? This will send emails using your SMTP credentials in .env.')) {
    launchWorkflow('outreach-send');
  }
}

// --------------------------------------------------------------------------
// Interview Preparation Tab
// --------------------------------------------------------------------------
async function loadInterviewsData() {
  const container = document.getElementById('interviewsCardsContainer');
  container.innerHTML = '<div class="text-center py-6 text-muted">Loading interview workspaces...</div>';

  try {
    const res = await fetch('/api/interviews');
    const json = await res.json();
    if (json.success) {
      state.interviews = json.interviews || [];
      renderInterviewsCards();
    }
  } catch (err) {
    container.innerHTML = `<div class="text-center py-6 text-rose">Error: ${err.message}</div>`;
  }
}

function renderInterviewsCards() {
  const container = document.getElementById('interviewsCardsContainer');
  if (state.interviews.length === 0) {
    container.innerHTML = '<div class="card text-center py-6 text-muted">No upcoming interviews in /interviews/upcoming.md.</div>';
    return;
  }

  container.innerHTML = state.interviews.map(item => {
    const artifactsHtml = (item.artifacts || []).map(f => {
      const cleanLabel = f.replace(/^\d+-/, '').replace(/\.md$/, '').replace(/-/g, ' ');
      return `<button class="artifact-pill" onclick="openDossierModal('${escapeHtml(item.company)}', '${escapeHtml(item.role)}', '${escapeHtml(f)}')">${cleanLabel}</button>`;
    }).join('');

    return `
      <div class="interview-card">
        <div class="interview-card-header">
          <div>
            <span class="badge badge-purple">${escapeHtml(item.company)}</span>
            <h3 style="font-size: 1.15rem; font-weight: 700; color: #fff; margin-top: 0.35rem;">${escapeHtml(item.role)}</h3>
            <span style="font-size: 0.8rem; color: var(--text-muted);">Interview Date: <strong>${escapeHtml(item.date)}</strong></span>
          </div>
          <span class="badge badge-emerald">${item.workspaceExists ? '✓ Workspace Ready' : 'Pending Gen'}</span>
        </div>

        <div style="font-size: 0.825rem; color: var(--text-dim); margin-bottom: 0.5rem;">
          📍 ${escapeHtml(item.location)} &bull; 📄 Resume: <code>${escapeHtml(item.resumeVersion)}</code>
        </div>

        <div style="font-size: 0.8rem; color: var(--text-muted); margin-top: 0.75rem;">
          <strong>Generated Intelligence Artifacts (${(item.artifacts || []).length}):</strong>
          <div class="artifacts-pills">${artifactsHtml || '<em>Run prep generator to produce dossiers</em>'}</div>
        </div>

        <div style="border-top: 1px solid var(--border-subtle); padding-top: 0.75rem; display: flex; justify-content: space-between; align-items: center;">
          <a href="${escapeHtml(item.jobUrl)}" target="_blank" style="font-size: 0.8rem; color: #60a5fa;">View Opening &rarr;</a>
          <button class="btn btn-xs btn-purple" onclick="launchWorkflow('interview-prep')">Refresh Dossier</button>
        </div>
      </div>
    `;
  }).join('');
}

async function openDossierModal(company, role, filename) {
  const modalOverlay = document.getElementById('dossierModalOverlay');
  const title = document.getElementById('modalDossierTitle');
  const subtitle = document.getElementById('modalDossierSubtitle');
  const content = document.getElementById('modalDossierContent');

  title.textContent = `${company} — ${role}`;
  subtitle.textContent = `Dossier Module: ${filename}`;
  content.innerHTML = '<p class="text-muted">Loading artifact content...</p>';
  modalOverlay.classList.add('open');

  try {
    const res = await fetch(`/api/interviews/artifact?company=${encodeURIComponent(company)}&role=${encodeURIComponent(role)}&filename=${encodeURIComponent(filename)}`);
    const json = await res.json();
    if (json.success) {
      content.innerHTML = window.marked ? window.marked.parse(json.content) : `<pre>${escapeHtml(json.content)}</pre>`;
    } else {
      content.innerHTML = `<p class="text-rose">Error: ${json.error}</p>`;
    }
  } catch (err) {
    content.innerHTML = `<p class="text-rose">Error loading: ${err.message}</p>`;
  }
}

// --------------------------------------------------------------------------
// Executive Report Tab
// --------------------------------------------------------------------------
async function loadReportContent() {
  const container = document.getElementById('reportContentArea');
  container.innerHTML = '<p class="text-muted">Rendering job-report.md...</p>';

  try {
    const res = await fetch('/api/report');
    const json = await res.json();
    if (json.success && json.content) {
      container.innerHTML = window.marked ? window.marked.parse(json.content) : `<pre>${escapeHtml(json.content)}</pre>`;
    } else {
      container.innerHTML = '<p class="text-muted">No report found. Run a job scan first.</p>';
    }
  } catch (err) {
    container.innerHTML = `<p class="text-rose">Error loading report: ${err.message}</p>`;
  }
}

// --------------------------------------------------------------------------
// Launch Workflows via Backend
// --------------------------------------------------------------------------
async function launchWorkflow(workflow, options = {}) {
  const terminal = document.getElementById('terminalOutput');
  switchTab('tab-workflows');

  const line = document.createElement('div');
  line.className = 'terminal-line system';
  line.textContent = `>>> Requesting execution: ${workflow}...`;
  terminal.appendChild(line);
  terminal.scrollTop = terminal.scrollHeight;

  try {
    const res = await fetch('/api/action/run-workflow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workflow, options })
    });
    const json = await res.json();
    if (!json.success) {
      alert(`Could not start workflow: ${json.error}`);
    }
  } catch (err) {
    alert(`Network error: ${err.message}`);
  }
}

async function cancelWorkflow() {
  try {
    const res = await fetch('/api/action/cancel-workflow', { method: 'POST' });
    const json = await res.json();
    alert(json.message || 'Cancelled');
  } catch (err) {
    alert(`Error: ${err.message}`);
  }
}

function exportJobsJson() {
  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(state.filteredJobs, null, 2));
  const downloadAnchor = document.createElement('a');
  downloadAnchor.setAttribute("href", dataStr);
  downloadAnchor.setAttribute("download", `jobs-export-${new Date().toISOString().split('T')[0]}.json`);
  document.body.appendChild(downloadAnchor);
  downloadAnchor.click();
  downloadAnchor.remove();
}

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

window.launchWorkflow = launchWorkflow;
window.openJobDrawer = openJobDrawer;
window.updateJobStatus = updateJobStatus;
window.openDossierModal = openDossierModal;
window.previewRecipientEmail = previewRecipientEmail;
window.confirmLiveOutreach = confirmLiveOutreach;
