// ─── Match Handler ──────────────────────────────────────────────────
// CRUD + lifecycle operations for matches.
// Creates/edits/cancels/completes matches and coordinates with
// the announcement handler to keep Discord in sync.

const { dataFiles, limits, statuses } = require('./config');
const { readData, writeData, generateId, log, sanitizeString, isValidISODate } = require('./utilities');

// Pre-built Sets for O(1) lookups
const VALID_RESULTS = new Set(['win', 'loss', 'draw']);

/**
 * Get all matches, optionally filtered.
 * Single-pass filter instead of 3 chained .filter() calls.
 */
async function getAllMatches(filters = {}) {
    let matches = await readData(dataFiles.matches, []);

    // Apply all filters in a single pass
    if (filters.tournamentId || filters.gameId || filters.status) {
        matches = matches.filter(m => {
            if (filters.tournamentId && m.tournamentId !== filters.tournamentId) return false;
            if (filters.gameId && m.gameId !== filters.gameId) return false;
            if (filters.status && m.status !== filters.status) return false;
            return true;
        });
    }

    // Sort by date descending (newest first)
    matches.sort((a, b) => new Date(b.matchDate) - new Date(a.matchDate));
    return matches;
}

/**
 * Get a single match by ID.
 */
async function getMatch(id) {
    const matches = await readData(dataFiles.matches, []);
    return matches.find(m => m.id === id) || null;
}

/**
 * Create a new match.
 * @param {object} data - { tournamentId, opponent, matchDate, matchTime, notes, teamName }
 * @returns {object} The created match
 */
async function createMatch(data) {
    // Validate tournament exists
    const tournaments = await readData(dataFiles.tournaments, []);
    const tournament = tournaments.find(t => t.id === data.tournamentId);
    if (!tournament) throw new Error('Tournament not found.');

    // Validate game exists (via tournament)
    const games = await readData(dataFiles.games, []);
    const game = games.find(g => String(g.id) === String(tournament.gameId));
    if (!game) throw new Error('Game configuration not found for this tournament.');

    // Validate opponent
    const opponent = sanitizeString(data.opponent, limits.maxOpponentLength);
    if (!opponent) throw new Error('Opponent name is required.');

    // Validate date
    if (!data.matchDate) throw new Error('Match date is required.');

    // Team name defaults to the game name
    const teamName = sanitizeString(data.teamName || game.name, limits.maxTeamNameLength);

    const match = {
        id: generateId(),
        tournamentId: data.tournamentId,
        gameId: tournament.gameId,
        teamName,
        opponent,
        matchDate: data.matchDate,
        matchTime: sanitizeString(data.matchTime || '', 20),
        notes: sanitizeString(data.notes || '', limits.maxNotesLength),
        status: statuses.SCHEDULED,
        announcementMessageId: null,
        result: null,
        scoreTeam: null,
        scoreOpponent: null,
        createdAt: new Date().toISOString()
    };

    const matches = await readData(dataFiles.matches, []);
    matches.push(match);
    await writeData(dataFiles.matches, matches);

    // Initialise empty reminder tracking for this match
    const reminders = await readData(dataFiles.reminders, {});
    reminders[match.id] = {
        captainNotified: false,
        rosterAlertSent: false,
        playersNotified: false,
        finalReminderSent: false
    };
    await writeData(dataFiles.reminders, reminders);

    await log('MATCH_CREATED', `Match: ${teamName} vs ${opponent} (${game.name}) on ${match.matchDate} ${match.matchTime}`, 'WEB');

    return match;
}

/**
 * Edit a match (before it's completed).
 */
async function editMatch(id, updates) {
    const matches = await readData(dataFiles.matches, []);
    const index = matches.findIndex(m => m.id === id);
    if (index === -1) throw new Error('Match not found.');

    if (matches[index].status === statuses.COMPLETED) {
        throw new Error('Cannot edit a completed match.');
    }

    const allowed = ['opponent', 'matchDate', 'matchTime', 'notes', 'tournamentId', 'teamName'];
    for (const key of allowed) {
        if (updates[key] !== undefined) {
            if (key === 'opponent') {
                matches[index][key] = sanitizeString(updates[key], limits.maxOpponentLength);
            } else if (key === 'notes') {
                matches[index][key] = sanitizeString(updates[key], limits.maxNotesLength);
            } else if (key === 'matchTime') {
                matches[index][key] = sanitizeString(updates[key], 20);
            } else if (key === 'teamName') {
                matches[index][key] = sanitizeString(updates[key], limits.maxTeamNameLength);
            } else {
                matches[index][key] = updates[key];
            }
        }
    }

    // If tournament changed, update gameId
    if (updates.tournamentId) {
        const tournaments = await readData(dataFiles.tournaments, []);
        const tournament = tournaments.find(t => t.id === updates.tournamentId);
        if (tournament) matches[index].gameId = tournament.gameId;
    }

    matches[index].updatedAt = new Date().toISOString();
    await writeData(dataFiles.matches, matches);
    const displayName = matches[index].teamName || 'SCUR';
    await log('MATCH_UPDATED', `Match ${id} updated — ${displayName} vs ${matches[index].opponent}`, 'WEB');

    return matches[index];
}

