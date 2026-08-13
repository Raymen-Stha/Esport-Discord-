let allLogs = [];

async function loadLogs() {
    try {
        allLogs = await window.tournamentApi.fetch('/logs');
        renderLogs();
    } catch (e) {
        console.error(e);
        document.querySelector('#logsTable tbody').innerHTML = `<tr><td colspan="4" class="text-error text-center">Error: ${e.message}</td></tr>`;
    }
}

function formatTime(isoString) {
    const d = new Date(isoString);
    if (isNaN(d)) return isoString;
    return d.toLocaleString();
}

function renderLogs() {
    const search = document.getElementById('logSearch').value.toLowerCase();
    const tbody = document.querySelector('#logsTable tbody');
    
    let filtered = allLogs;
    if (search) {
        filtered = allLogs.filter(l => 
            l.action.toLowerCase().includes(search) || 
            l.details.toLowerCase().includes(search) ||
            l.actorId.toLowerCase().includes(search)
        );
    }

    if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="text-center text-on-surface-variant">No logs found.</td></tr>';
        return;
    }

    tbody.innerHTML = filtered.map(log => `
        <tr>
            <td class="text-sm opacity-70 whitespace-nowrap">${formatTime(log.timestamp)}</td>
            <td><span class="bg-surface-variant px-2 py-1 rounded text-xs font-mono">${log.action}</span></td>
            <td>${log.details}</td>
            <td class="text-sm opacity-70">${log.actorId}</td>
        </tr>
    `).join('');
}

document.getElementById('logSearch').addEventListener('input', renderLogs);
document.addEventListener('DOMContentLoaded', loadLogs);
// Auto refresh every 30s
setInterval(loadLogs, 30000);
