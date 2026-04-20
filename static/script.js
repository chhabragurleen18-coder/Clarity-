/* script.js - Clarity Frontend Logic */

const API = ''; // Empty since we serve from same host

// --- ONBOARDING LOGIC (login.html) ---
let currentStep = 1;
const totalSteps = 4;
let commitRowCount = 1;

async function submitAuth(action) {
    const un = document.getElementById('auth-username').value;
    const pw = document.getElementById('auth-password').value;
    if(!un || !pw) return alert("Please enter username and password");
    
    try {
        const res = await fetch(`/api/auth/${action}`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({username: un, password: pw})
        });
        const data = await res.json();
        
        if(res.ok && data.success) {
            if(data.is_new) {
                // Show onboarding if new account
                document.getElementById('auth-container').style.display = 'none';
                document.getElementById('onboarding-flow').style.display = 'flex';
                document.getElementById('stepIndicator').style.visibility = 'visible';
            } else {
                // Returning user, go to dashboard
                window.location.href = '/dashboard';
            }
        } else {
            alert(data.error || "Authentication failed.");
        }
    } catch(e) {
        alert("Network error.");
        console.error(e);
    }
}

async function logoutUser() {
    try {
        const res = await fetch('/api/auth/logout', { method: 'POST' });
        if(res.ok) window.location.href = '/login';
    } catch(e) {
        console.error("Logout failed", e);
    }
}

function updateStepIndicator() {
    const el = document.getElementById('stepIndicator');
    if(el) el.textContent = `${currentStep} of ${totalSteps}`;
    
    const btnBack = document.getElementById('btnBack');
    if(btnBack) btnBack.style.visibility = currentStep === 1 ? 'hidden' : 'visible';
    
    const btnNext = document.getElementById('btnNext');
    if(btnNext) {
        btnNext.textContent = currentStep === totalSteps ? 'Finish Setup' : 'Continue';
    }
}

function nextStep() {
    if(currentStep === totalSteps) {
        submitOnboarding();
        return;
    }
    document.getElementById(`step${currentStep}`).classList.remove('active');
    currentStep++;
    document.getElementById(`step${currentStep}`).classList.add('active');
    updateStepIndicator();
}

function prevStep() {
    if(currentStep === 1) return;
    document.getElementById(`step${currentStep}`).classList.remove('active');
    currentStep--;
    document.getElementById(`step${currentStep}`).classList.add('active');
    updateStepIndicator();
}

function addCommitmentRow() {
    const container = document.getElementById('commitments-container');
    if(!container) return;
    
    const id = `row-${commitRowCount++}`;
    const html = `
        <div class="commitment-row" id="${id}">
            <div class="col-name"><input type="text" class="input-field commit-name" placeholder="e.g., Coaching"></div>
            <div class="col-time"><input type="time" class="input-field commit-from"></div>
            <div class="col-time"><input type="time" class="input-field commit-to"></div>
            <button class="remove-btn" onclick="removeRow('${id}')">&times;</button>
        </div>
    `;
    container.insertAdjacentHTML('beforeend', html);
}

function removeRow(id) {
    const el = document.getElementById(id);
    if(el) el.remove();
}

async function submitOnboarding() {
    const wake = document.getElementById('wake')?.value || '07:00';
    const sleep = document.getElementById('sleep')?.value || '23:00';
    const studyHours = document.getElementById('studyHours')?.value || 4;
    
    const commitments = [];
    document.querySelectorAll('.commitment-row').forEach(row => {
        const name = row.querySelector('.commit-name').value;
        const from = row.querySelector('.commit-from').value;
        const to = row.querySelector('.commit-to').value;
        if(name && from && to) commitments.push({ name, from, to });
    });
    
    const free_slots = [];
    document.querySelectorAll('.freeslot-row').forEach(row => {
        const from = row.querySelector('.free-from').value;
        const to = row.querySelector('.free-to').value;
        if(from && to) free_slots.push({ from, to });
    });
    
    const data = { wake, sleep, study_hours: studyHours, commitments, free_slots };
    
    try {
        const res = await fetch('/api/onboard', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        if(res.ok) window.location.href = '/dashboard';
    } catch(e) {
        console.error("Onboarding failed", e);
        window.location.href = '/dashboard';
    }
}

// --- DASHBOARD LOGIC (dashboard.html) ---
function switchTab(tabId) {
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.view-section').forEach(el => el.classList.remove('active'));
    
    const navItem = document.querySelector(`.nav-item[onclick="switchTab('${tabId}')"]`);
    if(navItem) navItem.classList.add('active');
    
    const section = document.getElementById(`view-${tabId}`);
    if(section) section.classList.add('active');
    
    if(tabId === 'plan') loadTasks();
    if(tabId === 'analytics') loadStats();
    if(tabId === 'hub') { loadTasks(); loadStudyFiles(); }
}

// Check Daily Plan at startup
window.addEventListener('DOMContentLoaded', () => {
    switchTab('plan'); // default tab
    fetchCalendarData();
    checkDailyPlan();
});

function checkDailyPlan() {
    const today = new Date().toISOString().split('T')[0];
    if (window.USER_DATA && window.USER_DATA.last_plan_date !== today) {
        // First login today — show full-screen setup overlay
        openDailySetupOverlay(false); // false = first-time mode (not edit)
    }
    // If already planned today, do nothing — dashboard shows normally
}

/* --- FULL-SCREEN DAILY SETUP OVERLAY LOGIC --- */
let p_currentStep = 1;
const p_totalSteps = 4;
let p_commitRowCount = 1;
let p_isEditMode = false; // tracks if user opened via "Daily Setup" button (edit) vs first-login (new)

// Called from header button "📋 Daily Setup"
function openDailyPlan() {
    const today = new Date().toISOString().split('T')[0];
    if (window.USER_DATA && window.USER_DATA.last_plan_date === today) {
        // Already completed today's setup — toggle the inline quick-edit panel
        toggleQuickEditPanel();
    } else {
        // Not done today — show full-screen overlay
        openDailySetupOverlay(false);
    }
}

async function openDailySetupOverlay(isEdit) {
    p_isEditMode = isEdit;
    const overlay = document.getElementById('daily-setup-overlay');
    const badge = document.getElementById('overlay-mode-badge');
    const closeBtn = document.getElementById('overlay-close-btn');
    
    // Reset steps to step 1
    p_currentStep = 1;
    document.querySelectorAll('#overlay-step-container .step').forEach(el => el.classList.remove('active'));
    document.getElementById('p_step1').classList.add('active');
    p_updateStepIndicator();
    
    if (isEdit) {
        // Edit mode: show close button, change badge
        badge.className = 'overlay-badge edit-mode';
        badge.innerHTML = '✏️ Editing today\'s daily setup';
        closeBtn.style.display = 'flex';
        
        // Fetch and pre-fill saved data
        try {
            const res = await fetch('/api/daily_setup');
            const data = await res.json();
            if (data.success) {
                prefillDailySetup(data);
            }
        } catch(e) {
            console.error('Failed to load daily setup data', e);
        }
    } else {
        // First-time mode: hide close button, force completion
        badge.className = 'overlay-badge first-time';
        badge.innerHTML = '🌅 First login today — let\'s plan your day';
        closeBtn.style.display = 'none';
        
        // Still pre-fill with previous values if available (user's established schedule)
        try {
            const res = await fetch('/api/daily_setup');
            const data = await res.json();
            if (data.success && data.last_plan_date) {
                // Pre-fill with last saved values as defaults
                prefillDailySetup(data);
            }
        } catch(e) {
            // Ignore, use defaults
        }
    }
    
    // Show the overlay
    overlay.classList.add('active');
    document.body.style.overflow = 'hidden'; // prevent background scroll
}

function prefillDailySetup(data) {
    // Step 1: Wake/Sleep
    const wakeEl = document.getElementById('p_wake');
    const sleepEl = document.getElementById('p_sleep');
    if (wakeEl && data.wake) wakeEl.value = data.wake;
    if (sleepEl && data.sleep) sleepEl.value = data.sleep;
    
    // Step 2: Commitments
    const commitContainer = document.getElementById('p_commitments-container');
    if (commitContainer && data.commitments && data.commitments.length > 0) {
        commitContainer.innerHTML = ''; // Clear default empty row
        p_commitRowCount = 0;
        data.commitments.forEach(c => {
            const id = `p_row-${p_commitRowCount++}`;
            const html = `
                <div class="commitment-row" id="${id}">
                    <div class="col-name"><input type="text" class="input-field p_commit-name" placeholder="e.g., College" value="${c.name || ''}"></div>
                    <div class="col-time"><input type="time" class="input-field p_commit-from" value="${c.from || ''}"></div>
                    <div class="col-time"><input type="time" class="input-field p_commit-to" value="${c.to || ''}"></div>
                    <button class="remove-btn" onclick="document.getElementById('${id}').remove()">&times;</button>
                </div>
            `;
            commitContainer.insertAdjacentHTML('beforeend', html);
        });
    }
    
    // Step 3: Free Slots
    const freeContainer = document.getElementById('p_freeslots-container');
    if (freeContainer && data.free_slots && data.free_slots.length > 0) {
        freeContainer.innerHTML = ''; // Clear default row
        data.free_slots.forEach(slot => {
            const id = `p_free-row-${Date.now()}-${Math.random().toString(36).substr(2,5)}`;
            const html = `
                <div class="freeslot-row" style="display: flex; gap: 16px; margin-bottom: 16px;" id="${id}">
                    <div style="flex: 1;"><label class="input-label">Free From</label><input type="time" class="input-field p_free-from" value="${slot.from || '16:00'}"></div>
                    <div style="flex: 1;"><label class="input-label">Free Until</label><input type="time" class="input-field p_free-to" value="${slot.to || '20:00'}"></div>
                    <button class="remove-btn" onclick="document.getElementById('${id}').remove()">&times;</button>
                </div>
            `;
            freeContainer.insertAdjacentHTML('beforeend', html);
        });
    }
    
    // Step 4: Study Hours
    const studyEl = document.getElementById('p_studyHours');
    if (studyEl && data.target_study_hours) studyEl.value = data.target_study_hours;
}

function closeDailySetupOverlay() {
    const overlay = document.getElementById('daily-setup-overlay');
    overlay.classList.remove('active');
    document.body.style.overflow = ''; // restore scrolling
}

// Legacy alias for header button compatibility
function closeDailyPlan() {
    closeDailySetupOverlay();
}

function p_updateStepIndicator() {
    const pb = document.getElementById('overlay-progress-fill');
    if(pb) pb.style.width = (p_currentStep / p_totalSteps * 100) + '%';
    
    const btnBack = document.getElementById('p_btnBack');
    if(btnBack) btnBack.style.visibility = p_currentStep === 1 ? 'hidden' : 'visible';
    
    const btnNext = document.getElementById('p_btnNext');
    if(btnNext) {
        btnNext.textContent = p_currentStep === p_totalSteps ? 'Finish Setup' : 'Continue';
    }
}

function p_nextStep() {
    if(p_currentStep === p_totalSteps) {
        p_submitDailyPlan();
        return;
    }
    document.getElementById(`p_step${p_currentStep}`).classList.remove('active');
    p_currentStep++;
    document.getElementById(`p_step${p_currentStep}`).classList.add('active');
    p_updateStepIndicator();
}

function p_prevStep() {
    if(p_currentStep === 1) return;
    document.getElementById(`p_step${p_currentStep}`).classList.remove('active');
    p_currentStep--;
    document.getElementById(`p_step${p_currentStep}`).classList.add('active');
    p_updateStepIndicator();
}

function p_addCommitmentRow() {
    const container = document.getElementById('p_commitments-container');
    if(!container) return;
    const id = `p_row-${p_commitRowCount++}`;
    const html = `
        <div class="commitment-row" id="${id}">
            <div class="col-name"><input type="text" class="input-field p_commit-name" placeholder="e.g., Coaching"></div>
            <div class="col-time"><input type="time" class="input-field p_commit-from"></div>
            <div class="col-time"><input type="time" class="input-field p_commit-to"></div>
            <button class="remove-btn" onclick="document.getElementById('${id}').remove()">&times;</button>
        </div>
    `;
    container.insertAdjacentHTML('beforeend', html);
}

function p_addFreeRow() {
    const container = document.getElementById('p_freeslots-container');
    if(!container) return;
    const id = `p_free-row-${Date.now()}`;
    const html = `
        <div class="freeslot-row" style="display: flex; gap: 16px; margin-bottom: 16px;" id="${id}">
            <div style="flex: 1;"><label class="input-label">Free From</label><input type="time" class="input-field p_free-from" value="16:00"></div>
            <div style="flex: 1;"><label class="input-label">Free Until</label><input type="time" class="input-field p_free-to" value="20:00"></div>
            <button class="remove-btn" onclick="document.getElementById('${id}').remove()">&times;</button>
        </div>
    `;
    container.insertAdjacentHTML('beforeend', html);
}

async function p_submitDailyPlan() {
    const wake = document.getElementById('p_wake')?.value || '07:00';
    const sleep = document.getElementById('p_sleep')?.value || '23:00';
    const studyHours = document.getElementById('p_studyHours')?.value || 4;
    
    const commitments = [];
    document.querySelectorAll('#overlay-step-container .commitment-row').forEach(row => {
        const name = row.querySelector('.p_commit-name').value;
        const from = row.querySelector('.p_commit-from').value;
        const to = row.querySelector('.p_commit-to').value;
        if(name && from && to) commitments.push({ name, from, to });
    });
    
    const free_slots = [];
    document.querySelectorAll('#overlay-step-container .freeslot-row').forEach(row => {
        const from = row.querySelector('.p_free-from').value;
        const to = row.querySelector('.p_free-to').value;
        if(from && to) free_slots.push({ from, to });
    });
    
    const data = { wake, sleep, study_hours: studyHours, commitments, free_slots };
    
    try {
        const res = await fetch('/api/onboard', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        if(res.ok) {
            window.USER_DATA.last_plan_date = new Date().toISOString().split('T')[0];
            // Update local USER_DATA for inline panel
            window.USER_DATA.wake = data.wake;
            window.USER_DATA.sleep = data.sleep;
            window.USER_DATA.target_study_hours = parseInt(data.study_hours);
            window.USER_DATA.commitments = data.commitments;
            window.USER_DATA.free_slots = data.free_slots;
            
            closeDailySetupOverlay();
            showToast(p_isEditMode ? '✅ Daily Setup updated!' : '✅ Daily Plan saved! Generate your smart timetable.', 'success');
            
            // Refresh the inline quick-edit panel if it exists
            renderQuickEditPanel();
        } else {
            const err = await res.json();
            showToast('Error: ' + (err.error || 'Unknown error'), 'error');
        }
    } catch(e) {
        console.error("Daily plan update failed", e);
        showToast('Network error while saving daily plan.', 'error');
    }
}

/* --- INLINE QUICK-EDIT PANEL (shown after daily setup is done) --- */
function toggleQuickEditPanel() {
    const panel = document.getElementById('quick-edit-panel');
    if (!panel) return;
    
    if (panel.style.display === 'none' || !panel.style.display) {
        renderQuickEditPanel();
        panel.style.display = 'block';
        panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
        panel.style.display = 'none';
    }
}

async function renderQuickEditPanel() {
    const panel = document.getElementById('quick-edit-panel');
    if (!panel) return;
    
    // Fetch latest data from backend
    let setupData = window.USER_DATA || {};
    try {
        const res = await fetch('/api/daily_setup');
        const data = await res.json();
        if (data.success) setupData = data;
    } catch(e) { /* use cached USER_DATA */ }
    
    const wake = setupData.wake || '07:00';
    const sleep = setupData.sleep || '23:00';
    const hours = setupData.target_study_hours || 4;
    const commitments = setupData.commitments || [];
    const freeSlots = setupData.free_slots || [];
    
    let commitmentsHtml = '';
    if (commitments.length > 0) {
        commitmentsHtml = commitments.map((c, i) => `
            <div class="qe-row" id="qe-commit-${i}">
                <input type="text" class="input-field qe-commit-name" value="${c.name || ''}" placeholder="Commitment">
                <input type="time" class="input-field qe-commit-from" value="${c.from || ''}">
                <input type="time" class="input-field qe-commit-to" value="${c.to || ''}">
                <button class="qe-remove" onclick="document.getElementById('qe-commit-${i}').remove()">&times;</button>
            </div>
        `).join('');
    }
    
    let slotsHtml = '';
    if (freeSlots.length > 0) {
        slotsHtml = freeSlots.map((s, i) => `
            <div class="qe-row" id="qe-slot-${i}">
                <input type="time" class="input-field qe-slot-from" value="${s.from || '16:00'}">
                <span style="color:var(--text-muted); font-weight:500;">to</span>
                <input type="time" class="input-field qe-slot-to" value="${s.to || '20:00'}">
                <button class="qe-remove" onclick="document.getElementById('qe-slot-${i}').remove()">&times;</button>
            </div>
        `).join('');
    }
    
    panel.innerHTML = `
        <div class="qe-header">
            <div>
                <h3 style="margin:0; font-size:1.1rem; color:#111827; display:flex; align-items:center; gap:8px;">
                    <span style="font-size:1.3rem;">⚙️</span> Today's Setup
                    <span class="qe-badge">✓ Configured</span>
                </h3>
                <p style="margin:4px 0 0; font-size:0.85rem; color:var(--text-muted);">Edit your daily availability below</p>
            </div>
            <button class="qe-close" onclick="document.getElementById('quick-edit-panel').style.display='none'">&times;</button>
        </div>
        
        <div class="qe-body">
            <div class="qe-grid">
                <div class="qe-field">
                    <label class="input-label">Wake Up</label>
                    <input type="time" id="qe-wake" class="input-field" value="${wake}">
                </div>
                <div class="qe-field">
                    <label class="input-label">Sleep</label>
                    <input type="time" id="qe-sleep" class="input-field" value="${sleep}">
                </div>
                <div class="qe-field">
                    <label class="input-label">Study Hours</label>
                    <input type="number" id="qe-hours" class="input-field" value="${hours}" min="1" max="12">
                </div>
            </div>
            
            <div class="qe-section">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                    <label class="input-label" style="margin:0;">Fixed Commitments</label>
                    <button class="qe-add-btn" onclick="qeAddCommitment()">+ Add</button>
                </div>
                <div id="qe-commitments-container">${commitmentsHtml || '<div style="font-size:0.85rem; color:var(--text-muted); padding:8px 0;">No commitments set</div>'}</div>
            </div>
            
            <div class="qe-section">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                    <label class="input-label" style="margin:0;">Free Study Slots</label>
                    <button class="qe-add-btn" onclick="qeAddSlot()">+ Add</button>
                </div>
                <div id="qe-slots-container">${slotsHtml || '<div style="font-size:0.85rem; color:var(--text-muted); padding:8px 0;">No free slots set</div>'}</div>
            </div>
            
            <div class="qe-actions">
                <button class="btn btn-primary" onclick="saveQuickEdit()" id="qe-save-btn" style="padding:10px 28px; font-size:0.95rem;">Save Changes</button>
                <button class="btn btn-outline" onclick="openDailySetupOverlay(true)" style="padding:10px 20px; font-size:0.85rem; color:var(--text-muted); border-color:var(--border-color);">Open Full Setup ↗</button>
            </div>
        </div>
    `;
}

let qeCommitCounter = 100;
function qeAddCommitment() {
    const container = document.getElementById('qe-commitments-container');
    if (!container) return;
    // Remove "no commitments" placeholder if present
    const placeholder = container.querySelector('div[style*="color:var(--text-muted)"]');
    if (placeholder && !container.querySelector('.qe-row')) placeholder.remove();
    
    const id = `qe-commit-${qeCommitCounter++}`;
    container.insertAdjacentHTML('beforeend', `
        <div class="qe-row" id="${id}">
            <input type="text" class="input-field qe-commit-name" placeholder="e.g., College">
            <input type="time" class="input-field qe-commit-from">
            <input type="time" class="input-field qe-commit-to">
            <button class="qe-remove" onclick="document.getElementById('${id}').remove()">&times;</button>
        </div>
    `);
}

let qeSlotCounter = 100;
function qeAddSlot() {
    const container = document.getElementById('qe-slots-container');
    if (!container) return;
    const placeholder = container.querySelector('div[style*="color:var(--text-muted)"]');
    if (placeholder && !container.querySelector('.qe-row')) placeholder.remove();
    
    const id = `qe-slot-${qeSlotCounter++}`;
    container.insertAdjacentHTML('beforeend', `
        <div class="qe-row" id="${id}">
            <input type="time" class="input-field qe-slot-from" value="16:00">
            <span style="color:var(--text-muted); font-weight:500;">to</span>
            <input type="time" class="input-field qe-slot-to" value="20:00">
            <button class="qe-remove" onclick="document.getElementById('${id}').remove()">&times;</button>
        </div>
    `);
}

async function saveQuickEdit() {
    const btn = document.getElementById('qe-save-btn');
    if (btn) { btn.textContent = 'Saving...'; btn.disabled = true; }
    
    const wake = document.getElementById('qe-wake')?.value || '07:00';
    const sleep = document.getElementById('qe-sleep')?.value || '23:00';
    const studyHours = document.getElementById('qe-hours')?.value || 4;
    
    const commitments = [];
    document.querySelectorAll('#qe-commitments-container .qe-row').forEach(row => {
        const name = row.querySelector('.qe-commit-name')?.value;
        const from = row.querySelector('.qe-commit-from')?.value;
        const to = row.querySelector('.qe-commit-to')?.value;
        if (name && from && to) commitments.push({ name, from, to });
    });
    
    const free_slots = [];
    document.querySelectorAll('#qe-slots-container .qe-row').forEach(row => {
        const from = row.querySelector('.qe-slot-from')?.value;
        const to = row.querySelector('.qe-slot-to')?.value;
        if (from && to) free_slots.push({ from, to });
    });
    
    try {
        const res = await fetch('/api/onboard', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ wake, sleep, study_hours: studyHours, commitments, free_slots })
        });
        if (res.ok) {
            window.USER_DATA.last_plan_date = new Date().toISOString().split('T')[0];
            window.USER_DATA.wake = wake;
            window.USER_DATA.sleep = sleep;
            window.USER_DATA.target_study_hours = parseInt(studyHours);
            window.USER_DATA.commitments = commitments;
            window.USER_DATA.free_slots = free_slots;
            showToast('✅ Daily Setup updated!', 'success');
        } else {
            showToast('Failed to save changes', 'error');
        }
    } catch(e) {
        showToast('Network error', 'error');
    } finally {
        if (btn) { btn.textContent = 'Save Changes'; btn.disabled = false; }
    }
}

