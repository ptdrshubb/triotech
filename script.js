// --- Global Selectors and Constants ---
const mainContainer = document.getElementById('main-container');
const loginForm = document.getElementById('login-form');
const signupForm = document.getElementById('signup-form');
const resetForm = document.getElementById('reset-form');
const dashboard = document.getElementById('medicine-dashboard');
const editPillForm = document.getElementById('edit-pill-form');
const pillDetailsTab = document.getElementById('tab-details');

const showSignupBtn = document.getElementById('show-signup');
const showLoginBtn = document.getElementById('show-login');
const showResetBtn = document.getElementById('show-reset');
const showLoginFromResetBtn = document.getElementById('show-login-from-reset');
const logoutBtn = document.getElementById('logout-btn');
const cancelEditBtn = document.getElementById('cancel-edit-btn');

// Reminder Pop-up variables removed

const loginError = document.getElementById('login-error');
const signupError = document.getElementById('signup-error');
const resetError = document.getElementById('reset-error');

let reminderInterval;
let currentUser = null; // Track currently logged-in user
let shownNotifications = {}; // Track shown notifications to avoid duplicates

// --- Utility Functions ---

function getPills() {
    if (!currentUser) return [];
    try {
        const key = `alchemistPills_${currentUser}`;
        return JSON.parse(localStorage.getItem(key)) || [];
    } catch (e) {
        console.error("Error loading pills from storage:", e);
        return [];
    }
}

function savePills(pills) {
    if (!currentUser) return;
    const key = `alchemistPills_${currentUser}`;
    localStorage.setItem(key, JSON.stringify(pills));
}

// --- User Authentication Storage ---
function getUsers() {
    try {
        return JSON.parse(localStorage.getItem('alchemistUsers')) || {};
    } catch (e) {
        console.error("Error loading users from storage:", e);
        return {};
    }
}

function saveUsers(users) {
    localStorage.setItem('alchemistUsers', JSON.stringify(users));
}

function userExists(username) {
    const users = getUsers();
    return users.hasOwnProperty(username);
}

function validateUserCredentials(username, password) {
    const users = getUsers();
    return users[username] && users[username].password === password;
}

function createUser(username, password, name, email, phone) {
    const users = getUsers();
    if (users.hasOwnProperty(username)) {
        return false; // User already exists
    }
    users[username] = {
        password: password,
        name: name,
        email: email,
        phone: phone,
        createdAt: new Date().toISOString()
    };
    saveUsers(users);
    return true;
}

function generateUniqueId() {
    return Date.now().toString(36) + Math.random().toString(36).substring(2);
}

/**
 * Converts 12-hour format (hour, minute, period) to 24-hour format (HH:MM)
 */
function convert12to24(hour, minute, period) {
    let h = parseInt(hour);
    const m = minute;
    
    if (period === 'AM') {
        if (h === 12) h = 0;
    } else if (period === 'PM') {
        if (h !== 12) h += 12;
    }
    
    return `${String(h).padStart(2, '0')}:${m}`;
}

/**
 * Converts 24-hour format (HH:MM) to 12-hour format with period
 * Returns { hour, minute, period }
 */
function convert24to12(time24) {
    const [hours, minutes] = time24.split(':').map(Number);
    let h = hours;
    let period = 'AM';
    
    if (hours === 0) {
        h = 12; // 00:xx = 12 AM
    } else if (hours >= 12) {
        period = 'PM';
        if (hours > 12) h = hours - 12; // 13-23 = 1-11 PM
    }
    
    return {
        hour: String(h),
        minute: String(minutes).padStart(2, '0'),
        period: period
    };
}

/**
 * Converts a 24-hour time string (HH:MM) to 12-hour format (h:mm AM/PM).
 */
function formatTime12h(time24) {
    const [hours, minutes] = time24.split(':').map(Number);
    const period = hours >= 12 ? 'PM' : 'AM';
    const h = hours % 12 || 12; // Convert 0 to 12
    const m = String(minutes).padStart(2, '0');
    return `${h}:${m} ${period}`;
}

/**
 * Validates time is between 7 AM (07:00) and 12 AM (23:00)
 */
function isValidDoseTime(hour, minute, period) {
    const time24 = convert12to24(hour, minute, period);
    const [h, m] = time24.split(':').map(Number);
    const totalMinutes = h * 60 + m;
    const minMinutes = 7 * 60; // 7 AM
    const maxMinutes = 23 * 60 + 59; // 11:59 PM (before midnight)
    
    return totalMinutes >= minMinutes && totalMinutes <= maxMinutes;
}

