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
// Cold Outreach & Referral Studio Client Logic
// --------------------------------------------------------------------------
state.selectedRecipient = null;
state.selectedRecipientIds = new Set();
state.activeEditorTab = 'edit';

async function loadOutreachData() {
  const tbody = document.getElementById('outreachRecipientsBody');
  const historyTbody = document.getElementById('historyTableBody');

  try {
    const res = await fetch('/api/outreach');
    const json = await res.json();
    if (json.success) {
      state.outreach = json;
      const recipients = json.recipients || [];

      // Update badge
      document.getElementById('outreachQueueCount').textContent = recipients.length;
      document.getElementById('badgeOutreachCount').textContent = recipients.length;

      // Update approved count
      const approvedCount = recipients.filter(r => r.status === 'previewed' || r.status === 'ready').length;
      document.getElementById('approvedCountDisplay').textContent = approvedCount;

      renderOutreachTable(recipients);

      // Select first recipient if none selected
      if (!state.selectedRecipient && recipients.length > 0) {
        selectRecipientForEdit(recipients[0].id);
      } else if (state.selectedRecipient) {
        const stillExists = recipients.find(r => r.id === state.selectedRecipient.id);
        if (stillExists) {
          selectRecipientForEdit(stillExists.id);
        }
      }

      // History from MongoDB
      loadMongoLogsAndContacts();
    }
  } catch (err) {
    console.error('Error loading outreach:', err);
    tbody.innerHTML = `<tr><td colspan="5" class="text-center py-4 text-rose">Error loading outreach queue: ${err.message}</td></tr>`;
  }
}

// Avatar color helper
function getCompanyAvatarMeta(name) {
  const clean = (name || 'Company').trim();
  const letter = clean.charAt(0).toUpperCase() || 'C';
  const colors = ['avatar-indigo', 'avatar-purple', 'avatar-cyan', 'avatar-emerald', 'avatar-rose', 'avatar-amber'];
  const charCode = letter.charCodeAt(0);
  const colorClass = colors[charCode % colors.length];
  return { letter, colorClass };
}

state.activeOutreachFilter = 'all';

function setOutreachFilter(filter) {
  state.activeOutreachFilter = filter;
  document.querySelectorAll('.filter-tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.filter === filter);
  });
  filterOutreachRecipients();
}

function updateQueueCounters(all) {
  const allCount = all.length;
  const readyCount = all.filter(r => r.status === 'ready').length;
  const previewedCount = all.filter(r => r.status === 'previewed').length;
  const pendingCount = all.filter(r => !r.status || r.status === 'pending').length;

  const setElText = (id, txt) => {
    const el = document.getElementById(id);
    if (el) el.textContent = txt;
  };

  setElText('outreachQueueCount', allCount);
  setElText('filterCountAll', allCount);
  setElText('filterCountReady', readyCount);
  setElText('filterCountPreviewed', previewedCount);
  setElText('filterCountPending', pendingCount);
  setElText('approvedCountDisplay', readyCount);
  setElText('approvedCountDisplayBtn', readyCount);

  // Enable/disable Send Approved Batch button glow based on ready count
  const btnBatch = document.getElementById('btnSendBatchApproved');
  if (btnBatch) {
    if (readyCount > 0) {
      btnBatch.classList.add('btn-glow');
      btnBatch.style.opacity = '1';
    } else {
      btnBatch.classList.remove('btn-glow');
    }
  }
}

