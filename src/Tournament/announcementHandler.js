const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { prefixes, dataFiles } = require('./config');
const { readData, writeData, log } = require('./utilities');
const { buildAnnouncementEmbed } = require('./templetes/announcementEmbed');
const { setAnnouncementMessageId } = require('./matchHandler');

/**
 * Posts a new match announcement to the game's announcement channel.
 */
async function postAnnouncement(client, match, game) {
    if (!game.announcementChannelId) {
        await log('ANNOUNCEMENT_ERROR', `Game ${game.name} has no announcement channel configured.`);
        return null;
    }

    try {
        const channel = await client.channels.fetch(game.announcementChannelId);
        if (!channel) throw new Error('Channel not found');

        const tournaments = await readData(dataFiles.tournaments, []);
        const tournament = tournaments.find(t => t.id === match.tournamentId);

        const embed = buildAnnouncementEmbed(match, tournament, game, null);
        
        // Add "Submit Roster" button if match is not completed/cancelled
        const components = [];
        if (!['completed', 'cancelled'].includes(match.status)) {
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`${prefixes.button}roster_submit_${match.id}`)
                    .setLabel('Submit Roster')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('📋')
            );
            components.push(row);
        }

        const message = await channel.send({ embeds: [embed], components });
        
        // Save the message ID so we can edit it later
        await setAnnouncementMessageId(match.id, message.id);
        await log('ANNOUNCEMENT_POSTED', `Posted announcement for match ${match.id}`);
        return message;

    } catch (error) {
        console.error(`Failed to post announcement for match ${match.id}:`, error);
        await log('ANNOUNCEMENT_ERROR', `Failed to post announcement: ${error.message}`);
        return null;
    }
}

/**
 * Updates an existing match announcement (e.g. status change, roster submitted, result entered).
 */
async function updateAnnouncement(client, match, game, roster = null) {
    if (!match.announcementMessageId || !game.announcementChannelId) return null;

    try {
        const channel = await client.channels.fetch(game.announcementChannelId);
        if (!channel) return null;

        const message = await channel.messages.fetch(match.announcementMessageId);
        if (!message) return null;

        const tournaments = await readData(dataFiles.tournaments, []);
        const tournament = tournaments.find(t => t.id === match.tournamentId);

        const embed = buildAnnouncementEmbed(match, tournament, game, roster);
        
        // Keep button unless match is completed/cancelled
        const components = [];
        if (!['completed', 'cancelled'].includes(match.status)) {
             const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`${prefixes.button}roster_submit_${match.id}`)
                    .setLabel(roster ? 'Edit Roster' : 'Submit Roster')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('📋')
            );
            components.push(row);
        }

        await message.edit({ embeds: [embed], components });
        await log('ANNOUNCEMENT_UPDATED', `Updated announcement for match ${match.id}`);
        return message;

    } catch (error) {
        console.error(`Failed to update announcement for match ${match.id}:`, error);
        return null;
    }
}

module.exports = {
    postAnnouncement,
    updateAnnouncement
};
