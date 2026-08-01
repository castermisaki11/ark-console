const { SlashCommandBuilder } = require('discord.js');

const commandDefs = [
  new SlashCommandBuilder()
    .setName('cmd')
    .setDescription('จัดการคำสั่ง Ark')
    .addSubcommand((sub) =>
      sub
        .setName('list')
        .setDescription('แสดงรายการคำสั่ง (ล่าสุด 15 รายการ)')
        .addStringOption((opt) => opt.setName('category').setDescription('กรองตามหมวด').setRequired(false))
    )
    .addSubcommand((sub) => sub.setName('add').setDescription('เพิ่มคำสั่งใหม่ (เปิดฟอร์ม)'))
    .addSubcommand((sub) =>
      sub
        .setName('search')
        .setDescription('ค้นหาคำสั่ง')
        .addStringOption((opt) => opt.setName('query').setDescription('คำค้นหา').setRequired(true))
    ),
  new SlashCommandBuilder()
    .setName('log')
    .setDescription('จัดการบันทึกประจำวัน')
    .addSubcommand((sub) =>
      sub
        .setName('add')
        .setDescription('เพิ่มบันทึกใหม่')
        .addStringOption((opt) => opt.setName('text').setDescription('ข้อความบันทึก').setRequired(true))
    )
    .addSubcommand((sub) => sub.setName('today').setDescription('แสดงบันทึกของวันนี้')),
  new SlashCommandBuilder().setName('status').setDescription('เช็คสถานะฐานข้อมูล/เซิร์ฟเวอร์ตอนนี้')
];

module.exports = { commandDefs };