function renderOutreachTable(recipients) {
  const tbody = document.getElementById('outreachRecipientsBody');
  const all = state.outreach.recipients || [];
  updateQueueCounters(all);

  if (recipients.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="text-center py-6 text-muted">No recipients found in this view.</td></tr>';
    return;
  }

  tbody.innerHTML = recipients.map((r) => {
    const isSelected = state.selectedRecipient && state.selectedRecipient.id === r.id;
    const isChecked = state.selectedRecipientIds.has(r.id);
    const { letter, colorClass } = getCompanyAvatarMeta(r.company);

    let statusBadge = '<span class="studio-pill-badge" style="color: #94a3b8;"><span style="color:#64748b;">●</span> Pending</span>';
    if (r.status === 'previewed') statusBadge = '<span class="studio-pill-badge" style="color: #60a5fa; border-color: rgba(59,130,246,0.3);"><span style="color:#3b82f6;">●</span> Previewed</span>';
    if (r.status === 'ready') statusBadge = '<span class="studio-ready-pill"><span>●</span> Ready</span>';
    if (r.status === 'sent') statusBadge = '<span class="studio-pill-badge" style="color: #c084fc; border-color: rgba(168,85,247,0.3);"><span style="color:#a855f7;">●</span> Sent</span>';

    return `
      <tr class="${isSelected ? 'active-row' : ''}" onclick="selectRecipientForEdit('${r.id}')">
        <td onclick="event.stopPropagation();">
          <input type="checkbox" ${isChecked ? 'checked' : ''} onchange="toggleSelectRecipient('${r.id}', this.checked)">
        </td>
        <td>
          <div class="recipient-flex-cell">
            <div class="company-avatar ${colorClass}">${letter}</div>
            <div class="recipient-info-col">
              <span class="recipient-company-name">${escapeHtml(r.company)}</span>
              <span class="recipient-contact-line">
                ${escapeHtml(r.name || 'Hiring Team')} &bull; 
                ${r.email ? `<span class="font-mono text-dim">${escapeHtml(r.email)}</span>` : '<span class="text-rose text-xs" style="font-weight:600;">⚠️ Missing Email</span>'}
              </span>
            </div>
          </div>
        </td>
        <td>
          <span class="role-tag-subtle" title="${escapeHtml(r.role || 'Generative AI & Backend')}">${escapeHtml(r.role || 'Generative AI & Backend')}</span>
        </td>
        <td>${statusBadge}</td>
        <td onclick="event.stopPropagation();" style="text-align: right;">
          <div class="row-actions-group">
            <button type="button" class="row-action-btn" onclick="selectRecipientForEdit('${r.id}'); openAiEnhanceModal();" title="AI Personalize with Company Intelligence">✨</button>
            <button type="button" class="row-action-btn" onclick="enrichRecipientContact('${r.id}', '${escapeHtml(r.company)}', '${escapeHtml(r.link || '')}')" title="Search LinkedIn & Google for Contacts">🔍</button>
            <button type="button" class="row-action-btn btn-delete" onclick="deleteRecipient('${r.id}')" title="Remove from queue">&times;</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function filterOutreachRecipients() {
  const query = (document.getElementById('outreachSearchInput')?.value || '').toLowerCase().trim();
  const filter = state.activeOutreachFilter || 'all';
  let list = state.outreach.recipients || [];

  if (filter === 'ready') {
    list = list.filter(r => r.status === 'ready');
  } else if (filter === 'previewed') {
    list = list.filter(r => r.status === 'previewed');
  } else if (filter === 'pending') {
    list = list.filter(r => !r.status || r.status === 'pending');
  }

  if (query) {
    list = list.filter(r => {
      const text = `${r.company} ${r.name} ${r.email} ${r.role}`.toLowerCase();
      return text.includes(query);
    });
  }

  renderOutreachTable(list);
}

function toggleSelectAllRecipients(checked) {
  const chkAll = document.getElementById('chkSelectAll');
  const isChecked = checked !== undefined ? checked : !chkAll.checked;
  chkAll.checked = isChecked;

  const all = state.outreach.recipients || [];
  if (isChecked) {
    all.forEach(r => state.selectedRecipientIds.add(r.id));
  } else {
    state.selectedRecipientIds.clear();
  }
  filterOutreachRecipients();
}

function toggleSelectRecipient(id, checked) {
  if (checked) {
    state.selectedRecipientIds.add(id);
  } else {
    state.selectedRecipientIds.delete(id);
  }
}

function toggleSenderConfigDrawer() {
  const drawer = document.getElementById('senderConfigDrawer');
  const text = document.getElementById('senderDrawerToggleText');
  if (!drawer) return;
  const isHidden = drawer.style.display === 'none';
  drawer.style.display = isHidden ? 'block' : 'none';
  if (text) text.textContent = isHidden ? 'Hide Sender Details ▲' : 'Configure Sender ▼';
}

function openAiEnhanceWithPreset(preset) {
  openAiEnhanceModal();
  applyPromptPreset(preset);
}

async function selectRecipientForEdit(id) {
  const rec = (state.outreach.recipients || []).find(r => r.id === id);
  if (!rec) return;

  state.selectedRecipient = rec;

  // Header Avatar & Title
  const { letter, colorClass } = getCompanyAvatarMeta(rec.company);
  const avatarEl = document.getElementById('editorCompanyAvatar');
  if (avatarEl) {
    avatarEl.textContent = letter;
    avatarEl.className = `company-logo-avatar ${colorClass}`;
  }

  const headerEl = document.getElementById('editorTargetHeader');
  if (headerEl) headerEl.textContent = `Email for ${rec.company}`;

  const subEl = document.getElementById('editorTargetSub');
  if (subEl) subEl.textContent = `Outreach to ${rec.name || 'Hiring Team'} (${rec.email || 'Email not yet entered'})`;

  const roleBadge = document.getElementById('editorRoleBadge');
  if (roleBadge) roleBadge.textContent = rec.role || 'Generative AI & Backend';

  // Populate Meta fields
  document.getElementById('editCompany').value = rec.company || '';
  document.getElementById('editName').value = rec.name || '';
  document.getElementById('editEmail').value = rec.email || '';
  document.getElementById('editRole').value = rec.role || '';

  // Update sender summary text
  const senderSummary = document.getElementById('senderSummaryText');
  if (senderSummary) {
    senderSummary.textContent = `${state.senderName || 'Yash Giradkar'} (${state.senderEmail || 'yashgiradkar02@gmail.com'})`;
  }

  // Fetch or generate preview content
  try {
    const res = await fetch('/api/outreach/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: rec.id })
    });
    const json = await res.json();
    if (json.success) {
      document.getElementById('editSubject').value = json.subject;
      document.getElementById('editEmailBody').value = rec.customBody || json.html;

      // Update mockup preview
      document.getElementById('mockupTo').textContent = `${rec.name || 'Hiring Team'} <${rec.email || 'recipient@company.com'}>`;
      document.getElementById('mockupSubject').textContent = json.subject;
      document.getElementById('mockupHtmlBody').innerHTML = rec.customBody || json.html;
    }
  } catch (err) {
    console.error('Error fetching preview:', err);
  }

  // Update Mark as Ready button state
  const btnMark = document.getElementById('btnMarkReady');
  if (rec.status === 'ready') {
    btnMark.textContent = '✓ Ready to Send';
    btnMark.className = 'btn btn-sm btn-emerald';
  } else if (rec.status === 'previewed') {
    btnMark.textContent = '✓ Previewed (Click to Set Ready)';
    btnMark.className = 'btn btn-sm btn-outline';
  } else {
    btnMark.textContent = '✓ Mark as Previewed';
    btnMark.className = 'btn btn-sm btn-outline';
  }

  // Re-render table to highlight active row
  filterOutreachRecipients();
}

function switchEditorTab(tab) {
  state.activeEditorTab = tab;
  document.getElementById('btnTabEditEmail').classList.toggle('active', tab === 'edit');
  document.getElementById('btnTabPreviewHtml').classList.toggle('active', tab === 'preview');
  document.getElementById('editorEditView').classList.toggle('active', tab === 'edit');
  document.getElementById('editorPreviewView').classList.toggle('active', tab === 'preview');

  if (tab === 'preview') {
    updateMockupFromEditor();
  }
}

// State for UI-driven email configuration
state.senderName = 'Yash Giradkar';
state.senderEmail = 'yashgiradkar02@gmail.com';
state.attachmentPath = './Yash_Giradkar_Resume.pdf';
state.attachmentVerified = true;
state.attachmentFilename = 'Yash_Giradkar_Resume.pdf';
state.attachmentSizeKb = '112.5';
state.activeBatchTargets = [];

let attachmentCheckTimeout = null;
function onAttachmentPathChange() {
  const input = document.getElementById('editAttachmentPath');
  const badge = document.getElementById('attachmentStatusBadge');
  const mockupAttach = document.getElementById('mockupAttachment');
  const pathVal = (input?.value || '').trim();
  state.attachmentPath = pathVal;

  clearTimeout(attachmentCheckTimeout);
  attachmentCheckTimeout = setTimeout(async () => {
    try {
      const res = await fetch('/api/outreach/verify-attachment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: pathVal })
      });
      const json = await res.json();
      if (json.exists) {
        state.attachmentVerified = true;
        state.attachmentFilename = json.filename;
        state.attachmentSizeKb = json.sizeKb;
        if (badge) {
          badge.className = 'badge badge-emerald';
          badge.textContent = `📎 Verified (${json.sizeKb} KB)`;
        }
        if (mockupAttach) {
          mockupAttach.textContent = `📎 ${json.filename} (${json.sizeKb} KB)`;
        }
      } else {
        state.attachmentVerified = false;
        if (badge) {
          badge.className = 'badge badge-rose';
          badge.textContent = `⚠️ File not found`;
        }
        if (mockupAttach) {
          mockupAttach.textContent = `⚠️ Missing: ${pathVal}`;
        }
      }
    } catch {
      state.attachmentVerified = false;
    }
  }, 350);
}

function updateMockupFromEditor() {
  const senderName = document.getElementById('editSenderName')?.value || state.senderName || 'Yash Giradkar';
  const senderEmail = document.getElementById('editSenderEmail')?.value || state.senderEmail || 'yashgiradkar02@gmail.com';
  const company = document.getElementById('editCompany')?.value || 'Company';
  const name = document.getElementById('editName')?.value || 'Hiring Team';
  const email = document.getElementById('editEmail')?.value || 'recipient@company.com';
  const role = document.getElementById('editRole')?.value || 'Generative AI & Backend Engineer';
  let subject = document.getElementById('editSubject')?.value || '';
  let body = document.getElementById('editEmailBody')?.value || '';

  state.senderName = senderName;
  state.senderEmail = senderEmail;

  // Dynamic token replacements
  const replaceTokens = (str) => {
    return str
      .replace(/\{\{company\}\}/gi, company)
      .replace(/\{\{name\}\}/gi, name)
      .replace(/\{\{role\}\}/gi, role)
      .replace(/\{\{senderName\}\}/gi, senderName)
      .replace(/\{\{link\}\}/gi, state.selectedRecipient?.link || '#');
  };

  subject = replaceTokens(subject);
  body = replaceTokens(body);

  const mockupFrom = document.getElementById('mockupFrom');
  if (mockupFrom) mockupFrom.textContent = `${senderName} <${senderEmail}>`;

  const mockupTo = document.getElementById('mockupTo');
  if (mockupTo) mockupTo.textContent = `${name} <${email}>`;

  const mockupSubject = document.getElementById('mockupSubject');
  if (mockupSubject) mockupSubject.textContent = subject;

  const mockupHtmlBody = document.getElementById('mockupHtmlBody');
  if (mockupHtmlBody) mockupHtmlBody.innerHTML = body;

  const mockupAttachment = document.getElementById('mockupAttachment');
  if (mockupAttachment) {
    mockupAttachment.textContent = state.attachmentVerified 
      ? `📎 ${state.attachmentFilename || 'Yash_Giradkar_Resume.pdf'}`
      : `⚠️ Missing Attachment`;
  }
}

function insertToken(token) {
  const textarea = document.getElementById('editEmailBody');
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const text = textarea.value;
  textarea.value = text.substring(0, start) + token + text.substring(end);
  textarea.focus();
  textarea.selectionStart = textarea.selectionEnd = start + token.length;
  updateMockupFromEditor();
}

function onSenderFieldChange() {
  state.senderName = document.getElementById('editSenderName')?.value || 'Yash Giradkar';
  state.senderEmail = document.getElementById('editSenderEmail')?.value || 'yashgiradkar02@gmail.com';
  updateMockupFromEditor();
}

function onSubjectChange() {
  if (state.selectedRecipient) {
    state.selectedRecipient.customSubject = document.getElementById('editSubject')?.value;
  }
  updateMockupFromEditor();
}

function onBodyChange() {
  if (state.selectedRecipient) {
    state.selectedRecipient.customBody = document.getElementById('editEmailBody')?.value;
  }
  updateMockupFromEditor();
}

function onRecipientFieldChange() {
  if (!state.selectedRecipient) return;
  state.selectedRecipient.company = document.getElementById('editCompany')?.value || '';
  state.selectedRecipient.name = document.getElementById('editName')?.value || '';
  state.selectedRecipient.email = document.getElementById('editEmail')?.value || '';
  state.selectedRecipient.role = document.getElementById('editRole')?.value || '';
  updateMockupFromEditor();
  renderOutreachTable(state.outreach.recipients || []);
}

function stripHtml(html) {
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  return tmp.textContent || tmp.innerText || '';
}

async function saveCurrentDraft() {
  if (!state.selectedRecipient) {
    alert('Please select a recipient first.');
    return;
  }

  const company = document.getElementById('editCompany').value;
  const name = document.getElementById('editName').value;
  const email = document.getElementById('editEmail').value;
  const role = document.getElementById('editRole').value;
  const customSubject = document.getElementById('editSubject').value;
  const customBody = document.getElementById('editEmailBody').value;

  try {
    const res = await fetch(`/api/outreach/recipient/${state.selectedRecipient.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        company,
        name,
        email,
        role,
        customSubject,
        customBody,
        status: 'previewed'
      })
    });
    const json = await res.json();
    if (json.success) {
      alert('Draft saved with your UI customizations!');
      loadOutreachData();
    } else {
      alert(`Could not save: ${json.error}`);
    }
  } catch (err) {
    alert(`Error: ${err.message}`);
  }
}

