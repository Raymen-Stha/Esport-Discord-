const metrics = { tickets: 0, lobbies: 0, verified: 0 };
let statsChart = null;

// Relative paths targeting your raw JSON files
const fileRoutes = {
    tickets: '../ticketing/tickets.json',
    lobbies: '../party/lobbies.json',
    verified: '../verification/verified_users.json'
};

window.onload = function () {
    initializeChart();
    fetchAllData();

    // Automatically poll and check for changes every 5 seconds
    setInterval(fetchAllData, 5000);
};

async function fetchAllData() {
    for (const key in fileRoutes) {
        await fetchFileMetric(fileRoutes[key], key);
    }
    if (statsChart) updateChart();
    document.getElementById('sync-time').innerText = `Last Auto-Synced: ${new Date().toLocaleTimeString()}`;
}

async function fetchFileMetric(url, target) {
    try {
        // Fetch your live JSON structures over the Live Server connection
        const response = await fetch(url);
        if (!response.ok) throw new Error();

        const data = await response.json();

        // Dynamically tally counts depending on JSON configuration (Array vs Object map)
        if (Array.isArray(data)) {
            metrics[target] = data.length;
        } else if (typeof data === 'object' && data !== null) {
            metrics[target] = Object.keys(data).length;
        } else {
            metrics[target] = 0;
        }

        // Push values to UI Card slots
        const elementIdMap = { tickets: 'stat-tickets', lobbies: 'stat-lobbies', verified: 'stat-verified' };
        document.getElementById(elementIdMap[target]).innerText = metrics[target];

    } catch (err) {
        console.warn(`Could not read ${url}. The file might be empty or waiting for bot data.`);
    }
}

function initializeChart() {
    const ctx = document.getElementById('statsChart').getContext('2d');
    statsChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['Tickets', 'Active Party Lobbies', 'Verified Users'],
            datasets: [{
                data: [0, 0, 0],
                backgroundColor: ['rgba(243, 139, 168, 0.6)', 'rgba(137, 180, 250, 0.6)', 'rgba(166, 227, 161, 0.6)'],
                borderColor: ['#f38ba8', '#89b4fa', '#a6e3a1'],
                borderWidth: 2,
                borderRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                y: { beginAtZero: true, grid: { color: '#313244' }, ticks: { color: '#cdd6f4' } },
                x: { grid: { display: false }, ticks: { color: '#cdd6f4' } }
            }
        }
    });
}

function updateChart() {
    statsChart.data.datasets[0].data = [metrics.tickets, metrics.lobbies, metrics.verified];
    statsChart.update();
}