/**
 * Calculates the specific time for a given dose slot (index) based on first dose time and frequency.
 * This still relies on 24-hour HH:MM format, which the <input type="time"> provides to JS.
 */
function calculateDoseTime(startTime, dosesPerDay, doseIndex) {
    const [startHour, startMinute] = startTime.split(':').map(Number);

    if (dosesPerDay <= 1) {
        return startTime;
    }

    // Calculate the interval in minutes between doses
    const intervalMinutesFloat = (12 * 60) / dosesPerDay;
    const intervalMinutes = Math.round(intervalMinutesFloat);

    // Calculate the total minutes offset from the start time
    let offsetMinutes = doseIndex * intervalMinutes;

    // Start time in minutes from midnight
    let currentMinutes = startHour * 60 + startMinute;

    // Add the offset
    currentMinutes = currentMinutes + offsetMinutes;
    
    // Normalize back to 24-hour cycle
    let finalHour = Math.floor(currentMinutes / 60) % 24;
    let finalMinute = currentMinutes % 60;
    
    // Format back to HH:MM string
    return `${String(finalHour).padStart(2, '0')}:${String(finalMinute).padStart(2, '0')}`;
}


// --- Core UI Logic ---

function switchView(view) {
    loginForm.classList.remove('active');
    signupForm.classList.remove('active');
    resetForm.classList.remove('active');
    dashboard.classList.remove('active');
    mainContainer.style.width = '350px'; // Reset width

    let title = "Alchemist's Grimoire";

    if (view === 'signup') {
        signupForm.classList.add('active');
        title = "Create Your Grimoire";
    } else if (view === 'reset') {
        resetForm.classList.add('active');
        title = "Recover The Formula";
    } else if (view === 'dashboard') {
        dashboard.classList.add('active');
        mainContainer.style.width = '90%'; // Set dashboard width
        mainContainer.style.maxWidth = '1200px';
        title = "Medicine Dashboard";
        // Render the dashboard content and tabs
        renderDashboardContent(document.querySelector('.tab-button.active')?.dataset.tab || 'details'); 
        startReminderCheck(); // START checking reminders when logged in
    } else { // 'login'
        loginForm.classList.add('active');
        title = "Alchemist's Grimoire";
        stopReminderCheck(); // STOP checking reminders when logged out
        currentUser = null; // Clear current user on logout
    }
    document.querySelector('.grimoire-container h2').textContent = title;
}

function startReminderCheck() {
    if (reminderInterval) clearInterval(reminderInterval);
    // Check reminders every 10 seconds (for demo purposes)
    reminderInterval = setInterval(checkReminders, 10000); 
    checkReminders(); // Run once immediately
}

function stopReminderCheck() {
    if (reminderInterval) clearInterval(reminderInterval);
    shownNotifications = {}; // Clear notifications on logout
}

// --- Notification System ---
function showNotification(pill, doseIndex, dueTime) {
    const notificationKey = `${pill.id}_${doseIndex}_${new Date().toISOString().split('T')[0]}`;
    
    // Check if already shown today
    if (shownNotifications[notificationKey]) {
        return;
    }

    // Mark as shown
    shownNotifications[notificationKey] = true;

    // Update notification content
    document.getElementById('notification-medicine-name').textContent = pill.name;
    document.getElementById('notification-dose-info').textContent = `Dosage: ${pill.dosage} at ${formatTime12h(dueTime)}`;

    // Store current notification context
    window.currentNotificationContext = { pillId: pill.id, doseIndex: doseIndex };

    // Show overlay
    document.getElementById('notification-overlay').classList.add('active');
}

function hideNotification() {
    document.getElementById('notification-overlay').classList.remove('active');
    window.currentNotificationContext = null;
}

function timeComparison(timeStr1, timeStr2) {
    // Returns: 1 if time1 > time2, -1 if time1 < time2, 0 if equal
    const [h1, m1] = timeStr1.split(':').map(Number);
    const [h2, m2] = timeStr2.split(':').map(Number);
    const totalMin1 = h1 * 60 + m1;
    const totalMin2 = h2 * 60 + m2;
    if (totalMin1 > totalMin2) return 1;
    if (totalMin1 < totalMin2) return -1;
    return 0;
}

function getCurrentTime() {
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
}

// --- Dashboard Tab Logic ---