// STRICT SAFETY GUARDRAIL: Sends email ONLY to user's address
async function sendTestPreviewToMe() {
  if (!state.selectedRecipient) {
    alert('Please select a recipient first to generate the preview.');
    return;
  }

  updateMockupFromEditor();
  const fromName = (document.getElementById('editSenderName')?.value || 'Yash Giradkar').trim();
  const fromEmail = (document.getElementById('editSenderEmail')?.value || 'yashgiradkar02@gmail.com').trim();
  const attachmentPath = (document.getElementById('editAttachmentPath')?.value || './Yash_Giradkar_Resume.pdf').trim();
  const subject = document.getElementById('mockupSubject')?.textContent || '';
  const html = document.getElementById('mockupHtmlBody')?.innerHTML || '';

  if (!confirm(`🛡️ SAFETY CHECK: This will send the preview email with your resume attachment strictly to YOUR own verified inbox (yashgiradkar02@gmail.com).\n\nSender Name: ${fromName}\nAttachment: ${attachmentPath}\n\nNo email will be sent to ${state.selectedRecipient.company}.\n\nProceed with safe test send?`)) {
    return;
  }

  try {
    const res = await fetch('/api/outreach/send-test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: state.selectedRecipient.id,
        fromName,
        fromEmail,
        attachmentPath,
        subject,
        html,
        text: stripHtml(html)
      })
    });
    const json = await res.json();
    if (json.success) {
      alert(`✅ ${json.message}\n\nPlease check your email inbox to verify the preview and attachment!`);
      loadOutreachData();
    } else {
      alert(`Failed to send test: ${json.error}`);
    }
  } catch (err) {
    alert(`Error: ${err.message}`);
  }
}

