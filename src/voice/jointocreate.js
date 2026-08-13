const {
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ActionRowBuilder,
    ChannelType,
    PermissionFlagsBits,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder
} = require('discord.js');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');

const dbPath = path.join(__dirname, 'active_vcs.json');

const getActiveVCs = async () => {
    try {
        await fsp.access(dbPath);
        const data = await fsp.readFile(dbPath, 'utf8');
        return data.trim() === "" ? {} : JSON.parse(data);
    } catch (e) {
        // If file doesn't exist, create it and return empty
        await fsp.writeFile(dbPath, JSON.stringify({}));
        return {};
    }
};

const saveActiveVCs = async (data) => {
    await fsp.writeFile(dbPath, JSON.stringify(data, null, 2));
};

module.exports = (client) => {
    const GENERATOR_CHANNEL_ID = '1515579378388697229';
    const CATEGORY_ID = '1515590565163434175';

    const GAME_ROLES = {
        'valorant': '1300268343483301918',
        'lol': '1300316815959920701',
        'rocket_league': '1300244643606429818',
        'marvel_rivals': '1339058485559558156',
        'fortnite': '1300584587742810142',
        'siege': '1300584377956175902',
        'dota': '1300584190839885936',
        'cs2': '1300244911752220682'
    };

    client.on('voiceStateUpdate', async (oldState, newState) => {
        const member = newState.member;
        if (newState.channelId === GENERATOR_CHANNEL_ID) {
            try {
                const tempChannel = await newState.guild.channels.create({
                    name: `⏳ Setting up...`,
                    type: ChannelType.GuildVoice,
                    parent: CATEGORY_ID,
                    permissionOverwrites: [
                        { id: newState.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
                        { id: member.id, allow: [PermissionFlagsBits.Connect, PermissionFlagsBits.ViewChannel] }
                    ]
                });

                await member.voice.setChannel(tempChannel);

                const select = new StringSelectMenuBuilder()
                    .setCustomId('vc_game_select')
                    .setPlaceholder('Select the game you are playing...')
                    .addOptions(
                        new StringSelectMenuOptionBuilder().setLabel('Valorant').setValue('valorant').setEmoji('1515587543889084597'),
                        new StringSelectMenuOptionBuilder().setLabel('League of Legends').setValue('lol').setEmoji('1515587558833389619'),
                        new StringSelectMenuOptionBuilder().setLabel('Rocket League').setValue('rocket_league').setEmoji('1515587578156290088'),
                        new StringSelectMenuOptionBuilder().setLabel('Marvel Rivals').setValue('marvel_rivals').setEmoji('1515587605293437058'),
                        new StringSelectMenuOptionBuilder().setLabel('Fortnite').setValue('fortnite').setEmoji('1515587627913318584'),
                        new StringSelectMenuOptionBuilder().setLabel('R6 Siege').setValue('siege').setEmoji('1515587511815114823'),
                        new StringSelectMenuOptionBuilder().setLabel('Dota 2').setValue('dota').setEmoji('1515587658817208430'),
                        new StringSelectMenuOptionBuilder().setLabel('CS2').setValue('cs2').setEmoji('1515587671416901662')
                    );

                const row = new ActionRowBuilder().addComponents(select);

                await tempChannel.send({
                    content: `Welcome <@${member.id}>! Select your game below.`,
                    components: [row]
                });

                const db = await getActiveVCs();
                // Use User ID during setup
                db[member.id] = { channelId: tempChannel.id, ownerId: member.id };
                await saveActiveVCs(db);
            } catch (err) {
                console.error("VC Error:", err);
            }
        }
    });

    client.on('interactionCreate', async (interaction) => {
        if (interaction.isStringSelectMenu() && interaction.customId === 'vc_game_select') {
            const db = await getActiveVCs();
            const data = db[interaction.user.id];
            if (!data) return interaction.reply({ content: "Rejoin the generator.", ephemeral: true });

            data.selectedGame = interaction.values[0];
            await saveActiveVCs(db);

            const modal = new ModalBuilder()
                .setCustomId('vc_setup_modal')
                .setTitle('Channel Setup');

            const nameInput = new TextInputBuilder()
                .setCustomId('vc_name')
                .setLabel("Room Name")
                .setStyle(TextInputStyle.Short)
                .setRequired(true);

            modal.addComponents(new ActionRowBuilder().addComponents(nameInput));
            await interaction.showModal(modal);
        }

        if (interaction.isModalSubmit() && interaction.customId === 'vc_setup_modal') {
            const db = await getActiveVCs();
            const data = db[interaction.user.id];
            const channelName = interaction.fields.getTextInputValue('vc_name');

            if (!data) return interaction.reply({ content: "Setup error.", ephemeral: true });

            const channel = interaction.guild.channels.cache.get(data.channelId);
            const roleId = GAME_ROLES[data.selectedGame];

            try {
                await channel.edit({
                    name: `🎮 | ${channelName}`,
                    permissionOverwrites: [
                        { id: interaction.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
                        { id: roleId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect] },
                        { id: interaction.user.id, allow: [PermissionFlagsBits.ManageChannels, PermissionFlagsBits.Connect] }
                    ]
                });

                await interaction.reply({ content: `✅ Setup complete!`, ephemeral: true });

                // --- KEY CHANGE HERE ---
                // We remove the temporary "User ID" setup entry
                delete db[interaction.user.id];
                // We add a permanent "Channel ID" entry for the delete script to track
                db[channel.id] = { channelId: channel.id, ownerId: interaction.user.id };
                await saveActiveVCs(db);

            } catch (err) {
                console.error(err);
                await interaction.reply({ content: "❌ Error.", ephemeral: true });
            }
        }
    });
};