/* --- Toast notification helper --- */
function showToast(message, type = 'success') {
    const existing = document.getElementById('clarity-toast');
    if (existing) existing.remove();
    
    const toast = document.createElement('div');
    toast.id = 'clarity-toast';
    const bg = type === 'success' ? 'linear-gradient(135deg, #059669, #10B981)' : 'linear-gradient(135deg, #DC2626, #EF4444)';
    toast.style.cssText = `position:fixed; bottom:30px; left:50%; transform:translateX(-50%) translateY(20px); background:${bg}; color:white; padding:14px 28px; border-radius:12px; font-weight:600; font-size:0.95rem; z-index:99999; box-shadow:0 8px 30px rgba(0,0,0,0.2); opacity:0; transition: all 0.4s cubic-bezier(0.16,1,0.3,1);`;
    toast.textContent = message;
    document.body.appendChild(toast);
    
    requestAnimationFrame(() => {
        toast.style.opacity = '1';
        toast.style.transform = 'translateX(-50%) translateY(0)';
    });
    
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(-50%) translateY(20px)';
        setTimeout(() => toast.remove(), 400);
    }, 3000);
}

// Load Tasks & Hub
async function loadTasks() {
    try {
        const res = await fetch('/api/tasks');
        const data = await res.json();
        const list = document.getElementById('tasks-list');
        const hubList = document.getElementById('hub-list');
        
        if(!list) return;
        
        if(data.tasks && data.tasks.length > 0) {
            window.appTasks = data.tasks;
            list.innerHTML = data.tasks.map(t => {
                const safeTitle = t.title.replace(/'/g, "\\'");
                const actionBtn = t.status === 'pending' 
                    ? `<button onclick="openFocusWidget('${t.id}', '${safeTitle}', ${t.estimated_time || 25})" class="btn btn-primary btn-sm">Start Focus</button>
                       <button onclick="openEditTask(${t.id})" class="btn btn-outline btn-sm" style="margin-left:8px;">Edit</button>`
                    : '<span style="color:var(--primary-color); font-weight:600;">✅ Done</span>';
                    
                return `
                <div class="task-card ${t.status === 'completed' ? 'completed' : ''}">
                    <div>
                        <h4 style="margin-bottom:4px;">${t.title}</h4>
                        <span style="font-size: 0.8rem; color: var(--text-muted); background: var(--bg-color); padding: 2px 8px; border-radius: 4px;">Est: ${t.estimated_time}m | Priority: ${t.priority}</span>
                    </div>
                    ${actionBtn}
                </div>
            `}).join('');
            
            if(hubList) {
                loadStudyFiles(); // Load from API instead of task materials
            }
        } else {
            list.innerHTML = `<div style="text-align:center; padding: 40px; color: var(--text-muted);">No tasks yet.</div>`;
            if(hubList) hubList.innerHTML = '';
        }
    } catch(e) { console.error("Error loading tasks", e); }
}

// Upload Academic Calendar File — with AI Review Modal
async function uploadAcademicCalendar(event) {
    const file = event.target.files[0];
    if(!file) return;
    
    const fd = new FormData();
    fd.append('file', file);
    
    const dropzone = event.target.closest('.upload-dropzone');
    const textNode = dropzone.querySelector('div[style*="font-weight: 600"]');
    const oldText = textNode ? textNode.innerText : "Uploading...";
    
    if(textNode) textNode.innerHTML = "🧠 AI is analyzing your schedule...";
    dropzone.style.opacity = '0.6';
    dropzone.style.pointerEvents = 'none';
    
    try {
        const res = await fetch('/api/upload_calendar', { method: 'POST', body: fd });
        const data = await res.json();
        if(data.success && data.preview) {
            // Show review modal with extracted data
            openCalReview(data);
        } else if(data.error) {
            // Show quality-aware error
            let errMsg = data.error;
            if(data.suggestion) errMsg += '\n\n💡 ' + data.suggestion;
            if(data.quality && data.quality.warnings) {
                data.quality.warnings.forEach(w => errMsg += '\n⚠️ ' + w);
            }
            alert(errMsg);
        }
    } catch(e) {
        alert("Network error analyzing calendar. Please check your connection.");
    } finally {
        if(textNode) textNode.innerText = oldText;
        dropzone.style.opacity = '1';
        dropzone.style.pointerEvents = 'auto';
        event.target.value = '';
    }
}

// Show extraction summary panel after calendar upload
function showExtractionSummary(data) {
    let existing = document.getElementById('extraction-summary');
    if(existing) existing.remove();
    
    const panel = document.createElement('div');
    panel.id = 'extraction-summary';
    panel.style.cssText = 'margin-top: 24px; padding: 24px; background: linear-gradient(135deg, #F0FDF4 0%, #ECFDF5 100%); border: 1px solid #BBF7D0; border-radius: 12px; animation: fadeIn 0.3s ease-out;';
    
    let monthHtml = '';
    if(data.month_summary) {
        const months = Object.entries(data.month_summary).sort((a, b) => new Date(a[0] + ' 1') - new Date(b[0] + ' 1'));
        monthHtml = months.map(([month, count]) => {
            const colors = {
                'exam': '#FEF3C7', 'deadline': '#FEE2E2',
                'holiday': '#D1FAE5', 'event': '#EFF6FF'
            };
            return `<div style="display:flex; justify-content:space-between; align-items:center; padding:8px 12px; background:white; border-radius:8px; margin-bottom:6px; border:1px solid #E5E7EB;">
                <span style="font-weight:600; color:#1F2937; font-size:0.9rem;">${month}</span>
                <span style="background:#059669; color:white; padding:2px 10px; border-radius:12px; font-size:0.8rem; font-weight:600;">${count}</span>
            </div>`;
        }).join('');
    }
    
    // Event type badges
    const typeCounts = {};
    (data.events || []).forEach(ev => {
        typeCounts[ev.type] = (typeCounts[ev.type] || 0) + 1;
    });
    const typeColors = { exam: '#D97706', deadline: '#EF4444', holiday: '#059669', event: '#4F46E5' };
    const typeBadges = Object.entries(typeCounts).map(([type, count]) => {
        return `<span style="display:inline-flex; align-items:center; gap:4px; padding:4px 12px; border-radius:16px; font-size:0.8rem; font-weight:600; background:${typeColors[type]}15; color:${typeColors[type]}; border:1px solid ${typeColors[type]}30;">${type.charAt(0).toUpperCase() + type.slice(1)}: ${count}</span>`;
    }).join(' ');
    
    panel.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
            <div>
                <h4 style="margin:0; color:#059669; font-size:1.1rem;">✅ Calendar Extracted Successfully</h4>
                <p style="margin:4px 0 0; color:#6B7280; font-size:0.9rem;">${data.total_events || data.events.length} events mapped to exact date boxes</p>
            </div>
            <button onclick="this.closest('#extraction-summary').remove()" style="background:none; border:none; font-size:1.2rem; cursor:pointer; color:#6B7280;">&times;</button>
        </div>
        <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:16px;">${typeBadges}</div>
        <div style="max-height:200px; overflow-y:auto;">${monthHtml}</div>
    `;
    
    const uploadCard = document.querySelector('.upload-card');
    if(uploadCard) uploadCard.after(panel);
}

// Upload Weekly Timetable PDF — with AI Review Modal
async function uploadWeeklyPDF(event) {
    const file = event.target.files[0];
    if(!file) return;
    
    const fd = new FormData();
    fd.append('file', file);
    
    const dropzone = event.target.closest('.upload-dropzone');
    const textNode = dropzone.querySelector('div[style*="font-weight: 600"]');
    const oldText = textNode ? textNode.innerText : "Uploading...";
    
    if(textNode) textNode.innerHTML = "🧠 AI is extracting your timetable...";
    dropzone.style.opacity = '0.6';
    dropzone.style.pointerEvents = 'none';
    
    try {
        const res = await fetch('/api/upload_weekly_pdf', { method: 'POST', body: fd });
        const data = await res.json();
        if(data.success && data.preview) {
            openTTReview(data);
        } else if(data.error) {
            let errMsg = data.error;
            if(data.suggestion) errMsg += '\n\n💡 ' + data.suggestion;
            if(data.quality && data.quality.warnings) {
                data.quality.warnings.forEach(w => errMsg += '\n⚠️ ' + w);
            }
            alert(errMsg);
        }
    } catch(e) {
        alert("Network error analyzing weekly timetable.");
    } finally {
        if(textNode) textNode.innerText = oldText;
        dropzone.style.opacity = '1';
        dropzone.style.pointerEvents = 'auto';
        event.target.value = '';
    }
}

// Add Advanced Task
let currentAISections = [];
let currentAITotalMins = 0;

function toggleTimeMode() {
    const mode = document.getElementById('m-mode').value;
    document.getElementById('div-manual').style.display = mode === 'manual' ? 'block' : 'none';
    document.getElementById('div-ai').style.display = mode === 'ai' ? 'block' : 'none';
}

async function analyzePDFForTime() {
    const fileInput = document.getElementById('m-file');
    if(fileInput.files.length === 0) return alert("Please select a study material PDF/File first!");
    
    const btn = document.getElementById('btn-analyze-pdf');
    const oldHtml = btn.innerHTML;
    btn.innerHTML = "⏳ Analyzing AI Depths...";
    btn.disabled = true;
    btn.style.opacity = '0.7';
    
    const fd = new FormData();
    fd.append('file', fileInput.files[0]);
    fd.append('study_type', 'reading'); 
    
    try {
        const res = await fetch('/api/upload_study_material', { method: 'POST', body: fd });
        const aiData = await res.json();
        
        if(aiData.success && aiData.sections) {
            currentAISections = aiData.sections;
            document.getElementById('label-m-type').style.display = 'block';
            document.getElementById('m-type').style.display = 'block';
            btn.style.display = 'none'; // hide analyze button
            updateAIPreview();
        } else {
            alert("Failed to analyze: " + (aiData.error || "Unknown error"));
            btn.innerHTML = oldHtml;
            btn.disabled = false;
        }
    } catch(e) {
        alert("Network error analyzing material");
        btn.innerHTML = oldHtml;
        btn.disabled = false;
    }
}

function updateAIPreview() {
    const studyType = document.getElementById('m-type').value;
    if(!currentAISections || currentAISections.length === 0) return;
    
    let totalMins = 0;
    let html = `<ul style="font-size:0.85rem; color:var(--text-muted); margin-top:8px; padding-left:16px; list-style-type:none;">`;
    let metadataHtml = '';
    
    currentAISections.forEach(s => {
        const t = s.all_times ? (s.all_times[studyType] || s.time) : s.time;
        totalMins += parseInt(t);
        
        if(s.difficulty) {
           metadataHtml += `<div style="margin-top:8px; padding:12px; border: 1px solid var(--border-color); background:white; border-radius:4px; font-size:0.85rem;">
               <div style="font-weight:600; margin-bottom:4px;">Difficulty: <span style="color:var(--primary-color)">${s.difficulty}</span></div>
               <div style="font-style:italic; color:#4B5563;">${s.reasoning || ''}</div>
           </div>`;
        }
    });
    
    // Instead of looping, we just show the final calculated time
    html += `<li><span style="font-weight:500;">Calculated Time:</span> <b style="color:var(--primary-color); font-size:1.1rem;">${totalMins}m</b></li>`;
    html += `</ul>`;
    
    currentAITotalMins = totalMins;
    const headerHtml = `<strong>AI Analysis Results</strong>`;
    document.getElementById('ai-estimate-result').innerHTML = headerHtml + html + metadataHtml;
}

function openEditTask(id) {
    const task = window.appTasks.find(t => t.id == id);
    if(!task) return;
    
    document.getElementById('edit-task-id').value = id;
    document.getElementById('edit-task-title').value = task.title || '';
    document.getElementById('edit-task-deadline').value = task.deadline || '';
    document.getElementById('edit-task-priority').value = task.priority || 'Medium';
    document.getElementById('edit-task-time').value = task.estimated_time || '';
    document.getElementById('edit-task-material').value = task.material_link || task.material || '';
    
    document.getElementById('edit-task-modal').style.display = 'flex';
}

async function updateTask(event) {
    event.preventDefault();
    const id = document.getElementById('edit-task-id').value;
    const btn = event.submitter;
    const oldHtml = btn.innerHTML;
    btn.innerHTML = 'Saving...';
    btn.disabled = true;
    
    const data = {
        title: document.getElementById('edit-task-title').value,
        deadline: document.getElementById('edit-task-deadline').value,
        priority: document.getElementById('edit-task-priority').value,
        estimated_time: parseInt(document.getElementById('edit-task-time').value),
        material_link: document.getElementById('edit-task-material').value
    };
    
    try {
        const res = await fetch('/api/tasks/' + id, {
            method: 'PUT',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(data)
        });
        const result = await res.json();
        if(result.success) {
            document.getElementById('edit-task-modal').style.display = 'none';
            loadTasks();
        } else {
            alert('Error updating task: ' + result.error);
        }
    } catch(err) {
        alert('Network error updating task.');
    } finally {
        btn.innerHTML = oldHtml;
        btn.disabled = false;
    }
}

async function createAdvancedTask(e) {
    e.preventDefault();
    const title = document.getElementById('m-title').value;
    const priority = document.getElementById('m-prio').value;
    const deadline = document.getElementById('m-dead').value;
    const mode = document.getElementById('m-mode').value;
    
    const btn = document.getElementById('btn-submit-task');
    const oldHtml = btn.innerHTML;
    
    let estimated_time = 0;
    
    const fileInput = document.getElementById('m-file');
    const urlInput = document.getElementById('m-url').value;
    const study_type = document.getElementById('m-type').value;
    
    let material_name = urlInput ? "URL Link" : null;
    let material_link = urlInput || null;
    
    if(mode === 'manual') {
        estimated_time = parseInt(document.getElementById('m-est').value) || 30;
    } else {
        if(fileInput.files.length > 0) {
            material_name = fileInput.files[0].name;
            if(currentAITotalMins > 0) {
                estimated_time = currentAITotalMins;
            } else {
                alert("Please click 'Analyze Material' first to extract your custom estimates from AI!");
                return;
            }
        } else {
            estimated_time = study_type === 'exam' ? 120 : (study_type === 'understanding' ? 60 : 30);
        }
    }
    
    btn.innerHTML = "Saving...";
    const data = { title, estimated_time, priority, deadline, study_type, material: material_name, material_link };
    
    try {
        const res = await fetch('/api/tasks', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(data)
        });
        const result = await res.json();
        if(result.success) {
            if(result.risk_warning) alert(`Warning: ${result.risk_warning}`);
            loadTasks();
            alert("Task Added!");
            
            // Reset form
            document.getElementById('m-title').value = '';
            document.getElementById('m-file').value = '';
            document.getElementById('m-url').value = '';
            
            // Reset AI
            document.getElementById('label-m-type').style.display = 'none';
            document.getElementById('m-type').style.display = 'none';
            const btnAnalyze = document.getElementById('btn-analyze-pdf');
            if(btnAnalyze) {
                btnAnalyze.style.display = 'block';
                btnAnalyze.disabled = false;
                btnAnalyze.innerHTML = 'Analyze Material (Get 3 Estimates)';
            }
            document.getElementById('ai-estimate-result').innerHTML = '';
            currentAISections = [];
            currentAITotalMins = 0;
        }
    } catch(err) {
        console.error(err);
    } finally {
        btn.innerHTML = oldHtml;
    }
}

// Generate Timetable — AI-Powered Timeline
async function generateTimetable() {
    const btn = document.getElementById('btn-gen-tt');
    if(btn) { btn.textContent = '🧠 AI Scheduling...'; btn.disabled = true; }
    try {
        const res = await fetch('/api/generate_timetable', { method: 'POST' });
        const data = await res.json();
        
        const disp = document.getElementById('tt-display');
        if(data.success && data.timetable && data.timetable.length > 0) {
            // Summary bar
            const s = data.summary || {};
            const studyH = ((s.total_study_mins || 0) / 60).toFixed(1);
            const breakH = ((s.total_break_mins || 0) / 60).toFixed(1);
            
            let html = `
                <div style="display:flex; gap:12px; flex-wrap:wrap; margin-bottom:20px;">
                    <div style="display:flex; align-items:center; gap:6px; padding:6px 14px; border-radius:20px; background:#EEF2FF; font-size:0.82rem; font-weight:600; color:#4F46E5;">
                        📖 ${studyH}h study
                    </div>
                    <div style="display:flex; align-items:center; gap:6px; padding:6px 14px; border-radius:20px; background:#D1FAE5; font-size:0.82rem; font-weight:600; color:#065F46;">
                        ☕ ${breakH}h breaks
                    </div>
                    <div style="display:flex; align-items:center; gap:6px; padding:6px 14px; border-radius:20px; background:#FEF3C7; font-size:0.82rem; font-weight:600; color:#92400E;">
                        ✅ ${s.tasks_covered || 0}/${s.total_tasks || 0} tasks covered
                    </div>
                </div>
            `;

            // Group by date
            let currentDate = '';
            data.timetable.forEach(t => {
                const dateLabel = t.date || '';
                if(dateLabel !== currentDate) {
                    currentDate = dateLabel;
                    const dayText = t.carry_forward ? `🔄 ${t.day_label} — ${dateLabel}` : `📅 Today — ${dateLabel}`;
                    html += `<div style="font-size:0.85rem; font-weight:700; color:#374151; margin:16px 0 8px; padding:6px 12px; background:#F9FAFB; border-radius:8px; border-left:3px solid var(--primary-color);">${dayText}</div>`;
                }

                if(t.is_break) {
                    // Break block — soft green
                    html += `
                        <div style="display:flex; align-items:center; gap:12px; padding:10px 16px; margin-bottom:6px; background:linear-gradient(135deg,#ECFDF5,#D1FAE5); border-radius:10px; border-left:4px solid #34D399; opacity:0.85;">
                            <span style="font-size:1.2rem;">${t.title.includes('Long') ? '🧘' : '☕'}</span>
                            <div style="flex:1;">
                                <div style="font-weight:600; font-size:0.85rem; color:#065F46;">${t.title}</div>
                                <div style="font-size:0.75rem; color:#6B7280;">${t.start} - ${t.end} · ${t.duration} min</div>
                            </div>
                        </div>
                    `;
                } else {
                    // Study block — color-coded by priority
                    const safeTitle = t.title.replace(/'/g, "\\'");
                    const color = t.color || '#6366F1';
                    const carryDim = t.carry_forward ? 'opacity:0.75;' : '';
                    const priLabel = t.priority === 'High' ? '🔴 High' : t.priority === 'Medium' ? '🟡 Medium' : '🔵 Low';
                    const deadlineTag = t.deadline ? `<span style="font-size:0.7rem; color:#6B7280; margin-left:8px;">Due: ${t.deadline}</span>` : '';
                    
                    html += `
                        <div style="display:flex; align-items:stretch; gap:0; margin-bottom:8px; cursor:pointer; border-radius:12px; overflow:hidden; box-shadow:0 2px 8px rgba(0,0,0,0.06); transition:transform 0.15s, box-shadow 0.15s; ${carryDim}"
                             onclick="openFocusWidget('${t.task_id}', '${safeTitle}', ${t.duration})"
                             onmouseenter="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 6px 20px rgba(0,0,0,0.1)'"
                             onmouseleave="this.style.transform='none'; this.style.boxShadow='0 2px 8px rgba(0,0,0,0.06)'"
                             title="Click to start Focus Mode">
                            <div style="width:5px; background:${color}; flex-shrink:0;"></div>
                            <div style="flex:1; padding:14px 16px; background:white;">
                                <div style="display:flex; justify-content:space-between; align-items:center;">
                                    <span style="font-size:0.78rem; font-weight:700; color:#6B7280;">${t.start} - ${t.end}</span>
                                    <span style="font-size:0.72rem; font-weight:600; padding:2px 8px; border-radius:10px; background:${color}15; color:${color};">${priLabel}</span>
                                </div>
                                <div style="font-weight:700; font-size:0.95rem; margin-top:4px; color:#1F2937;">${t.title}</div>
                                <div style="font-size:0.75rem; color:#9CA3AF; margin-top:2px;">${t.duration} min session${deadlineTag}</div>
                            </div>
                        </div>
                    `;
                }
            });

            disp.innerHTML = html;
            showToast(`✅ Smart timetable generated — ${data.timetable.length} blocks`, 'success');
        } else {
            disp.innerHTML = `
                <div style="text-align:center; padding:40px; color:var(--text-muted);">
                    <div style="font-size:2rem; margin-bottom:12px;">📝</div>
                    <p style="font-weight:600; margin-bottom:4px;">${data.message || 'No pending tasks to schedule.'}</p>
                    <p style="font-size:0.85rem;">Add tasks first, then generate your study plan!</p>
                </div>
            `;
        }
    } catch(e) {
        console.error(e);
        showToast('Failed to generate timetable', 'error');
    } finally {
        if(btn) { btn.textContent = '⚡ Generate Smart Timetable'; btn.disabled = false; }
    }
}

// Daily Reflection
async function submitReflection(e) {
    e.preventDefault();
    const payload = {
        well: document.getElementById('ref-well').value,
        wasted: document.getElementById('ref-wasted').value,
        focus: document.getElementById('ref-focus').value,
        energy: document.getElementById('ref-energy').value,
        mood: document.getElementById('ref-mood').value,
        distraction: document.getElementById('ref-distraction').value,
        improvement: document.getElementById('ref-improvement').value
    };
    
    try {
        await fetch('/api/reflection', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(payload)
        });
        alert('Reflection saved! Streak updated.');
        document.getElementById('ref-well').value = '';
        document.getElementById('ref-wasted').value = '';
        document.getElementById('ref-focus').value = '';
        document.getElementById('ref-energy').value = '';
        document.getElementById('ref-distraction').value = '';
        document.getElementById('ref-improvement').value = '';
        loadStats(); // Update analytics view
    } catch(err) {
        console.error(err);
    }
}

// Load Stats for Analytics
async function loadStats() {
    try {
        const res = await fetch('/api/stats');
        const data = await res.json();
        if(data.success) {
            const actualHours = (data.actual_mins / 60).toFixed(1);
            const plannedHours = (data.planned_mins / 60).toFixed(1);
            
            // Update stat cards
            document.getElementById('stat-planned').textContent = plannedHours + 'h';
            document.getElementById('stat-actual').textContent = actualHours + 'h';
            const diff = Math.max(0, data.planned_mins - data.actual_mins);
            document.getElementById('stat-lost').textContent = diff + ' min';
            
            const tasksDone = document.getElementById('stat-tasks-done');
            if(tasksDone) tasksDone.textContent = (data.tasks_completed || 0) + '/' + (data.tasks_total || 0);
            
            // Focus score
            const focusEl = document.getElementById('analytics-focus');
            if(focusEl) focusEl.textContent = data.avg_focus > 0 ? data.avg_focus + '/100' : '-';
            
            const consistEl = document.getElementById('analytics-consistency');
            if(consistEl) consistEl.textContent = data.consistency > 0 ? data.consistency + '%' : '-';
            
            const streakEl = document.getElementById('analytics-streak');
            if(streakEl) streakEl.textContent = (data.streak || 0) + ' days';
            
            // Focus progress bar
            const progressBar = document.getElementById('focus-progress-bar');
            if(progressBar) progressBar.style.width = Math.min(data.avg_focus || 0, 100) + '%';
            
            // ── WEEKLY BAR CHART ──
            if(data.weekly_chart && document.getElementById('weeklyBarChart')) {
                if(window._weeklyBarChart) window._weeklyBarChart.destroy();
                const ctx = document.getElementById('weeklyBarChart').getContext('2d');
                window._weeklyBarChart = new Chart(ctx, {
                    type: 'bar',
                    data: {
                        labels: data.weekly_chart.labels,
                        datasets: [
                            {
                                label: 'Planned (mins)',
                                data: data.weekly_chart.planned,
                                backgroundColor: 'rgba(99, 102, 241, 0.2)',
                                borderColor: 'rgba(99, 102, 241, 0.8)',
                                borderWidth: 2,
                                borderRadius: 6,
                                barPercentage: 0.6,
                                categoryPercentage: 0.7
                            },
                            {
                                label: 'Actual (mins)',
                                data: data.weekly_chart.actual,
                                backgroundColor: 'rgba(16, 185, 129, 0.75)',
                                borderColor: 'rgba(16, 185, 129, 1)',
                                borderWidth: 2,
                                borderRadius: 6,
                                barPercentage: 0.6,
                                categoryPercentage: 0.7
                            }
                        ]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                            legend: { display: false },
                            tooltip: {
                                mode: 'index',
                                intersect: false,
                                backgroundColor: '#1F2937',
                                titleFont: { weight: '600' },
                                bodyFont: { size: 13 },
                                padding: 12,
                                cornerRadius: 8,
                                callbacks: {
                                    label: function(ctx) {
                                        const hrs = (ctx.parsed.y / 60).toFixed(1);
                                        return ctx.dataset.label + ': ' + ctx.parsed.y + 'm (' + hrs + 'h)';
                                    }
                                }
                            }
                        },
                        scales: {
                            y: {
                                beginAtZero: true,
                                title: { display: true, text: 'Minutes', font: { size: 12, weight: '500' }, color: '#9CA3AF' },
                                grid: { color: 'rgba(0,0,0,0.04)', drawBorder: false },
                                ticks: { color: '#9CA3AF', font: { size: 11 } }
                            },
                            x: {
                                grid: { display: false },
                                ticks: { color: '#6B7280', font: { size: 12, weight: '600' } }
                            }
                        }
                    }
                });
            }
            
            // ── MONTHLY PIE CHART ──
            if(data.monthly_chart && document.getElementById('monthlyPieChart')) {
                if(window._monthlyPieChart) window._monthlyPieChart.destroy();
                const ctx2 = document.getElementById('monthlyPieChart').getContext('2d');
                
                const pieColors = [
                    'rgba(99, 102, 241, 0.8)',
                    'rgba(16, 185, 129, 0.8)',
                    'rgba(245, 158, 11, 0.8)',
                    'rgba(239, 68, 68, 0.8)',
                    'rgba(139, 92, 246, 0.8)',
                    'rgba(6, 182, 212, 0.8)'
                ];
                const pieBorders = [
                    'rgba(99, 102, 241, 1)',
                    'rgba(16, 185, 129, 1)',
                    'rgba(245, 158, 11, 1)',
                    'rgba(239, 68, 68, 1)',
                    'rgba(139, 92, 246, 1)',
                    'rgba(6, 182, 212, 1)'
                ];
                
                if(data.monthly_chart.labels.length > 0 && data.monthly_chart.values.some(v => v > 0)) {
                    window._monthlyPieChart = new Chart(ctx2, {
                        type: 'doughnut',
                        data: {
                            labels: data.monthly_chart.labels,
                            datasets: [{
                                data: data.monthly_chart.values,
                                backgroundColor: pieColors.slice(0, data.monthly_chart.labels.length),
                                borderColor: pieBorders.slice(0, data.monthly_chart.labels.length),
                                borderWidth: 2,
                                hoverOffset: 8
                            }]
                        },
                        options: {
                            responsive: true,
                            maintainAspectRatio: false,
                            cutout: '55%',
                            plugins: {
                                legend: {
                                    position: 'bottom',
                                    labels: {
                                        padding: 16,
                                        usePointStyle: true,
                                        pointStyle: 'circle',
                                        font: { size: 12, weight: '500' },
                                        color: '#6B7280'
                                    }
                                },
                                tooltip: {
                                    backgroundColor: '#1F2937',
                                    padding: 12,
                                    cornerRadius: 8,
                                    callbacks: {
                                        label: function(ctx) {
                                            const hrs = (ctx.parsed / 60).toFixed(1);
                                            return ctx.label + ': ' + ctx.parsed + 'm (' + hrs + 'h)';
                                        }
                                    }
                                }
                            }
                        }
                    });
                } else {
                    // No data placeholder
                    ctx2.canvas.parentElement.innerHTML = '<div style="display:flex; align-items:center; justify-content:center; height:100%; color:var(--text-muted); font-size:0.9rem; text-align:center; padding:20px;">No monthly data yet.<br>Complete focus sessions to see your monthly breakdown.</div>';
                }
            }
            
            // ── INSIGHTS ──
            const insightsEl = document.getElementById('analytics-insights');
            if(insightsEl) {
                let insightHtml = '';
                
                if(data.main_distraction && data.main_distraction !== 'Not enough data yet') {
                    insightHtml += '<div style="padding:12px 16px; background:#FEF3C7; border-left:4px solid #F59E0B; border-radius:6px; margin-bottom:10px;"><strong style="color:#92400E;">Main Distraction:</strong> <span style="color:#78350F;">' + data.main_distraction + '</span></div>';
                }
                
                if(data.energy_correlation && data.energy_correlation !== 'Not enough data yet') {
                    insightHtml += '<div style="padding:12px 16px; background:#EFF6FF; border-left:4px solid #3B82F6; border-radius:6px; margin-bottom:10px;"><strong style="color:#1E40AF;">Energy:</strong> <span style="color:#1E3A5F;">' + data.energy_correlation + '</span></div>';
                }
                
                if(data.insights && data.insights.length > 0) {
                    data.insights.forEach(function(insight) {
                        const isRisk = insight.includes('DEADLINE RISK');
                        const bg = isRisk ? '#FEE2E2' : '#F0FDF4';
                        const border = isRisk ? '#EF4444' : '#10B981';
                        const color = isRisk ? '#991B1B' : '#065F46';
                        insightHtml += '<div style="padding:12px 16px; background:' + bg + '; border-left:4px solid ' + border + '; border-radius:6px; margin-bottom:10px; color:' + color + ';">' + insight + '</div>';
                    });
                }
                
                if(!insightHtml) {
                    insightHtml = '<div style="padding:16px; background:#F9FAFB; border-radius:8px; color:var(--text-muted); text-align:center;">Complete study sessions and reflections to unlock AI insights.</div>';
                }
                
                insightsEl.innerHTML = insightHtml;
            }
        }
    } catch(err) { console.error("Stats Load Error", err); }
}

function addFreeRow() {
    const container = document.getElementById('freeslots-container');
    if(!container) return;
    
    const id = `free-row-${Date.now()}`;
    const html = `
        <div class="freeslot-row" style="display: flex; gap: 16px; margin-bottom: 16px;" id="${id}">
            <div style="flex: 1;">
                <label class="input-label">Free From</label>
                <input type="time" class="input-field free-from" value="16:00">
            </div>
            <div style="flex: 1;">
                <label class="input-label">Free Until</label>
                <input type="time" class="input-field free-to" value="20:00">
            </div>
            <button class="remove-btn" onclick="removeFreeRow('${id}')">&times;</button>
        </div>
    `;
    container.insertAdjacentHTML('beforeend', html);
}
function removeFreeRow(id) {
    const el = document.getElementById(id);
    if(el) el.remove();
}

/* --- CALENDAR LOGIC --- */
let currentCalDate = new Date();
let calendarEvents = [];
let weeklyTimetable = [];

/**
 * Normalize a date string to YYYY-MM-DD on the client side.
 * Handles pandas timestamps, ISO strings, etc.
 */
function normalizeDateStr(raw) {
    if (!raw) return '';
    const s = String(raw).trim();
    // Already YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    // Timestamp like "2026-03-01 00:00:00" or ISO "2026-03-01T00:00:00"
    const isoMatch = s.match(/^(\d{4}-\d{2}-\d{2})[T\s]/);
    if (isoMatch) return isoMatch[1];
    // Try parsing via Date object as last resort
    const d = new Date(s);
    if (!isNaN(d.getTime())) {
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        return `${yyyy}-${mm}-${dd}`;
    }
    return s;
}

async function fetchCalendarData() {
    try {
        const [calRes, weekRes] = await Promise.all([
            fetch('/api/calendar'),
            fetch('/api/weekly_timetable')
        ]);
        const calData = await calRes.json();
        const weekData = await weekRes.json();
        
        if(calData.success) {
            // Normalize all event dates on the client side as a safety net
            calendarEvents = (calData.events || []).map(ev => ({
                ...ev,
                date: normalizeDateStr(ev.date),
                end_date: normalizeDateStr(ev.end_date || ev.date)
            }));
            console.log(`[Calendar] Loaded ${calendarEvents.length} events. Sample dates:`, calendarEvents.slice(0, 5).map(e => e.date + ' => ' + e.title));
        }
        if(weekData.success) weeklyTimetable = weekData.timetable;
        
        renderCalendar();
    } catch(e) {
        console.error("Failed to load calendar data", e);
    }
}

function renderCalendar() {
    const container = document.getElementById('dynamic-calendar');
    const title = document.getElementById('cal-month-title');
    if(!container) return;
    
    const year = currentCalDate.getFullYear();
    const month = currentCalDate.getMonth();
    
    title.textContent = new Date(year, month).toLocaleString('default', { month: 'long', year: 'numeric' });
    
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    
    let html = '';
    
    // Fill empty days before 1st
    for(let i = 0; i < firstDay; i++) {
        html += `<div style="min-height: 80px; padding: 8px; border: 1px solid var(--border-color); border-radius: var(--radius-sm); background: #F9FAFB;"></div>`;
    }
    
    // Fill active days
    for(let i = 1; i <= daysInMonth; i++) {
        const dateStr = `${year}-${String(month+1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
        
        // Find events on this day (match by normalized date)
        const dayEvents = calendarEvents.filter(e => {
            const evDate = e.date;
            const evEndDate = e.end_date || evDate;
            if (evEndDate && evEndDate !== evDate) {
                return dateStr >= evDate && dateStr <= evEndDate;
            }
            return evDate === dateStr;
        });
        let eventsHtml = '';
        
        // Show first 3 events, then a "+N more" badge
        const maxShow = 3;
        const shownEvents = dayEvents.slice(0, maxShow);
        const hiddenCount = dayEvents.length - maxShow;
        
        shownEvents.forEach(ev => {
            let bg = 'var(--primary-light)', color = 'var(--primary-color)';
            let icon = '📌';
            if(ev.type === 'deadline') { bg = '#FEE2E2'; color = '#EF4444'; icon = '⚠️'; }
            if(ev.type === 'exam') { bg = '#FEF3C7'; color = '#D97706'; icon = '📝'; }
            if(ev.type === 'holiday') { bg = '#D1FAE5'; color = '#059669'; icon = '🎉'; }
            
            eventsHtml += `<div onclick="openEventModal(event, '${ev.id}')" style="background:${bg}; color:${color}; font-size:0.7rem; border-radius:4px; padding:3px 4px; margin-top:3px; cursor:pointer; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; line-height:1.3;" title="${ev.title} (${ev.type})">
                ${icon} ${ev.title}
            </div>`;
        });
        
        if(hiddenCount > 0) {
            eventsHtml += `<div style="font-size:0.7rem; color:var(--primary-color); font-weight:700; margin-top:3px; cursor:pointer; text-align:center;" onclick="openDayViewModal('${dateStr}')">+${hiddenCount} more</div>`;
        }
        
        // Check weekly timetable
        const dayOfWeek = new Date(year, month, i).getDay(); // 0-6
        const weeklyEvents = weeklyTimetable.filter(w => parseInt(w.day) === dayOfWeek);
        weeklyEvents.forEach(w => {
            eventsHtml += `<div style="background:#E0E7FF; color:#4338CA; font-size:0.75rem; border-radius:4px; padding:4px; margin-top:4px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${w.start}-${w.end}">
                <span style="font-weight:700; opacity:0.8; margin-right:4px;">${w.start}</span>${w.title}
            </div>`;
        });
        
        html += `<div style="border: 1px solid var(--border-color); border-radius: var(--radius-sm); min-height: 80px; padding: 8px; text-align: left; cursor: pointer; transition: background 0.2s;" onclick="openDayViewModal('${dateStr}')" onmouseover="this.style.background='#F9FAFB'" onmouseout="this.style.background='white'">
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <span style="font-size:0.9rem; color: #4B5563; font-weight:500;">${i}</span>
                ${dayEvents.length > 0 ? '<span style="font-size:0.65rem; background:var(--primary-color); color:white; padding:1px 5px; border-radius:8px; font-weight:700;">' + dayEvents.length + '</span>' : ''}
            </div>
            ${eventsHtml}
        </div>`;
    }
    
    container.innerHTML = html;
}

function changeMonth(delta) {
    currentCalDate.setMonth(currentCalDate.getMonth() + delta);
    renderCalendar();
}

function switchCalTab(tab) {
    ['acad', 'week'].forEach(t => {
        const tabEl = document.getElementById(`tab-${t}`);
        const panelEl = document.getElementById(`panel-${t}`);
        if (tabEl) {
            tabEl.classList.toggle('active', t === tab);
            tabEl.classList.toggle('inactive', t !== tab);
        }
        if (panelEl) panelEl.style.display = t === tab ? 'block' : 'none';
    });
    if(tab === 'week') loadWeeklyForms();
}

/* EVENT MODAL LOGIC */
function openEventModal(e, eventId, dateStr = null) {
    e.stopPropagation();
    const modal = document.getElementById('event-modal');
    modal.style.display = 'flex';
    
    if(eventId) {
        const ev = calendarEvents.find(x => x.id === eventId);
        if (!ev) { console.warn('Event not found:', eventId); return; }
        document.getElementById('event-modal-title').textContent = 'Edit Event';
        document.getElementById('event-modal-id').value = ev.id;
        document.getElementById('event-modal-date').value = ev.date;
        document.getElementById('event-modal-end-date').value = ev.end_date || ev.date;
        document.getElementById('event-modal-text').value = ev.title;
        document.getElementById('event-modal-type').value = ev.type || 'event';
        document.getElementById('btn-delete-event').style.display = 'block';
    } else {
        document.getElementById('event-modal-title').textContent = 'Add Event';
        document.getElementById('event-modal-id').value = '';
        document.getElementById('event-modal-date').value = dateStr || new Date().toISOString().split('T')[0];
        document.getElementById('event-modal-end-date').value = dateStr || new Date().toISOString().split('T')[0];
        document.getElementById('event-modal-text').value = '';
        document.getElementById('event-modal-type').value = 'event';
        document.getElementById('btn-delete-event').style.display = 'none';
    }
}

function closeEventModal() {
    document.getElementById('event-modal').style.display = 'none';
}

async function saveEvent() {
    const id = document.getElementById('event-modal-id').value;
    const date = document.getElementById('event-modal-date').value;
    const end_date = document.getElementById('event-modal-end-date').value;
    const title = document.getElementById('event-modal-text').value;
    const type = document.getElementById('event-modal-type').value;
    
    if(!title || !date) return alert('Title and start date are required.');
    if(end_date && end_date < date) return alert('End date cannot be before start date.');
    
    const payload = { date, end_date: end_date || date, title, type };
    const method = id ? 'PUT' : 'POST';
    const url = id ? `/api/calendar/${id}` : `/api/calendar`;
    
    try {
        const res = await fetch(url, {
            method,
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(payload)
        });
        if(res.ok) {
            closeEventModal();
            fetchCalendarData();
        }
    } catch(e) { console.error(e); alert('Failed to save event'); }
}

async function deleteEvent() {
    const id = document.getElementById('event-modal-id').value;
    if(!id) return;
    try {
        const res = await fetch(`/api/calendar/${id}`, { method: 'DELETE' });
        if(res.ok) { closeEventModal(); fetchCalendarData(); }
    } catch(e) { console.error(e); }
}

function openDayViewModal(dateStr) {
    document.getElementById('day-modal-title').textContent = "Schedule for " + dateStr;
    document.getElementById('day-modal-date-hidden').value = dateStr;
    
    const dayEvents = calendarEvents.filter(e => {
        if (e.end_date && e.end_date !== e.date) {
            return dateStr >= e.date && dateStr <= e.end_date;
        }
        return e.date === dateStr;
    });
    
    const parts = dateStr.split('-');
    const dt = new Date(parts[0], parseInt(parts[1])-1, parts[2]);
    const dayOfWeek = dt.getDay(); // 0-6
    
    const weeklyEvents = weeklyTimetable.filter(w => parseInt(w.day) === dayOfWeek);
    
    let html = '';
    
    if(dayEvents.length === 0 && weeklyEvents.length === 0) {
       html = '<p style="color:var(--text-muted);">No events or classes on this day.</p>';
    } else {
       dayEvents.forEach(ev => {
           let typeStr = '📌 Event', borderColor = 'var(--primary-color)', bgColor = 'var(--primary-light)';
           if(ev.type === 'exam') { typeStr = '📝 Exam'; borderColor = '#D97706'; bgColor = '#FEF3C7'; }
           else if(ev.type === 'deadline') { typeStr = '⚠️ Deadline'; borderColor = '#EF4444'; bgColor = '#FEE2E2'; }
           else if(ev.type === 'holiday') { typeStr = '🎉 Holiday'; borderColor = '#059669'; bgColor = '#D1FAE5'; }
           
           html += `<div style="padding:12px; border-left:4px solid ${borderColor}; background:${bgColor}; border-radius:6px; margin-bottom:8px;">
               <div style="display:flex; justify-content:space-between; align-items:center;">
                   <div style="font-weight:600; color:#111827;">${ev.title}</div>
                   <span style="font-size:0.75rem; font-weight:600; padding:2px 8px; border-radius:12px; background:${borderColor}15; color:${borderColor};">${typeStr}</span>
               </div>
           </div>`;
       });
       
       weeklyEvents.sort((a,b) => a.start.localeCompare(b.start)).forEach(w => {
           html += `<div style="padding:12px; border-left:4px solid #4338CA; background:#F5F8FF; border-radius:4px; margin-bottom:8px;">
               <div style="font-weight:600; color:#4338CA;">${w.title}</div>
               <div style="font-size:0.85rem; color:var(--text-muted); margin-top:4px;">🕒 ${w.start} - ${w.end}</div>
           </div>`;
       });
    }
    
    document.getElementById('day-view-timeline').innerHTML = html;
    document.getElementById('day-view-modal').style.display = 'flex';
}

/* --- (Duplicate daily plan functions removed — overlay-based versions in the top section are canonical) --- */

function closeDayViewModal() {
    document.getElementById('day-view-modal').style.display = 'none';
    fetchCalendarData(); // Refresh calendar behind it in case they added an event while in day view
}

/* WEEKLY TIMETABLE LOGIC */
function loadWeeklyForms() {
    const c = document.getElementById('weekly-classes-container');
    c.innerHTML = '';
    if(weeklyTimetable.length === 0) {
        addWeeklyClassForm();
    } else {
        weeklyTimetable.forEach(w => addWeeklyClassForm(w));
    }
}

function addWeeklyClassForm(data = {}) {
    const c = document.getElementById('weekly-classes-container');
    const html = `
        <div class="weekly-row" style="display:flex; gap:12px; margin-bottom:12px; align-items:center;">
            <select class="input-field w-day" style="flex:1;">
                <option value="1" ${data.day==1?'selected':''}>Monday</option>
                <option value="2" ${data.day==2?'selected':''}>Tuesday</option>
                <option value="3" ${data.day==3?'selected':''}>Wednesday</option>
                <option value="4" ${data.day==4?'selected':''}>Thursday</option>
                <option value="5" ${data.day==5?'selected':''}>Friday</option>
                <option value="6" ${data.day==6?'selected':''}>Saturday</option>
                <option value="0" ${data.day==0?'selected':''}>Sunday</option>
            </select>
            <input type="text" class="input-field w-title" placeholder="Class Name" value="${data.title||''}" style="flex:2;">
            <input type="time" class="input-field w-start" value="${data.start||'09:00'}" style="flex:1;">
            <input type="time" class="input-field w-end" value="${data.end||'10:30'}" style="flex:1;">
            <button class="btn btn-outline" style="padding:8px" onclick="this.parentElement.remove()">X</button>
        </div>
    `;
    c.insertAdjacentHTML('beforeend', html);
}

async function saveWeeklyTimetable() {
    const rows = document.querySelectorAll('.weekly-row');
    const data = Array.from(rows).map(r => ({
        day: parseInt(r.querySelector('.w-day').value),
        title: r.querySelector('.w-title').value,
        start: r.querySelector('.w-start').value,
        end: r.querySelector('.w-end').value
    })).filter(x => x.title);
    
    try {
        const res = await fetch('/api/weekly_timetable', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(data)
        });
        if(res.ok) {
            alert("Weekly Timetable Saved!");
            fetchCalendarData();
        }
    } catch(e) { console.error(e); }
}

/* NOTIFICATIONS LOGIC */
let currentNotificationCount = -1;

async function checkNotifications() {
    try {
        const res = await fetch('/api/notifications');
        const data = await res.json();
        if(data.success && data.notifications.length > 0) {
            const container = document.getElementById('notification-container');
            if(!container) return;
            container.innerHTML = '';
            
            // Badge Update
            let shouldPlaySound = false;
            const badge = document.getElementById('notif-badge') || document.getElementById('bell-badge');
            if(badge && data.notifications.length > currentNotificationCount) {
                badge.textContent = data.notifications.length;
                badge.style.display = 'block';
                badge.classList.remove('hidden');
                shouldPlaySound = true;
            }
            currentNotificationCount = data.notifications.length;
            
            data.notifications.forEach(n => {
                const toast = document.createElement('div');
                toast.style.cssText = 'background: white; border-left: 4px solid #EF4444; padding: 16px; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); width: 320px; animation: slideInRight 0.3s ease-out; position: relative; margin-bottom: 8px;';
                
                toast.innerHTML = `
                    <div style="font-weight: 600; color: #111827;">Reminder: ${n.title}</div>
                    <div style="font-size: 0.85rem; color: #6B7280; margin-top: 4px;">Due in ${n.days_left} days | Date: ${n.date}</div>
                    <button style="position:absolute; top:8px; right:8px; background:none; border:none; font-size: 1.2rem; cursor:pointer;" onclick="dismissNotification('${n.id}', this)">&times;</button>
                `;
                container.appendChild(toast);
            });
            
            if(shouldPlaySound) {
                const notifSound = document.getElementById('notif-sound') || document.getElementById('bell-sound');
                if(notifSound) notifSound.play().catch(e=>console.log("Audio play blocked", e));
            }
        }
    } catch(e) {
        console.error("Notifications fetch failed", e);
    }
}

function dismissNotification(id, el) {
    fetch('/api/notifications/dismiss', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({id: id})
    }).then(() => {
        el.parentElement.remove();
        const badge = document.getElementById('notif-badge') || document.getElementById('bell-badge');
        if(badge) {
            let c = parseInt(badge.textContent) - 1;
            if(c <= 0) {
                badge.classList.add('hidden');
                badge.style.display = 'none';
            } else {
                badge.textContent = c;
            }
            currentNotificationCount = c;
        }
    });
}