async function toggleMarkReady() {
  if (!state.selectedRecipient) return;
  const newStatus = state.selectedRecipient.status === 'ready' ? 'previewed' : 'ready';

  try {
    await fetch(`/api/outreach/recipient/${state.selectedRecipient.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus })
    });
    loadOutreachData();
  } catch (err) {
    console.error(err);
  }
}

// Send Single Email: 100% UI Data payload (Zero JSON file dependency)
async function sendSingleOutreachEmail() {
  if (!state.selectedRecipient) {
    alert('Please select a recipient first.');
    return;
  }

  updateMockupFromEditor();
  const to = (document.getElementById('editEmail')?.value || '').trim();
  const fromName = (document.getElementById('editSenderName')?.value || 'Yash Giradkar').trim();
  const fromEmail = (document.getElementById('editSenderEmail')?.value || 'yashgiradkar02@gmail.com').trim();
  const attachmentPath = (document.getElementById('editAttachmentPath')?.value || './Yash_Giradkar_Resume.pdf').trim();
  const company = (document.getElementById('editCompany')?.value || '').trim();
  const recipientName = (document.getElementById('editName')?.value || '').trim();
  const role = (document.getElementById('editRole')?.value || '').trim();
  const subject = (document.getElementById('mockupSubject')?.textContent || '').trim();
  const html = document.getElementById('mockupHtmlBody')?.innerHTML || '';

  // Strict Production Validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!to || !emailRegex.test(to)) {
    alert(`Cannot send: Missing or invalid corporate email address "${to}" for ${company}. Please enter a valid email.`);
    document.getElementById('editEmail')?.focus();
    return;
  }

  const lowerTo = to.toLowerCase();
  if (lowerTo.endsWith('@example.com') || lowerTo.endsWith('@placeholder.com') || lowerTo.endsWith('@test.com')) {
    alert(`Cannot send: Placeholder/fake domain "${to}" detected. Enterprise compliance requires verified corporate emails.`);
    document.getElementById('editEmail')?.focus();
    return;
  }

  if (!subject || subject.includes('{{') || html.includes('{{')) {
    alert(`Cannot send: Unreplaced template tokens {{...}} detected. Please resolve them first.`);
    return;
  }

  if (!state.attachmentVerified) {
    if (!confirm(`⚠️ Attachment Warning: Resume file was not found at "${attachmentPath}". Send without attachment?`)) {
      return;
    }
  }

  if (!confirm(`⚠️ PRODUCTION OUTREACH CONFIRMATION:\n\nAre you sure you want to send this production email?\n\n• From: ${fromName} <${fromEmail}>\n• To: ${recipientName || 'Hiring Team'} <${to}>\n• Company: ${company}\n• Role: ${role}\n• Subject: ${subject}\n• Attachment: ${attachmentPath}\n\nAll data is transmitted directly from your UI edits (Zero JSON dependency). Click OK to dispatch.`)) {
    return;
  }

  try {
    const res = await fetch('/api/outreach/send-single', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to,
        fromName,
        fromEmail,
        attachmentPath,
        company,
        recipientName,
        role,
        subject,
        html,
        text: stripHtml(html),
        id: state.selectedRecipient.id,
        confirmed: true
      })
    });
    const json = await res.json();
    if (json.success) {
      alert(`✅ ${json.message}`);
      loadOutreachData();
    } else {
      alert(`Error sending email: ${json.error}`);
    }
  } catch (err) {
    alert(`Error: ${err.message}`);
  }
}

// Populate 30 Startups from Google Sheet
async function populate30Startups() {
  if (!confirm('Load a batch of 30 Agentic AI startup companies (Devin, Cursor, Replit, Poolside, LangChain, CrewAI, etc.) into your outreach campaign queue?')) {
    return;
  }

  try {
    const res = await fetch('/api/outreach/populate-startups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ count: 30 })
    });
    const json = await res.json();
    if (json.success) {
      alert(`✅ ${json.message}`);
      loadOutreachData();
    } else {
      alert(`Error: ${json.error}`);
    }
  } catch (err) {
    alert(`Error: ${err.message}`);
  }
}

// Add Recipient Modal
function openAddRecipientModal() {
  document.getElementById('addRecipientModal').classList.add('open');
}

function closeAddRecipientModal() {
  document.getElementById('addRecipientModal').classList.remove('open');
}

async function submitNewRecipient(event) {
  event.preventDefault();
  const company = document.getElementById('newRecCompany').value.trim();
  const name = document.getElementById('newRecName').value.trim();
  const email = document.getElementById('newRecEmail').value.trim();
  const role = document.getElementById('newRecRole').value.trim();
  const link = document.getElementById('newRecLink').value.trim();

  try {
    const res = await fetch('/api/outreach/recipient', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ company, name, email, role, link })
    });
    const json = await res.json();
    if (json.success) {
      closeAddRecipientModal();
      document.getElementById('formAddRecipient').reset();
      await loadOutreachData();
      selectRecipientForEdit(json.recipient.id);
    } else {
      alert(`Could not add recipient: ${json.error}`);
    }
  } catch (err) {
    alert(`Error: ${err.message}`);
  }
}

async function deleteRecipient(id) {
  if (!confirm('Remove this recipient from your outreach campaign queue?')) return;
  try {
    const res = await fetch(`/api/outreach/recipient/${id}`, { method: 'DELETE' });
    const json = await res.json();
    if (json.success) {
      if (state.selectedRecipient && state.selectedRecipient.id === id) {
        state.selectedRecipient = null;
      }
      loadOutreachData();
    }
  } catch (err) {
    alert(`Error: ${err.message}`);
  }
}

// --------------------------------------------------------------------------
// Batch Production Dispatch Modal & Execution (Zero JSON dependency, Zero fake data)
// --------------------------------------------------------------------------
function closeBatchDispatchModal() {
  document.getElementById('batchDispatchModal').classList.remove('open');
}

function openBatchDispatchModal() {
  document.getElementById('batchDispatchModal').classList.add('open');
}

function confirmBatchSend() {
  const selectedIds = Array.from(state.selectedRecipientIds);
  const queue = state.outreach.recipients || [];
  let targets = selectedIds.length > 0 
    ? queue.filter(r => selectedIds.includes(r.id)) 
    : queue;

  if (targets.length === 0) {
    alert('No recipients in queue. Please load or add recipients first.');
    return;
  }

  state.activeBatchTargets = targets;
  renderBatchModal();
  openBatchDispatchModal();
}

function renderBatchModal() {
  const targets = state.activeBatchTargets;
  const tbody = document.getElementById('batchModalTableBody');
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  let validCount = 0;
  let invalidCount = 0;

  tbody.innerHTML = targets.map((t, idx) => {
    const email = (t.email || '').trim();
    const isFake = email.endsWith('@example.com') || email.endsWith('@placeholder.com') || email.endsWith('@test.com');
    const isValid = email && emailRegex.test(email) && !isFake;

    if (isValid) {
      validCount++;
    } else {
      invalidCount++;
    }

    return `
      <tr>
        <td>${idx + 1}</td>
        <td><strong>${escapeHtml(t.company)}</strong></td>
        <td>${escapeHtml(t.name || 'Hiring Team')}</td>
        <td>
          <input type="email" class="input-meta font-mono" style="padding: 0.25rem 0.5rem; font-size: 0.8rem; width: 220px; ${!isValid ? 'border-color: #f43f5e;' : ''}" 
                 value="${escapeHtml(email)}" 
                 placeholder="Enter corporate email..."
                 onchange="updateBatchRecipientEmail(${idx}, this.value)">
        </td>
        <td>
          ${isValid 
            ? '<span class="badge badge-emerald">✓ Verified</span>' 
            : '<span class="badge badge-rose">⚠️ Email Required</span>'}
        </td>
        <td style="text-align: right;">
          <button type="button" class="btn btn-xs btn-outline btn-rose" onclick="removeRecipientFromBatch(${idx})" title="Remove ${escapeHtml(t.company)} from this dispatch batch">
            ✕ Remove
          </button>
        </td>
      </tr>
    `;
  }).join('');

  document.getElementById('batchTotalCount').textContent = targets.length;
  document.getElementById('batchValidCount').textContent = validCount;
  document.getElementById('batchInvalidCount').textContent = invalidCount;
  document.getElementById('batchAttachmentStatus').textContent = state.attachmentVerified ? 'Verified' : 'Missing';
  document.getElementById('batchAttachmentStatus').className = state.attachmentVerified ? 'batch-stat-num text-emerald' : 'batch-stat-num text-rose';

  const warningBox = document.getElementById('batchWarningBox');
  const btnExecute = document.getElementById('btnExecuteBatchDispatch');

  if (invalidCount > 0) {
    warningBox.style.display = 'flex';
    document.getElementById('batchWarningText').textContent = 
      `${invalidCount} recipient(s) have missing or placeholder emails. Enterprise rules require real corporate emails for all batch items. Click "Remove All Invalid" or enter valid emails above before dispatching.`;
    btnExecute.disabled = true;
    btnExecute.style.opacity = '0.5';
    btnExecute.style.cursor = 'not-allowed';
  } else {
    warningBox.style.display = 'none';
    btnExecute.disabled = false;
    btnExecute.style.opacity = '1';
    btnExecute.style.cursor = 'pointer';
  }
}

function updateBatchRecipientEmail(index, newEmail) {
  if (state.activeBatchTargets[index]) {
    state.activeBatchTargets[index].email = newEmail.trim();
    // Also sync to main queue
    const targetId = state.activeBatchTargets[index].id;
    const qItem = (state.outreach.recipients || []).find(r => r.id === targetId);
    if (qItem) qItem.email = newEmail.trim();
    renderBatchModal();
    renderOutreachTable(state.outreach.recipients || []);
  }
}

function removeRecipientFromBatch(index) {
  if (!state.activeBatchTargets || index < 0 || index >= state.activeBatchTargets.length) return;
  const removed = state.activeBatchTargets.splice(index, 1)[0];
  if (removed && removed.id) {
    state.selectedRecipientIds.delete(removed.id);
  }
  if (state.activeBatchTargets.length === 0) {
    closeBatchDispatchModal();
  } else {
    renderBatchModal();
  }
}

function removeInvalidRecipientsFromBatch() {
  if (!state.activeBatchTargets) return;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const beforeCount = state.activeBatchTargets.length;
  state.activeBatchTargets = state.activeBatchTargets.filter(t => {
    const email = (t.email || '').trim().toLowerCase();
    const isFake = email.endsWith('@example.com') || email.endsWith('@placeholder.com') || email.endsWith('@test.com');
    const isValid = email && emailRegex.test(email) && !isFake;
    if (!isValid && t.id) {
      state.selectedRecipientIds.delete(t.id);
    }
    return isValid;
  });
  const removedCount = beforeCount - state.activeBatchTargets.length;
  if (state.activeBatchTargets.length === 0) {
    alert(`Removed ${removedCount} recipient(s) with invalid or missing emails. No valid recipients remaining in batch.`);
    closeBatchDispatchModal();
  } else {
    renderBatchModal();
  }
}

async function executeBatchDispatch() {
  const targets = state.activeBatchTargets;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const fromName = (document.getElementById('editSenderName')?.value || state.senderName || 'Yash Giradkar').trim();
  const fromEmail = (document.getElementById('editSenderEmail')?.value || state.senderEmail || 'yashgiradkar02@gmail.com').trim();
  const attachmentPath = (document.getElementById('editAttachmentPath')?.value || state.attachmentPath || './Yash_Giradkar_Resume.pdf').trim();

  // Validate entire batch before dispatch
  const invalid = targets.filter(t => {
    const e = (t.email || '').trim().toLowerCase();
    return !e || !emailRegex.test(e) || e.endsWith('@example.com') || e.endsWith('@placeholder.com') || e.endsWith('@test.com');
  });

  if (invalid.length > 0) {
    alert(`Cannot launch batch: ${invalid.length} recipient(s) still have invalid/missing emails (${invalid.map(i => i.company).join(', ')}). Please provide real emails.`);
    return;
  }

  // Build the complete production payload directly from UI state
  const batchPayload = targets.map(t => {
    // Generate personalized copy if custom body not already stored
    let subject = t.customSubject || `${fromName} — Generative AI & Backend Systems (${t.role || 'Engineer'} at ${t.company})`;
    let body = t.customBody || document.getElementById('editEmailBody')?.value || '';

    // Token replacements
    const replaceTokens = (str) => {
      return str
        .replace(/\{\{company\}\}/gi, t.company || 'Company')
        .replace(/\{\{name\}\}/gi, t.name || 'Hiring Team')
        .replace(/\{\{role\}\}/gi, t.role || 'Generative AI & Backend Engineer')
        .replace(/\{\{senderName\}\}/gi, fromName)
        .replace(/\{\{link\}\}/gi, t.link || '#');
    };

    subject = replaceTokens(subject);
    body = replaceTokens(body);

    return {
      id: t.id,
      to: t.email.trim(),
      fromName,
      fromEmail,
      attachmentPath,
      recipientName: t.name || 'Hiring Team',
      company: t.company,
      role: t.role || 'Generative AI & Backend Systems Engineer',
      subject,
      html: body,
      text: stripHtml(body)
    };
  });

  closeBatchDispatchModal();

  try {
    const res = await fetch('/api/outreach/send-batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        batch: batchPayload,
        confirmed: true
      })
    });
    const json = await res.json();
    if (json.success) {
      switchTab('tab-workflows'); // Switch to terminal to watch live SSE logs
      loadOutreachData();
    } else {
      alert(`Batch launch error: ${json.error}`);
    }
  } catch (err) {
    alert(`Error: ${err.message}`);
  }
}

// --------------------------------------------------------------------------
// MongoDB Outreach Logs & Real-Time Sync (127.0.0.1:27017 / ai_job_hunter)
// --------------------------------------------------------------------------
async function loadMongoLogsAndContacts() {
  const historyTbody = document.getElementById('historyTableBody');
  const countBadge = document.getElementById('historyCountBadge');
  const logsCountElem = document.getElementById('mongoLogsCount');
  const contactsCountElem = document.getElementById('mongoContactsCount');
  const hostElem = document.getElementById('mongoDbHost');

  try {
    // 1. Fetch DB Stats
    const statsRes = await fetch('/api/db/stats');
    const statsJson = await statsRes.json();
    if (statsJson.success && statsJson.db) {
      if (logsCountElem) logsCountElem.textContent = statsJson.db.collections?.outreach_logs || 0;
      if (contactsCountElem) contactsCountElem.textContent = statsJson.db.collections?.companies_contacts || 0;
      if (hostElem) {
        hostElem.textContent = statsJson.db.connected 
          ? `${statsJson.db.uri.replace('mongodb://', '')} / ${statsJson.db.dbName}` 
          : 'Connecting to 127.0.0.1:27017...';
      }
    }

    // 2. Fetch Outreach Logs from MongoDB
    const logsRes = await fetch('/api/outreach/mongo-logs?limit=50');
    const logsJson = await logsRes.json();
    if (logsJson.success && logsJson.logs) {
      const logs = logsJson.logs;
      state.mongoLogs = logs;
      if (countBadge) countBadge.textContent = `${logs.length} in MongoDB`;

      if (logs.length > 0) {
        historyTbody.innerHTML = logs.map(l => {
          const dt = l.date && l.time ? `${l.date} ${l.time}` : new Date(l.timestamp || l.createdAt).toLocaleString();
          const attachName = l.attachment ? l.attachment.split('/').pop() : 'Resume.pdf';
          return `
            <tr>
              <td style="font-family: var(--font-mono); font-size: 0.75rem;">${escapeHtml(dt)}</td>
              <td><strong>${escapeHtml(l.company)}</strong></td>
              <td>${escapeHtml(l.recipientName || 'Hiring Team')}</td>
              <td style="font-family: var(--font-mono); font-size: 0.75rem; color: #a5b4fc;">${escapeHtml(l.toEmail || l.email)}</td>
              <td><span class="skill-tag">${escapeHtml(l.role || 'Generative AI & Backend')}</span></td>
              <td style="font-size: 0.75rem; color: var(--text-dim);">${escapeHtml(l.location || 'Remote')}</td>
              <td><span class="badge badge-sm badge-secondary font-mono">📎 ${escapeHtml(attachName)}</span></td>
              <td><span class="badge badge-emerald">✓ ${escapeHtml(l.status || 'sent')}</span></td>
              <td><button class="btn btn-xs btn-outline" onclick="openViewEmailLogModal('${l._id}')">👁️ View</button></td>
            </tr>
          `;
        }).join('');
      } else {
        historyTbody.innerHTML = '<tr><td colspan="9" class="text-center py-4 text-muted">No emails sent yet in MongoDB database.</td></tr>';
      }
    }
  } catch (err) {
    console.error('Error loading MongoDB logs:', err);
  }
}

function openViewEmailLogModal(id) {
  const log = (state.mongoLogs || []).find(item => item._id === id || String(item._id) === String(id));
  if (!log) return;

  const modal = document.getElementById('viewEmailLogModal');
  document.getElementById('logModalTitle').textContent = `Logged Outreach: ${log.company}`;
  document.getElementById('logModalCompany').textContent = log.company || '-';
  document.getElementById('logModalTo').textContent = `${log.recipientName ? log.recipientName + ' <' : ''}${log.toEmail || log.email || '-'}${log.recipientName ? '>' : ''}`;
  document.getElementById('logModalFrom').textContent = log.fromEmail || 'Default SMTP Sender';
  document.getElementById('logModalSubject').textContent = log.subject || '(No Subject)';
  document.getElementById('logModalDateTime').textContent = log.date && log.time ? `${log.date} ${log.time}` : new Date(log.timestamp || log.createdAt).toLocaleString();
  document.getElementById('logModalMessageId').textContent = log.messageId || 'Direct SMTP Confirmed';
  document.getElementById('logModalAttachment').textContent = log.attachment ? `📎 ${log.attachment.split('/').pop()}` : '📎 Resume.pdf';

  const contentBox = document.getElementById('logModalHtmlContent');
  if (log.emailContentHtml) {
    contentBox.innerHTML = log.emailContentHtml;
  } else if (log.emailContentText) {
    contentBox.innerHTML = `<pre style="white-space: pre-wrap; font-family: inherit; margin: 0;">${escapeHtml(log.emailContentText)}</pre>`;
  } else {
    contentBox.innerHTML = '<span class="text-muted">No content stored for this log.</span>';
  }

  if (modal) modal.classList.add('active');
}

function closeViewEmailLogModal() {
  const modal = document.getElementById('viewEmailLogModal');
  if (modal) modal.classList.remove('active');
}

// --------------------------------------------------------------------------
// Contact Enrichment (LinkedIn & Google Scraping for Founders & HR)
// --------------------------------------------------------------------------
async function enrichRecipientContact(id, company, link) {
  if (!company) return;
  const btn = event?.target;
  const originalText = btn ? btn.textContent : '';
  if (btn) {
    btn.textContent = '⏳ Searching...';
    btn.disabled = true;
  }

  try {
    const res = await fetch('/api/outreach/enrich-contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, company, link })
    });
    const json = await res.json();
    if (json.success && json.contacts && json.contacts.length > 0) {
      const top = json.contacts[0];
      alert(`🎯 Found Contact for ${company}!\n\nName: ${top.name}\nTitle: ${top.title}\nEmail: ${top.email}\nLinkedIn: ${top.linkedinUrl || 'N/A'}\nLocation: ${top.location || 'Remote'}\n\nSaved to MongoDB and updated in UI!`);
      await loadOutreachData();
      selectRecipientForEdit(id);
    } else {
      alert(`No individual LinkedIn profile found for ${company}. Corporate careers domain generated and saved in MongoDB.`);
      await loadOutreachData();
    }
  } catch (err) {
    alert(`Enrichment error: ${err.message}`);
  } finally {
    if (btn) {
      btn.textContent = originalText;
      btn.disabled = false;
    }
  }
}

async function enrichBatchContacts() {
  if (!confirm('Search LinkedIn and Google to discover HR leaders, Recruiters, and Founders for startup companies in your queue?\n\nDiscovered profiles and verified corporate emails will be saved to MongoDB (127.0.0.1:27017) and auto-filled into your queue.')) {
    return;
  }

  try {
    const res = await fetch('/api/outreach/enrich-batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    const json = await res.json();
    if (json.success) {
      alert(`🚀 ${json.message}`);
      switchTab('tab-workflows'); // Switch to terminal to watch live searches
      loadOutreachData();
    } else {
      alert(`Error starting batch enrichment: ${json.error}`);
    }
  } catch (err) {
    alert(`Error: ${err.message}`);
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

// --------------------------------------------------------------------------
// AI Prompt & Company Intelligence Email Enhancer
// --------------------------------------------------------------------------
state.aiEnhancer = {
  currentIntel: null,
  enhancedSubject: '',
  enhancedHtml: '',
  enhancedText: ''
};

function openAiEnhanceModal() {
  if (!state.selectedRecipient) {
    if (state.outreach.recipients && state.outreach.recipients.length > 0) {
      selectRecipientForEdit(state.outreach.recipients[0].id);
    } else {
      alert('Please select or add an outreach recipient first.');
      return;
    }
  }

  const rec = state.selectedRecipient;
  const company = rec.company || 'Company';
  const role = rec.role || 'Generative AI & Backend Systems Engineer';
  const name = rec.name || 'Hiring Team';

  document.getElementById('aiModalCompany').textContent = company;
  document.getElementById('aiModalRole').textContent = role;
  document.getElementById('aiModalRecipient').textContent = name;

  const promptTextarea = document.getElementById('aiPromptText');
  if (!promptTextarea.value || promptTextarea.dataset.lastCompany !== company) {
    promptTextarea.dataset.lastCompany = company;
    promptTextarea.value = `Research ${company}'s latest product launches, news headlines, mission/passion, and recent AI initiatives.
Integrate these company findings with my candidate background (Yash Giradkar: Generative AI/LLM + Backend Engineer, 83% API latency reduction with Node.js/NestJS/FastAPI, Avion AI multi-agent RAG with 94.6% precision, AWS ECS/Fargate).
Generate an eye-catching, unique subject line and a concise, high-converting cold email selling my specific engineering impact to their current engineering goals.`;
  }

  const savedKey = localStorage.getItem('ai_outreach_api_key');
  if (savedKey) {
    const keyInput = document.getElementById('aiApiKeyInput');
    if (keyInput) keyInput.value = savedKey;
  }
  const savedProvider = localStorage.getItem('ai_outreach_provider');
  if (savedProvider) {
    const provSelect = document.getElementById('aiProviderSelect');
    if (provSelect) provSelect.value = savedProvider;
    onProviderSelectChange();
  }

  document.getElementById('aiEnhanceProgress').style.display = 'none';
  document.getElementById('aiResultsContainer').style.display = 'none';
  document.getElementById('btnApplyAiEnhancedDraft').style.display = 'none';

  document.getElementById('aiEnhanceModal').classList.add('open');
}

function closeAiEnhanceModal() {
  document.getElementById('aiEnhanceModal').classList.remove('open');
}

function applyPromptPreset(presetKey) {
  const comp = state.selectedRecipient?.company || 'this company';
  const promptTextarea = document.getElementById('aiPromptText');
  if (!promptTextarea) return;

  const presets = {
    default: `Research ${comp}'s latest product launches, news headlines, mission/passion, and recent AI initiatives.
Integrate these company findings with my candidate background (Yash Giradkar: Generative AI/LLM + Backend Engineer, 83% API latency reduction with Node.js/NestJS/FastAPI, Avion AI multi-agent RAG with 94.6% precision, AWS ECS/Fargate).
Generate an eye-catching, unique subject line and a concise, high-converting cold email selling my specific engineering impact to their current engineering goals.`,

    concise: `Research ${comp}'s core platform and most recent headline.
Draft an ultra-concise (<120 words) executive email to the engineering hiring team.
Lead with a 1-sentence hook showing I understand their exact product momentum, highlight 2 bullet points of my verified metrics (83% API latency reduction, Avion AI multi-agent RAG with 94.6% precision), and propose a low-friction 10-minute sync. Zero generic filler.`,

    tech: `Deeply analyze ${comp}'s engineering architecture, backend scalability, and AI/GenAI tech stack.
Emphasize my direct engineering experience: building production TypeScript/NestJS API Gateways, reducing API latency by 83% across microservices, multi-document RAG with MMR search on FAISS/AWS ECS, and resolving 70K+ corrupted records using MongoDB aggregations.
Directly map how I can accelerate ${comp}'s immediate infrastructure and GenAI roadmap.`,

    agentic: `Focus heavily on ${comp}'s interest in Autonomous AI Agents and LLM workflows.
Highlight my hands-on build of the Avion AI Customer Support Platform: multi-tenant agentic orchestration (LangChain, LangGraph), dynamic tool selection across Search, Escalate and Resolve, and two-stage multi-model response synthesis.
Demonstrate how I bring dependable, production-grade agentic systems to ${comp}.`,

    headlines: `Search for the newest 2025/2026 press releases, news headlines, or product announcements from ${comp}.
Open the email with a direct reference to their latest headline/achievement to immediately show authentic research.
Seamlessly connect their recent momentum to my background as a Generative AI & Backend Engineer with proven results cutting backend latency by 83% and building high-precision RAG architectures.`,

    startup: `Adopt an agile startup founder / engineering lead tone for ${comp}.
Focus on passion, speed of shipping, and eliminating production downtime.
Highlight building full-stack backend systems, handling messy production incidents (70K+ MongoDB record recovery), and deploying containerized microservices to AWS. Keep it fast, energetic, and compelling.`
  };

  if (presets[presetKey]) {
    promptTextarea.value = presets[presetKey];
    promptTextarea.focus();
  }
}

function toggleAiSettings() {
  const panel = document.getElementById('aiSettingsPanel');
  const text = document.getElementById('aiSettingsExpandText');
  const isHidden = panel.style.display === 'none';

  panel.style.display = isHidden ? 'block' : 'none';
  text.textContent = isHidden ? 'Hide Settings ▲' : 'Show Settings ▼';
}

function onProviderSelectChange() {
  const prov = document.getElementById('aiProviderSelect').value;
  const badge = document.getElementById('activeProviderBadge');
  const modelInput = document.getElementById('aiModelInput');

  localStorage.setItem('ai_outreach_provider', prov);

  if (prov === 'gemini') {
    badge.textContent = 'Google Gemini';
    modelInput.placeholder = 'gemini-1.5-flash (default)';
  } else if (prov === 'openai') {
    badge.textContent = 'OpenAI';
    modelInput.placeholder = 'gpt-4o-mini (default)';
  } else if (prov === 'anthropic') {
    badge.textContent = 'Claude';
    modelInput.placeholder = 'claude-3-5-sonnet (default)';
  } else if (prov === 'ollama') {
    badge.textContent = 'Local Ollama';
    modelInput.placeholder = 'llama3.2 (default)';
  } else {
    badge.textContent = 'Built-in Zero-Key Engine';
    modelInput.placeholder = 'Built-in Heuristic Generator';
  }
}

async function executeAiEnhancement() {
  const rec = state.selectedRecipient;
  if (!rec) {
    alert('Please select a recipient first.');
    return;
  }

  const prompt = document.getElementById('aiPromptText')?.value?.trim();
  const provider = document.getElementById('aiProviderSelect')?.value || 'gemini';
  const model = document.getElementById('aiModelInput')?.value?.trim();
  const apiKey = document.getElementById('aiApiKeyInput')?.value?.trim();

  if (apiKey) {
    localStorage.setItem('ai_outreach_api_key', apiKey);
  }

  const progress = document.getElementById('aiEnhanceProgress');
  const resultsContainer = document.getElementById('aiResultsContainer');
  const btnExecute = document.getElementById('btnExecuteAiEnhance');
  const stepWeb = document.getElementById('stepWebSearch');
  const stepMatch = document.getElementById('stepMatchProfile');
  const stepLlm = document.getElementById('stepLlmGeneration');
  const statusText = document.getElementById('aiProgressStatusText');

  progress.style.display = 'block';
  resultsContainer.style.display = 'none';
  document.getElementById('btnApplyAiEnhancedDraft').style.display = 'none';
  btnExecute.disabled = true;
  btnExecute.innerHTML = '<span class="spinner-sm" style="display:inline-block; vertical-align:middle; margin-right:6px;"></span> Researching & Synthesizing...';

  stepWeb.className = 'ai-step-item active';
  stepMatch.className = 'ai-step-item';
  stepLlm.className = 'ai-step-item';
  statusText.textContent = `Scraping ${rec.company}'s latest products, headlines & passion...`;

  const stepTimer1 = setTimeout(() => {
    stepWeb.className = 'ai-step-item completed';
    stepMatch.className = 'ai-step-item active';
    statusText.textContent = `Aligning company momentum with Yash's verified achievements (83% latency, Avion AI RAG)...`;
  }, 1200);

  const stepTimer2 = setTimeout(() => {
    stepMatch.className = 'ai-step-item completed';
    stepLlm.className = 'ai-step-item active';
    statusText.textContent = `Executing LLM prompt synthesis for high-conversion email...`;
  }, 2400);

  try {
    const res = await fetch('/api/outreach/enhance-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: rec.id,
        company: rec.company,
        role: rec.role,
        recipientName: rec.name,
        link: rec.link,
        prompt,
        provider,
        apiKey,
        model
      })
    });

    clearTimeout(stepTimer1);
    clearTimeout(stepTimer2);

    const json = await res.json();
    if (!json.success) {
      throw new Error(json.error || 'Failed to enhance email');
    }

    stepWeb.className = 'ai-step-item completed';
    stepMatch.className = 'ai-step-item completed';
    stepLlm.className = 'ai-step-item completed';
    statusText.textContent = '✨ Complete! High-converting personalized email generated.';

    state.aiEnhancer.currentIntel = json.companyIntel;
    state.aiEnhancer.enhancedSubject = json.subject;
    state.aiEnhancer.enhancedHtml = json.html;
    state.aiEnhancer.enhancedText = json.text;

    document.getElementById('aiResultSubject').value = json.subject || '';
    document.getElementById('aiResultHtmlPreview').innerHTML = json.html || '';
    document.getElementById('aiResultRawHtml').value = json.html || '';

    const noteBanner = document.getElementById('aiResultNoteBanner');
    if (json.warning || json.note) {
      noteBanner.style.display = 'block';
      noteBanner.textContent = json.warning || json.note;
    } else {
      noteBanner.style.display = 'none';
    }

    const intel = json.companyIntel || {};
    document.getElementById('intelWhatItDoes').textContent = intel.whatItDoes || `${rec.company} builds modern technology products.`;
    document.getElementById('intelPassion').textContent = intel.passion || `Focusing on engineering excellence, reliability and scalable systems.`;

    const headlinesEl = document.getElementById('intelHeadlinesList');
    headlinesEl.innerHTML = '';
    if (intel.headlines && intel.headlines.length > 0) {
      intel.headlines.forEach(h => {
        const div = document.createElement('div');
        div.className = 'headline-item';
        div.innerHTML = `
          <a href="${escapeHtml(h.link)}" target="_blank" class="headline-link">📰 ${escapeHtml(h.title)}</a>
          <span class="headline-snippet">${escapeHtml(h.snippet)}</span>
        `;
        headlinesEl.appendChild(div);
      });
    } else {
      headlinesEl.innerHTML = '<span class="text-dim text-xs">No recent news headlines returned by search.</span>';
    }

    const recentDoneEl = document.getElementById('intelRecentDoneList');
    recentDoneEl.innerHTML = '';
    if (intel.recentDone && intel.recentDone.length > 0) {
      intel.recentDone.forEach(d => {
        const li = document.createElement('li');
        li.textContent = d;
        recentDoneEl.appendChild(li);
      });
    } else {
      recentDoneEl.innerHTML = '<li>Continuous backend optimization and scalable product launches.</li>';
    }

    setTimeout(() => {
      progress.style.display = 'none';
      resultsContainer.style.display = 'block';
      document.getElementById('btnApplyAiEnhancedDraft').style.display = 'inline-flex';
      switchAiResultTab('email');
    }, 600);

  } catch (err) {
    clearTimeout(stepTimer1);
    clearTimeout(stepTimer2);
    progress.style.display = 'none';
    alert(`Enhancement Error: ${err.message}`);
  } finally {
    btnExecute.disabled = false;
    btnExecute.innerHTML = '🚀 Research Company & Enhance Email with LLM';
  }
}