/**
 * Cancel a match.
 */
async function cancelMatch(id) {
    const matches = await readData(dataFiles.matches, []);
    const index = matches.findIndex(m => m.id === id);
    if (index === -1) throw new Error('Match not found.');

    matches[index].status = statuses.CANCELLED;
    matches[index].cancelledAt = new Date().toISOString();

    await writeData(dataFiles.matches, matches);
    const displayName = matches[index].teamName || 'SCUR';
    await log('MATCH_CANCELLED', `Match ${id} cancelled — ${displayName} vs ${matches[index].opponent}`, 'WEB');

    return matches[index];
}

/**
 * Complete a match with results.
 * @param {string} id
 * @param {object} resultData - { result?, scoreTeam, scoreOpponent, notes }
 *   result is auto-derived from scores if scoreTeam and scoreOpponent are provided.
 *   Falls back to explicit result if provided without scores.
 */
async function completeMatch(id, resultData) {
    const matches = await readData(dataFiles.matches, []);
    const index = matches.findIndex(m => m.id === id);
    if (index === -1) throw new Error('Match not found.');

    if (matches[index].status === statuses.COMPLETED) {
        throw new Error('Match is already completed.');
    }
    if (matches[index].status === statuses.CANCELLED) {
        throw new Error('Cannot complete a cancelled match.');
    }

    // Handle split scores — auto-derive result
    const hasScores = resultData.scoreTeam !== undefined && resultData.scoreOpponent !== undefined;
    let result;
    let scoreTeam = null;
    let scoreOpponent = null;

    if (hasScores) {
        scoreTeam = parseInt(resultData.scoreTeam);
        scoreOpponent = parseInt(resultData.scoreOpponent);
        if (isNaN(scoreTeam) || isNaN(scoreOpponent)) {
            throw new Error('Scores must be valid numbers.');
        }
        // Auto-derive result
        if (scoreTeam > scoreOpponent) result = 'win';
        else if (scoreTeam < scoreOpponent) result = 'loss';
        else result = 'draw';
    } else if (resultData.result) {
        // Fallback: explicit result with optional legacy score string
        result = resultData.result;
    } else {
        throw new Error('Either scores (scoreTeam + scoreOpponent) or an explicit result must be provided.');
    }

    // O(1) Set lookup instead of Array.includes()
    if (!VALID_RESULTS.has(result)) {
        throw new Error('Result must be one of: win, loss, draw.');
    }

    matches[index].status = statuses.COMPLETED;
    matches[index].result = result;
    matches[index].scoreTeam = scoreTeam;
    matches[index].scoreOpponent = scoreOpponent;
    // Keep legacy score field for backward compatibility
    if (hasScores) {
        matches[index].score = `${scoreTeam} - ${scoreOpponent}`;
    } else {
        matches[index].score = sanitizeString(resultData.score || '', limits.maxScoreLength);
    }
    matches[index].resultNotes = sanitizeString(resultData.notes || '', limits.maxNotesLength);
    matches[index].completedAt = new Date().toISOString();

    await writeData(dataFiles.matches, matches);
    const displayName = matches[index].teamName || 'SCUR';
    const scoreDisplay = hasScores ? `${scoreTeam}-${scoreOpponent}` : matches[index].score;
    await log('MATCH_COMPLETED', `Match ${id} completed — ${displayName} vs ${matches[index].opponent}: ${result} (${scoreDisplay})`, 'WEB');

    return matches[index];
}

/**
 * Update the announcement message ID for a match (called by announcementHandler).
 */
async function setAnnouncementMessageId(matchId, messageId) {
    const matches = await readData(dataFiles.matches, []);
    const index = matches.findIndex(m => m.id === matchId);
    if (index === -1) return;

    matches[index].announcementMessageId = messageId;

    // Progress status to ANNOUNCED if still SCHEDULED
    if (matches[index].status === statuses.SCHEDULED) {
        matches[index].status = statuses.ANNOUNCED;
    }

    await writeData(dataFiles.matches, matches);
}

/**
 * Update match status.
 */
async function updateMatchStatus(matchId, newStatus) {
    const matches = await readData(dataFiles.matches, []);
    const index = matches.findIndex(m => m.id === matchId);
    if (index === -1) return;

    matches[index].status = newStatus;
    await writeData(dataFiles.matches, matches);
}

module.exports = {
    getAllMatches,
    getMatch,
    createMatch,
    editMatch,
    cancelMatch,
    completeMatch,
    setAnnouncementMessageId,
    updateMatchStatus
};
