// Processes dynamic metadata properties parsed straight out of frontend view
function broadcastAnnouncement(client, payload) {
    if (!client) return console.error("Discord client instance missing.");

    const { targetChannelId, mentionRole, message } = payload;

    if (!targetChannelId) return console.error("No target channel was provided in routing metadata.");

    // Pull the channel object directly from the bot's cache
    const channel = client.channels.cache.get(targetChannelId);
    if (!channel) return console.error(`Target channel ${targetChannelId} could not be resolved inside cache structure.`);

    // If a mention role was selected, format it properly, otherwise leave it blank
    const tag = mentionRole ? `<@&${mentionRole}>` : "";
    const finalContent = tag ? `${tag}\n${message}` : message;

    // Send it directly to your Discord channel
    return channel.send({ content: finalContent });
}

module.exports = { broadcastAnnouncement };