function switchAiResultTab(tab) {
  document.getElementById('btnTabAiEmail').classList.toggle('active', tab === 'email');
  document.getElementById('btnTabAiIntel').classList.toggle('active', tab === 'intel');
  document.getElementById('aiResultEmailView').style.display = tab === 'email' ? 'block' : 'none';
  document.getElementById('aiResultIntelView').style.display = tab === 'intel' ? 'block' : 'none';
}

function toggleAiBodyView(view) {
  const isHtml = view === 'html';
  document.getElementById('btnAiViewHtml').classList.toggle('active', isHtml);
  document.getElementById('btnAiViewRaw').classList.toggle('active', !isHtml);
  document.getElementById('aiResultHtmlPreview').style.display = isHtml ? 'block' : 'none';
  document.getElementById('aiResultRawHtml').style.display = !isHtml ? 'block' : 'none';

  if (!isHtml) {
    document.getElementById('aiResultRawHtml').value = document.getElementById('aiResultHtmlPreview').innerHTML;
  } else {
    document.getElementById('aiResultHtmlPreview').innerHTML = document.getElementById('aiResultRawHtml').value;
  }
}

function applyAiEnhancedDraftToEditor() {
  const subjectInput = document.getElementById('aiResultSubject');
  const subject = subjectInput ? subjectInput.value : state.aiEnhancer.enhancedSubject;
  const rawHtmlTextarea = document.getElementById('aiResultRawHtml');
  const htmlPreview = document.getElementById('aiResultHtmlPreview');
  const html = rawHtmlTextarea && rawHtmlTextarea.style.display !== 'none' 
    ? rawHtmlTextarea.value 
    : (htmlPreview?.innerHTML || state.aiEnhancer.enhancedHtml);

  const editSub = document.getElementById('editSubject');
  const editBody = document.getElementById('editEmailBody');
  if (editSub) editSub.value = subject;
  if (editBody) editBody.value = html;

  if (state.selectedRecipient) {
    state.selectedRecipient.customSubject = subject;
    state.selectedRecipient.customBody = html;
    state.selectedRecipient.status = 'previewed';
  }

  updateMockupFromEditor();

  const btnMark = document.getElementById('btnMarkReady');
  if (btnMark) {
    btnMark.textContent = '✓ Previewed (Click to Set Ready)';
    btnMark.className = 'btn btn-sm btn-outline';
  }

  closeAiEnhanceModal();
  renderOutreachTable(state.outreach.recipients || []);

  alert('✨ AI Enhanced Email draft applied to your editor! You can review or edit further before saving or sending.');
}