document.querySelectorAll('.tab-button').forEach(button => {
    button.addEventListener('click', (e) => {
        const tabId = e.target.dataset.tab;
        renderDashboardContent(tabId);
    });
});

function renderDashboardContent(tabId) {
    // Update Tab buttons
    document.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
    document.querySelector(`.tab-button[data-tab="${tabId}"]`).classList.add('active');

    // Update Tab panes
    document.querySelectorAll('.tab-pane').forEach(pane => pane.classList.remove('active'));
    document.getElementById(`tab-${tabId}`).classList.add('active');
    
    // Render specific content
    if (tabId === 'details') renderPillDetails();
    if (tabId === 'reminder') renderReminderList();
    if (tabId === 'taken') renderLogList('taken');
    if (tabId === 'missed') renderLogList('missed');
    if (tabId === 'chart') renderChart();
}

// --- Pill Details Rendering and Management (CRUD) ---

function renderPillDetails() {
    editPillForm.style.display = 'none';
    pillDetailsTab.classList.remove('edit-active');

    const pillsListElement = document.getElementById('pills-list');
    const pills = getPills();
    
    if (pills.length === 0) {
        pillsListElement.innerHTML = '<p>No pills added yet. Use the form above.</p>';
        return;
    }

    pillsListElement.innerHTML = pills.map(pill => `
        <div class="pill-item" data-id="${pill.id}">
            <div class="pill-details">
                <strong>${pill.name}</strong>
                <span>Dosage: ${pill.dosage}</span>
                <span>Doses Per Day: ${pill.frequency}</span>
                <span>First Dose Time: ${formatTime12h(pill.time)} (${pill.time})</span>
            </div>
            <div class="item-actions">
                <button class="btn-primary btn-edit" data-id="${pill.id}">Edit</button>
                <button class="btn-secondary btn-delete" data-id="${pill.id}">Delete</button>
            </div>
        </div>
    `).join('');

    pillsListElement.querySelectorAll('.btn-delete').forEach(button => {
        button.addEventListener('click', handleDeletePill);
    });
    pillsListElement.querySelectorAll('.btn-edit').forEach(button => {
        button.addEventListener('click', handleEditPill);
    });
}

function handleDeletePill(e) {
    const pillId = e.target.dataset.id;
    if (confirm("Are you sure you want to delete this pill? All log history will be removed.")) {
        let pills = getPills();
        pills = pills.filter(p => p.id !== pillId);
        savePills(pills);
        renderDashboardContent('details'); // Re-render the details tab
    }
}

function handleEditPill(e) {
    const pillId = e.target.dataset.id;
    const pills = getPills();
    const pillToEdit = pills.find(p => p.id === pillId);

    if (pillToEdit) {
        document.getElementById('edit-pill-id').value = pillToEdit.id;
        document.getElementById('edit-pill-name').value = pillToEdit.name;
        document.getElementById('edit-pill-dosage').value = pillToEdit.dosage;
        
        // Convert stored 24-hour time to 12-hour format
        const timeObj = convert24to12(pillToEdit.time);
        document.getElementById('edit-pill-hour').value = timeObj.hour;
        document.getElementById('edit-pill-minute').value = timeObj.minute;
        document.getElementById('edit-pill-period').value = timeObj.period;
        
        document.getElementById('edit-pill-frequency').value = pillToEdit.frequency;

        editPillForm.style.display = 'block';
        pillDetailsTab.classList.add('edit-active');
    }
}

function saveEditedPill(e) {
    e.preventDefault();
    const pillId = document.getElementById('edit-pill-id').value;
    const name = document.getElementById('edit-pill-name').value;
    const dosage = document.getElementById('edit-pill-dosage').value;
    const hour = document.getElementById('edit-pill-hour').value;
    const minute = document.getElementById('edit-pill-minute').value;
    const period = document.getElementById('edit-pill-period').value;
    const frequency = parseInt(document.getElementById('edit-pill-frequency').value);

    // Validate selections
    if (!hour || !minute || !period) {
        alert('Please select a valid time (Hour, Minute, AM/PM).');
        return;
    }
    
    // Validate time is between 7 AM and 12 AM
    if (!isValidDoseTime(hour, minute, period)) {
        alert('Dose time must be between 7 AM and 11:59 PM (before midnight). After midnight you should be sleeping!');
        return;
    }

    // Convert 12-hour format to 24-hour format for storage
    const time24 = convert12to24(hour, minute, period);

    let pills = getPills();
    const pillIndex = pills.findIndex(p => p.id === pillId);

    if (pillIndex > -1) {
        pills[pillIndex].name = name;
        pills[pillIndex].dosage = dosage;
        pills[pillIndex].time = time24;
        pills[pillIndex].frequency = frequency;

        savePills(pills);
        alert(`Pill "${name}" details saved!`);
        
        renderDashboardContent('details'); // Re-render the details tab
        checkReminders(); // Update reminder state
    } else {
        alert("Error: Pill not found.");
    }
}

