const { ChannelType, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { saveTicket } = require('./db.js');

module.exports = (client) => {
    const TICKET_CATEGORY = '1515570304636948480';
    const STAFF_ROLE_ID = ['1298099720572375131', '1298101273027153992', '1399599012906012756'];

    client.on('interactionCreate', async (interaction) => {
        // --- 1. NAMESPACE GUARD ---
        if (!interaction.isButton() || !interaction.customId.startsWith('ticket_')) return;

        // --- 2. OPEN TICKET LOGIC ---
        if (interaction.customId === 'ticket_open') {
            try {
                await interaction.deferReply({ ephemeral: true });

                const ticketId = Math.floor(1000 + Math.random() * 9000);
                const channelName = `ticket-${ticketId}-${interaction.user.username}`;

                const channel = await interaction.guild.channels.create({
                    name: channelName,
                    type: ChannelType.GuildText,
                    parent: TICKET_CATEGORY,
                    topic: interaction.user.id, // Fallback
                    permissionOverwrites: [
                        {
                            id: interaction.guild.id,
                            deny: [PermissionFlagsBits.ViewChannel]
                        },
                        {
                            id: interaction.user.id,
                            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.ReadMessageHistory]
                        },
                        // Map through the array to generate a separate object for each role ID
                        ...STAFF_ROLE_ID.map(roleId => ({
                            id: roleId,
                            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.ReadMessageHistory]
                        }))
                    ]
                });

                // --- 3. SAVE TO JSON DATABASE ---
                await saveTicket(channel.id, interaction.user.id);

                const adminEmbed = new EmbedBuilder()
                    .setTitle('🛠️ Ticket Admin Controls')
                    .setDescription(`Ticket opened by ${interaction.user.tag}\nStaff will be with you shortly.`)
                    .setColor(0xFFCC00)
                    .setTimestamp();

                const buttons = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('ticket_close').setLabel('Close').setStyle(ButtonStyle.Danger).setEmoji('🔒'),
                    new ButtonBuilder().setCustomId('ticket_delete').setLabel('Delete').setStyle(ButtonStyle.Secondary).setEmoji('🗑️')
                );

                await channel.send({
                    content: `Welcome <@${interaction.user.id}> | ${STAFF_ROLE_ID.map(id => `<@&${id}>`).join(' ')}`, embeds: [adminEmbed],
                    components: [buttons]
                });

                await interaction.editReply({
                    content: `✅ Your ticket has been created: ${channel}`
                });

            } catch (error) {
                console.error('Ticket Creation Error:', error);
                if (interaction.deferred) {
                    await interaction.editReply({ content: '❌ Failed to create ticket.' }).catch(() => null);
                }
            }
        }
    });
};