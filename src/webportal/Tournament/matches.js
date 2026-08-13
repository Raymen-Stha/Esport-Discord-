let matches = [];
let currentTournament = null;
let currentTournamentId = null;
let currentGame = null;
let gameName = "SCUR";

async function loadData() {
    try {
        // Get tournament ID from URL
        const urlParams = new URLSearchParams(window.location.search);
        currentTournamentId = urlParams.get('tournamentId');

        if (!currentTournamentId) {
            document.querySelector('.main-content').innerHTML = `
                <div class="empty-state" style="margin-top:40px;">
                    <span class="material-symbols-outlined text-error" style="font-size:64px;">error</span>
                    <h2 class="font-headline" style="font-size:24px; margin-bottom:16px;">No Tournament Selected</h2>
                    <p>Please select a tournament to manage its matches.</p>
                    <a href="tournaments.html" class="btn btn-primary mt-4">Go to Tournaments</a>
                </div>
            `;
            return;
        }

        const tbody = document.querySelector('#matchesTable tbody');
        tbody.innerHTML = '<tr><td colspan="4" class="loading-text">Loading matches...</td></tr>';

        // Fetch tournament data to verify it exists and get its name
        const tournaments = await window.tournamentApi.fetch('/tournaments');
        currentTournament = tournaments.find(t => t.id === currentTournamentId);

        if (!currentTournament) {
            throw new Error("Tournament not found.");
        }

        // Fetch games to get the default team name
        const games = await window.tournamentApi.fetch('/games');
        const game = games.find(g => g.id === currentTournament.gameId);
        if (game) {
            currentGame = game;
            gameName = game.name;
        }

        document.getElementById('breadcrumbTournamentName').textContent = currentTournament.name;

        // Fetch matches and filter
        const allMatches = await window.tournamentApi.fetch('/matches');
        matches = allMatches.filter(m => m.tournamentId === currentTournamentId);
            
        renderTable();
    } catch (e) {
        console.error(e);
        document.querySelector('#matchesTable tbody').innerHTML = `<tr><td colspan="4" class="empty-state text-error">Error: ${e.message}</td></tr>`;
        window.showToast(e.message, "error");
    }
}

