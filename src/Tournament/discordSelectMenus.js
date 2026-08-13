const { ActionRowBuilder, UserSelectMenuBuilder } = require('discord.js');
const { prefixes, dataFiles } = require('./config');
const { readData, log } = require('./utilities');
const rosterHandler = require('./rosterHandler');

// TTL for roster drafts (10 minutes)
const DRAFT_TTL_MS = 10 * 60 * 1000;

module.exports = (client) => {
    client.on('interactionCreate', async (interaction) => {
        if (!interaction.isUserSelectMenu()) return;
        if (!interaction.customId.startsWith(prefixes.select)) return;

        try {
            // =========================================================
            // STEP 1: Select Starters
            // ID Format: tournament_sel_starters_{matchId}
            // =========================================================
            if (interaction.customId.startsWith(`${prefixes.select}starters_`)) {
                await interaction.deferReply({ ephemeral: true });
                
                const matchId = interaction.customId.replace(`${prefixes.select}starters_`, '');
                const selectedStarters = interaction.values;
                
                // Fetch context (async)
                const matches = await readData(dataFiles.matches, []);
                const match = matches.find(m => m.id === matchId);
                const games = await readData(dataFiles.games, []);
                const game = games.find(g => g.id === match.gameId);
                
                // Validate starter count
                if (selectedStarters.length !== game.squadSize) {
                    return interaction.editReply(`❌ Please select exactly **${game.squadSize}** starters. You selected ${selectedStarters.length}.`);
                }
                
                // If the game requires a bench, move to Step 2
                if (game.benchSize > 0) {
                    if (!global.rosterDrafts) global.rosterDrafts = new Map();
                    const draftKey = `${matchId}_${interaction.user.id}`;
                    
                    // Clear any existing timeout for this draft
                    if (global.rosterDrafts.has(draftKey)) {
                        clearTimeout(global.rosterDrafts.get(draftKey).timeout);
                    }
                    
                    // Set new draft with TTL
                    global.rosterDrafts.set(draftKey, { 
                        starters: selectedStarters,
                        timeout: setTimeout(() => {
                            global.rosterDrafts.delete(draftKey);
                        }, DRAFT_TTL_MS)
                    });
                    
                    const row = new ActionRowBuilder().addComponents(
                        new UserSelectMenuBuilder()
                            .setCustomId(`${prefixes.select}bench_${matchId}`)
                            .setPlaceholder(`Select ${game.benchSize} bench player(s)...`)
                            .setMinValues(game.benchSize)
                            .setMaxValues(game.benchSize)
                    );
                    
                    return interaction.editReply({
                        content: `✅ Starters selected. Now, please select **${game.benchSize}** bench player(s).`,
                        components: [row]
                    });
                }
                
                // If no bench required, submit immediately
                await submitFinalRoster(client, interaction, matchId, selectedStarters, []);
                return;
            }

            // =========================================================
            // STEP 2: Select Bench
            // ID Format: tournament_sel_bench_{matchId}
            // =========================================================
            if (interaction.customId.startsWith(`${prefixes.select}bench_`)) {
                await interaction.deferReply({ ephemeral: true });
                
                const matchId = interaction.customId.replace(`${prefixes.select}bench_`, '');
                const selectedBench = interaction.values;
                
                // Fetch draft
                const draftKey = `${matchId}_${interaction.user.id}`;
                const draft = global.rosterDrafts ? global.rosterDrafts.get(draftKey) : null;
                
                if (!draft || !draft.starters) {
                    return interaction.editReply("❌ Session expired or invalid state. Please click 'Submit Roster' on the announcement again.");
                }
                
                // Check overlap between starters and bench
                const overlap = selectedBench.some(id => draft.starters.includes(id));
                if (overlap) {
                    return interaction.editReply("❌ You cannot select the same player for both starting and bench positions.");
                }
                
                // Submit final roster
                await submitFinalRoster(client, interaction, matchId, draft.starters, selectedBench);
                
                // Clean up draft and clear its timeout
                clearTimeout(draft.timeout);
                global.rosterDrafts.delete(draftKey);
                return;
            }
            
        } catch (error) {
            console.error("Select Menu Error:", error);
            if (interaction.deferred) {
                await interaction.editReply(`❌ An error occurred: ${error.message}`).catch(() => {});
            }
        }
    });
};

/**
 * Helper to submit roster and reply
 */
async function submitFinalRoster(client, interaction, matchId, starters, bench) {
    try {
        await rosterHandler.submitRoster(client, matchId, interaction.user.id, starters, bench);
        await interaction.editReply({
            content: "✅ Roster submitted successfully! The announcement has been updated and players will be notified.",
            components: []
        });
    } catch (error) {
        await interaction.editReply(`❌ Failed to submit roster: ${error.message}`);
    }
}
