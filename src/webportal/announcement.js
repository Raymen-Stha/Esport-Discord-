window.onload = function () {
    loadDiscordMetadata();
};

// Fetches live server data cleanly from our bot backend engine
async function loadDiscordMetadata() {
    const channelSelect = document.getElementById('channelSelect');
    const roleSelect = document.getElementById('roleSelect');

    try {
        const response = await fetch('/api/discord-metadata');
        if (!response.ok) throw new Error("Could not pull server metadata context.");

        const data = await response.json();

        // 1. Populate text channels dropdown
        data.channels.forEach(channel => {
            const option = document.createElement('option');
            option.value = channel.id;
            option.innerText = `# ${channel.name}`;
            channelSelect.appendChild(option);
        });

        // 2. Populate server roles dropdown
        data.roles.forEach(role => {
            const option = document.createElement('option');
            option.value = role.id;
            option.innerText = role.name;
            roleSelect.appendChild(option);
        });

    } catch (err) {
        console.error("Failed to populate server dropdown fields natively:", err);
        const statusText = document.getElementById('submissionStatus');
        statusText.style.color = "#f38ba8";
        statusText.innerText = "❌ Failed to load server roles and channels. Check connection.";
    }
}

async function handleFormSubmit(event) {
    event.preventDefault();

    const channelId = document.getElementById('channelSelect').value;
    const role = document.getElementById('roleSelect').value;
    const title = document.getElementById('announceTitle').value;
    const body = document.getElementById('announceBody').value;
    const statusText = document.getElementById('submissionStatus');

    // Convert the title into Markdown Heading format (# Heading)
    const formattedMarkdownMessage = `# ${title}\n\n${body}`;

    const payload = {
        targetChannelId: channelId,
        mentionRole: role,
        message: formattedMarkdownMessage
    };

    statusText.style.color = "#89b4fa";
    statusText.innerText = "Dispatching parameters to bot routing layer...";

    try {
        const response = await fetch('/api/announcement', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (response.ok) {
            statusText.style.color = "#a6e3a1";
            statusText.innerText = "✨ Announcement successfully sent through the bot!";
            document.getElementById('announcementForm').reset();
        } else {
            throw new Error();
        }
    } catch (err) {
        statusText.style.color = "#f38ba8";
        statusText.innerText = "❌ Transmission error. Ensure your main server execution script is online.";
    }
}