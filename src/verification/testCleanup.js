const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
// Import the shared logic from aluminicleanup.js
const { runCleanupLogic } = require('./aluminicleanup.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('test-alumni')
        .setDescription('Manual trigger for alumni role cleanup (Test Only)')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        // Defer the reply as database processing can take time
        await interaction.deferReply({ ephemeral: true });

        try {
            // Call the function directly
            const count = await runCleanupLogic(interaction.guild);

            return interaction.editReply({
                content: `✅ **Manual Sync Success.** Processed database and updated **${count}** members to Alumni.`
            });
        } catch (error) {
            console.error("Manual Sync Command Error:", error);
            return interaction.editReply({ content: "❌ Failed to run manual sync." });
        }
    }
};