const { EmbedBuilder } = require('discord.js');
const { colors } = require('../config');

function buildRosterEmbed(match, tournament, roster) {
    const embed = new EmbedBuilder()
        .setTitle(`📋 Roster Confirmed: ${tournament.name}`)
        .setDescription(`${match.teamName} vs ${match.opponent}`)
        .setColor(colors.roster)
        .setTimestamp();

    if (roster && roster.players) {
        const startersList = roster.players.map((pId, i) => `${i + 1}. <@${pId}>`).join('\n') || 'None';
        embed.addFields({ name: 'Starters', value: startersList, inline: true });

        if (roster.bench && roster.bench.length > 0) {
            const benchList = roster.bench.map((pId, i) => `${i + 1}. <@${pId}>`).join('\n');
            embed.addFields({ name: 'Bench', value: benchList, inline: true });
        }
    }

    embed.setFooter({ text: 'Selected players will receive reminders before the match.' });

    return embed;
}

module.exports = { buildRosterEmbed };
