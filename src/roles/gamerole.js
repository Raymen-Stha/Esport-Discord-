const { EmbedBuilder, Events, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

module.exports = (client) => {
    // Array of game roles for button generation
    const GAME_ROLES = [
        { label: 'Valorant', emoji: '1515587543889084597', roleId: '1300268343483301918' },
        { label: 'LoL', emoji: '1515587558833389619', roleId: '1300316815959920701' },
        { label: 'Rocket League', emoji: '1515587578156290088', roleId: '1300244643606429818' },
        { label: 'Marvel Rivals', emoji: '1515587605293437058', roleId: '1339058485559558156' },
        { label: 'Fortnite', emoji: '1515587627913318584', roleId: '1300584587742810142' },
        { label: 'R6 Siege', emoji: '1515587511815114823', roleId: '1300584377956175902' },
        { label: 'Dota 2', emoji: '1515587658817208430', roleId: '1300584190839885936' },
        { label: 'CS2', emoji: '1515587671416901662', roleId: '1300244911752220682' }
    ];

    const ADMIN_ROLE_ID = '1298101273027153992';

    // --- 1. SETUP COMMAND ---
    client.on(Events.MessageCreate, async (message) => {
        if (message.author.bot || !message.guild) return;

        if (message.content === '!setup-roles') {
            if (!message.member.roles.cache.has(ADMIN_ROLE_ID)) {
                return message.reply("❌ You don't have the required admin role.");
            }

            const roleEmbed = new EmbedBuilder()
                .setTitle('🎮 Select Your Game Roles')
                .setColor(0xFFCC00)
                .setAuthor({
                    name: 'Southern Cross University',
                    iconURL: client.user.displayAvatarURL()
                })
                .setDescription(
                    'Click the buttons below to get access to specific game channels!\n\n' +
                    '### <:valorant:1515587543889084597> Valorant\n' +
                    '### <:lol:1515587558833389619> League of Legends\n' +
                    '### <:RL:1515587578156290088> Rocket League\n' +
                    '### <:MR:1515587605293437058> Marvel Rivals\n' +
                    '### <:FN:1515587627913318584> Fortnite\n' +
                    '### <:RSS6:1515587511815114823> R6 Siege\n' +
                    '### <:d2:1515587658817208430> Dota 2\n' +
                    '### <:CS2:1515587671416901662> CS2'
                )
                .setThumbnail(client.user.displayAvatarURL())
                .setFooter({ text: 'SCU Student Support Services' });

            const rows = [];
            // Discord limits 5 buttons per ActionRow
            for (let i = 0; i < GAME_ROLES.length; i += 5) {
                const row = new ActionRowBuilder();
                const slice = GAME_ROLES.slice(i, i + 5);
                for (const game of slice) {
                    row.addComponents(
                        new ButtonBuilder()
                            .setCustomId(`gamerole_${game.roleId}`)
                            .setLabel(game.label)
                            .setEmoji(game.emoji)
                            .setStyle(ButtonStyle.Secondary)
                    );
                }
                rows.push(row);
            }

            await message.channel.send({ embeds: [roleEmbed], components: rows });
        }
    });

    // --- 2. BUTTON INTERACTION ---
    client.on(Events.InteractionCreate, async (interaction) => {
        if (!interaction.isButton()) return;

        if (interaction.customId.startsWith('gamerole_')) {
            const roleId = interaction.customId.split('_')[1];
            const role = interaction.guild.roles.cache.get(roleId);

            if (!role) {
                return interaction.reply({ content: '⚠️ Role not found. Please contact an admin.', ephemeral: true });
            }

            const member = interaction.member;

            try {
                if (member.roles.cache.has(roleId)) {
                    await member.roles.remove(role);
                    return interaction.reply({ content: `❌ Removed the **${role.name}** role.`, ephemeral: true });
                } else {
                    await member.roles.add(role);
                    return interaction.reply({ content: `✅ Added the **${role.name}** role!`, ephemeral: true });
                }
            } catch (error) {
                console.error(`Failed to assign/remove role ${roleId} for user ${member.id}:`, error);
                return interaction.reply({ content: '⚠️ I encountered an error modifying your roles.', ephemeral: true });
            }
        }
    });
};