// Add Pill Handler
document.getElementById('add-pill-form').addEventListener('submit', function(e) {
    e.preventDefault();
    const name = document.getElementById('pill-name').value;
    const dosage = document.getElementById('pill-dosage').value;
    const hour = document.getElementById('pill-hour').value;
    const minute = document.getElementById('pill-minute').value;
    const period = document.getElementById('pill-period').value;
    const frequency = document.getElementById('pill-frequency').value;
    
    // Validate selections
    if (!hour || !minute || !period) {
        alert('Please select a valid time (Hour, Minute, AM/PM).');
        return;
    }
    
    // Validate time is between 7 AM and 12 AM
    if (!isValidDoseTime(hour, minute, period)) {
        alert('Dose time must be between 7 AM and 11:59 PM (before midnight). After midnight you should be sleeping!');
        return;
    }
    
    // Convert 12-hour format to 24-hour format for storage
    const time24 = convert12to24(hour, minute, period);
    
    let pills = getPills();
    
    const newPill = {
        id: generateUniqueId(),
        name,
        dosage,
        time: time24,
        frequency: parseInt(frequency),
        log: []
    };

    pills.push(newPill);
    savePills(pills);
    
    // Clear form
    e.target.reset();
    document.getElementById('pill-hour').value = '';
    document.getElementById('pill-minute').value = '';
    document.getElementById('pill-period').value = '';
    
    renderDashboardContent('details');
});


// --- Log (Taken/Missed) Rendering ---

function renderLogList(type) {
    const listElement = document.getElementById(`${type}-list`);
    const pills = getPills();
    let logItems = [];

    pills.forEach(pill => {
        // Filter log entries that match the log type
        const doses = (pill.log || []).filter(dose => dose.status === type);
        
        doses.forEach(dose => {
            logItems.push({
                name: pill.name,
                dosage: pill.dosage,
                time: calculateDoseTime(pill.time, pill.frequency, dose.doseIndex),
                date: dose.date,
                status: dose.status,
                doseIndex: dose.doseIndex
            });
        });
    });
    
    if (logItems.length === 0) {
        listElement.innerHTML = `<p>No doses marked as ${type}.</p>`;
        return;
    }
    // Sort by date then time (newest first)
    logItems.sort((a, b) => new Date(b.date + ' ' + b.time) - new Date(a.date + ' ' + a.time));
    
    listElement.innerHTML = logItems.map(item => `
        <div class="log-item log-${type}">
            <div class="pill-details">
                <strong>${item.name} (Dose #${item.doseIndex + 1})</strong>
                <span>Dosage: ${item.dosage}</span>
                <span>Logged: ${item.date} at ${formatTime12h(item.time)}</span>
            </div>
        </div>
    `).join('');
}

// --- Chart Rendering ---

function renderChart() {
    const pills = getPills();
    let takenCount = 0;
    let missedCount = 0;
    
    pills.forEach(pill => {
        (pill.log || []).forEach(log => {
            if (log.status === 'taken') takenCount++;
            if (log.status === 'missed') missedCount++;
        });
    });

    const totalCount = takenCount + missedCount;
    const takenPercent = totalCount > 0 ? (takenCount / totalCount) * 100 : 0;
    const missedPercent = totalCount > 0 ? (missedCount / totalCount) * 100 : 0;
    
    const totalDosesMessage = `Total Doses Tracked: ${totalCount}`;

    document.getElementById('chart-total').textContent = totalDosesMessage;
    document.getElementById('taken-count').textContent = takenCount;
    document.getElementById('missed-count').textContent = missedCount;

    document.getElementById('chart-taken-bar').style.width = `${takenPercent}%`;
    document.getElementById('chart-missed-bar').style.width = `${missedPercent}%`;
}


// --- Reminder System ---

