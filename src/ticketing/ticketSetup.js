const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('setup-tickets')
        .setDescription('Setup the ticketing system'),

    async execute(interaction) {
        const STAFF_ROLE_ID = ['1298099720572375131', '1298101273027153992', '1399599012906012756'];

        // 1. Check if the user has ANY of the Staff Roles (Fix: was checking the whole array directly)
        const isStaff = STAFF_ROLE_ID.some(roleId => interaction.member.roles.cache.has(roleId));
        if (!isStaff) {
            return interaction.reply({
                content: '❌ You do not have the required **Staff Role** to use this command.',
                ephemeral: true
            });
        }

        // 2. Build the Ticket Embed
        const embed = new EmbedBuilder()
            .setTitle('📩 Support Tickets')
            .setDescription('Click the button below to open a new support ticket.\nOur staff will be with you shortly.')
            .setColor(0x00AE86)
            .setThumbnail(interaction.guild.iconURL());

        const button = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('ticket_open') // <--- FIXED: Now matches the Handler's prefix
                .setLabel('Open Ticket')
                .setEmoji('🎫')
                .setStyle(ButtonStyle.Primary)
        );

        // 3. Send Response
        await interaction.reply({ content: '✅ Ticketing system embed has been generated below.', ephemeral: true });
        await interaction.channel.send({ embeds: [embed], components: [button] });
    }
};