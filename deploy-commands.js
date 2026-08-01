require('dotenv').config();
const { REST, Routes } = require('discord.js');
const { commandDefs } = require('./discord/commands');

const token = process.env.DISCORD_BOT_TOKEN;
const clientId = process.env.DISCORD_CLIENT_ID;
const guildId = process.env.DISCORD_GUILD_ID;

if (!token || !clientId || !guildId) {
  console.error(
    'ต้องตั้งค่า env vars DISCORD_BOT_TOKEN, DISCORD_CLIENT_ID, DISCORD_GUILD_ID ก่อนรันสคริปต์นี้'
  );
  process.exit(1);
}

const rest = new REST({ version: '10' }).setToken(token);
const body = commandDefs.map((c) => c.toJSON());

(async () => {
  try {
    console.log(`กำลังลงทะเบียน ${body.length} slash commands กับ guild ${guildId}...`);
    await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body });
    console.log('ลงทะเบียนสำเร็จ — เปิด Discord แล้วลองพิมพ์ /cmd /log /status ในเซิร์ฟเวอร์นั้นได้เลย');
  } catch (err) {
    console.error('ลงทะเบียน commands ไม่สำเร็จ:', err);
    process.exit(1);
  }
})();