function checkReminders() {
    const pills = getPills();
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const currentTime = getCurrentTime();
    let remindersDue = [];
    
    // Check for doses due/overdue today
    pills.forEach(pill => {
        const dosesPerDay = pill.frequency;
        
        for (let i = 0; i < dosesPerDay; i++) {
            const doseTimeStr = calculateDoseTime(pill.time, dosesPerDay, i);
            
            const alreadyLoggedToday = (pill.log || []).some(log => 
                log.date === today && log.doseIndex === i
            );

            if (!alreadyLoggedToday) {
                remindersDue.push({ pill, doseIndex: i, dueTime: doseTimeStr });

                // Check if it's time to show notification (current time >= dose time)
                if (timeComparison(currentTime, doseTimeStr) >= 0) {
                    showNotification(pill, i, doseTimeStr);
                }
            }
        }
    });
    
    const isDashboardActive = dashboard.classList.contains('active');

    // Always re-render the list and chart when checking reminders
    if (isDashboardActive && document.querySelector('.tab-button.active').dataset.tab === 'reminder') {
         renderReminderList();
    }
    if (isDashboardActive && document.querySelector('.tab-button.active').dataset.tab === 'chart') {
         renderChart();
    }
}

function logDose(pillId, doseIndex, status) {
    let pills = getPills();
    const pillIndex = pills.findIndex(p => p.id === pillId);
    
    if (pillIndex === -1) return;

    const now = new Date();
    const pill = pills[pillIndex];

    const logEntry = {
        date: now.toISOString().split('T')[0],
        doseIndex: doseIndex, 
        status: status
    };

    if (!pill.log) pill.log = [];
    
    // Check if this dose has already been logged today (e.g., initially missed, then taken)
    const existingLogIndex = pill.log.findIndex(log => log.date === logEntry.date && log.doseIndex === logEntry.doseIndex);
    
    if (existingLogIndex > -1) {
        pill.log[existingLogIndex] = logEntry; // Overwrite the status
    } else {
        pill.log.push(logEntry); // Add new log
    }

    savePills(pills);
    
    // Re-render the current active tab
    renderDashboardContent(document.querySelector('.tab-button.active').dataset.tab); 
    checkReminders(); // Check for the next reminder
}

function renderReminderList() {
    const pills = getPills();
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const reminderListElement = document.getElementById('reminder-list');
    let dueDoses = [];

    pills.forEach(pill => {
        const dosesPerDay = pill.frequency;
        
        for (let i = 0; i < dosesPerDay; i++) {
            const doseTimeStr = calculateDoseTime(pill.time, dosesPerDay, i);
            
            const alreadyLoggedToday = (pill.log || []).some(log => 
                log.date === today && log.doseIndex === i
            );
            
            if (!alreadyLoggedToday) {
                dueDoses.push({
                    id: pill.id,
                    name: pill.name,
                    dosage: pill.dosage,
                    doseIndex: i,
                    dueTime: doseTimeStr
                });
            }
        }
    });

    if (dueDoses.length === 0) {
        reminderListElement.innerHTML = '<p>No doses remaining for today.</p>';
        return;
    }
    
    // Sort by due time
    dueDoses.sort((a, b) => a.dueTime.localeCompare(b.dueTime));

    reminderListElement.innerHTML = dueDoses.map(dose => `
        <div class="pill-item" data-id="${dose.id}" data-dose-index="${dose.doseIndex}">
            <div class="pill-details">
                <strong>${dose.name} (Dose #${dose.doseIndex + 1})</strong>
                <span>Dosage: ${dose.dosage}</span>
                <span class="reminder-time">Due at: ${formatTime12h(dose.dueTime)}</span>
            </div>
            <div class="item-actions">
                <button class="btn-primary btn-reminder-taken" data-id="${dose.id}" data-dose-index="${dose.doseIndex}">Taken</button>
                <button class="btn-secondary btn-reminder-missed" data-id="${dose.id}" data-dose-index="${dose.doseIndex}">Missed</button>
            </div>
        </div>
    `).join('');
    
    // Attach event listeners for the list buttons
    reminderListElement.querySelectorAll('.btn-reminder-taken').forEach(button => {
        button.addEventListener('click', (e) => logDose(e.target.dataset.id, parseInt(e.target.dataset.doseIndex), 'taken'));
    });
    reminderListElement.querySelectorAll('.btn-reminder-missed').forEach(button => {
        button.addEventListener('click', (e) => logDose(e.target.dataset.id, parseInt(e.target.dataset.doseIndex), 'missed'));
    });
}

