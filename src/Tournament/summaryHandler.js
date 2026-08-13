const { dataFiles, statuses } = require('./config');
const { readData, writeData } = require('./utilities');
const { buildSummaryEmbed } = require('./templetes/summaryEmbed');

// Pre-built Set for terminal status checks
const TERMINAL_STATUSES = new Set([statuses.CANCELLED]);

async function updateWeeklySummary(client) {
    const settings = await readData(dataFiles.settings, {});
    if (settings.summaryEnabled === false) return;

    // Parallelize data loading
    const [games, tournaments, matches, summaryData] = await Promise.all([
        readData(dataFiles.games, []),
        readData(dataFiles.tournaments, []),
        readData(dataFiles.matches, []),
        readData(dataFiles.summary, {})
    ]);

    // Filter matches for the next 7 days
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const nextWeek = new Date(today);
    nextWeek.setDate(today.getDate() + 7);

    for (const game of games) {
        if (!game.summaryChannelId) continue;

        // Get active matches for this game within the week
        const gameMatches = matches.filter(m => {
            if (m.gameId !== game.id) return false;

            // Only show scheduled, announced, roster open/locked, and recently completed
            if (TERMINAL_STATUSES.has(m.status)) return false;

            const matchDate = new Date(m.matchDate);
            return matchDate >= today && matchDate <= nextWeek;
        });

        try {
            const channel = await client.channels.fetch(game.summaryChannelId);
            if (!channel) continue;

            const embed = buildSummaryEmbed(game, gameMatches, tournaments);
            let messageId = summaryData[game.id];
            let message = null;

            if (messageId) {
                try {
                    message = await channel.messages.fetch(messageId);
                    await message.edit({ embeds: [embed] });
                } catch (e) {
                    // Message might have been deleted, we'll post a new one
                    message = null;
                }
            }

            if (!message) {
                message = await channel.send({ embeds: [embed] });
                summaryData[game.id] = message.id;
            }
        } catch (e) {
            console.error(`Failed to update summary for game ${game.name}:`, e);
        }
    }

    await writeData(dataFiles.summary, summaryData);
}

module.exports = {
    updateWeeklySummary
};
