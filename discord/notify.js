const { EmbedBuilder } = require('discord.js');

const COLORS = {
  create: 0x57f287, // เขียว
  update: 0xfee75c, // เหลือง
  delete: 0xed4245, // แดง
  online: 0x57f287,
  offline: 0xed4245
};

const ACTION_LABEL = { create: 'เพิ่ม', update: 'แก้ไข', delete: 'ลบ' };

function commandEmbed(action, cmd) {
  return new EmbedBuilder()
    .setColor(COLORS[action])
    .setTitle(`${ACTION_LABEL[action]}คำสั่ง`)
    .addFields(
      { name: 'ชื่อ', value: cmd.name || '-', inline: true },
      { name: 'หมวด', value: cmd.category || 'Uncategorized', inline: true },
      { name: 'คำสั่ง', value: `\`${cmd.command || '-'}\`` }
    )
    .setTimestamp();
}

function statusEmbed(online) {
  return new EmbedBuilder()
    .setColor(online ? COLORS.online : COLORS.offline)
    .setTitle(online ? '🟢 ฐานข้อมูลกลับมาออนไลน์' : '🔴 เชื่อมต่อฐานข้อมูลไม่ได้')
    .setTimestamp();
}

// ส่ง embed เข้า channel ที่ตั้งไว้ — ไม่มี client (ยังไม่ login) หรือส่งไม่สำเร็จ
// ก็แค่ log error ไว้ ไม่ทำให้ request ของ REST API พัง
async function sendNotify(client, embed) {
  if (!client || !client.isReady || !client.isReady()) return;
  const channelId = process.env.DISCORD_NOTIFY_CHANNEL_ID;
  if (!channelId) return;
  try {
    const channel = await client.channels.fetch(channelId);
    if (channel) await channel.send({ embeds: [embed] });
  } catch (err) {
    console.error('ส่งแจ้งเตือน Discord ไม่สำเร็จ:', err.message);
  }
}

module.exports = { commandEmbed, statusEmbed, sendNotify };
