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
    )
    .addSubcommand((sub) =>
      sub
        .setName('delete')
        .setDescription('ลบคำสั่ง')
        .addStringOption((opt) =>
          opt.setName('target').setDescription('พิมพ์ค้นหาแล้วเลือกจากรายการ').setRequired(true).setAutocomplete(true)
        )
    ),
  new SlashCommandBuilder().setName('status').setDescription('เช็คสถานะฐานข้อมูล/เซิร์ฟเวอร์ตอนนี้')
];

module.exports = { commandDefs };
