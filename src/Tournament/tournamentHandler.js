// ─── Tournament Handler ─────────────────────────────────────────────
// CRUD operations for tournaments. Pure data logic — no Discord calls.

const { dataFiles, limits, statuses } = require('./config');
const { readData, writeData, generateId, log, sanitizeString } = require('./utilities');

// Pre-built Set for terminal statuses — O(1) lookups
const TERMINAL_STATUSES = new Set([statuses.COMPLETED, statuses.CANCELLED]);

/**
 * Get all tournaments.
 */
async function getAllTournaments() {
    return await readData(dataFiles.tournaments, []);
}

/**
 * Get a single tournament by ID.
 */
async function getTournament(id) {
    const tournaments = await getAllTournaments();
    return tournaments.find(t => t.id === id) || null;
}

/**
 * Create a new tournament.
 * @param {object} data - { name, gameId, startDate, endDate, format, notes }
 * @returns {object} The created tournament
 */
async function createTournament(data) {
    const tournaments = await getAllTournaments();

    const tournament = {
        id: generateId(),
        name: sanitizeString(data.name, limits.maxTournamentName),
        gameId: data.gameId,
        startDate: data.startDate || null,
        endDate: data.endDate || null,
        format: sanitizeString(data.format || '', 100),
        notes: sanitizeString(data.notes || '', limits.maxNotesLength),
        status: 'active',
        createdAt: new Date().toISOString()
    };

    // Validate: name is required
    if (!tournament.name) {
        throw new Error('Tournament name is required.');
    }

    // Validate: gameId must exist
    const games = await readData(dataFiles.games, []);
    if (!games.find(g => String(g.id) === String(tournament.gameId))) {
        throw new Error('Invalid game ID. Configure the game first.');
    }

    tournaments.push(tournament);
    await writeData(dataFiles.tournaments, tournaments);
    await log('TOURNAMENT_CREATED', `Tournament "${tournament.name}" created for game ${tournament.gameId}`, 'WEB');

    return tournament;
}

/**
 * Edit an existing tournament.
 * @param {string} id - Tournament ID
 * @param {object} updates - Fields to update
 * @returns {object} The updated tournament
 */
async function editTournament(id, updates) {
    const tournaments = await getAllTournaments();
    const index = tournaments.findIndex(t => t.id === id);

    if (index === -1) throw new Error('Tournament not found.');

    // Whitelist allowed fields
    const allowed = ['name', 'gameId', 'startDate', 'endDate', 'format', 'notes', 'status'];
    for (const key of allowed) {
        if (updates[key] !== undefined) {
            if (key === 'name') {
                tournaments[index][key] = sanitizeString(updates[key], limits.maxTournamentName);
            } else if (key === 'notes') {
                tournaments[index][key] = sanitizeString(updates[key], limits.maxNotesLength);
            } else if (key === 'format') {
                tournaments[index][key] = sanitizeString(updates[key], 100);
            } else {
                tournaments[index][key] = updates[key];
            }
        }
    }

    tournaments[index].updatedAt = new Date().toISOString();
    await writeData(dataFiles.tournaments, tournaments);
    await log('TOURNAMENT_UPDATED', `Tournament "${tournaments[index].name}" updated`, 'WEB');

    return tournaments[index];
}

/**
 * Delete a tournament. Only allowed if no active/scheduled matches reference it.
 * @param {string} id - Tournament ID
 */
async function deleteTournament(id) {
    const tournaments = await getAllTournaments();
    const tournament = tournaments.find(t => t.id === id);

    if (!tournament) throw new Error('Tournament not found.');

    // Check for active matches — use Set for O(1) terminal status check
    const matches = await readData(dataFiles.matches, []);
    const activeMatches = matches.filter(
        m => m.tournamentId === id && !TERMINAL_STATUSES.has(m.status)
    );

    if (activeMatches.length > 0) {
        throw new Error(`Cannot delete: ${activeMatches.length} active match(es) still reference this tournament.`);
    }

    const filtered = tournaments.filter(t => t.id !== id);
    await writeData(dataFiles.tournaments, filtered);
    await log('TOURNAMENT_DELETED', `Tournament "${tournament.name}" deleted`, 'WEB');

    return { success: true };
}

module.exports = {
    getAllTournaments,
    getTournament,
    createTournament,
    editTournament,
    deleteTournament
};
