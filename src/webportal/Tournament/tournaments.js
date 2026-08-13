let tournaments = [];
let games = [];
let matches = []; // We fetch matches to show stats per tournament

async function loadData() {
    try {
        const grid = document.getElementById('tournamentsGrid');
        grid.innerHTML = '<div class="loading-text" style="grid-column: 1 / -1;">Loading tournaments...</div>';

        // Fetch all data in parallel
        const [gamesData, tournamentsData, matchesData] = await Promise.all([
            window.tournamentApi.fetch('/games'),
            window.tournamentApi.fetch('/tournaments'),
            window.tournamentApi.fetch('/matches')
        ]);
        
        games = gamesData;
        tournaments = tournamentsData;
        matches = matchesData;

        // Populate game select
        document.getElementById('tGame').innerHTML = '<option value="">-- Select Game --</option>' +
            games.map(g => `<option value="${g.id}">${g.name}</option>`).join('');

        renderGrid();
    } catch (e) {
        console.error(e);
        document.getElementById('tournamentsGrid').innerHTML = `
            <div class="empty-state" style="grid-column: 1 / -1;">
                <span class="material-symbols-outlined text-error">error</span>
                <p class="text-error">Error loading tournaments: ${e.message}</p>
            </div>
        `;
    }
}

function renderGrid() {
    const grid = document.getElementById('tournamentsGrid');
    if (tournaments.length === 0) {
        grid.innerHTML = `
            <div class="empty-state" style="grid-column: 1 / -1;">
                <span class="material-symbols-outlined">emoji_events</span>
                <p>No active tournaments. Create one to get started!</p>
            </div>
        `;
        return;
    }

    grid.innerHTML = tournaments.map((t, index) => {
        const game = games.find(g => g.id === t.gameId);
        const gameName = game ? game.name : 'Unknown Game';
        const dateStr = (t.startDate || '?') + ' to ' + (t.endDate || '?');
        
        // Calculate stats for this tournament
        const tMatches = matches.filter(m => m.tournamentId === t.id);
        const total = tMatches.length;
        const wins = tMatches.filter(m => m.result === 'win').length;
        const losses = tMatches.filter(m => m.result === 'loss').length;
        const winRate = total > 0 ? Math.round((wins / total) * 100) : 0;

        return `
            <div class="glass-card tournament-card card-animate" style="animation-delay: ${index * 0.05}s">
                <div class="tournament-card-header">
                    <span class="status-badge status-${t.status}">${t.status}</span>
                    <div class="actions">
                        <button onclick="editT('${t.id}')" class="btn-icon edit" title="Edit"><span class="material-symbols-outlined">edit</span></button>
                        <button onclick="deleteT('${t.id}')" class="btn-icon delete" title="Delete"><span class="material-symbols-outlined">delete</span></button>
                    </div>
                </div>
                <h3 class="tournament-card-title">${t.name}</h3>
                <div class="tournament-card-game">${gameName}</div>
                
                <div class="tournament-card-meta">
                    <div class="meta-row"><span class="material-symbols-outlined">calendar_month</span> ${dateStr}</div>
                    <div class="meta-row"><span class="material-symbols-outlined">format_list_bulleted</span> ${t.format || 'Standard'}</div>
                </div>
                
                <div class="tournament-card-stats">
                    <div class="stat">Matches<br><strong>${total}</strong></div>
                    <div class="stat text-success">Wins<br><strong>${wins}</strong></div>
                    <div class="stat text-error">Losses<br><strong>${losses}</strong></div>
                    <div class="stat" style="margin-left:auto; text-align:right;">Win Rate<br><strong>${winRate}%</strong></div>
                </div>
                
                <a href="matches.html?tournamentId=${t.id}" class="btn btn-secondary btn-manage">
                    Manage Matches <span class="material-symbols-outlined">arrow_forward</span>
                </a>
            </div>
        `;
    }).join('');
}

function openModal(t = null) {
    document.getElementById('tournamentForm').reset();
    document.getElementById('tournamentId').value = '';
    document.getElementById('modalTitle').innerText = 'Create Tournament';

    if (t) {
        document.getElementById('modalTitle').innerText = 'Edit Tournament';
        document.getElementById('tournamentId').value = t.id;
        document.getElementById('tName').value = t.name;
        document.getElementById('tGame').value = t.gameId;
        document.getElementById('tStartDate').value = t.startDate || '';
        document.getElementById('tEndDate').value = t.endDate || '';
        document.getElementById('tFormat').value = t.format || '';
        document.getElementById('tNotes').value = t.notes || '';
    }

    document.getElementById('tournamentModal').classList.add('active');
}

function closeModal() {
    document.getElementById('tournamentModal').classList.remove('active');
}

function editT(id) {
    const t = tournaments.find(x => x.id === id);
    if (t) openModal(t);
}

async function deleteT(id) {
    if (!confirm("Delete this tournament? This will fail if it has active matches.")) return;
    try {
        await window.tournamentApi.fetch(`/tournaments/${id}`, { method: 'DELETE' });
        window.showToast("Tournament deleted successfully.", "success");
        await loadData();
    } catch (e) {
        window.showToast("Failed to delete: " + e.message, "error");
    }
}

document.getElementById('tournamentForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('tournamentId').value;
    const btn = e.target.querySelector('button[type="submit"]');
    const origText = btn.innerText;
    
    btn.innerText = "Saving...";
    btn.disabled = true;

    const payload = {
        name: document.getElementById('tName').value,
        gameId: document.getElementById('tGame').value,
        startDate: document.getElementById('tStartDate').value,
        endDate: document.getElementById('tEndDate').value,
        format: document.getElementById('tFormat').value,
        notes: document.getElementById('tNotes').value
    };

    try {
        if (id) {
            await window.tournamentApi.fetch(`/tournaments/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
            window.showToast("Tournament updated successfully.", "success");
        } else {
            await window.tournamentApi.fetch(`/tournaments`, { method: 'POST', body: JSON.stringify(payload) });
            window.showToast("Tournament created successfully.", "success");
        }
        closeModal();
        await loadData();
    } catch (err) {
        window.showToast("Error saving: " + err.message, "error");
    } finally {
        btn.innerText = origText;
        btn.disabled = false;
    }
});

document.addEventListener('DOMContentLoaded', loadData);
