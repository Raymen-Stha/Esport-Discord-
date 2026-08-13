const { generateTranscript } = require('./transcript.js');
const { getTicket } = require('./db.js'); // --- IMPORT DB UTILITY ---

module.exports = (client) => {
    const STAFF_ROLE_ID = ['1298099720572375131', '1298101273027153992'];

    client.on('interactionCreate', async (interaction) => {
        // --- 1. NAMESPACE GUARD ---
        if (!interaction.isButton() || !interaction.customId.startsWith('ticket_')) return;

        if (interaction.replied || interaction.deferred) return;

        // --- 2. HANDLE CLOSE ---
        if (interaction.customId === 'ticket_close') {
            await interaction.reply({ content: '🔒 Closing ticket...' });

            try {
                // Fetch ticket data from JSON instead of Channel Topic
                const ticketData = await getTicket(interaction.channel.id);

                // Remove the user's personal permission overwrite
                if (ticketData && ticketData.userId) {
                    await interaction.channel.permissionOverwrites.delete(ticketData.userId)
                        .catch(() => console.log("Personal overwrite already gone."));
                } else {
                    // Fallback to topic just in case it's an older ticket
                    const openerId = interaction.channel.topic;
                    if (openerId) {
                        await interaction.channel.permissionOverwrites.delete(openerId).catch(() => null);
                    }
                }

                // Lock the channel for the rest of the guild (@everyone)
                await interaction.channel.permissionOverwrites.edit(interaction.guild.id, {
                    ViewChannel: false
                });

                await interaction.followUp('✅ Ticket closed. The user has been removed and this ticket can now be deleted.');
            } catch (error) {
                console.error("Close Error:", error);
                await interaction.followUp('⚠️ Failed to fully remove user permissions.');
            }
        }

        // --- 3. HANDLE DELETE (Staff Only) ---
        if (interaction.customId === 'ticket_delete') {

            // Check if the member has ANY of the staff roles in the array
            const isStaff = STAFF_ROLE_ID.some(roleId => interaction.member.roles.cache.has(roleId));

            if (!isStaff) {
                return interaction.reply({
                    content: '❌ Only staff can delete tickets.',
                    ephemeral: true
                });
            }

            // Proceed if they are staff
            await generateTranscript(interaction);
        }
    });
};