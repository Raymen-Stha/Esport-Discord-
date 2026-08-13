const { EmbedBuilder } = require('discord.js');
const { colors } = require('../config');

function buildSummaryEmbed(game, matchesThisWeek, tournaments) {
    const embed = new EmbedBuilder()
        .setTitle(`📅 Weekly Summary: ${game.name}`)
        .setColor(colors.summary)
        .setTimestamp()
        .setFooter({ text: 'Auto-updates periodically' });

    if (!matchesThisWeek || matchesThisWeek.length === 0) {
        embed.setDescription('*No upcoming matches this week.*');
        return embed;
    }

    // Group matches by Date
    const grouped = {};
    for (const match of matchesThisWeek) {
        if (!grouped[match.matchDate]) {
            grouped[match.matchDate] = [];
        }
        grouped[match.matchDate].push(match);
    }

    // Sort dates
    const sortedDates = Object.keys(grouped).sort();

    for (const date of sortedDates) {
        // Try to get day of week
        let dayName = date;
        try {
            const d = new Date(date);
            if (!isNaN(d)) {
                dayName = d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
            }
        } catch (e) { }

        let dayContent = '';
        for (const match of grouped[date]) {
            const t = tournaments.find(t => t.id === match.tournamentId);
            const tName = t ? t.name : 'Unknown Tournament';
            let statusBadge = '';
            if (match.status === 'completed') statusBadge = `[${match.result.toUpperCase()}] `;
            else if (match.status === 'cancelled') statusBadge = '[CANCELLED] ';

            const teamName = match.teamName || 'SCU';
            dayContent += `• **${match.matchTime}** - ${tName}\n  └ ${teamName} vs **${match.opponent}** ${statusBadge}\n`;
        }
        embed.addFields({ name: dayName, value: dayContent, inline: false });
    }

    return embed;
}

module.exports = { buildSummaryEmbed };