// --- Event Handlers ---

editPillForm.addEventListener('submit', saveEditedPill);
cancelEditBtn.addEventListener('click', () => renderDashboardContent('details'));

// --- Notification Button Handlers ---
document.getElementById('btn-notification-taken').addEventListener('click', function() {
    if (window.currentNotificationContext) {
        const { pillId, doseIndex } = window.currentNotificationContext;
        hideNotification();
        logDose(pillId, doseIndex, 'taken');
        alert('✓ Dose marked as taken!');
    }
});

document.getElementById('btn-notification-later').addEventListener('click', function() {
    if (window.currentNotificationContext) {
        const { pillId, doseIndex } = window.currentNotificationContext;
        hideNotification();
        logDose(pillId, doseIndex, 'missed');
        alert('⏰ Dose marked as missed. You can take it later!');
    }
});

// Event Listeners for switching views (Authentication logic remains simulated)
showSignupBtn.addEventListener('click', () => switchView('signup'));
showLoginBtn.addEventListener('click', () => switchView('login'));
showResetBtn.addEventListener('click', () => switchView('reset'));
showLoginFromResetBtn.addEventListener('click', () => switchView('login'));
logoutBtn.addEventListener('click', () => switchView('login'));

// Login Submission
loginForm.addEventListener('submit', function(event) {
    event.preventDefault();
    loginError.textContent = '';
    
    const user = document.getElementById('login-user').value.trim();
    const pass = document.getElementById('login-password').value;

    if (user === '' || pass === '') {
        loginError.textContent = 'Please enter both username/email and password.';
        return;
    }
    
    if (pass.length < 4) {
        loginError.textContent = 'Password must be at least 4 characters long.';
        return;
    }
    
    // Check if user exists
    if (!userExists(user)) {
        loginError.innerHTML = `❌ This username is invalid or doesn't exist. <br><button type="button" class="btn-link" id="go-to-signup-from-error" style="margin-top: 10px; display: inline-block;">Sign Up Now</button>`;
        
        document.getElementById('go-to-signup-from-error').addEventListener('click', () => {
            switchView('signup');
            loginError.textContent = '';
        });
        return;
    }
    
    // Check if password matches
    if (!validateUserCredentials(user, pass)) {
        loginError.textContent = '❌ Incorrect password. Please try again.';
        return;
    }
    
    // LOGIN SUCCESS - Set current user
    currentUser = user;
    loginError.textContent = '✓ Signing in...';
    setTimeout(() => {
        loginError.textContent = ''; 
        switchView('dashboard'); // SUCCESS: Move to Dashboard
    }, 1000);
});

// Signup Submission
signupForm.addEventListener('submit', function(event) {
    event.preventDefault();
    signupError.textContent = '';
    
    const name = document.getElementById('signup-name').value.trim();
    const username = document.getElementById('signup-username').value.trim();
    const pass = document.getElementById('signup-password').value;
    const email = document.getElementById('signup-email').value.trim();
    const phone = document.getElementById('signup-phone').value.trim();
    
    if (name === '' || username === '' || pass === '' || email === '' || phone === '') { 
        signupError.textContent = 'Please fill all required fields.';
        return;
    }

    if (pass.length < 4) {
        signupError.textContent = 'Password must be at least 4 characters long.';
        return;
    }

    // Check if username already exists
    if (userExists(username)) {
        signupError.textContent = `❌ Username "${username}" is already taken. Please choose a different one.`;
        return;
    }

    // Create the user account
    if (createUser(username, pass, name, email, phone)) {
        signupError.textContent = `✓ Account creating for ${username}...`;
        setTimeout(() => {
            alert(`✓ Account created successfully! Your username: ${username}\n\nNow please sign in with your credentials.`);
            
            // Clear signup form
            signupForm.reset();
            
            // Set the username in login form for convenience
            document.getElementById('login-user').value = username;
            document.getElementById('login-password').value = '';
            
            switchView('login');
            signupError.textContent = ''; 
        }, 1000);
    } else {
        signupError.textContent = 'Error creating account. Please try again.';
    }
});

// Password Reset Handler
resetForm.addEventListener('submit', function(e) {
    e.preventDefault();
    resetError.textContent = `Searching... (Simulated)`;
    setTimeout(() => {
        alert(`Password reset instructions sent.`);
        switchView('login');
        resetError.textContent = '';
    }, 1500);
});

// Initial setup
switchView('login');