function renderTable() {
    const tbody = document.querySelector('#matchesTable tbody');
    if (matches.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="4">
                    <div class="empty-state">
                        <span class="material-symbols-outlined">swords</span>
                        <p>No matches scheduled yet for this tournament.</p>
                    </div>
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = matches.map(m => {
        let actions = '';
        const teamName = m.teamName || 'SCUR';

        if (m.status !== 'completed' && m.status !== 'cancelled') {
            actions = `
                <button onclick="editMatch('${m.id}')" class="btn-icon edit" title="Edit"><span class="material-symbols-outlined">edit</span></button>
                <button onclick="openRoster('${m.id}')" class="btn-icon text-dim" title="Manage Roster" style="color:var(--primary)"><span class="material-symbols-outlined">groups</span></button>
                <button onclick="openComplete('${m.id}')" class="btn-icon complete" title="Enter Result"><span class="material-symbols-outlined">check_circle</span></button>
                <button onclick="cancelMatch('${m.id}')" class="btn-icon cancel" title="Cancel"><span class="material-symbols-outlined">cancel</span></button>
            `;
        }
        
        let statusDisplay = `<span class="status-badge status-${m.status}">${m.status.replace('_', ' ')}</span>`;
        if (m.status === 'completed') {
            let resClass = m.result === 'win' ? 'win' : (m.result === 'loss' ? 'loss' : 'draw');
            // Show split scores if they exist, else legacy score
            let scoreStr = (m.scoreTeam !== null && m.scoreOpponent !== null) 
                            ? `${m.scoreTeam} - ${m.scoreOpponent}` 
                            : (m.score || '');
            
            statusDisplay = `
                <div style="display:flex; flex-direction:column; gap:4px; align-items:flex-start;">
                    <span class="result-badge ${resClass}">${m.result}</span>
                    <span class="match-score ${resClass}">${scoreStr}</span>
                </div>
            `;
        }

        return `
            <tr>
                <td>
                    <div class="match-teams">
                        <span class="team-name">${teamName}</span>
                        <span class="vs">vs</span>
                        <span class="opponent">${m.opponent}</span>
                    </div>
                </td>
                <td>
                    <div class="match-datetime">
                        <span class="material-symbols-outlined" style="font-size:14px; vertical-align:middle; margin-right:4px;">calendar_month</span>
                        ${m.matchDate} @ ${m.matchTime || 'TBA'}
                    </div>
                </td>
                <td>${statusDisplay}</td>
                <td><div class="actions-cell">${actions}</div></td>
            </tr>
        `;
    }).join('');
}

// Format 24h to 12h or just return as is (assuming input is HH:MM from time picker)
function formatTime12h(time24) {
    if (!time24) return '';
    let [h, m] = time24.split(':');
    h = parseInt(h);
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return `${h}:${m} ${ampm}`;
}

// Convert 12h back to 24h for input
function formatTime24h(time12) {
    if (!time12) return '';
    const match = time12.match(/(\d+):(\d+)\s?(AM|PM)/i);
    if (!match) return time12;
    let [_, h, m, ampm] = match;
    h = parseInt(h);
    if (ampm.toUpperCase() === 'PM' && h < 12) h += 12;
    if (ampm.toUpperCase() === 'AM' && h === 12) h = 0;
    return `${h.toString().padStart(2,'0')}:${m}`;
}

function openModal(m = null) {
    document.getElementById('matchForm').reset();
    document.getElementById('matchId').value = '';
    document.getElementById('mTournament').value = currentTournamentId;
    document.getElementById('modalTitle').innerText = 'Create Match';
    
    // Default team name
    document.getElementById('mTeamName').value = gameName;
    
    if (m) {
        document.getElementById('modalTitle').innerText = 'Edit Match';
        document.getElementById('matchId').value = m.id;
        document.getElementById('mTeamName').value = m.teamName || 'SCUR';
        document.getElementById('mOpponent').value = m.opponent;
        document.getElementById('mDate').value = m.matchDate;
        document.getElementById('mTime').value = formatTime24h(m.matchTime);
        document.getElementById('mNotes').value = m.notes || '';
    }
    
    document.getElementById('matchModal').classList.add('active');
}

function closeModal(id) {
    document.getElementById(id).classList.remove('active');
}

function editMatch(id) {
    const m = matches.find(x => x.id === id);
    if (m) openModal(m);
}

async function cancelMatch(id) {
    if (!confirm("Are you sure you want to cancel this match? This will update the Discord announcement.")) return;
    try {
        await window.tournamentApi.fetch(`/matches/${id}/cancel`, { method: 'POST' });
        window.showToast("Match cancelled.", "info");
        await loadData();
    } catch (e) {
        window.showToast("Failed to cancel: " + e.message, "error");
    }
}

function openComplete(id) {
    const m = matches.find(x => x.id === id);
    if (!m) return;

    document.getElementById('completeForm').reset();
    document.getElementById('cMatchId').value = id;
    
    const teamName = m.teamName || 'SCUR';
    document.getElementById('cMatchupDisplay').innerHTML = `<span class="text-primary">${teamName}</span> vs <span class="text-text">${m.opponent}</span>`;
    document.getElementById('cLabelTeam').innerText = `${teamName} Score`;
    document.getElementById('cLabelOpponent').innerText = `${m.opponent} Score`;
    
    document.getElementById('completeModal').classList.add('active');
}

// Submit Create/Edit Match
document.getElementById('matchForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('matchId').value;
    const btn = e.target.querySelector('button[type="submit"]');
    const origText = btn.innerText;
    
    btn.innerText = "Saving...";
    btn.disabled = true;
    
    const time24 = document.getElementById('mTime').value;
    const time12 = formatTime12h(time24);

    const payload = {
        tournamentId: document.getElementById('mTournament').value,
        teamName: document.getElementById('mTeamName').value,
        opponent: document.getElementById('mOpponent').value,
        matchDate: document.getElementById('mDate').value,
        matchTime: time12,
        notes: document.getElementById('mNotes').value
    };

    try {
        if (id) {
            await window.tournamentApi.fetch(`/matches/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
            window.showToast("Match updated successfully.", "success");
        } else {
            await window.tournamentApi.fetch(`/matches`, { method: 'POST', body: JSON.stringify(payload) });
            window.showToast("Match created successfully.", "success");
        }
        closeModal('matchModal');
        await loadData();
    } catch (err) {
        window.showToast("Error saving: " + err.message, "error");
    } finally {
        btn.innerText = origText;
        btn.disabled = false;
    }
});

// Submit Complete Result (Two-box score)
document.getElementById('completeForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('cMatchId').value;
    const btn = e.target.querySelector('button[type="submit"]');
    const origText = btn.innerText;
    
    btn.innerText = "Submitting...";
    btn.disabled = true;
    
    const scoreTeam = document.getElementById('cScoreTeam').value;
    const scoreOpponent = document.getElementById('cScoreOpponent').value;
    
    const payload = {
        scoreTeam: scoreTeam,
        scoreOpponent: scoreOpponent,
        notes: document.getElementById('cNotes').value
    };

    try {
        await window.tournamentApi.fetch(`/matches/${id}/complete`, { method: 'POST', body: JSON.stringify(payload) });
        window.showToast("Match result submitted.", "success");
        closeModal('completeModal');
        await loadData();
    } catch (err) {
        window.showToast("Error saving result: " + err.message, "error");
    } finally {
        btn.innerText = origText;
        btn.disabled = false;
    }
});

let cachedRoleMembers = null;

async function getRoleMembers(roleId) {
    if (!roleId) return [];
    try {
        const res = await fetch(`/api/discord-role-members/${roleId}`);
        if(res.ok) return await res.json();
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP error ${res.status}`);
    } catch(e) {
        console.error("Failed to fetch role members:", e);
    }
    return [];
}

function renderRosterSelect(id, value, options) {
    const selected = options.find(o => o.id === value);
    let selectedHtml = `<div class="placeholder">Select a player...</div>`;
    if (selected) {
        selectedHtml = `
            <img src="${selected.avatarURL}" alt="avatar">
            <div>
                <div class="name">${selected.globalName || selected.username}</div>
            </div>
        `;
    }

    const optionsHtml = options.map(o => `
        <div class="roster-option" data-id="${o.id}">
            <img src="${o.avatarURL}" alt="avatar">
            <div>
                <div class="name">${o.globalName || o.username}</div>
                <div class="id">${o.username}</div>
            </div>
        </div>
    `).join('');

    return `
        <div class="roster-player-select" id="wrapper_${id}">
            <input type="hidden" id="${id}" value="${value || ''}" />
            <div class="roster-selected" onclick="toggleRosterDropdown('${id}')">
                ${selectedHtml}
                <span class="material-symbols-outlined" style="margin-left:auto; color:var(--text-muted)">expand_more</span>
            </div>
            <div class="roster-options" id="options_${id}">
                <div class="roster-option" data-id="">
                    <span class="material-symbols-outlined text-muted" style="font-size:28px;">person_remove</span>
                    <div class="name text-muted">None (Clear Slot)</div>
                </div>
                ${optionsHtml}
            </div>
        </div>
    `;
}

window.toggleRosterDropdown = function(id) {
    document.querySelectorAll('.roster-options').forEach(el => {
        if (el.id !== `options_${id}`) el.classList.remove('open');
    });
    const opts = document.getElementById(`options_${id}`);
    if (opts) opts.classList.toggle('open');
}

document.addEventListener('click', (e) => {
    const option = e.target.closest('.roster-option');
    if (option) {
        const wrapper = option.closest('.roster-player-select');
        const id = wrapper.querySelector('input').id;
        const val = option.getAttribute('data-id');
        
        wrapper.querySelector('input').value = val;
        
        const selectedDiv = wrapper.querySelector('.roster-selected');
        if (val && cachedRoleMembers) {
            const member = cachedRoleMembers.find(m => m.id === val);
            if (member) {
                selectedDiv.innerHTML = `
                    <img src="${member.avatarURL}" alt="avatar">
                    <div><div class="name">${member.globalName || member.username}</div></div>
                    <span class="material-symbols-outlined" style="margin-left:auto; color:var(--text-muted)">expand_more</span>
                `;
            }
        } else {
            selectedDiv.innerHTML = `
                <div class="placeholder">Select a player...</div>
                <span class="material-symbols-outlined" style="margin-left:auto; color:var(--text-muted)">expand_more</span>
            `;
        }
        wrapper.querySelector('.roster-options').classList.remove('open');
    } else if (!e.target.closest('.roster-player-select')) {
        document.querySelectorAll('.roster-options').forEach(el => el.classList.remove('open'));
    }
});

async function openRoster(id) {
    if (!currentGame) return window.showToast("Game configuration missing.", "error");

    const m = matches.find(x => x.id === id);
    if (!m) return;

    document.getElementById('rMatchId').value = id;
    const startersContainer = document.getElementById('rosterStartersContainer');
    const benchContainer = document.getElementById('rosterBenchContainer');

    startersContainer.innerHTML = '<div class="loading-text">Loading players...</div>';
    benchContainer.innerHTML = '';

    // Fetch players and existing roster
    const [roster] = await Promise.all([
        window.tournamentApi.fetch(`/matches/${id}/roster`).catch(() => ({})),
        (async () => {
            if (!cachedRoleMembers) {
                cachedRoleMembers = await getRoleMembers(currentGame.roleId);
            }
        })()
    ]);

    const opts = cachedRoleMembers || [];

    let startersHtml = '';
    for(let i=0; i<currentGame.squadSize; i++) {
        const val = (roster && roster.players && roster.players[i]) ? roster.players[i] : '';
        startersHtml += renderRosterSelect(`rPlayer${i}`, val, opts);
    }
    startersContainer.innerHTML = startersHtml;

    let benchHtml = '';
    for(let i=0; i<currentGame.benchSize; i++) {
        const val = (roster && roster.bench && roster.bench[i]) ? roster.bench[i] : '';
        benchHtml += renderRosterSelect(`rBench${i}`, val, opts);
    }
    benchContainer.innerHTML = benchHtml || '<p class="text-sm text-dim">No bench allowed.</p>';

    document.getElementById('rosterModal').classList.add('active');
}

document.getElementById('rosterForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('rMatchId').value;
    const btn = e.target.querySelector('button[type="submit"]');
    const origText = btn.innerText;
    
    btn.innerText = "Saving...";
    btn.disabled = true;

    const players = [];
    for(let i=0; i<currentGame.squadSize; i++) {
        const input = document.getElementById(`rPlayer${i}`);
        const val = input ? input.value.trim() : '';
        if (val) players.push(val);
    }
    const bench = [];
    for(let i=0; i<currentGame.benchSize; i++) {
        const input = document.getElementById(`rBench${i}`);
        const val = input ? input.value.trim() : '';
        if (val) bench.push(val);
    }

    try {
        await window.tournamentApi.fetch(`/matches/${id}/roster`, { 
            method: 'PUT', 
            body: JSON.stringify({ players, bench }) 
        });
        window.showToast("Roster saved successfully.", "success");
        closeModal('rosterModal');
        await loadData();
    } catch (err) {
        window.showToast("Error saving roster: " + err.message, "error");
    } finally {
        btn.innerText = origText;
        btn.disabled = false;
    }
});

document.addEventListener('DOMContentLoaded', loadData);
