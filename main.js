// 1. Load environment variables
require('dotenv').config();

const {
    Client,
    GatewayIntentBits,
    Partials,
    REST,
    Routes,
    SlashCommandBuilder
} = require('discord.js');

const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;


// 2. Import custom modules
const setupWelcome = require('./src/welcome/welcome.js');
const setupVerify = require('./src/verification/verify.js');
const setupGameRoles = require('./src/roles/gamerole.js');
const setupJoinToCreate = require('./src/voice/jointocreate.js');
const setupDeleteVoice = require('./src/voice/deletevoice.js');
const setupTicketHandler = require('./src/ticketing/ticketHandler.js');
const setupAdminControl = require('./src/ticketing/adminControl.js');
const ticketSetupCmd = require('./src/ticketing/ticketSetup.js');
const setupToxicityFilter = require('./src/moderation/bad.js');
const setupLink = require('./src/moderation/link.js');
const setupImageGuard = require('./src/moderation/image.js');
const setupAlumniCleanup = require('./src/verification/aluminicleanup.js');
const testAlumniCmd = require('./src/verification/testCleanup.js');
const textReset = require('./src/moderation/rrole.js');
const setupCampus = require('./src/roles/Campus.js');

const { broadcastAnnouncement } = require('./src/announcement/sendannouncement.js');

// --- TOURNAMENT MODULE IMPORTS ---
const { ensureDataFiles } = require('./src/Tournament/utilities.js');
const setupTournamentApi = require('./src/Tournament/api.js');
const setupTournamentButtons = require('./src/Tournament/discordButtons.js');
const setupTournamentSelects = require('./src/Tournament/discordSelectMenus.js');
const setupTournamentScheduler = require('./src/Tournament/scheduler.js');

// 3. Initialize the Client
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.GuildVoiceStates
    ],
    partials: [Partials.GuildMember, Partials.User, Partials.Message, Partials.Reaction]
});

// 4. Slash Command Registration
const commands = [
    new SlashCommandBuilder()
        .setName('verify')
        .setDescription('Verify your SCU student email')
        .addStringOption(option =>
            option.setName('email')
                .setDescription('Your @student.scu.edu.au email address')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('gradyear')
                .setDescription('The year you graduate (e.g., 2026)')
                .setRequired(true)
                .setMinValue(2014)
                .setMaxValue(2100)),

    ticketSetupCmd.data,

    testAlumniCmd.data

].map(command => command.toJSON());

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

client.once('ready', async () => {
    try {
        console.log('Registering slash commands...');
        await rest.put(
            Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
            { body: commands }
        );

        // --- START CRON JOBS ---
        setupTournamentScheduler(client);

        console.log(`✅ Logged in as ${client.user.tag}! Midnight NSW Cleanup active.`);
    } catch (error) {
        console.error('Registration Error:', error);
    }
});

// 5. Initialize modules
ensureDataFiles();
setupTournamentButtons(client);
setupTournamentSelects(client);
setupWelcome(client);
setupVerify(client);
setupGameRoles(client);
setupJoinToCreate(client);
setupDeleteVoice(client);
setupTicketHandler(client);
setupAdminControl(client);
setupToxicityFilter(client);
setupLink(client);
setupImageGuard(client);
setupAlumniCleanup(client);
textReset(client);
setupCampus(client);

// 6. Interaction Handler
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === 'setup-tickets') {
        return await ticketSetupCmd.execute(interaction);
    }
    if (interaction.commandName === 'test-alumni') {
        return await testAlumniCmd.execute(interaction);
    }
});

// --- 7. Web Portal Backend API Routes ---
app.use(express.json());
app.use('/api/tournament', setupTournamentApi(client));

// Serves the web portal files automatically on the given network port
app.use(express.static(path.join(__dirname, 'src', 'webportal')));

// --- BACKEND CACHE MEMORY SPACE ---
let cachedStats = {
    totalUsers: 0,
    verifiedStudents: 0,
    alumniCount: 0,
    lastUpdated: 0
};

// Configuration & State Management
const NORMAL_COOLDOWN_MS = 15000; // 15 seconds to prevent spam during normal use
const RAID_DELAY_MS = 40000;      // 40 seconds during raids
let isRaidActive = false;         // Set true/false dynamically via your anti-raid system
let syncTimeout = null;           // Reference to tracking active delay timers
let isUpdating = false;           // Mutual exclusion flag to block overlapping runs

// Background worker to safely fetch numbers from Discord
async function updateServerStatsCache() {
    if (isUpdating || !client.readyAt) return;

    try {
        isUpdating = true;
        const guildId = process.env.GUILD_ID || (client.guilds.cache.first()?.id);
        const guild = client.guilds.cache.get(guildId);

        if (!guild) {
            console.warn("⚠️ [Cache Worker] Target Discord server not found yet.");
            return;
        }

        const totalUserRoleID = "1515573751935275179";
        const studentRoleID = "1515572262760349846";
        const alumniRoleID = "1515572053019852800";

        // Download member structures safely
        await guild.members.fetch().catch(err => console.error("Cache fetch warning:", err));

        // Update local memory footprint counters
        cachedStats.totalUsers = guild.roles.cache.get(totalUserRoleID)?.members.size || 0;
        cachedStats.verifiedStudents = guild.roles.cache.get(studentRoleID)?.members.size || 0;
        cachedStats.alumniCount = guild.roles.cache.get(alumniRoleID)?.members.size || 0;
        cachedStats.lastUpdated = Date.now();

        console.log("✅ [Telemetry Cache] Stats successfully updated from Discord API.");
    } catch (error) {
        console.error("❌ Error updating background stats cache:", error);
    } finally {
        isUpdating = false;
    }
}

