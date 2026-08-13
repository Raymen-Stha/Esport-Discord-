const { dataFiles, statuses } = require('./config');
const { readData, writeData, log, generateId } = require('./utilities');
const { updateAnnouncement } = require('./announcementHandler');
const { sendSquadConfirmation } = require('./reminderHandler');

/**
 * Get roster by match ID.
 */
async function getRoster(matchId) {
    const rosters = await readData(dataFiles.rosters, []);
    return rosters.find(r => r.matchId === matchId) || null;
}

/**
 * Submits or updates a roster for a match.
 * @param {object} client - Discord client instance
 * @param {string} matchId - The match ID
 * @param {string} captainId - User ID of the captain submitting
 * @param {Array<string>} players - Array of user IDs for starters
 * @param {Array<string>} bench - Array of user IDs for bench
 */
async function submitRoster(client, matchId, captainId, players, bench = []) {
    // 1. Validate inputs
    if (!players || players.length === 0) {
        throw new Error('Roster must contain at least one player.');
    }
    
    // Check duplicates — already uses Set for O(1) dedup ✅
    const allPlayers = [...players, ...bench];
    if (new Set(allPlayers).size !== allPlayers.length) {
        throw new Error('Duplicate players found in roster submission.');
    }

    const matches = await readData(dataFiles.matches, []);
    const matchIndex = matches.findIndex(m => m.id === matchId);
    if (matchIndex === -1) throw new Error('Match not found.');
    const match = matches[matchIndex];

    const games = await readData(dataFiles.games, []);
    const game = games.find(g => g.id === match.gameId);
    if (!game) throw new Error('Game configuration not found.');

    // 2. Validate against game limits
    if (players.length !== game.squadSize) {
        throw new Error(`Invalid squad size. Expected ${game.squadSize}, got ${players.length}.`);
    }
    if (bench.length !== game.benchSize) {
        throw new Error(`Invalid bench size. Expected ${game.benchSize}, got ${bench.length}.`);
    }

    // 3. Save to database
    const rosters = await readData(dataFiles.rosters, []);
    let roster = rosters.find(r => r.matchId === matchId);
    let isEdit = true;
    
    if (!roster) {
        isEdit = false;
        roster = {
            id: generateId(),
            matchId: matchId,
            createdAt: new Date().toISOString()
        };
        rosters.push(roster);
    }
    
    roster.captainId = captainId;
    roster.players = players;
    roster.bench = bench;
    roster.updatedAt = new Date().toISOString();
    
    await writeData(dataFiles.rosters, rosters);
    await log('ROSTER_SUBMITTED', `Roster ${isEdit ? 'updated' : 'submitted'} for match ${matchId} by captain ${captainId}`);

    // 4. Update match status if needed
    if (match.status !== statuses.COMPLETED && match.status !== statuses.CANCELLED) {
        match.status = statuses.ROSTER_LOCKED;
        await writeData(dataFiles.matches, matches);
    }

    // 5. Trigger Discord updates (async, don't block)
    // Update the announcement embed to show the new roster
    updateAnnouncement(client, match, game, roster).catch(e => console.error("Failed to update announcement with roster:", e));
    
    // Ping the squad members to confirm they are selected
    sendSquadConfirmation(client, match, roster, game).catch(e => console.error("Failed to send squad confirmation:", e));

    return roster;
}

module.exports = {
    getRoster,
    submitRoster
};
