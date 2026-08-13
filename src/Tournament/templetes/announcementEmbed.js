const { EmbedBuilder } = require('discord.js');
const { colors, statuses } = require('../config');

/**
 * Builds an announcement embed for a match.
 */
function buildAnnouncementEmbed(match, tournament, game, roster = null) {
    const teamName = match.teamName || 'SCUR';

    const embed = new EmbedBuilder()
        .setTitle(`🏆 ${tournament.name}`)
        .setColor(colors.announcement)
        .addFields(
            { name: 'Match', value: `**${teamName}** vs **${match.opponent}**`, inline: false },
            { name: 'Date', value: match.matchDate, inline: true },
            { name: 'Time', value: match.matchTime || 'TBA', inline: true },
            { name: 'Game', value: game.name, inline: true }
        )
        .setTimestamp();

    if (match.notes) {
        embed.addFields({ name: 'Notes', value: match.notes, inline: false });
    }

    // Status / Result
    if (match.status === statuses.COMPLETED) {
        embed.setColor(colors.completed);
        let resultEmoji = '➖';
        if (match.result === 'win') resultEmoji = '🏆';
        else if (match.result === 'loss') resultEmoji = '❌';

        // Build score display — prefer split scores, fallback to legacy string
        let scoreDisplay = 'N/A';
        if (match.scoreTeam !== null && match.scoreTeam !== undefined &&
            match.scoreOpponent !== null && match.scoreOpponent !== undefined) {
            scoreDisplay = `${teamName} **${match.scoreTeam}** — **${match.scoreOpponent}** ${match.opponent}`;
        } else if (match.score) {
            scoreDisplay = match.score;
        }
        
        embed.addFields(
            { name: 'Result', value: `${resultEmoji} **${match.result.toUpperCase()}**`, inline: true },
            { name: 'Score', value: scoreDisplay, inline: true }
        );
        if (match.resultNotes) {
            embed.addFields({ name: 'Result Notes', value: match.resultNotes, inline: false });
        }
    } else if (match.status === statuses.CANCELLED) {
        embed.setColor(colors.error);
        embed.addFields({ name: 'Status', value: '🚫 **CANCELLED**', inline: false });
    } else if (match.status === statuses.IN_PROGRESS) {
        embed.addFields({ name: 'Status', value: '🔴 **LIVE NOW**', inline: false });
    } else {
        // Roster formatting
        if (roster && roster.players.length > 0) {
            const startersList = roster.players.map(pId => `<@${pId}>`).join('\n') || 'None';
            embed.addFields({ name: 'Starters', value: startersList, inline: true });
            
            if (roster.bench && roster.bench.length > 0) {
                const benchList = roster.bench.map(pId => `<@${pId}>`).join('\n');
                embed.addFields({ name: 'Bench', value: benchList, inline: true });
            }
        } else {
             embed.addFields({ name: 'Roster', value: '⏳ *Pending Captain Submission*', inline: false });
        }
    }
    
    if (game.captainRoleId) {
        embed.setDescription(`Captain: <@&${game.captainRoleId}>`);
    }

    return embed;
}

module.exports = { buildAnnouncementEmbed };