// The main coordinator function applying smart throttling
function handleMemberEvent() {
    if (syncTimeout) clearTimeout(syncTimeout);

    const currentDelay = isRaidActive ? RAID_DELAY_MS : NORMAL_COOLDOWN_MS;

    if (isRaidActive) {
        console.log(`[Raid Mode] Delaying cache sync by ${RAID_DELAY_MS / 1000} seconds...`);
    }

    syncTimeout = setTimeout(() => {
        updateServerStatsCache();
        syncTimeout = null;
    }, currentDelay);
}

// Event hooks
client.on('guildMemberUpdate', handleMemberEvent);
client.on('guildMemberAdd', handleMemberEvent);
client.on('guildMemberRemove', handleMemberEvent);

// Run the setup script 5 seconds after connection logs in
client.on('ready', () => {
    setTimeout(updateServerStatsCache, 5000);
});


// Discord Metadata Cache
let discordMetadataCache = null;
let discordMetadataCacheExpiry = 0;

// NEW: Endpoint to fetch live text channels and roles straight from the Discord server
app.get('/api/discord-metadata', async (req, res) => {
    try {
        const now = Date.now();
        if (discordMetadataCache && now < discordMetadataCacheExpiry) {
            return res.status(200).json(discordMetadataCache);
        }

        const guild = client.guilds.cache.get(process.env.GUILD_ID);
        if (!guild) {
            return res.status(404).json({ error: "Guild not found. Verify your GUILD_ID env variable." });
        }

        const liveChannels = await guild.channels.fetch();
        const liveRoles = await guild.roles.fetch();

        const textChannels = liveChannels
            .filter(ch => ch && ch.isTextBased())
            .map(ch => ({ id: ch.id, name: ch.name }));

        const serverRoles = liveRoles
            .filter(role => role.name !== '@everyone' && !role.managed)
            .map(role => ({ id: role.id, name: role.name }));

        discordMetadataCache = { channels: textChannels, roles: serverRoles };
        discordMetadataCacheExpiry = now + 60000; // 60 seconds TTL

        res.status(200).json(discordMetadataCache);
    } catch (error) {
        console.error("Failed to compile live Discord server metadata structure:", error);
        res.status(500).json({ error: "Failed to load guild metadata parameters dynamically." });
    }
});


let roleMembersCache = new Map();
let roleMembersPendingFetch = new Set();

app.get('/api/discord-role-members/:roleId', async (req, res) => {
    try {
        const roleId = req.params.roleId;
        const guild = client.guilds.cache.get(process.env.GUILD_ID);
        if (!guild) return res.status(404).json({ error: "Guild not found." });

        const role = guild.roles.cache.get(roleId);
        if (!role) return res.status(404).json({ error: "Role not found." });

        // Serve from cache if available
        if (roleMembersCache.has(roleId)) {
            // Trigger a background refresh if not already pending
            if (!roleMembersPendingFetch.has(roleId)) {
                roleMembersPendingFetch.add(roleId);
                setTimeout(async () => {
                    await guild.members.fetch();
                    const updatedMembers = role.members.map(m => ({
                        id: m.user.id,
                        username: m.user.username,
                        globalName: m.user.globalName,
                        avatarURL: m.user.displayAvatarURL({ extension: 'png', size: 64 }) || 'https://cdn.discordapp.com/embed/avatars/0.png'
                    }));
                    roleMembersCache.set(roleId, updatedMembers);
                    roleMembersPendingFetch.delete(roleId);
                }, 500); // Debounced
            }
            return res.status(200).json(roleMembersCache.get(roleId));
        }

        // Fetch synchronously on first request
        await guild.members.fetch();
        
        const members = role.members.map(m => ({
            id: m.user.id,
            username: m.user.username,
            globalName: m.user.globalName,
            avatarURL: m.user.displayAvatarURL({ extension: 'png', size: 64 }) || 'https://cdn.discordapp.com/embed/avatars/0.png'
        }));

        roleMembersCache.set(roleId, members);
        res.status(200).json(members);
    } catch (error) {
        console.error("Failed to fetch role members:", error);
        res.status(500).json({ error: "Failed to fetch role members." });
    }
});

app.post('/api/announcement', async (req, res) => {
    try {
        await broadcastAnnouncement(client, req.body);
        res.status(200).json({ success: true });
    } catch (error) {
        console.error("Web Portal Announcement Error:", error);
        res.status(500).json({ error: "Failed to process and send the announcement." });
    }
});

// Changed from POST to GET
app.get('/api/bot-server-stats', async (req, res) => {
    try {
        // If the cache has never run, run it immediately on the spot
        if (cachedStats.lastUpdated === 0) {
            await updateServerStatsCache();
        }

        res.status(200).json({
            totalUsers: cachedStats.totalUsers,
            verifiedStudents: cachedStats.verifiedStudents,
            alumniCount: cachedStats.alumniCount
        });

    } catch (error) {
        console.error("Backend Server Stats Telemetry Error:", error);
        res.status(500).json({ error: "Failed to read Discord server role metrics." });
    }
});

// Fire up web dashboard instance listener
app.listen(PORT, () => {
    console.log(`🚀 Web portal engine running at http://localhost:${PORT}`);
});

client.login(process.env.DISCORD_TOKEN);