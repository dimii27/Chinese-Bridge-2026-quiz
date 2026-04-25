// app.js

let questions = [];
let progress = {}; // { id: { interval: int, efactor: float, nextReview: timestamp, reps: int } }
let score = 0;
let currentMode = 'home'; // home, study, test, review
let currentDeckRange = 'all';
let testStep = 1; // 1: Say A/B/C, 2: Read Text
let currentSessionScore = 0;
let testQueue = [];
let username = localStorage.getItem('srs_username') || '';

// --- Firebase Configuration ---
const firebaseConfig = {
  apiKey: "AIzaSyAkdzW0QSDTNPwz9e86YGwXsZMpcuMsQ4w",
  authDomain: "chinese-bridge-2026-quiz.firebaseapp.com",
  projectId: "chinese-bridge-2026-quiz",
  storageBucket: "chinese-bridge-2026-quiz.firebasestorage.app",
  messagingSenderId: "785696482205",
  appId: "1:785696482205:web:946fbe09ea06701fdac574",
  measurementId: "G-LH33S74WCT"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
// ------------------------------

// ------------------------------

let studyQueue = [];
let currentStudyIndex = 0;

// Settings
let settings = {
  translations: false,
  pinyin: false,
  answerPinyin: false,
  hints: true, 
  keywords: false,
  confirm: false,
  scramble: true,
  filterType: 'all',
  studyOrder: 'sequential',
  rangeStart: 1,
  rangeEnd: 100,
  showId: false
};

// Stable shuffled key order (so toggles don't rescramble)
let currentShuffledKeys = null;

// DOM Elements
const el = {
  app: document.getElementById('app'),
  loginModal: document.getElementById('login-modal'),
  usernameInput: document.getElementById('username-input'),
  btnLogin: document.getElementById('btn-login'),
  loginStatus: document.getElementById('login-status'),
  displayUsername: document.getElementById('display-username'),
  btnLogout: document.getElementById('btn-logout'),

  profileModal: document.getElementById('profile-modal'),
  btnCloseProfile: document.getElementById('btn-close-profile'),
  btnExportBackup: document.getElementById('btn-export-backup'),
  btnImportBackup: document.getElementById('btn-import-backup'),
  importFileInput: document.getElementById('import-file-input'),
  migrateUsernameInput: document.getElementById('migrate-username-input'),
  btnMigrateUsername: document.getElementById('btn-migrate-username'),
  btnResetProgress: document.getElementById('btn-reset-progress'),

  viewHome: document.getElementById('view-home'),
  viewQuiz: document.getElementById('view-quiz'),
  
  btnToggleLeft: document.getElementById('btn-toggle-left'),
  btnToggleRight: document.getElementById('btn-toggle-right'),
  sidebarLeft: document.getElementById('sidebar-left'),
  sidebarRight: document.getElementById('sidebar-right'),

  daysRemaining: document.getElementById('days-remaining'),
  scoreDisplay: document.getElementById('score-display'),
  currentScore: document.getElementById('current-score'),
  
  homeDueCount: document.getElementById('home-due-count'),
  homeNewCount: document.getElementById('home-new-count'),
  masteryGrid: document.getElementById('mastery-grid'),
  modeBtns: document.querySelectorAll('.mode-btn'),
  deckPills: document.querySelectorAll('.deck-pill'),
  
  statMastered: document.getElementById('stat-mastered'),
  statLearning: document.getElementById('stat-learning'),

  questionText: document.getElementById('question-text'),
  questionIdLabel: document.getElementById('question-id-label'),
  questionPinyin: document.getElementById('question-pinyin'),
  questionTranslation: document.getElementById('question-translation'),
  optionsContainer: document.getElementById('options-container'),
  translationSection: document.getElementById('translation-section'),
  feedbackSection: document.getElementById('feedback-section'),
  controlsSection: document.getElementById('controls-section'),
  confirmSection: document.getElementById('confirm-section'),
  voiceAnswerSection: document.getElementById('voice-answer-section'),
  voiceTranscript: document.getElementById('voice-transcript'),
  nextSection: document.getElementById('next-section'),
  
  btnTtsQuestion: document.getElementById('btn-tts-question'),
  btnTtsAnswer: document.getElementById('btn-tts-answer'),
  btnSubmitAnswer: document.getElementById('btn-submit-answer'),
  btnSkip: document.getElementById('btn-skip'),
  btnFail: document.getElementById('btn-fail'),
  btnGood: document.getElementById('btn-good'),
  btnNext: document.getElementById('btn-next'),

  helpModal: document.getElementById('help-modal'),
  btnShowHelp: document.getElementById('btn-show-help'),
  btnCloseHelp: document.getElementById('btn-close-help'),
  
  viewAdmin: document.getElementById('view-admin'),
  adminUserList: document.getElementById('admin-user-list'),
  btnAdminRefresh: document.getElementById('btn-admin-refresh'),
  
  togTrans: document.getElementById('setting-translations'),
  togPinyin: document.getElementById('setting-pinyin'),
  togAnswerPinyin: document.getElementById('setting-answer-pinyin'),
  togHints: document.getElementById('setting-hints'),
  togKey: document.getElementById('setting-keywords'),
  togConfirm: document.getElementById('setting-confirm'),
  togScramble: document.getElementById('setting-scramble'),
  togShowId: document.getElementById('setting-show-id'),

  cloudStatus: document.getElementById('cloud-status'),
  statusText: document.querySelector('#cloud-status .status-text'),
  btnSyncNow: document.getElementById('btn-sync-now'),

  sidebarLeft: document.getElementById('sidebar-left'),
  sidebarRight: document.getElementById('sidebar-right'),
  btnToggleLeft: document.getElementById('btn-toggle-left'),
  btnToggleRight: document.getElementById('btn-toggle-right'),
  btnCloseLeft: document.getElementById('btn-close-left'),
  btnCloseRight: document.getElementById('btn-close-right'),
};

// --- Core Button Listeners ---
el.btnNext.onclick = nextCard;
// Correcting duplicated listeners block removal
let currentCard = null;
let currentSelectedKey = null;
let currentAnswerSelected = false;

// ---------------- Initialization & Auth ----------------
async function init() {
  if (typeof questionsData !== 'undefined') {
    questions = questionsData;
  } else {
    alert("Error: Could not load questions_data.js");
    return;
  }

  if (username) {
    loadSettings(); // Load user-specific settings
    updateCountdown();
    el.loginModal.classList.add('hidden');
    el.app.classList.remove('hidden');
    el.displayUsername.textContent = username;
    
    // Add Sync button listener
    el.btnSyncNow.onclick = async () => {
      updateCloudStatus('syncing', 'Syncing...');
      await fetchProgressFromServer(true); 
    };

    await fetchProgressFromServer();
    setupButtonListeners();
    setupSidebarListeners();
    renderSidebar();
    goHome(); // Ensure we start at home
  } else {
    el.loginModal.classList.remove('hidden');
    el.app.classList.add('hidden');
    setupButtonListeners();
  }
}

function updateCloudStatus(state, text) {
  if (!el.cloudStatus) return;
  el.cloudStatus.className = 'cloud-status ' + state;
  el.statusText.textContent = text;
}

async function fetchProgressFromServer(manual = false) {
  if (!username) return;
  const local = localStorage.getItem('srs_progress_' + username);
  if (local) progress = JSON.parse(local);

  try {
    updateCloudStatus('syncing', 'Connecting...');
    const doc = await db.collection('progress').doc(username).get();
    if (doc.exists) {
      const data = doc.data();
      const merged = mergeProgress(progress, data);
      
      // If data changed after merge, save it
      if (JSON.stringify(merged) !== JSON.stringify(progress)) {
          progress = merged;
          localStorage.setItem('srs_progress_' + username, JSON.stringify(progress));
          renderSidebar();
          if (manual) alert("Cloud data merged successfully!");
      } else {
          if (manual) alert("Already up to date.");
      }
      updateCloudStatus('connected', 'Cloud Synced');
    } else {
      // User doesn't exist in cloud yet, let's upload current progress
      await db.collection('progress').doc(username).set(progress);
      updateCloudStatus('connected', 'Cloud Active');
      if (manual) alert("Local progress uploaded to new cloud account.");
    }
  } catch (err) {
    console.warn("Cloud sync failed", err);
    let msg = "Sync Failed";
    if (err.message.includes("permission-denied")) msg = "Check Firestore Rules";
    else if (err.message.includes("offline")) msg = "Offline";
    updateCloudStatus('error', msg);
  }
}

function mergeProgress(local, remote) {
  const merged = { ...local };
  for (const id in remote) {
    // Only merge numeric keys (question IDs)
    if (isNaN(id)) continue;
    
    const r = remote[id];
    const l = merged[id];
    if (!l || (r.updatedAt || 0) > (l.updatedAt || 0)) {
      merged[id] = r;
    }
  }
  return merged;
}

async function syncProgressToServer() {
  // Always persist locally immediately
  localStorage.setItem('srs_progress_' + username, JSON.stringify(progress));
  
  // Update sidebar immediately to reflect new progress state
  renderSidebar();

  if (!username) return;

  try {
    updateCloudStatus('syncing', 'Uploading...');
    await db.collection('progress').doc(username).set(progress);
    updateCloudStatus('connected', 'Cloud Synced');
  } catch (err) {
    console.error("Cloud upload failed", err);
    let msg = "Upload Failed";
    if (err.message.includes("permission-denied")) msg = "Check Firestore Rules";
    updateCloudStatus('error', msg);
  }
}

function setupButtonListeners() {
  el.btnLogout.onclick = () => {
    localStorage.removeItem('srs_username');
    location.reload();
  };

  el.displayUsername.onclick = () => {
    el.profileModal.classList.remove('hidden');
    el.migrateUsernameInput.value = '';
  };

  el.btnCloseProfile.onclick = () => el.profileModal.classList.add('hidden');
  el.profileModal.onclick = (e) => { if(e.target === el.profileModal) el.profileModal.classList.add('hidden'); };

  // Export Backup
  el.btnExportBackup.onclick = (e) => {
    if (e) e.preventDefault();
    const backupData = {
      username: username,
      progress: progress,
      settings: settings,
      timestamp: new Date().toISOString()
    };
    
    const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const dlAnchorElem = document.createElement('a');
    dlAnchorElem.href = url;
    dlAnchorElem.download = `chinese_bridge_backup_${username || 'user'}_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(dlAnchorElem);
    dlAnchorElem.click();
    document.body.removeChild(dlAnchorElem);
    
    // Revoke URL after a delay
    setTimeout(() => URL.revokeObjectURL(url), 100);
  };

  // Import Backup
  el.btnImportBackup.onclick = () => el.importFileInput.click();
  el.importFileInput.onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);
        if (data.progress) progress = data.progress;
        if (data.settings) settings = {...settings, ...data.settings};
        
        // Save to current user
        localStorage.setItem('srs_progress_' + username, JSON.stringify(progress));
        localStorage.setItem('srs_settings_' + username, JSON.stringify(settings));
        
        alert("Backup restored successfully!");
        location.reload();
      } catch (err) {
        alert("Invalid backup file.");
      }
    };
    reader.readAsText(file);
  };

  // Migrate Username
  el.btnMigrateUsername.onclick = async (e) => {
    if (e) e.preventDefault();
    try {
      const newName = el.migrateUsernameInput.value.trim().toLowerCase();
      if (!newName) {
        alert("Please enter a target username.");
        return;
      }
      if (newName === username) {
        alert("Target username is the same as current.");
        return;
      }
      
      // Check if target exists
      const existing = localStorage.getItem('srs_progress_' + newName);
      let targetProgress = {};
      if (existing) {
         const shouldMerge = confirm(`Account "${newName}" already exists. \n\nClick OK to MERGE progress from both accounts, or Cancel to OVERWRITE it with your current progress.`);
         if (shouldMerge) {
            try {
              targetProgress = JSON.parse(existing);
            } catch(e) {
              console.error("Failed to parse existing progress", e);
            }
         }
      }

      if (confirm(`Migrate all data to "${newName}"?`)) {
        const merged = mergeProgress(targetProgress, progress);
        // Save merged progress to the new username key
        localStorage.setItem('srs_progress_' + newName, JSON.stringify(merged));
        
        // Also migrate settings
        const currentSettings = localStorage.getItem('srs_settings_' + username);
        if (currentSettings) {
          localStorage.setItem('srs_settings_' + newName, currentSettings);
        } else {
          localStorage.setItem('srs_settings_' + newName, JSON.stringify(settings));
        }
        
        // Update the active username
        localStorage.setItem('srs_username', newName);
        
        // Try to sync to server immediately for the NEW username
        try {
          await db.collection('progress').doc(newName).set(merged);
        } catch(err) {
          console.warn("Cloud sync failed during migration, will retry later.");
        }

        alert(`Successfully migrated to ${newName}.`);
        location.reload();
      }
    } catch (err) {
      alert("Migration failed: " + err.message);
      console.error(err);
    }
  };

  // Reset Progress
  el.btnResetProgress.onclick = async (e) => {
    if (e) e.preventDefault();
    if (confirm("Are you sure you want to completely reset your progress? This cannot be undone!")) {
      try {
        progress = {};
        localStorage.setItem('srs_progress_' + username, JSON.stringify(progress));
        
        // Force sync empty progress to server
        await db.collection('progress').doc(username).set({});
        
        alert("Progress has been reset.");
        location.reload();
      } catch (err) {
        if (confirm("Reset failed (Cloud sync error): " + err.message + "\n\nWould you like to reset LOCALLY anyway? (Note: Cloud progress will be restored on next login unless connection is fixed)")) {
          localStorage.setItem('srs_progress_' + username, JSON.stringify({}));
          location.reload();
        }
        console.error(err);
      }
    }
  };

  el.btnLogin.onclick = async () => {
    const val = el.usernameInput.value.trim().toLowerCase();
    if (val.length < 1) return;
    username = val;
    localStorage.setItem('srs_username', username);
    
    el.loginStatus.classList.remove('hidden');
    
    // 1. Load user settings
    loadSettings();
    
    // 2. Fetch progress (local first then background sync)
    await fetchProgressFromServer();
    
    // 3. Update UI state
    el.loginStatus.classList.add('hidden');
    el.loginModal.classList.add('hidden');
    el.app.classList.remove('hidden');
    el.displayUsername.textContent = username;
    
    // 4. Initialize app view
    setupSidebarListeners();
    renderSidebar();
    goHome();
  };

  el.btnNext.onclick = nextCard;
  el.btnSkip.onclick = () => {
    stopSTT();
    synth.cancel();
    if (currentMode === 'study' || currentMode === 'review') {
        let p = progress[currentCard.id] || { interval: 0, efactor: 2.5, reps: 0 };
        p.reps = 0;
        p.interval = 1;
        p.efactor = Math.max(1.3, p.efactor - 0.2);
        p.nextReview = Date.now() + (p.interval * 60 * 1000);
        p.updatedAt = Date.now();
        progress[currentCard.id] = p;
        syncProgressToServer();
    }
    nextCard();
  };
  el.btnTtsQuestion.onclick = () => speak(currentCard.chinese);
  el.btnTtsAnswer.onclick = () => {
    const correctKey = currentCard.answer;
    speak(currentCard.options[correctKey].hanzi);
  };
}

function setupSidebarListeners() {
  // Mobile Toggles
  el.btnToggleLeft.onclick = () => {
    el.sidebarLeft.classList.toggle('open');
    el.sidebarRight.classList.remove('open');
  };
  el.btnToggleRight.onclick = () => {
    el.sidebarRight.classList.toggle('open');
    el.sidebarLeft.classList.remove('open');
  };

  // Mobile Close Buttons
  el.btnCloseLeft.onclick = () => el.sidebarLeft.classList.remove('open');
  el.btnCloseRight.onclick = () => el.sidebarRight.classList.remove('open');

  // Foldable sections
  document.querySelectorAll('.foldable-header').forEach(header => {
    header.onclick = () => {
      header.parentElement.classList.toggle('active');
    };
  });

  // Filter/Order listeners
  const filterType = document.getElementById('filter-type');
  const studyOrder = document.getElementById('study-order');
  const rangeStart = document.getElementById('range-start');
  const rangeEnd = document.getElementById('range-end');
  const rangePicker = document.getElementById('range-picker');

  if (filterType) {
    filterType.value = settings.filterType;
    filterType.onchange = (e) => {
      settings.filterType = e.target.value;
      if (settings.filterType === 'range') rangePicker.classList.remove('hidden');
      else rangePicker.classList.add('hidden');
      saveSettings();
    };
  }
  if (studyOrder) {
    studyOrder.value = settings.studyOrder;
    studyOrder.onchange = (e) => {
      settings.studyOrder = e.target.value;
      saveSettings();
    };
  }
  if (rangeStart) {
    rangeStart.value = settings.rangeStart;
    rangeStart.onchange = (e) => { settings.rangeStart = parseInt(e.target.value); saveSettings(); };
  }
  if (rangeEnd) {
    rangeEnd.value = settings.rangeEnd;
    rangeEnd.onchange = (e) => { settings.rangeEnd = parseInt(e.target.value); saveSettings(); };
  }
  
  if (settings.filterType === 'range') rangePicker.classList.remove('hidden');
}
function goHome() {
  currentMode = 'home';
  el.viewHome.classList.remove('hidden');
  el.viewQuiz.classList.add('hidden');
  const viewAdmin = document.getElementById('view-admin');
  if(viewAdmin) viewAdmin.classList.add('hidden');
  
  el.modeBtns.forEach(btn => btn.classList.remove('active'));
  el.scoreDisplay.classList.add('hidden');
  
  renderSidebar();
  closeSidebars();
}

function updateCountdown() {
  const target = new Date('2026-05-09T00:00:00').getTime();
  const now = new Date().getTime();
  const diff = target - now;
  const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
  const val = days > 0 ? days : 0;
  el.daysRemaining.textContent = val;
  const headerDays = document.getElementById('days-remaining-header');
  if (headerDays) headerDays.textContent = val;
}

// ---------------- Mobile Sidebar Toggles ----------------
el.btnToggleLeft.onclick = () => el.sidebarLeft.classList.toggle('open');
el.btnToggleRight.onclick = () => el.sidebarRight.classList.toggle('open');

function closeSidebars() {
  el.sidebarLeft.classList.remove('open');
  el.sidebarRight.classList.remove('open');
}

// ---------------- Help / Tutorial ----------------
el.btnShowHelp.onclick = () => el.helpModal.classList.remove('hidden');
el.btnCloseHelp.onclick = () => el.helpModal.classList.add('hidden');
el.helpModal.onclick = (e) => { if(e.target === el.helpModal) el.helpModal.classList.add('hidden'); };

el.displayUsername.onclick = () => {
  const newName = prompt("Enter new username:", username);
  if (newName && newName !== username) {
    localStorage.setItem('srs_username', newName);
    location.reload();
  }
};

// ---------------- Admin Logic ----------------
let isAdmin = false;
async function renderAdminDashboard() {
  el.adminUserList.innerHTML = '<p>Loading user data...</p>';
  try {
    const res = await fetch('/api/admin/users');
    if (!res.ok) throw new Error("Unauthorized");
    const users = await res.json();
    el.adminUserList.innerHTML = '';
    users.forEach(u => {
      const row = document.createElement('div');
      row.className = 'admin-user-row';
      row.innerHTML = `
        <div class="user-info">
          <strong>${u.username}</strong>
          <span>Mastered: ${u.stats.mastered} | Learning: ${u.stats.learning}</span>
        </div>
        <button class="btn-primary small" onclick="deleteUser('${u.username}')">Reset</button>
      `;
      el.adminUserList.appendChild(row);
    });
  } catch (err) {
    el.adminUserList.innerHTML = '<p>Error loading admin data. Make sure server is running and you have permissions.</p>';
  }
}

el.btnAdminRefresh.onclick = renderAdminDashboard;

async function deleteUser(targetUser) {
  if (!confirm(`Are you sure you want to RESET progress for ${targetUser}?`)) return;
  await fetch(`/api/admin/users/${targetUser}`, { method: 'DELETE' });
  renderAdminDashboard();
}

// ---------------- Navigation & View Management ----------------
function switchView(viewId) {
  el.viewHome.classList.add('hidden');
  el.viewQuiz.classList.add('hidden');
  document.getElementById(viewId).classList.remove('hidden');
  closeSidebars();
  
  if (viewId === 'view-home') {
    el.scoreDisplay.classList.add('hidden');
    renderSidebar();
  } else if (viewId === 'view-admin') {
    el.scoreDisplay.classList.add('hidden');
  }
}

function goHome() {
  stopSTT();
  synth.cancel();
  el.modeBtns.forEach(b => b.classList.remove('active'));
  currentMode = 'home';
  switchView('view-home');
}

el.modeBtns.forEach(btn => {
  btn.onclick = () => {
    el.modeBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentMode = btn.dataset.mode;
    startMode(currentMode);
  };
});

// Pill-button deck selector
el.deckPills.forEach(pill => {
  pill.onclick = () => {
    el.deckPills.forEach(p => p.classList.remove('active'));
    pill.classList.add('active');
    currentDeckRange = pill.dataset.range;
  };
});

function getDeckRange() {
  if(currentDeckRange === 'all') return [1, 100];
  const parts = currentDeckRange.split('-');
  return [parseInt(parts[0]), parseInt(parts[1])];
}

function getMasteryColor(qId) {
  const p = progress[qId];
  if (!p) return 'var(--grid-new)';
  let score = Math.min(100, (p.interval / 4320) * 100);
  if (p.interval >= 4320) return 'var(--grid-mastered)';
  const hue = (score / 100) * 120;
  return `hsl(${hue}, 70%, 45%)`;
}

function buildStudyQueue() {
  const now = Date.now();
  let filtered = [...questions];

  if (settings.filterType === 'new') {
    filtered = filtered.filter(q => !progress[q.id]);
  } else if (settings.filterType === 'due') {
    filtered = filtered.filter(q => progress[q.id] && progress[q.id].nextReview <= now);
  } else if (settings.filterType === 'range') {
    filtered = filtered.filter(q => q.id >= settings.rangeStart && q.id <= settings.rangeEnd);
  }

  if (settings.studyOrder === 'random') {
    filtered.sort(() => Math.random() - 0.5);
  } else if (settings.studyOrder === 'mastery') {
    filtered.sort((a, b) => {
      const pa = progress[a.id] ? progress[a.id].interval : -1;
      const pb = progress[b.id] ? progress[b.id].interval : -1;
      return pa - pb;
    });
  } else if (settings.studyOrder === 'least') {
    filtered.sort((a, b) => {
      const pa = progress[a.id] ? progress[a.id].reps : 0;
      const pb = progress[b.id] ? progress[b.id].reps : 0;
      return pa - pb;
    });
  } else {
    filtered.sort((a, b) => a.id - b.id);
  }

  studyQueue = filtered;
  currentStudyIndex = 0;
}

function renderSidebar() {
  const now = Date.now();
  let due = 0;
  let newC = 0;
  let masteredC = 0;
  let learningC = 0;
  
  el.masteryGrid.innerHTML = '';
  
  questions.forEach(q => {
    const p = progress[q.id] || { interval: 0, reps: 0, correct: 0, wrong: 0 };
    let cellClass = 'new';
    
    if (!progress[q.id]) {
      newC++;
    } else {
      if (p.nextReview <= now) due++;
      if (p.interval >= 4320) { cellClass = 'mastered'; masteredC++; }
      else { cellClass = 'learning'; learningC++; }
    }
    
    const cell = document.createElement('div');
    cell.className = `grid-cell ${cellClass}`;
    cell.dataset.id = q.id;
    cell.textContent = q.id;
    cell.style.backgroundColor = getMasteryColor(q.id);
    
    const confidence = p.interval >= 4320 ? 100 : Math.round((p.interval / 4320) * 100);
    cell.title = `Q${q.id}\nCorrect: ${p.correct || 0}\nWrong: ${p.wrong || 0}\nConfidence: ${confidence}%`;
    
    cell.onclick = () => {
        buildStudyQueue();
        const idx = studyQueue.findIndex(card => card.id === q.id);
        if (idx !== -1) {
          currentStudyIndex = idx;
        } else {
          studyQueue.unshift(q);
          currentStudyIndex = 0;
        }
        
        currentMode = 'study';
        currentCard = studyQueue[currentStudyIndex];
        switchView('view-quiz');
        renderCard();
    };

    el.masteryGrid.appendChild(cell);
  });
  
  el.homeDueCount.textContent = due;
  el.homeNewCount.textContent = newC;
  el.statMastered.textContent = masteredC;
  el.statLearning.textContent = learningC;
}

// ---------------- Mode Logic ----------------
function startMode(mode) {
  score = 0;
  currentMode = mode;
  el.currentScore.textContent = score;
  switchView('view-quiz');
  
  if (mode === 'study') {
    el.scoreDisplay.classList.add('hidden');
    buildStudyQueue();
  } else if (mode === 'test') {
    testQueue = [...questions].sort(() => Math.random() - 0.5);
    el.scoreDisplay.classList.remove('hidden');
  }
  
  nextCard();
}

function getNextCardForMode() {
  if (currentMode === 'test') {
    return testQueue.shift() || null;
  } else if (currentMode === 'study' || currentMode === 'review') {
    const card = studyQueue[currentStudyIndex];
    if (card) {
      currentStudyIndex++;
      return card;
    }
    return null;
  }
  return null;
}

// ---------------- Card Rendering ----------------
function renderCard() {
  stopSTT();
  synth.cancel();

  if (!currentCard) {
    el.questionText.textContent = "All caught up! Excellent work.";
    el.questionText.classList.remove('hidden');
    el.questionPinyin.classList.add('hidden');
    el.questionTranslation.textContent = "Go back to Home to select another mode.";
    el.translationSection.classList.remove('hidden');
    el.optionsContainer.innerHTML = '';
    el.feedbackSection.classList.add('hidden');
    el.controlsSection.classList.add('hidden');
    el.confirmSection.classList.add('hidden');
    el.voiceAnswerSection.classList.add('hidden');
    el.nextSection.classList.add('hidden');
    return;
  }

  currentAnswerSelected = false;
  currentSelectedKey = null;
  currentShuffledKeys = null; 
  testStep = 1; 
  
  el.feedbackSection.classList.add('hidden');
  el.controlsSection.classList.add('hidden');
  el.confirmSection.classList.add('hidden');
  el.nextSection.classList.add('hidden');
  el.voiceAnswerSection.classList.add('hidden');

  buildOptionsDom();
  updateDisplay();
  
  const isTest = currentMode === 'test';
  if (isTest) {
    el.voiceAnswerSection.classList.remove('hidden');
    el.voiceTranscript.textContent = "Reading question...";
    el.voiceTranscript.style.color = "var(--text-secondary)";

    speak(currentCard.chinese, () => {
        if(!currentAnswerSelected) {
            el.voiceTranscript.textContent = "Listening: 'wǒ de dá'àn shì A...'";
            el.voiceTranscript.style.color = "var(--text-secondary)";
            startSTT();
        }
    }, true);
  }
}

function updateDisplay() {
  if (!currentCard) return;
  
  const isTest = currentMode === 'test';
  const postAnswer = currentAnswerSelected;
  const allowSettings = !isTest || postAnswer;
  
  const showId = allowSettings ? settings.showId : false;
  const showPinyin = allowSettings ? settings.pinyin : false;
  const showTrans = allowSettings ? settings.translations : false;
  const showHints = allowSettings ? settings.hints : false;
  const showAnswerPinyin = allowSettings ? settings.answerPinyin : false;

  if (showId) {
    el.questionIdLabel.textContent = `Question #${currentCard.id}`;
    el.questionIdLabel.classList.remove('hidden');
  } else {
    el.questionIdLabel.classList.add('hidden');
  }
  
  function processBlanks(html, isPinyin = false) {
    // 1. Handle explicit blanks (____ or ___)
    if (html.includes('____') || html.includes('___')) {
       return html.replace(/____/g, '<span class="blank-slot" aria-hidden="true">____</span>')
                  .replace(/___/g, '<span class="blank-slot" aria-hidden="true">____</span>');
    }
    
    // 2. Fallback: Try to hide the answer if it's in the text (only for non-test mode or post-answer)
    if (!currentAnswerSelected) {
      const ansHanzi = currentCard.options[currentCard.answer].hanzi;
      if (ansHanzi) {
        // Handle ellipsis (e.g., "与其...不如")
        if (ansHanzi.includes('...')) {
           const parts = ansHanzi.split('...');
           let result = html;
           parts.forEach(p => {
             const cleanP = p.trim();
             if (cleanP && !isPinyin && result.includes(cleanP)) {
               result = result.replace(cleanP, '<span class="blank-slot" aria-hidden="true">____</span>');
             }
           });
           return result;
        } else if (!isPinyin && html.includes(ansHanzi)) {
           return html.replace(ansHanzi, '<span class="blank-slot" aria-hidden="true">____</span>');
        } else if (!isPinyin && !html.includes(ansHanzi) && !html.includes('blank-slot')) {
           // If no blank and no answer match, just append one (common for older source data)
           return html + ' <span class="blank-slot" aria-hidden="true">____</span>';
        }
      }
    }
    return html;
  }

  if (showPinyin) {
    el.questionText.innerHTML = processBlanks(currentCard.chinese_pinyin, true);
    el.questionPinyin.classList.add('hidden');
  } else {
    const baseHtml = settings.keywords ? currentCard.chinese_keywords : currentCard.chinese;
    el.questionText.innerHTML = processBlanks(baseHtml, false);
    el.questionPinyin.classList.add('hidden');
  }
  
  el.questionTranslation.textContent = currentCard.english;

  if(showTrans && currentCard.english) {
    el.translationSection.classList.remove('hidden');
  } else {
    const isStudy = currentMode === 'study' || currentMode === 'review';
    if (!currentAnswerSelected || !isStudy) el.translationSection.classList.add('hidden');
    else if (currentAnswerSelected && isStudy) el.translationSection.classList.remove('hidden');
  }
  
  const btns = el.optionsContainer.querySelectorAll('.option-btn');
  btns.forEach(btn => {
    const key = btn.dataset.originalKey;
    const displayLetter = btn.dataset.displayLetter;
    const valObj = currentCard.options[key];
    if (!valObj) return;
    
    let mainHtml = `<span class="option-main">${displayLetter}. ${showAnswerPinyin ? valObj.pinyin : valObj.hanzi}</span>`;
    if (showHints && valObj.hint) {
      mainHtml += `<span class="option-hint">${valObj.hint}</span>`;
    }
    btn.innerHTML = mainHtml;
  });
}

function buildOptionsDom() {
  el.optionsContainer.innerHTML = '';
  const opts = currentCard.options;
  const isTest = currentMode === 'test';
  
  let keys = Object.keys(opts);
  
  if (!currentShuffledKeys) {
    currentShuffledKeys = [...keys];
    if (settings.scramble || isTest) {
      currentShuffledKeys.sort(() => Math.random() - 0.5);
    }
  }

  const displayLetters = ['A', 'B', 'C', 'D', 'E'];

  currentShuffledKeys.forEach((key, index) => {
    const btn = document.createElement('button');
    btn.className = 'option-btn';
    btn.dataset.originalKey = key;
    btn.dataset.displayLetter = displayLetters[index];
    btn.onclick = () => handleOptionClick(key, btn);
    el.optionsContainer.appendChild(btn);
  });
}

function handleOptionClick(selectedKey, btn) {
  if (currentAnswerSelected) return;

  const allBtns = el.optionsContainer.querySelectorAll('.option-btn');
  allBtns.forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
  currentSelectedKey = selectedKey;

  if (settings.confirm && currentMode !== 'test') {
    el.confirmSection.classList.remove('hidden');
  } else {
    submitAnswer('click');
  }
}

el.btnSubmitAnswer.onclick = () => submitAnswer('click');

function submitAnswer(method) { 
  if(!currentSelectedKey && method === 'click') return;
  currentAnswerSelected = true;
  stopSTT();
  
  el.confirmSection.classList.add('hidden');
  if(method === 'click') el.voiceAnswerSection.classList.add('hidden');
  
  const correctKey = currentCard.answer;
  const isCorrect = currentSelectedKey === correctKey;

  if (currentMode !== 'test') {
    let p = progress[currentCard.id] || { interval: 0, efactor: 2.5, reps: 0, correct: 0, wrong: 0 };
    if (isCorrect) p.correct = (p.correct || 0) + 1;
    else p.wrong = (p.wrong || 0) + 1;
    p.updatedAt = Date.now();
    progress[currentCard.id] = p;
  }

  if (currentMode === 'test') {
    if (isCorrect) {
      if (testStep === 1) {
          score += 2;
          el.currentScore.textContent = score;
          testStep = 2;
          el.voiceTranscript.textContent = "Correct! (+2) Now read the answer text for +3 points.";
          el.voiceTranscript.style.color = "var(--accent)";
          
          const allBtns = el.optionsContainer.querySelectorAll('.option-btn');
          allBtns.forEach(b => {
              if (b.dataset.originalKey === correctKey) {
                  b.classList.add('correct', 'selected');
              } else {
                  b.style.opacity = '0.5';
                  b.style.pointerEvents = 'none';
              }
          });
          setTimeout(startSTT, 500); 
          return; 
      } else {
          score += 3;
          el.currentScore.textContent = score;
          el.voiceTranscript.textContent = "Perfect! Total 5 points.";
      }
    }
  }

  if(currentCard.english && currentMode !== 'test') el.translationSection.classList.remove('hidden');
  if(currentCard.english && currentMode === 'review') el.translationSection.classList.remove('hidden');
  
  const allBtns = el.optionsContainer.querySelectorAll('.option-btn');
  allBtns.forEach(b => {
    b.style.pointerEvents = 'none';
    const isThisBtnCorrect = b.dataset.originalKey === correctKey;
    if (isThisBtnCorrect) {
      b.classList.add('correct');
      if (method === 'voice' && isCorrect) b.classList.add('selected');
    }
    else {
      b.style.opacity = '0.5';
    }
  });

  const selectedBtn = Array.from(allBtns).find(b => b.classList.contains('selected'));
  if (!isCorrect && selectedBtn) {
    selectedBtn.classList.add('wrong');
    selectedBtn.style.opacity = '1';
    setTimeout(showFeedbackControls, 500);
  } else {
    showFeedbackControls();
  }
  
  updateDisplay();
  speak(currentCard.options[correctKey].hanzi, null, true);
}

function showFeedbackControls() {
  el.feedbackSection.classList.remove('hidden');
  
  const correctKey = currentCard.answer;
  const isCorrect = currentSelectedKey === correctKey;
  
  if (currentMode === 'study' || currentMode === 'review') {
    if (!isCorrect) {
      el.nextSection.classList.remove('hidden');
      let p = progress[currentCard.id] || { interval: 0, efactor: 2.5, reps: 0 };
      p.reps = 0;
      p.interval = 1;
      p.efactor = Math.max(1.3, p.efactor - 0.2);
      p.nextReview = Date.now() + (p.interval * 60 * 1000);
      p.updatedAt = Date.now();
      progress[currentCard.id] = p;
      syncProgressToServer();
    } else {
      el.controlsSection.classList.remove('hidden');
    }
  } else {
    el.nextSection.classList.remove('hidden');
  }
  
  el.feedbackSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// ---------------- Practice Mode SRS Logic ----------------
function processPracticeAnswer(quality) {
  let p = progress[currentCard.id] || { interval: 0, efactor: 2.5, reps: 0 };
  
  if (quality === 0) {
    p.reps = 0;
    p.interval = 1; 
  } else {
    p.reps += 1;
    if (p.reps === 1) {
      p.interval = 1440; 
    } else {
      p.interval = Math.round(p.interval * p.efactor);
      if (p.interval > 4320) p.interval = 4320; 
    }
  }
  
  p.efactor = Math.max(1.3, p.efactor + (quality === 1 ? 0.1 : -0.2));
  p.nextReview = Date.now() + (p.interval * 60 * 1000);
  
  p.updatedAt = Date.now();
  progress[currentCard.id] = p;
  syncProgressToServer();
  
  if(currentMode === 'review') {
      goHome();
  } else {
      nextCard();
  }
}

function nextCard() {
  if (currentMode === 'study' || currentMode === 'review') {
    if (studyQueue.length === 0) {
      goHome();
      return;
    }
    currentStudyIndex = (currentStudyIndex + 1) % studyQueue.length;
    currentCard = studyQueue[currentStudyIndex];
  } else {
    currentCard = getNextCardForMode(currentMode);
  }
  renderCard();
}

el.btnFail.onclick = () => processPracticeAnswer(0); 
el.btnGood.onclick = () => processPracticeAnswer(1); 

// ---------------- Web Speech API (TTS & STT) ----------------
const synth = window.speechSynthesis;
let recognition = null;

if ('webkitSpeechRecognition' in window) {
  recognition = new webkitSpeechRecognition();
} else if ('SpeechRecognition' in window) {
  recognition = new SpeechRecognition();
}

if (recognition) {
  recognition.lang = 'zh-CN';
  recognition.interimResults = true;
  recognition.continuous = true;
  recognition.maxAlternatives = 3;

  recognition.onresult = (event) => {
    if(currentMode !== 'test' || currentAnswerSelected) return;
    
    let transcript = '';
    for (let i = event.resultIndex; i < event.results.length; ++i) {
      for (let alt = 0; alt < event.results[i].length; alt++) {
        transcript += event.results[i][alt].transcript;
      }
    }
    
    el.voiceTranscript.textContent = `Heard: "${transcript}"`;
    el.voiceTranscript.style.color = "var(--accent)";
    
    const cleanTranscript = transcript.replace(/\s+/g, '').toLowerCase();
    
    const letterMatch = cleanTranscript.match(/[abcd]/i);
    let spokenDisplayLetter = null;
    if (letterMatch) spokenDisplayLetter = letterMatch[0].toUpperCase();
    
    const correctKey = currentCard.answer;
    const correctHanzi = currentCard.options[correctKey].hanzi.replace(/\s+/g, '');
    
    let isCorrect = false;
    let selectedKey = null;

    if (spokenDisplayLetter) {
        const allBtns = el.optionsContainer.querySelectorAll('.option-btn');
        let matchedBtn = Array.from(allBtns).find(b => b.dataset.displayLetter === spokenDisplayLetter);
        if (matchedBtn) {
            selectedKey = matchedBtn.dataset.originalKey;
            if (selectedKey === correctKey) isCorrect = true;
        }
    }
    if (!selectedKey && cleanTranscript.includes(correctHanzi.toLowerCase())) {
        isCorrect = true;
        selectedKey = correctKey;
    }

    if (isCorrect || testStep === 2) {
      if (testStep === 1 && isCorrect) {
          el.voiceTranscript.textContent = `✓ Choice Correct! Now read the text out loud (+3 pts)`;
          el.voiceTranscript.style.color = "#10b981";
          currentSelectedKey = selectedKey;
          submitAnswer('voice');
      } else if (testStep === 2) {
          if (cleanTranscript.includes(correctHanzi.toLowerCase())) {
              el.voiceTranscript.textContent = `✓ Reading Correct! (+3 pts)`;
              el.voiceTranscript.style.color = "#10b981";
              recognition.stop();
              submitAnswer('voice');
          }
      }
    } else if (testStep === 1 && spokenDisplayLetter && selectedKey) {
      el.voiceTranscript.textContent = `✗ Incorrect choice: "${transcript}"`;
      el.voiceTranscript.style.color = "#ef4444";
      recognition.stop();
      currentSelectedKey = selectedKey;
      submitAnswer('voice'); 
    }
  };

  recognition.onerror = (event) => {
    if(event.error === 'not-allowed' || event.error === 'service-not-allowed') {
       el.voiceTranscript.textContent = "⚠ Microphone access denied. Check browser permissions.";
       el.voiceTranscript.style.color = "#ef4444";
       return;
    }
    if(event.error === 'no-speech') {
       el.voiceTranscript.textContent = "No speech detected. Tap the mic or speak again...";
       el.voiceTranscript.style.color = "var(--text-secondary)";
    }
    if(event.error === 'aborted') return;
    if(currentMode === 'test' && !currentAnswerSelected) {
       setTimeout(startSTT, 500);
    }
  };
  
  recognition.onend = () => {
    if (currentMode === 'test' && !currentAnswerSelected) {
      setTimeout(startSTT, 300);
    }
  };
}

el.voiceAnswerSection.onclick = () => {
   if (currentMode === 'test' && !currentAnswerSelected) {
      el.voiceTranscript.textContent = "🎙 Listening... say 'w\u01D2 de d\u00E1'\u00E0n sh\u00EC A/B/C'";
      el.voiceTranscript.style.color = "var(--accent)";
      startSTT();
   }
};

function startSTT() {
  if (recognition && currentMode === 'test' && !currentAnswerSelected) {
    // Ensure TTS is not speaking while listening
    if (synth && synth.speaking) {
      synth.cancel();
    }
    try {
      recognition.start();
      el.voiceTranscript.style.color = "var(--accent)";
    } catch(e) {
      // Already started — that's fine
    }
  }
}

function stopSTT() {
  if (recognition) {
    try {
      recognition.stop();
    } catch(e) {}
  }
}

function speak(text, onEndCallback = null, forcePlay = false) {
  if (!synth) {
     if(onEndCallback) onEndCallback();
     return;
  }
  
  // If not forced and already speaking, toggle it off
  if (!forcePlay && synth.speaking) {
      synth.cancel();
      // Reset transcript message if we stop manually
      if (el.voiceTranscript.textContent === "Reading question...") {
          el.voiceTranscript.textContent = "Listening paused.";
      }
      return;
  }
  
  synth.cancel();
  // Strip underscores so TTS doesn't read "underscore underscore..."
  const cleanText = text.replace(/_+/g, ' ');
  const ut = new SpeechSynthesisUtterance(cleanText);
  ut.lang = 'zh-CN';
  ut.rate = 0.9;
  if(onEndCallback) {
     ut.onend = onEndCallback;
     setTimeout(onEndCallback, 15000); 
  }
  synth.speak(ut);
}

el.btnTtsQuestion.onclick = () => {
  if(currentCard) speak(currentCard.chinese, null, false);
};

el.btnTtsAnswer.onclick = () => {
  if(currentCard && currentCard.answer) {
    speak(currentCard.options[currentCard.answer].hanzi, null, false);
  }
};

// ---------------- Settings Setup ----------------
function loadSettings() {
  if (!username) return;
  const data = localStorage.getItem('srs_settings_' + username);
  if (data) settings = {...settings, ...JSON.parse(data)};
  
  el.togTrans.checked = settings.translations;
  el.togPinyin.checked = settings.pinyin;
  if (el.togAnswerPinyin) el.togAnswerPinyin.checked = settings.answerPinyin;
  el.togHints.checked = settings.hints;
  el.togKey.checked = settings.keywords;
  el.togConfirm.checked = settings.confirm;
  el.togScramble.checked = settings.scramble;
  if (el.togShowId) el.togShowId.checked = settings.showId;
}

function saveSettings() {
  if (!username) return;
  localStorage.setItem('srs_settings_' + username, JSON.stringify(settings));
}

// Lightweight listener: only updates display, never rescrambles or restarts TTS
function setupDisplaySettingListener(element, key) {
  if (!element) return;
  element.addEventListener('change', () => {
    settings[key] = element.checked;
    saveSettings();
    if (currentMode !== 'home') updateDisplay();
  });
}

// Structural listener: these need a full re-render (e.g. scramble changes order)
function setupStructuralSettingListener(element, key) {
  if (!element) return;
  element.addEventListener('change', () => {
    settings[key] = element.checked;
    saveSettings();
    // Scramble changes the DOM order, so we need a full re-render
    if (currentMode !== 'home' && !currentAnswerSelected) {
      currentShuffledKeys = null; // Force reshuffle
      renderCard();
    }
  });
}

// Display-only settings (don't reshuffle or restart TTS)
setupDisplaySettingListener(el.togTrans, 'translations');
setupDisplaySettingListener(el.togPinyin, 'pinyin');
setupDisplaySettingListener(el.togAnswerPinyin, 'answerPinyin');
setupDisplaySettingListener(el.togHints, 'hints');
setupDisplaySettingListener(el.togKey, 'keywords');
setupDisplaySettingListener(el.togConfirm, 'confirm');
setupDisplaySettingListener(el.togShowId, 'showId');

// Structural settings (reshuffle required)
setupStructuralSettingListener(el.togScramble, 'scramble');

init();
