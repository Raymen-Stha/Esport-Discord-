const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const dbPath = path.join(__dirname, 'tickets.json');

const loadTickets = async () => {
    try {
        await fsp.access(dbPath);
        return JSON.parse(await fsp.readFile(dbPath, 'utf8'));
    } catch (e) {
        if (e.code !== 'ENOENT') console.error("DB Load Error:", e);
        return {};
    }
};

const saveTicket = async (channelId, userId) => {
    const tickets = await loadTickets();
    tickets[channelId] = {
        userId: userId,
        openedAt: new Date().toISOString()
    };
    await fsp.writeFile(dbPath, JSON.stringify(tickets, null, 2));
};

const getTicket = async (channelId) => {
    const tickets = await loadTickets();
    return tickets[channelId] || null;
};

const deleteTicketData = async (channelId) => {
    const tickets = await loadTickets();
    if (tickets[channelId]) {
        delete tickets[channelId];
        await fsp.writeFile(dbPath, JSON.stringify(tickets, null, 2));
        return true;
    }
    return false;
};

module.exports = { saveTicket, getTicket, deleteTicketData };