const { EmbedBuilder } = require('discord.js');
const { colors } = require('../config');

function buildReminderEmbed(match, tournament, type, game) {
    const embed = new EmbedBuilder()
        .setTitle(`⏰ Match Reminder: ${tournament.name}`)
        .setColor(colors.reminder)
        .addFields(
            { name: 'Match', value: `${match.teamName} vs ${match.opponent}`, inline: true },
            { name: 'Time', value: `${match.matchDate} @ ${match.matchTime}`, inline: true },
            { name: 'Game', value: game.name, inline: true }
        )
        .setTimestamp();

    if (type === 'captain') {
        embed.setDescription(`Your match is in **24 hours**. The roster submission window is now open.\nPlease submit the roster using the button in the announcement channel.`);
    } else if (type === 'roster_alert') {
        embed.setColor(colors.error);
        embed.setDescription(`⚠️ **Warning:** Your match is in 6 hours and no roster has been submitted!`);
    } else if (type === 'player_6h') {
        embed.setDescription(`Your match starts in **6 hours**.\nPlease ensure you are online and ready 30 minutes before check-in.`);
    } else if (type === 'final_1h') {
        embed.setColor(colors.error); // Urgent
        embed.setDescription(`🚨 **FINAL REMINDER** 🚨\nMatch begins in **1 HOUR**. All players must be in the voice channel.`);
    }

    return embed;
}

module.exports = { buildReminderEmbed };
