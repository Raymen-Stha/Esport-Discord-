const fs = require('fs');
const fsp = fs.promises;
const path = require('path');

const activeTimers = new Map();
const dbPath = path.join(__dirname, 'active_vcs.json');

// Helper to update the DB with a deletion timestamp
const setDeletionTime = async (channelId, timestamp) => {
    try {
        const raw = await fsp.readFile(dbPath, 'utf8').catch(() => '{}');
        const db = JSON.parse(raw || '{}');
        for (const ownerId in db) {
            if (db[ownerId].channelId === channelId) {
                db[ownerId].deleteAt = timestamp; // Save when it should be deleted
            }
        }
        await fsp.writeFile(dbPath, JSON.stringify(db, null, 2));
    } catch (err) { console.error("DB Error:", err); }
};

const cleanupDB = async (channelId) => {
    try {
        const raw = await fsp.readFile(dbPath, 'utf8').catch(() => '{}');
        const db = JSON.parse(raw || '{}');
        let found = false;
        for (const ownerId in db) {
            if (db[ownerId].channelId === channelId) {
                delete db[ownerId];
                found = true;
            }
        }
        if (found) await fsp.writeFile(dbPath, JSON.stringify(db, null, 2));
    } catch (err) { console.error("DB Cleanup Error:", err); }
};

module.exports = (client) => {
    const CATEGORY_ID = '1515590565163434175';
    const GENERATOR_CHANNEL_ID = '1515590639231254618';

    // --- RESTART RECOVERY ---
    // This runs ONCE when the bot starts
    client.once('ready', async () => {
        console.log("Checking for abandoned VCs from previous session...");
        try {
            await fsp.access(dbPath);
            const raw = await fsp.readFile(dbPath, 'utf8');
            const db = JSON.parse(raw || '{}');

            for (const ownerId in db) {
                const data = db[ownerId];
                const channel = await client.channels.fetch(data.channelId).catch(() => null);

                if (!channel) {
                    await cleanupDB(data.channelId);
                    continue;
                }

                if (channel.members.size === 0) {
                    // If it's already empty, delete it immediately on restart
                    await channel.delete().catch(() => null);
                    await cleanupDB(data.channelId);
                    console.log(`🧹 Cleaned up leftover VC: ${channel.name}`);
                }
            }
        } catch (err) { 
            if (err.code !== 'ENOENT') console.error("Recovery Error:", err); 
        }
    });

    client.on('voiceStateUpdate', async (oldState, newState) => {
        const oldChannel = oldState.channel;

        // --- DELETION LOGIC ---
        if (oldChannel && oldChannel.parentId === CATEGORY_ID && oldChannel.id !== GENERATOR_CHANNEL_ID) {
            if (oldChannel.members.size === 0) {
                const deleteTime = Date.now() + 120000; // 2 minutes from now
                await setDeletionTime(oldChannel.id, deleteTime);

                const timer = setTimeout(async () => {
                    const chan = await client.channels.fetch(oldChannel.id).catch(() => null);
                    if (chan && chan.members.size === 0) {
                        await chan.delete().catch(() => null);
                        await cleanupDB(oldChannel.id);
                    }
                    activeTimers.delete(oldChannel.id);
                }, 120000);

                activeTimers.set(oldChannel.id, timer);
            }
        }

        // --- CANCEL LOGIC ---
        const newChannel = newState.channel;
        if (newChannel && activeTimers.has(newChannel.id)) {
            clearTimeout(activeTimers.get(newChannel.id));
            activeTimers.delete(newChannel.id);
            await setDeletionTime(newChannel.id, null); // Clear timestamp from DB
        }
    });
};