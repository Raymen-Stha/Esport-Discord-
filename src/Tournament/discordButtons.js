const { ActionRowBuilder, UserSelectMenuBuilder } = require('discord.js');
const { prefixes, dataFiles } = require('./config');
const { readData, log } = require('./utilities');

module.exports = (client) => {
    client.on('interactionCreate', async (interaction) => {
        if (!interaction.isButton()) return;
        if (!interaction.customId.startsWith(prefixes.button)) return;

        try {
            // =========================================================
            // SUBMIT ROSTER BUTTON CLICK
            // ID Format: tournament_btn_roster_submit_{matchId}
            // =========================================================
            if (interaction.customId.startsWith(`${prefixes.button}roster_submit_`)) {
                
                const matchId = interaction.customId.replace(`${prefixes.button}roster_submit_`, '');
                
                const matches = await readData(dataFiles.matches, []);
                const match = matches.find(m => m.id === matchId);
                if (!match) {
                    return interaction.reply({ content: '❌ Match no longer exists.', ephemeral: true });
                }

                if (match.status === 'completed' || match.status === 'cancelled') {
                     return interaction.reply({ content: '❌ This match is closed.', ephemeral: true });
                }

                const games = await readData(dataFiles.games, []);
                const game = games.find(g => g.id === match.gameId);
                if (!game) {
                    return interaction.reply({ content: '❌ Game configuration error.', ephemeral: true });
                }

                // SECURITY: Verify Captain Role
                if (game.captainRoleId && !interaction.member.roles.cache.has(game.captainRoleId)) {
                    await log('SECURITY_BLOCK', `User ${interaction.user.id} tried to submit roster without captain role for game ${game.name}.`);
                    return interaction.reply({ 
                        content: `❌ You must have the <@&${game.captainRoleId}> role to submit rosters.`, 
                        ephemeral: true 
                    });
                }

                // Launch Starters Select Menu
                const squadSize = parseInt(game.squadSize) || 5;
                const row = new ActionRowBuilder().addComponents(
                    new UserSelectMenuBuilder()
                        .setCustomId(`${prefixes.select}starters_${match.id}`)
                        .setPlaceholder(`Select ${squadSize} starting player(s)...`)
                        .setMinValues(squadSize)
                        .setMaxValues(squadSize)
                );

                const teamName = match.teamName || 'SCUR';
                await interaction.reply({
                    content: `**Roster Submission — ${teamName} vs ${match.opponent}**\n\nStep 1: Select your **${game.squadSize}** starters.`,
                    components: [row],
                    ephemeral: true
                });
                
                await log('ROSTER_FLOW_START', `Captain ${interaction.user.id} started roster submission for match ${match.id}`);
            }
            
        } catch (error) {
            console.error("Button Error:", error);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ content: `❌ An error occurred: ${error.message}`, ephemeral: true }).catch(() => {});
            }
        }
    });
};