// showNotificationDropdown is defined below (toggle version) — do not duplicate here

const style = document.createElement('style');
style.textContent = `
    @keyframes slideInRight {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
    }
`;
document.head.appendChild(style);

/* FLOATING FOCUS WIDGET LOGIC */
let focusTaskId = null;
let focusInterval = null;
let focusSeconds = 0;
let focusOriginalSeconds = 0;
let focusIsPlaying = false;

function openFocusWidget(taskId, title, durationMins) {
    focusTaskId = taskId;
    focusSeconds = durationMins * 60;
    focusOriginalSeconds = focusSeconds; // remember original for elapsed calc
    focusIsPlaying = false;
    
    document.getElementById('fw-title').textContent = title;
    updateFocusDisplay();
    document.getElementById('fw-btn-play').textContent = 'Start';
    document.getElementById('focus-widget').style.display = 'block';
    
    // Switch to study hub automatically so they can see PDFs
    switchTab('hub');
}

function closeFocusWidget() {
    document.getElementById('focus-widget').style.display = 'none';
    clearInterval(focusInterval);
    focusIsPlaying = false;
}

function updateFocusDisplay() {
    const m = Math.floor(focusSeconds / 60);
    const s = focusSeconds % 60;
    document.getElementById('fw-time').textContent = `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

function toggleFocusTimer() {
    const btn = document.getElementById('fw-btn-play');
    if(focusIsPlaying) {
        clearInterval(focusInterval);
        focusIsPlaying = false;
        btn.textContent = 'Resume';
    } else {
        focusIsPlaying = true;
        btn.textContent = 'Pause';
        focusInterval = setInterval(() => {
            if(focusSeconds > 0) {
                focusSeconds--;
                updateFocusDisplay();
            } else {
                clearInterval(focusInterval);
                alert("Focus Session Complete!");
            }
        }, 1000);
    }
}

async function completeFocusTask() {
    // Compute how many seconds have actually elapsed
    const elapsedSecs = focusOriginalSeconds - focusSeconds;
    const actualMins = Math.max(1, Math.round(elapsedSecs / 60));
    try {
        await fetch('/api/focus_session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                task_id: focusTaskId,
                duration_mins: actualMins
            })
        });
        closeFocusWidget();
        loadTasks();
    } catch(e) { console.error(e); }
}

// Drag functionality for Widget
if(typeof document !== 'undefined') {
    const fw = document.getElementById('focus-widget');
    const header = document.getElementById('fw-header');
    
    if(fw && header) {
        let isDragging = false;
        let diffX = 0, diffY = 0;
        
        header.addEventListener('mousedown', (e) => {
            isDragging = true;
            diffX = e.clientX - fw.getBoundingClientRect().left;
            diffY = e.clientY - fw.getBoundingClientRect().top;
        });
        
        document.addEventListener('mousemove', (e) => {
            if(!isDragging) return;
            fw.style.right = 'auto'; // allow dragging free
            fw.style.bottom = 'auto';
            fw.style.left = (e.clientX - diffX) + 'px';
            fw.style.top = (e.clientY - diffY) + 'px';
        });
        
        document.addEventListener('mouseup', () => { isDragging = false; });
    }
}

// Init on dashboard — notifications only (fetchCalendarData already called from DOMContentLoaded)
if(window.location.pathname.includes('dashboard')) {
    setTimeout(checkNotifications, 1000);
}

// UI Dropdowns
function showNotificationDropdown() {
    const el = document.getElementById('notification-container');
    if(el) {
        el.style.display = (el.style.display === 'none' || el.style.display === '') ? 'flex' : 'none';
        
        // Hide calendar dropdown if open
        const calDropdown = document.getElementById('calendar-dropdown');
        if(calDropdown) calDropdown.style.display = 'none';
        
        if(el.style.display === 'flex') {
            checkNotifications();
        }
    }
}

function showCalendarDropdown() {
    const el = document.getElementById('calendar-dropdown');
    if(el) {
        el.style.display = (el.style.display === 'none' || !el.style.display) ? 'block' : 'none';
        
        // Hide notification container if open
        const notifContainer = document.getElementById('notification-container');
        if(notifContainer) notifContainer.style.display = 'none';
        
        renderCalendarDeadlines();
    }
}

function renderCalendarDeadlines() {
    const list = document.getElementById('calendar-deadlines-list');
    if(!list || !window.appTasks) return;
    
    // Sort tasks by deadline
    const upcoming = window.appTasks
        .filter(t => t.status !== 'completed' && t.deadline)
        .sort((a,b) => new Date(a.deadline) - new Date(b.deadline))
        .slice(0, 5); // top 5
        
    if(upcoming.length === 0) {
        list.innerHTML = '<div style="color:var(--text-muted); font-size:0.9rem; padding: 10px 0;">No upcoming deadlines.</div>';
        return;
    }
    
    list.innerHTML = upcoming.map(t => {
        const d = new Date(t.deadline);
        const dateStr = d.toLocaleDateString(undefined, {month:'short', day:'numeric'});
        return `<div style="padding: 10px 0; border-bottom: 1px solid var(--border-color);">
            <div style="font-weight: 500; font-size: 0.95rem; color: var(--text-main); margin-bottom: 4px;">${t.title}</div>
            <div style="font-size: 0.85rem; color: var(--text-muted); display: flex; justify-content: space-between;">
                <span>${dateStr}</span> <span style="color:var(--primary-color);font-weight:600;">Due soon</span>
            </div>
        </div>`;
    }).join('');
}

// Chart.js Instance
let analysisChartInstance = null;

// loadStats and renderBarChart moved to the main async loadStats() above


// ===================================================================
// STUDY HUB — File Loading & Opening
// ===================================================================
async function loadStudyFiles() {
    const hubList = document.getElementById('hub-list');
    if(!hubList) return;

    try {
        const res = await fetch('/api/study_files');
        const data = await res.json();

        if(!data.success || !data.files || data.files.length === 0) {
            hubList.innerHTML = `
                <div style="grid-column: 1/-1; text-align:center; padding:60px 20px; color:var(--text-muted);">
                    <div style="font-size:3rem; margin-bottom:16px;">📂</div>
                    <h3 style="font-weight:600; color:#374151; margin-bottom:8px;">No study materials yet</h3>
                    <p style="font-size:0.9rem;">Upload PDFs, images, or documents from the Calendar or Task sections.</p>
                </div>
            `;
            return;
        }

        const typeIcons = {
            pdf: '📄',
            image: '🖼️',
            other: '📎'
        };
        const typeColors = {
            pdf: { bg: '#FEF2F2', border: '#FECACA', color: '#DC2626' },
            image: { bg: '#EEF2FF', border: '#C7D2FE', color: '#4F46E5' },
            other: { bg: '#F9FAFB', border: '#E5E7EB', color: '#6B7280' }
        };

        hubList.innerHTML = data.files.map(f => {
            const icon = typeIcons[f.type] || '📎';
            const colors = typeColors[f.type] || typeColors.other;
            const sizeLabel = f.size_kb > 1024 ? `${(f.size_kb/1024).toFixed(1)} MB` : `${f.size_kb} KB`;

            let openAction = '';
            if(f.type === 'pdf') {
                openAction = `onclick="window.open('${f.url}', '_blank')"`;
            } else if(f.type === 'image') {
                openAction = `onclick="openImageLightbox('${f.url}', '${f.name.replace(/'/g, "\\'")}')"`;
            } else {
                openAction = `onclick="window.open('${f.url}', '_blank')"`;
            }

            return `
                <div class="card" style="padding:0; overflow:hidden; cursor:pointer; transition:transform 0.2s, box-shadow 0.2s; border:1px solid ${colors.border};"
                     ${openAction}
                     onmouseenter="this.style.transform='translateY(-4px)'; this.style.boxShadow='0 12px 32px rgba(0,0,0,0.12)'"
                     onmouseleave="this.style.transform='none'; this.style.boxShadow='none'">
                    <div style="padding:24px 20px 16px; background:${colors.bg}; text-align:center;">
                        <span style="font-size:2.5rem;">${icon}</span>
                    </div>
                    <div style="padding:16px 20px;">
                        <h4 style="margin:0 0 6px; font-size:0.9rem; color:#1F2937; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${f.name}">${f.name}</h4>
                        <div style="display:flex; justify-content:space-between; align-items:center; font-size:0.78rem; color:#9CA3AF;">
                            <span>${sizeLabel}</span>
                            <span>${f.uploaded}</span>
                        </div>
                        <div style="margin-top:12px;">
                            <span style="display:inline-flex; align-items:center; gap:4px; padding:4px 12px; border-radius:12px; font-size:0.75rem; font-weight:600; background:${colors.bg}; color:${colors.color}; border:1px solid ${colors.border};">
                                ${f.extension.toUpperCase()} · Open ${f.type === 'pdf' ? 'in new tab' : f.type === 'image' ? 'preview' : 'file'}
                            </span>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

    } catch(e) {
        console.error('Failed to load study files:', e);
        hubList.innerHTML = '<div style="grid-column:1/-1; text-align:center; padding:40px; color:var(--text-muted);">Failed to load files.</div>';
    }
}

// Image Lightbox
function openImageLightbox(url, name) {
    let lb = document.getElementById('image-lightbox');
    if(!lb) {
        lb = document.createElement('div');
        lb.id = 'image-lightbox';
        lb.style.cssText = 'display:none; position:fixed; inset:0; z-index:99999; background:rgba(0,0,0,0.85); backdrop-filter:blur(8px); display:flex; align-items:center; justify-content:center; cursor:pointer; padding:40px;';
        lb.onclick = () => { lb.style.display = 'none'; };
        lb.innerHTML = `
            <div style="max-width:90vw; max-height:90vh; position:relative; text-align:center;">
                <img id="lightbox-img" src="" style="max-width:100%; max-height:80vh; border-radius:12px; box-shadow:0 20px 60px rgba(0,0,0,0.4); object-fit:contain;">
                <div id="lightbox-name" style="color:white; font-weight:600; margin-top:16px; font-size:0.95rem;"></div>
                <button style="position:absolute; top:-12px; right:-12px; width:36px; height:36px; border-radius:50%; background:white; border:none; font-size:1.2rem; cursor:pointer; box-shadow:0 4px 12px rgba(0,0,0,0.2);">✕</button>
            </div>
        `;
        document.body.appendChild(lb);
    }
    document.getElementById('lightbox-img').src = url;
    document.getElementById('lightbox-name').textContent = name;
    lb.style.display = 'flex';
}


// ===================================================================
// AI REVIEW MODAL SYSTEM — Calendar Events
// ===================================================================
let _calPreviewEvents = [];

function openCalReview(data) {
    _calPreviewEvents = data.events || [];
    const modal = document.getElementById('cal-review-modal');
    const body = document.getElementById('cal-review-body');
    const meta = document.getElementById('cal-review-meta');
    const notes = document.getElementById('cal-review-notes');
    const count = document.getElementById('cal-review-count');

    // Confidence badge
    const conf = data.confidence || 0;
    const confClass = conf >= 70 ? 'confidence-high' : conf >= 40 ? 'confidence-mid' : 'confidence-low';
    const confIcon = conf >= 70 ? '✅' : conf >= 40 ? '⚠️' : '❌';
    
    let metaHtml = `<span class="confidence-badge ${confClass}">${confIcon} AI Confidence: ${conf}%</span>`;
    metaHtml += `<span class="confidence-badge confidence-high">📄 ${data.total_events || _calPreviewEvents.length} events found</span>`;
    
    // Quality warnings
    if(data.quality && data.quality.source) {
        const srcLabel = data.quality.source === 'ocr' ? '📸 Image (OCR)' : '📄 PDF';
        metaHtml += `<span class="quality-badge" style="background:#F3F4F6; color:#374151;">${srcLabel}</span>`;
    }
    // Type summary badges
    if(data.type_summary) {
        const typeColors = { exam: '#D97706', deadline: '#EF4444', holiday: '#059669', event: '#4F46E5' };
        Object.entries(data.type_summary).forEach(([type, cnt]) => {
            const c = typeColors[type] || '#6B7280';
            metaHtml += `<span style="display:inline-flex;align-items:center;padding:4px 10px;border-radius:12px;font-size:0.75rem;font-weight:600;background:${c}15;color:${c};border:1px solid ${c}30;">${type}: ${cnt}</span>`;
        });
    }
    meta.innerHTML = metaHtml;
    
    // AI Notes
    if(data.ai_notes && data.ai_notes.length > 0) {
        notes.innerHTML = `🤖 <strong>AI Notes:</strong> ${data.ai_notes}`;
        notes.style.display = 'block';
    } else {
        notes.style.display = 'none';
    }
    // Quality warnings
    if(data.quality && data.quality.warnings && data.quality.warnings.length > 0) {
        let warnHtml = notes.innerHTML ? notes.innerHTML + '<br>' : '';
        data.quality.warnings.forEach(w => { warnHtml += `⚠️ ${w}<br>`; });
        notes.innerHTML = warnHtml;
        notes.style.display = 'block';
    }
    
    // Render event table rows
    body.innerHTML = _calPreviewEvents.map((ev, i) => `
        <tr data-idx="${i}">
            <td><input type="date" value="${ev.date}" onchange="_calPreviewEvents[${i}].date=this.value; _calPreviewEvents[${i}].end_date=this.value; updateCalCount()"></td>
            <td><input type="text" value="${ev.title}" onchange="_calPreviewEvents[${i}].title=this.value"></td>
            <td>
                <select onchange="_calPreviewEvents[${i}].type=this.value">
                    <option value="event" ${ev.type==='event'?'selected':''}>Event</option>
                    <option value="exam" ${ev.type==='exam'?'selected':''}>Exam</option>
                    <option value="deadline" ${ev.type==='deadline'?'selected':''}>Deadline</option>
                    <option value="holiday" ${ev.type==='holiday'?'selected':''}>Holiday</option>
                </select>
            </td>
            <td style="text-align:center;"><button class="review-delete-btn" onclick="deleteCalRow(${i})">🗑</button></td>
        </tr>
    `).join('');
    
    updateCalCount();
    modal.style.display = 'block';
    document.body.style.overflow = 'hidden';
}

function updateCalCount() {
    const valid = _calPreviewEvents.filter(e => e && e.title);
    document.getElementById('cal-review-count').textContent = `${valid.length} events ready to save`;
}

function deleteCalRow(idx) {
    _calPreviewEvents.splice(idx, 1);
    // Re-render
    const data = { events: _calPreviewEvents, confidence: 0, ai_notes: '', quality: {}, type_summary: {} };
    const body = document.getElementById('cal-review-body');
    body.innerHTML = _calPreviewEvents.map((ev, i) => `
        <tr data-idx="${i}">
            <td><input type="date" value="${ev.date}" onchange="_calPreviewEvents[${i}].date=this.value; _calPreviewEvents[${i}].end_date=this.value; updateCalCount()"></td>
            <td><input type="text" value="${ev.title}" onchange="_calPreviewEvents[${i}].title=this.value"></td>
            <td>
                <select onchange="_calPreviewEvents[${i}].type=this.value">
                    <option value="event" ${ev.type==='event'?'selected':''}>Event</option>
                    <option value="exam" ${ev.type==='exam'?'selected':''}>Exam</option>
                    <option value="deadline" ${ev.type==='deadline'?'selected':''}>Deadline</option>
                    <option value="holiday" ${ev.type==='holiday'?'selected':''}>Holiday</option>
                </select>
            </td>
            <td style="text-align:center;"><button class="review-delete-btn" onclick="deleteCalRow(${i})">🗑</button></td>
        </tr>
    `).join('');
    updateCalCount();
}

function closeCalReview() {
    document.getElementById('cal-review-modal').style.display = 'none';
    document.body.style.overflow = '';
    _calPreviewEvents = [];
}

async function confirmCalEvents() {
    const btn = document.getElementById('cal-confirm-btn');
    btn.textContent = '⏳ Saving...';
    btn.disabled = true;
    
    // Read current values from the table inputs
    const rows = document.querySelectorAll('#cal-review-body tr');
    const events = [];
    rows.forEach((row, i) => {
        const inputs = row.querySelectorAll('input, select');
        if(inputs.length >= 3) {
            events.push({
                date: inputs[0].value,
                end_date: inputs[0].value,
                title: inputs[1].value,
                type: inputs[2].value,
                description: _calPreviewEvents[i]?.description || ''
            });
        }
    });
    
    try {
        const res = await fetch('/api/confirm_calendar_events', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ events })
        });
        const data = await res.json();
        if(data.success) {
            closeCalReview();
            showToast(`✅ ${data.saved_count} events saved to calendar!`, 'success');
            
            // Navigate to first event month
            if(events.length > 0 && events[0].date) {
                const parts = events[0].date.split('-');
                currentCalDate = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, 1);
            }
            fetchCalendarData();
            showExtractionSummary({ events, total_events: events.length });
        } else {
            showToast('Error saving: ' + (data.error || 'Unknown'), 'error');
        }
    } catch(e) {
        showToast('Network error while saving events.', 'error');
    } finally {
        btn.textContent = '✓ Confirm & Save';
        btn.disabled = false;
    }
}


// ===================================================================
// AI REVIEW MODAL SYSTEM — Weekly Timetable
// ===================================================================
let _ttPreviewClasses = [];

function openTTReview(data) {
    _ttPreviewClasses = data.timetable || [];
    const modal = document.getElementById('tt-review-modal');
    const body = document.getElementById('tt-review-body');
    const meta = document.getElementById('tt-review-meta');
    const notes = document.getElementById('tt-review-notes');
    
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    
    // Confidence badge
    const conf = data.confidence || 0;
    const confClass = conf >= 70 ? 'confidence-high' : conf >= 40 ? 'confidence-mid' : 'confidence-low';
    const confIcon = conf >= 70 ? '✅' : conf >= 40 ? '⚠️' : '❌';
    
    let metaHtml = `<span class="confidence-badge ${confClass}">${confIcon} AI Confidence: ${conf}%</span>`;
    metaHtml += `<span class="confidence-badge confidence-high">📅 ${data.total_classes || _ttPreviewClasses.length} classes found</span>`;
    
    if(data.quality && data.quality.source) {
        const srcLabel = data.quality.source === 'ocr' ? '📸 Image (OCR)' : '📄 PDF';
        metaHtml += `<span class="quality-badge" style="background:#F3F4F6; color:#374151;">${srcLabel}</span>`;
    }
    
    // Day distribution
    const dayDist = {};
    _ttPreviewClasses.forEach(c => {
        const dn = dayNames[c.day] || 'Unknown';
        dayDist[dn] = (dayDist[dn] || 0) + 1;
    });
    Object.entries(dayDist).forEach(([day, cnt]) => {
        metaHtml += `<span style="display:inline-flex;align-items:center;padding:4px 10px;border-radius:12px;font-size:0.75rem;font-weight:600;background:#EEF2FF;color:#4F46E5;border:1px solid #C7D2FE;">${day}: ${cnt}</span>`;
    });
    meta.innerHTML = metaHtml;
    
    if(data.ai_notes && data.ai_notes.length > 0) {
        notes.innerHTML = `🤖 <strong>AI Notes:</strong> ${data.ai_notes}`;
        notes.style.display = 'block';
    } else {
        notes.style.display = 'none';
    }
    if(data.quality && data.quality.warnings && data.quality.warnings.length > 0) {
        let warnHtml = notes.innerHTML ? notes.innerHTML + '<br>' : '';
        data.quality.warnings.forEach(w => { warnHtml += `⚠️ ${w}<br>`; });
        notes.innerHTML = warnHtml;
        notes.style.display = 'block';
    }
    
    renderTTReviewRows();
    modal.style.display = 'block';
    document.body.style.overflow = 'hidden';
}

function renderTTReviewRows() {
    const body = document.getElementById('tt-review-body');
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    
    body.innerHTML = _ttPreviewClasses.map((cls, i) => `
        <tr data-idx="${i}">
            <td>
                <select onchange="_ttPreviewClasses[${i}].day=parseInt(this.value)">
                    ${dayNames.map((d, di) => `<option value="${di}" ${cls.day===di?'selected':''}>${d}</option>`).join('')}
                </select>
            </td>
            <td><input type="text" value="${cls.title}" onchange="_ttPreviewClasses[${i}].title=this.value"></td>
            <td><input type="time" value="${cls.start}" onchange="_ttPreviewClasses[${i}].start=this.value"></td>
            <td><input type="time" value="${cls.end}" onchange="_ttPreviewClasses[${i}].end=this.value"></td>
            <td style="text-align:center;"><button class="review-delete-btn" onclick="deleteTTRow(${i})">🗑</button></td>
        </tr>
    `).join('');
    
    document.getElementById('tt-review-count').textContent = `${_ttPreviewClasses.length} classes ready to save`;
}

function deleteTTRow(idx) {
    _ttPreviewClasses.splice(idx, 1);
    renderTTReviewRows();
}

function closeTTReview() {
    document.getElementById('tt-review-modal').style.display = 'none';
    document.body.style.overflow = '';
    _ttPreviewClasses = [];
}

async function confirmTTClasses() {
    const btn = document.getElementById('tt-confirm-btn');
    btn.textContent = '⏳ Saving...';
    btn.disabled = true;
    
    // Read current values from the table inputs
    const rows = document.querySelectorAll('#tt-review-body tr');
    const timetable = [];
    rows.forEach((row, i) => {
        const inputs = row.querySelectorAll('input, select');
        if(inputs.length >= 4) {
            timetable.push({
                day: parseInt(inputs[0].value),
                title: inputs[1].value,
                start: inputs[2].value,
                end: inputs[3].value
            });
        }
    });
    
    try {
        const res = await fetch('/api/confirm_weekly_timetable', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ timetable })
        });
        const data = await res.json();
        if(data.success) {
            closeTTReview();
            showToast(`✅ ${data.saved_count} classes saved to timetable!`, 'success');
            
            // Update the weekly timetable display
            const container = document.getElementById('weekly-classes-container');
            if(container) container.innerHTML = '';
            weeklyTimetable = timetable;
            timetable.forEach(w => addWeeklyClassForm(w));
        } else {
            showToast('Error saving: ' + (data.error || 'Unknown'), 'error');
        }
    } catch(e) {
        showToast('Network error while saving timetable.', 'error');
    } finally {
        btn.textContent = '✓ Confirm & Save';
        btn.disabled = false;
    }
}


// ===================================================================
// CALENDAR SEARCH SYSTEM
// ===================================================================
let _calSearchTimeout = null;

function handleCalendarSearch(query) {
    const clearBtn = document.getElementById('cal-search-clear');
    const resultsEl = document.getElementById('cal-search-results');
    
    if (!query || query.trim().length === 0) {
        clearCalendarSearch();
        return;
    }
    
    clearBtn.style.display = 'flex';
    
    // Debounce — wait 300ms after typing stops
    clearTimeout(_calSearchTimeout);
    _calSearchTimeout = setTimeout(async () => {
        const q = query.trim();
        if (q.length < 2) return;
        
        // First, try local search for instant results
        const localResults = searchCalendarLocal(q);
        renderSearchResults(localResults, q);
        
        // Then hit the API for more accurate/fuzzy results
        try {
            const res = await fetch(`/api/calendar_search?q=${encodeURIComponent(q)}`);
            const data = await res.json();
            if (data.success) {
                // Merge: prefer API results but add any local-only ones
                const apiIds = new Set(data.results.map(r => r.id));
                const merged = [...data.results];
                localResults.forEach(lr => {
                    if (!apiIds.has(lr.id)) merged.push(lr);
                });
                renderSearchResults(merged, q);
            }
        } catch(e) {
            // Fallback: just use local results already shown
            console.error('Calendar search API error:', e);
        }
    }, 300);
}

function searchCalendarLocal(query) {
    const q = query.toLowerCase();
    const results = [];
    
    calendarEvents.forEach(ev => {
        const title = (ev.title || '').toLowerCase();
        const type = (ev.type || '').toLowerCase();
        const desc = (ev.description || '').toLowerCase();
        const date = (ev.date || '').toLowerCase();
        
        let score = 0;
        if (title.includes(q)) score += 10;
        if (type.includes(q)) score += 5;
        if (desc.includes(q)) score += 3;
        if (date.includes(q)) score += 4;
        
        // Month name matching
        const months = {
            'jan':'01','january':'01','feb':'02','february':'02','mar':'03','march':'03',
            'apr':'04','april':'04','may':'05','jun':'06','june':'06','jul':'07','july':'07',
            'aug':'08','august':'08','sep':'09','sept':'09','september':'09',
            'oct':'10','october':'10','nov':'11','november':'11','dec':'12','december':'12'
        };
        for (const [mname, mnum] of Object.entries(months)) {
            if (q.includes(mname) && date.includes(`-${mnum}-`)) score += 8;
        }
        
        if (score > 0) {
            results.push({ ...ev, _score: score });
        }
    });
    
    results.sort((a, b) => b._score - a._score || (a.date || '').localeCompare(b.date || ''));
    return results;
}

function renderSearchResults(results, query) {
    const container = document.getElementById('cal-search-results');
    if (!container) return;
    
    if (results.length === 0) {
        container.innerHTML = `
            <div class="cal-search-no-results">
                <div style="font-size:2.5rem; margin-bottom:12px;">🔍</div>
                <h4 style="color:#374151; margin-bottom:4px;">No events found</h4>
                <p style="font-size:0.85rem;">Try searching for "exam", "holiday", a month name, or an event title.</p>
            </div>
        `;
        container.style.display = 'block';
        return;
    }
    
    const typeConfig = {
        exam: { icon: '📝', bg: '#FEF3C7', border: '#FDE68A', color: '#92400E' },
        deadline: { icon: '⚠️', bg: '#FEE2E2', border: '#FECACA', color: '#991B1B' },
        holiday: { icon: '🎉', bg: '#D1FAE5', border: '#A7F3D0', color: '#065F46' },
        event: { icon: '📌', bg: '#EEF2FF', border: '#C7D2FE', color: '#3730A3' }
    };
    
    const q = query.toLowerCase();
    
    let html = `<div style="padding:12px 20px; border-bottom:1px solid #F3F4F6; display:flex; justify-content:space-between; align-items:center;">
        <span style="font-size:0.85rem; font-weight:600; color:#374151;">${results.length} result${results.length!==1?'s':''} found</span>
        <span style="font-size:0.78rem; color:var(--text-muted);">Click to navigate</span>
    </div>`;
    
    results.slice(0, 20).forEach(ev => {
        const cfg = typeConfig[ev.type] || typeConfig.event;
        
        // Highlight matching text
        let title = ev.title || 'Event';
        const titleLower = title.toLowerCase();
        const idx = titleLower.indexOf(q);
        if (idx >= 0) {
            title = title.substring(0, idx) + 
                    `<span class="cal-search-highlight">${title.substring(idx, idx + q.length)}</span>` + 
                    title.substring(idx + q.length);
        }
        
        // Format date nicely
        let dateDisplay = ev.date || '';
        try {
            const d = new Date(ev.date + 'T00:00:00');
            dateDisplay = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
        } catch(e) {}
        
        html += `
            <div class="cal-search-result-item" onclick="navigateToCalendarDate('${ev.date}')">
                <div class="cal-search-result-icon" style="background:${cfg.bg}; border:1px solid ${cfg.border};">
                    ${cfg.icon}
                </div>
                <div class="cal-search-result-info">
                    <div class="cal-search-result-title">${title}</div>
                    <div class="cal-search-result-meta">
                        <span>${dateDisplay}</span>
                        <span style="padding:2px 8px; border-radius:8px; font-size:0.72rem; font-weight:600; background:${cfg.bg}; color:${cfg.color}; border:1px solid ${cfg.border};">${(ev.type || 'event').charAt(0).toUpperCase() + (ev.type || 'event').slice(1)}</span>
                    </div>
                </div>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" stroke-width="2" style="flex-shrink:0;"><polyline points="9 18 15 12 9 6"></polyline></svg>
            </div>
        `;
    });
    
    container.innerHTML = html;
    container.style.display = 'block';
}

function navigateToCalendarDate(dateStr) {
    if (!dateStr) return;
    const parts = dateStr.split('-');
    if (parts.length === 3) {
        currentCalDate = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, 1);
        renderCalendar();
        // Close search
        clearCalendarSearch();
        // Open day view modal
        setTimeout(() => openDayViewModal(dateStr), 300);
    }
}

function clearCalendarSearch() {
    const input = document.getElementById('cal-search-input');
    const clearBtn = document.getElementById('cal-search-clear');
    const results = document.getElementById('cal-search-results');
    
    if (input) input.value = '';
    if (clearBtn) clearBtn.style.display = 'none';
    if (results) { results.style.display = 'none'; results.innerHTML = ''; }
}


// ===================================================================
// AI CALENDAR CHAT SYSTEM
// ===================================================================
let _calChatHistory = [];
let _calChatOpen = false;

function toggleCalendarChat() {
    const drawer = document.getElementById('cal-chat-drawer');
    const backdrop = document.getElementById('cal-chat-backdrop');
    
    if (!drawer) return;
    
    _calChatOpen = !_calChatOpen;
    
    if (_calChatOpen) {
        drawer.classList.add('open');
        if (backdrop) backdrop.classList.add('active');
        document.body.style.overflow = 'hidden';
        
        // Focus input
        setTimeout(() => {
            const input = document.getElementById('cal-chat-input');
            if (input) input.focus();
        }, 400);
        
        // Update status with event count
        const status = document.getElementById('cal-chat-status');
        if (status) {
            const count = calendarEvents.length;
            status.textContent = count > 0 
                ? `${count} events loaded • Ready to chat` 
                : 'Upload a calendar to get started';
        }
    } else {
        drawer.classList.remove('open');
        if (backdrop) backdrop.classList.remove('active');
        document.body.style.overflow = '';
    }
}

function sendQuickQuestion(question) {
    const input = document.getElementById('cal-chat-input');
    if (input) input.value = question;
    sendCalendarChat();
}

async function sendCalendarChat() {
    const input = document.getElementById('cal-chat-input');
    const sendBtn = document.getElementById('cal-chat-send-btn');
    const messagesEl = document.getElementById('cal-chat-messages');
    const quickActions = document.getElementById('cal-chat-quick-actions');
    
    if (!input || !messagesEl) return;
    
    const message = input.value.trim();
    if (!message) return;
    
    // Clear welcome message on first send
    const welcome = messagesEl.querySelector('.cal-chat-welcome');
    if (welcome) welcome.remove();
    
    // Hide quick actions after first message
    if (quickActions && _calChatHistory.length === 0) {
        quickActions.style.display = 'none';
    }
    
    // Add user message to UI
    const now = new Date();
    const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    
    messagesEl.innerHTML += `
        <div class="cal-chat-msg user">
            <div class="cal-chat-bubble">${escapeHtml(message)}</div>
            <div class="cal-chat-msg-time">${timeStr}</div>
        </div>
    `;
    
    // Add to history
    _calChatHistory.push({ role: 'user', content: message });
    
    // Clear input
    input.value = '';
    
    // Disable send button
    if (sendBtn) sendBtn.disabled = true;
    
    // Show typing indicator
    const typingId = 'typing-' + Date.now();
    messagesEl.innerHTML += `
        <div class="cal-chat-msg ai" id="${typingId}">
            <div class="cal-chat-typing">
                <div class="cal-chat-typing-dot"></div>
                <div class="cal-chat-typing-dot"></div>
                <div class="cal-chat-typing-dot"></div>
            </div>
        </div>
    `;
    
    // Scroll to bottom
    messagesEl.scrollTop = messagesEl.scrollHeight;
    
    // Update status
    const status = document.getElementById('cal-chat-status');
    if (status) status.textContent = 'Thinking...';
    
    try {
        const res = await fetch('/api/calendar_chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message: message,
                history: _calChatHistory.slice(-10) // Send last 10 messages for context
            })
        });
        
        const data = await res.json();
        
        // Remove typing indicator
        const typingEl = document.getElementById(typingId);
        if (typingEl) typingEl.remove();
        
        if (data.success && data.response) {
            // Format AI response (basic markdown-like formatting)
            const formatted = formatAIResponse(data.response);
            
            messagesEl.innerHTML += `
                <div class="cal-chat-msg ai">
                    <div class="cal-chat-bubble">${formatted}</div>
                    <div class="cal-chat-msg-time">Clarity AI • ${timeStr}</div>
                </div>
            `;
            
            // Add to history
            _calChatHistory.push({ role: 'assistant', content: data.response });
            
            if (status) {
                status.textContent = `${data.events_count || calendarEvents.length} events loaded • Ready to chat`;
            }
        } else {
            // Error response
            const errMsg = data.error || 'Something went wrong. Please try again.';
            messagesEl.innerHTML += `
                <div class="cal-chat-msg ai">
                    <div class="cal-chat-bubble" style="background:#FEE2E2; color:#991B1B;">
                        ⚠️ ${escapeHtml(errMsg)}
                    </div>
                </div>
            `;
            if (status) status.textContent = 'Error — please try again';
        }
    } catch(e) {
        console.error('Calendar chat error:', e);
        
        // Remove typing indicator
        const typingEl = document.getElementById(typingId);
        if (typingEl) typingEl.remove();
        
        messagesEl.innerHTML += `
            <div class="cal-chat-msg ai">
                <div class="cal-chat-bubble" style="background:#FEE2E2; color:#991B1B;">
                    ⚠️ Network error. Please check your connection and try again.
                </div>
            </div>
        `;
        if (status) status.textContent = 'Connection error';
    } finally {
        if (sendBtn) sendBtn.disabled = false;
        messagesEl.scrollTop = messagesEl.scrollHeight;
        input.focus();
    }
}

function formatAIResponse(text) {
    // Basic markdown-like formatting for AI responses
    let html = escapeHtml(text);
    
    // Bold: **text** or __text__
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/__(.*?)__/g, '<strong>$1</strong>');
    
    // Italic: *text* or _text_
    html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
    
    // Bullet points: lines starting with - or •
    html = html.replace(/^[-•]\s+(.+)$/gm, '<span style="display:block; padding-left:12px; margin:2px 0;">• $1</span>');
    
    // Numbered lists: lines starting with 1. 2. etc
    html = html.replace(/^(\d+)\.\s+(.+)$/gm, '<span style="display:block; padding-left:12px; margin:2px 0;"><strong>$1.</strong> $2</span>');
    
    // Emoji dates (📅 formatting)
    html = html.replace(/(📅|📝|🎉|⚠️|🕐|✅|❌|🔴|🟡|🟢)/g, '<span style="font-size:1.1em;">$1</span>');
    
    // Line breaks
    html = html.replace(/\n/g, '<br>');
    
    return html;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
