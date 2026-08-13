async function loadSettings() {
    try {
        const settings = await window.tournamentApi.fetch('/settings');
        
        document.getElementById('captainReminderEnabled').checked = settings.captainReminderEnabled !== false;
        document.getElementById('playerReminderEnabled').checked = settings.playerReminderEnabled !== false;
        document.getElementById('finalReminderEnabled').checked = settings.finalReminderEnabled !== false;
        document.getElementById('summaryEnabled').checked = settings.summaryEnabled !== false;
        
        document.getElementById('captainReminderHours').value = settings.captainReminderHours || 24;
        document.getElementById('playerReminderHours').value = settings.playerReminderHours || 6;
        document.getElementById('finalReminderHours').value = settings.finalReminderHours || 1;
        
    } catch (e) {
        console.error(e);
        alert("Failed to load settings: " + e.message);
    }
}

document.getElementById('settingsForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const payload = {
        captainReminderEnabled: document.getElementById('captainReminderEnabled').checked,
        playerReminderEnabled: document.getElementById('playerReminderEnabled').checked,
        finalReminderEnabled: document.getElementById('finalReminderEnabled').checked,
        summaryEnabled: document.getElementById('summaryEnabled').checked,
        
        captainReminderHours: parseInt(document.getElementById('captainReminderHours').value) || 24,
        playerReminderHours: parseInt(document.getElementById('playerReminderHours').value) || 6,
        finalReminderHours: parseInt(document.getElementById('finalReminderHours').value) || 1
    };

    try {
        const btn = e.target.querySelector('button[type="submit"]');
        const orig = btn.innerText;
        btn.innerText = "Saving...";
        
        await window.tournamentApi.fetch(`/settings`, { method: 'PUT', body: JSON.stringify(payload) });
        
        btn.innerText = "Saved!";
        setTimeout(() => btn.innerText = orig, 2000);
    } catch (err) {
        alert("Error saving settings: " + err.message);
    }
});

document.addEventListener('DOMContentLoaded', loadSettings);
