import fs from 'node:fs/promises';
import path from 'node:path';

const STATE_FILE = path.resolve(process.cwd(), 'interviews/.research-state.json');

/**
 * Loads the research tracking state.
 */
async function loadState() {
  try {
    const data = await fs.readFile(STATE_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    return {};
  }
}

/**
 * Saves the research tracking state.
 */
async function saveState(state) {
  try {
    await fs.mkdir(path.dirname(STATE_FILE), { recursive: true });
    await fs.writeFile(STATE_FILE, JSON.stringify(state, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to save research state:', err.message);
  }
}

/**
 * Checks for daily updates on an interview (> 1 day away).
 */
export async function checkDailyRefresh(interview, research) {
  const state = await loadState();
  const key = `${interview.companySlug}-${interview.roleSlug}`;
  const previousRecord = state[key] || null;

  const today = new Date().toISOString().split('T')[0];

  // If never researched or first time
  if (!previousRecord) {
    const initialItems = [...research.recentLaunches, ...research.aiGenAiInitiatives];
    state[key] = {
      lastChecked: today,
      knownDevelopments: initialItems
    };
    await saveState(state);
    return {
      isNew: true,
      hasUpdates: true,
      newDevelopments: initialItems
    };
  }

  // Compare developments against known list
  const known = new Set(previousRecord.knownDevelopments || []);
  const currentItems = [
    ...research.recentLaunches,
    ...research.aiGenAiInitiatives,
    ...(research.engineeringBlogs || [])
  ];

  const newItems = currentItems.filter(item => !known.has(item));

  if (newItems.length > 0) {
    // Append to notebook log
    const notebookPath = path.resolve(process.cwd(), interview.workspaceDir, `${interview.companySlug}-${interview.roleSlug}-Interview.md`);
    try {
      let notebookContent = await fs.readFile(notebookPath, 'utf-8');
      const updateEntry = `\n- **${today} Daily Refresh:**\n` + newItems.map(item => `  - ${item}`).join('\n');
      notebookContent += updateEntry;
      await fs.writeFile(notebookPath, notebookContent, 'utf-8');
    } catch {
      // If notebook not present, ignore append
    }

    // Update state
    state[key] = {
      lastChecked: today,
      knownDevelopments: [...known, ...newItems]
    };
    await saveState(state);

    return {
      isNew: false,
      hasUpdates: true,
      newDevelopments: newItems
    };
  }

  // No updates
  state[key].lastChecked = today;
  await saveState(state);

  return {
    isNew: false,
    hasUpdates: false,
    newDevelopments: []
  };
}
