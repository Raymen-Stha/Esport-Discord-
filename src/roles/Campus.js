const { EmbedBuilder, Events, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');

// Database Paths
const configPath = path.join(__dirname, 'campus_config.json');
const studentDbPath = path.join(__dirname, 'student_campuses.json');

module.exports = (client) => {
    // Helper to read/write setup configuration (Message ID) - Async
    const getConfig = async () => {
        try {
            await fsp.access(configPath);
            return JSON.parse(await fsp.readFile(configPath, 'utf8'));
        } catch (e) {
            return { messageId: null };
        }
    };
    const saveConfig = async (id) => {
        await fsp.writeFile(configPath, JSON.stringify({ messageId: id }, null, 2));
    };

    // Helper to read/write user-campus mapping database for your website integration - Async
    const getStudentDb = async () => {
        try {
            await fsp.access(studentDbPath);
            return JSON.parse(await fsp.readFile(studentDbPath, 'utf8'));
        } catch (e) {
            return {};
        }
    };
    const saveStudentDb = async (data) => {
        await fsp.writeFile(studentDbPath, JSON.stringify(data, null, 2));
    };

    // Campus Mapping Configuration
    const CAMPUS_ROLES = {
        'sydney': { roleId: '1526755394867691560', label: 'Sydney', emoji: '1526755338114830336' },
        'melbourne': { roleId: '1526755648954564658', label: 'Melbourne', emoji: '1526755243117903943' },
        'perth': { roleId: '1526755557841830030', label: 'Perth', emoji: '1526755307731288104' },
        'brisbane': { roleId: '1526755434864574584', label: 'Brisbane', emoji: '1526755271488049252' },
        'goldcoast': { roleId: '1526755457967063180', label: 'Gold Coast', emoji: '1526755206262558830' },
        'lismore': { roleId: '1526755487951884359', label: 'Lismore', emoji: '1526755161639223497' },
        'coffsharbour': { roleId: '1526755505085743155', label: 'Coffs Harbour', emoji: '1526755112020869272' },
        'online': { roleId: '1526755575621488670', label: 'Online', emoji: '1526755057931124807' }
    };

    // Pre-compute Set of all campus role IDs for O(1) lookups
    const allCampusRoleIds = new Set(Object.values(CAMPUS_ROLES).map(c => c.roleId));

    const ADMIN_ROLE_ID = '1298101273027153992';

    // --- 1. SETUP CAMPUS COMMAND ---
    client.on(Events.MessageCreate, async (message) => {
        if (message.author.bot || !message.guild) return;

        if (message.content === '!setup-campuses') {
            if (!message.member.roles.cache.has(ADMIN_ROLE_ID)) {
                return message.reply("❌ You don't have the required admin role.");
            }

            const campusEmbed = new EmbedBuilder()
                .setTitle('🏫 Select Your Campus')
                .setColor(0x00A3E0)
                .setAuthor({
                    name: 'Southern Cross University',
                    iconURL: client.user.displayAvatarURL()
                })
                .setDescription(
                    'Please select your current campus by clicking one of the buttons below.\n' +
                    '*Note: Choosing a new campus will automatically update your profile and remove your previous selection.*\n\n' +
                    Object.values(CAMPUS_ROLES).map(data => `### <:${data.label.replace(/\s+/g, '')}:${data.emoji}> ${data.label}`).join('\n')
                )
                .setThumbnail(client.user.displayAvatarURL())
                .setFooter({ text: 'SCU Student Support Services' });

            const rows = [];
            const campusEntries = Object.entries(CAMPUS_ROLES);

            for (let i = 0; i < campusEntries.length; i += 5) {
                const row = new ActionRowBuilder();
                const slice = campusEntries.slice(i, i + 5);

                slice.forEach(([customId, data]) => {
                    row.addComponents(
                        new ButtonBuilder()
                            .setCustomId(`campus_${customId}`)
                            .setLabel(data.label)
                            .setStyle(ButtonStyle.Secondary)
                            .setEmoji(data.emoji)
                    );
                });
                rows.push(row);
            }

            const sent = await message.channel.send({ embeds: [campusEmbed], components: rows });
            await saveConfig(sent.id);
        }
    });

    // --- 2. BUTTON INTERACTION HANDLING ---
    client.on(Events.InteractionCreate, async (interaction) => {
        if (!interaction.isButton()) return;
        if (!interaction.customId.startsWith('campus_')) return;

        const { messageId } = await getConfig();
        if (interaction.message.id !== messageId) return;

        await interaction.deferReply({ ephemeral: true });

        const targetKey = interaction.customId.replace('campus_', '');
        const selectedCampus = CAMPUS_ROLES[targetKey];
        if (!selectedCampus) return interaction.editReply({ content: '❌ Campus layout setup error.' });

        const member = interaction.member;
        const guild = interaction.guild;

        // Find all roles controlled by this system that the user currently has using Set O(1)
        const rolesToRemoveIds = member.roles.cache
            .filter(role => allCampusRoleIds.has(role.id) && role.id !== selectedCampus.roleId)
            .map(role => role.id);

        try {
            // 1. Remove old campus roles in batch
            if (rolesToRemoveIds.length > 0) {
                await member.roles.remove(rolesToRemoveIds);
            }

            // 2. Assign the new campus role
            if (!member.roles.cache.has(selectedCampus.roleId)) {
                await member.roles.add(selectedCampus.roleId);
            }

            // 3. Update the tracking database for your website reference (async)
            const studentDb = await getStudentDb();
            studentDb[interaction.user.id] = {
                username: interaction.user.username,
                campusKey: targetKey,
                campusName: selectedCampus.label,
                roleId: selectedCampus.roleId,
                updatedAt: new Date().toISOString()
            };
            await saveStudentDb(studentDb);

            return interaction.editReply({
                content: `✅ Your profile has been updated! You are now assigned to the **${selectedCampus.label}** campus.`
            });

        } catch (error) {
            console.error('Error modifying member roles or database:', error);
            return interaction.editReply({
                content: '❌ Something went wrong while updating your preferences. Please contact an administrator.'
            });
        }
    });
};