const { Client, GatewayIntentBits, Events } = require('discord.js');
const { handleInteraction } = require('./interactions');

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once(Events.ClientReady, (c) => {
  console.log(`Discord bot ล็อกอินสำเร็จ: ${c.user.tag}`);
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    await handleInteraction(interaction);
  } catch (err) {
    console.error('จัดการ interaction ผิดพลาด:', err);
    const errMsg = { content: 'เกิดข้อผิดพลาด ลองใหม่อีกครั้ง', ephemeral: true };
    try {
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply(errMsg);
      } else if (interaction.isRepliable && interaction.isRepliable()) {
        await interaction.reply(errMsg);
      }
    } catch {
      // เพิกเฉยถ้าตอบ interaction ไม่สำเร็จอีก (เช่น timeout ไปแล้ว)
    }
  }
});

let loginPromise = null;

// เริ่มบอท — ถ้าไม่มี DISCORD_BOT_TOKEN ตั้งไว้ ให้ข้ามไปเงียบๆ
// (แอปหลักยังทำงานได้ปกติ แค่ไม่มีแจ้งเตือน/บอทเท่านั้น)
function startBot() {
  if (loginPromise) return loginPromise;

  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) {
    console.log('ไม่พบ DISCORD_BOT_TOKEN — ข้ามการเริ่มบอท Discord (ปิดใช้งานแจ้งเตือน/slash command)');
    loginPromise = Promise.resolve(null);
    return loginPromise;
  }

  loginPromise = client
    .login(token)
    .then(() => client)
    .catch((err) => {
      console.error('ล็อกอินบอท Discord ไม่สำเร็จ:', err.message);
      return null;
    });

  return loginPromise;
}

module.exports = { client, startBot };
