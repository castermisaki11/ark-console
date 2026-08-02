// Discord bot authorization helper.
//
// Reuses the exact same ADMIN_IDS allowlist the web dashboard already
// uses for Discord OAuth login (see auth/discordOAuth.js#isAdmin), so
// the bot and the dashboard always agree on who's an admin. Do not
// duplicate the ADMIN_IDS parsing logic here — import it.

const { isAdmin } = require('../auth/discordOAuth');

function isDiscordAdmin(userId) {
  return isAdmin(userId);
}

module.exports = { isDiscordAdmin };