window.launchWorkflow = launchWorkflow;
window.openJobDrawer = openJobDrawer;
window.updateJobStatus = updateJobStatus;
window.openDossierModal = openDossierModal;
window.populate30Startups = populate30Startups;
window.openAddRecipientModal = openAddRecipientModal;
window.closeAddRecipientModal = closeAddRecipientModal;
window.submitNewRecipient = submitNewRecipient;
window.deleteRecipient = deleteRecipient;
window.selectRecipientForEdit = selectRecipientForEdit;
window.switchEditorTab = switchEditorTab;
window.insertToken = insertToken;
window.onRecipientFieldChange = onRecipientFieldChange;
window.saveCurrentDraft = saveCurrentDraft;
window.sendTestPreviewToMe = sendTestPreviewToMe;
window.toggleMarkReady = toggleMarkReady;
window.sendSingleOutreachEmail = sendSingleOutreachEmail;
window.confirmBatchSend = confirmBatchSend;
window.toggleSelectAllRecipients = toggleSelectAllRecipients;
window.toggleSelectRecipient = toggleSelectRecipient;
window.filterOutreachRecipients = filterOutreachRecipients;
window.openAiEnhanceModal = openAiEnhanceModal;
window.closeAiEnhanceModal = closeAiEnhanceModal;
window.applyPromptPreset = applyPromptPreset;
window.toggleAiSettings = toggleAiSettings;
window.onProviderSelectChange = onProviderSelectChange;
window.executeAiEnhancement = executeAiEnhancement;
window.switchAiResultTab = switchAiResultTab;
window.toggleAiBodyView = toggleAiBodyView;
window.applyAiEnhancedDraftToEditor = applyAiEnhancedDraftToEditor;
window.setOutreachFilter = setOutreachFilter;
window.toggleSenderConfigDrawer = toggleSenderConfigDrawer;
window.openAiEnhanceWithPreset = openAiEnhanceWithPreset;
window.removeRecipientFromBatch = removeRecipientFromBatch;
window.removeInvalidRecipientsFromBatch = removeInvalidRecipientsFromBatch;


