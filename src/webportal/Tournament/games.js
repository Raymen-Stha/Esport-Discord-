let gamesData = [];
let discordMeta = { roles: [], channels: [] };

async function loadMetadata() {
    try {
        const res = await fetch('/api/discord-metadata');
        if (res.ok) discordMeta = await res.json();
    } catch (e) {
        console.error("Failed to load discord metadata", e);
    }
}

function populateSelects() {
    const roleOpts = '<option value="">None</option>' + discordMeta.roles.map(r => `<option value="${r.id}">${r.name}</option>`).join('');
    const chanOpts = '<option value="">None</option>' + discordMeta.channels.map(c => `<option value="${c.id}"># ${c.name}</option>`).join('');
    
    document.getElementById('roleId').innerHTML = roleOpts;
    document.getElementById('captainRoleId').innerHTML = roleOpts;
    document.getElementById('announcementChannelId').innerHTML = chanOpts;
    document.getElementById('channelId').innerHTML = chanOpts;
}

async function loadGames() {
    try {
        gamesData = await window.tournamentApi.fetch('/games');
        renderTable();
    } catch (e) {
        console.error(e);
        document.querySelector('#gamesTable tbody').innerHTML = `<tr><td colspan="5" class="empty-state text-error">Error loading games: ${e.message}</td></tr>`;
        window.showToast("Failed to load games: " + e.message, "error");
    }
}

function renderTable() {
    const tbody = document.querySelector('#gamesTable tbody');
    if (gamesData.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="5">
                    <div class="empty-state">
                        <span class="material-symbols-outlined">sports_esports</span>
                        <p>No games configured yet. Add one to get started.</p>
                    </div>
                </td>
            </tr>
        `;
        return;
    }

    const getRoleName = (id) => discordMeta.roles.find(r => r.id === id)?.name || id || '-';
    const getChanName = (id) => discordMeta.channels.find(c => c.id === id)?.name || id || '-';

    tbody.innerHTML = gamesData.map(g => `
        <tr>
            <td class="font-bold text-primary">${g.name}</td>
            <td><span class="mono" style="background:var(--surface-solid); padding:2px 8px; border-radius:4px;">${g.squadSize || 5} / ${g.benchSize || 1}</span></td>
            <td>${getRoleName(g.captainRoleId)}</td>
            <td>${g.announcementChannelId ? '#' + getChanName(g.announcementChannelId) : '<span class="text-muted">None</span>'}</td>
            <td>
                <div class="actions-cell">
                    <button onclick="editGame('${g.id}')" class="btn-icon edit" title="Edit"><span class="material-symbols-outlined">edit</span></button>
                    <button onclick="deleteGame('${g.id}')" class="btn-icon delete" title="Delete"><span class="material-symbols-outlined">delete</span></button>
                </div>
            </td>
        </tr>
    `).join('');
}

function openModal(game = null) {
    document.getElementById('gameForm').reset();
    document.getElementById('gameId').value = '';
    document.getElementById('modalTitle').innerText = 'Add Game';
    
    if (game) {
        document.getElementById('modalTitle').innerText = 'Edit Game';
        document.getElementById('gameId').value = game.id;
        document.getElementById('gameName').value = game.name;
        document.getElementById('squadSize').value = game.squadSize;
        document.getElementById('benchSize').value = game.benchSize;
        document.getElementById('roleId').value = game.roleId || '';
        document.getElementById('captainRoleId').value = game.captainRoleId || '';
        document.getElementById('announcementChannelId').value = game.announcementChannelId || '';
        document.getElementById('channelId').value = game.channelId || '';
    }
    
    document.getElementById('gameModal').classList.add('active');
}

function closeModal() {
    document.getElementById('gameModal').classList.remove('active');
}

function editGame(id) {
    const game = gamesData.find(g => g.id === id);
    if (game) openModal(game);
}

async function deleteGame(id) {
    if (!confirm("Are you sure you want to delete this game?")) return;
    try {
        await window.tournamentApi.fetch(`/games/${id}`, { method: 'DELETE' });
        window.showToast("Game deleted successfully.", "success");
        await loadGames();
    } catch (e) {
        window.showToast("Failed to delete: " + e.message, "error");
    }
}

document.getElementById('gameForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('gameId').value;
    const btn = e.target.querySelector('button[type="submit"]');
    const origText = btn.innerText;
    
    btn.innerText = "Saving...";
    btn.disabled = true;
    
    const payload = {
        name: document.getElementById('gameName').value,
        squadSize: document.getElementById('squadSize').value,
        benchSize: document.getElementById('benchSize').value,
        roleId: document.getElementById('roleId').value,
        captainRoleId: document.getElementById('captainRoleId').value,
        announcementChannelId: document.getElementById('announcementChannelId').value,
        channelId: document.getElementById('channelId').value,
    };

    try {
        if (id) {
            await window.tournamentApi.fetch(`/games/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
            window.showToast("Game updated successfully.", "success");
        } else {
            await window.tournamentApi.fetch(`/games`, { method: 'POST', body: JSON.stringify(payload) });
            window.showToast("Game created successfully.", "success");
        }
        closeModal();
        await loadGames();
    } catch (err) {
        window.showToast("Error saving game: " + err.message, "error");
    } finally {
        btn.innerText = origText;
        btn.disabled = false;
    }
});

async function init() {
    await loadMetadata();
    populateSelects();
    await loadGames();
}

document.addEventListener('DOMContentLoaded', init);
