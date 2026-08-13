/* ── Dashboard Core JS ─────────────────────────────────────────────
   Shared across all tournament pages:
   • API wrapper with auth
   • Toast notification system
   • Animated number counter
   • Mobile sidebar toggle
   ──────────────────────────────────────────────────────────────────── */

const API_BASE = '/api/tournament';

// ── Auth ──────────────────────────────────────────────────────────
function getApiKey() {
    let key = sessionStorage.getItem('TOURNAMENT_API_KEY');
    if (!key) {
        key = prompt("Admin Area: Enter Tournament API Key to continue");
        if (key) sessionStorage.setItem('TOURNAMENT_API_KEY', key);
    }
    return key;
}

async function fetchApi(endpoint, options = {}) {
    const key = getApiKey();
    if (!key) throw new Error("No API Key provided.");

    const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${key}`,
        ...(options.headers || {})
    };

    const response = await fetch(`${API_BASE}${endpoint}`, { ...options, headers });

    if (response.status === 401 || response.status === 403) {
        sessionStorage.removeItem('TOURNAMENT_API_KEY');
        throw new Error("Invalid or expired API Key.");
    }

    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || `HTTP error ${response.status}`);
    }

    return response.json();
}

window.tournamentApi = { fetch: fetchApi };

// ── Toast Notification System ────────────────────────────────────
function ensureToastContainer() {
    let container = document.querySelector('.toast-container');
    if (!container) {
        container = document.createElement('div');
        container.className = 'toast-container';
        document.body.appendChild(container);
    }
    return container;
}

function showToast(message, type = 'info', duration = 4000) {
    const container = ensureToastContainer();
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    const icons = { success: 'check_circle', error: 'error', info: 'info', warning: 'warning' };
    toast.innerHTML = `
        <span class="material-symbols-outlined">${icons[type] || 'info'}</span>
        <span>${message}</span>
    `;
    container.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('removing');
        setTimeout(() => toast.remove(), 300);
    }, duration);
}
window.showToast = showToast;

// ── Animated Number Counter ──────────────────────────────────────
function animateNumber(el, target, duration = 800) {
    const start = parseInt(el.textContent) || 0;
    if (start === target) return;
    const startTime = performance.now();

    function update(currentTime) {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        // Ease out quad
        const eased = 1 - (1 - progress) * (1 - progress);
        el.textContent = Math.round(start + (target - start) * eased);
        if (progress < 1) requestAnimationFrame(update);
    }
    requestAnimationFrame(update);
}
window.animateNumber = animateNumber;

// ── Time Formatter ───────────────────────────────────────────────
function formatTime(isoString) {
    const d = new Date(isoString);
    if (isNaN(d)) return isoString;
    return d.toLocaleString();
}
window.formatTime = formatTime;

// ── Mobile Sidebar Toggle ────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    const menuBtn = document.querySelector('.mobile-menu-btn');
    const sidebar = document.querySelector('.sidebar');
    if (menuBtn && sidebar) {
        menuBtn.addEventListener('click', () => {
            sidebar.classList.toggle('open');
        });
        // Close sidebar when clicking outside
        document.addEventListener('click', (e) => {
            if (sidebar.classList.contains('open') && !sidebar.contains(e.target) && !menuBtn.contains(e.target)) {
                sidebar.classList.remove('open');
            }
        });
    }
});

// ── Dashboard Page Logic ─────────────────────────────────────────
async function loadDashboard() {
    const authStatus = document.getElementById('authStatus');
    if (!authStatus) return; // Not on dashboard page

    try {
        const data = await fetchApi('/dashboard');
        authStatus.textContent = "Authenticated";
        authStatus.className = "auth-badge success";

        // Animate Stats
        const statEls = {
            'stat-todaysMatches': data.stats.todaysMatches,
            'stat-missingRosters': data.stats.missingRosters,
            'stat-activeTournaments': data.stats.activeTournaments,
            'stat-totalMatches': data.stats.totalMatches
        };
        for (const [id, val] of Object.entries(statEls)) {
            const el = document.getElementById(id);
            if (el) animateNumber(el, val);
        }

        // Render Logs Table
        const tbody = document.querySelector('#logsTable tbody');
        if (!tbody) return;

        if (data.recentLogs.length === 0) {
            tbody.innerHTML = '<tr><td colspan="3" class="loading-text">No recent activity.</td></tr>';
            return;
        }

        tbody.innerHTML = data.recentLogs.map(log => `
            <tr>
                <td class="text-sm opacity-70 whitespace-nowrap">${formatTime(log.timestamp)}</td>
                <td><span class="status-badge" style="font-size:10px;padding:2px 8px;">${log.action}</span></td>
                <td>${log.details}</td>
            </tr>
        `).join('');

    } catch (e) {
        if (authStatus) {
            authStatus.textContent = "❌ Auth Failed";
            authStatus.className = "auth-badge error";
        }
        console.error("Dashboard load failed:", e);
        if (e.message.includes("API Key")) {
            setTimeout(() => window.location.reload(), 1000);
        }
    }
}

document.addEventListener('DOMContentLoaded', loadDashboard);
