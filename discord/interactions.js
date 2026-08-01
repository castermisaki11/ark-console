const {
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder
} = require('discord.js');
const crypto = require('crypto');
const { pool } = require('../db');
const { commandEmbed, logEmbed, sendNotify } = require('./notify');

const ADD_MODAL_ID = 'ark-console-cmd-add';
const BRAND_COLOR = 0x5865f2;

async function handleInteraction(interaction) {
  if (interaction.isChatInputCommand()) {
    return handleSlashCommand(interaction);
  }
  if (interaction.isModalSubmit() && interaction.customId === ADD_MODAL_ID) {
    return handleAddModalSubmit(interaction);
  }
}

async function handleSlashCommand(interaction) {
  const { commandName } = interaction;

  if (commandName === 'cmd') {
    const sub = interaction.options.getSubcommand();
    if (sub === 'list') return handleCmdList(interaction);
    if (sub === 'add') return handleCmdAdd(interaction);
    if (sub === 'search') return handleCmdSearch(interaction);
  }

  if (commandName === 'log') {
    const sub = interaction.options.getSubcommand();
    if (sub === 'add') return handleLogAdd(interaction);
    if (sub === 'today') return handleLogToday(interaction);
  }

  if (commandName === 'status') {
    return handleStatus(interaction);
  }
}

function formatCmdLine(row) {
  return `**${row.name}** \`${row.command}\` _(${row.category || 'Uncategorized'})_`;
}

async function handleCmdList(interaction) {
  const category = interaction.options.getString('category');
  await interaction.deferReply();

  const { rows } = category
    ? await pool.query(
        'SELECT * FROM commands WHERE category ILIKE $1 ORDER BY created_at DESC LIMIT 15',
        [category]
      )
    : await pool.query('SELECT * FROM commands ORDER BY created_at DESC LIMIT 15');

  if (rows.length === 0) {
    return interaction.editReply(category ? `ไม่พบคำสั่งในหมวด "${category}"` : 'ยังไม่มีคำสั่งบันทึกไว้');
  }

  const embed = new EmbedBuilder()
    .setColor(BRAND_COLOR)
    .setTitle(category ? `คำสั่ง — หมวด ${category}` : 'คำสั่งล่าสุด')
    .setDescription(rows.map(formatCmdLine).join('\n'));

  await interaction.editReply({ embeds: [embed] });
}

async function handleCmdSearch(interaction) {
  const query = interaction.options.getString('query');
  await interaction.deferReply();

  const { rows } = await pool.query(
    `SELECT * FROM commands
     WHERE name ILIKE $1 OR command ILIKE $1 OR description ILIKE $1 OR category ILIKE $1
     ORDER BY created_at DESC LIMIT 15`,
    [`%${query}%`]
  );

  if (rows.length === 0) {
    return interaction.editReply(`ไม่พบผลลัพธ์สำหรับ "${query}"`);
  }

  const embed = new EmbedBuilder()
    .setColor(BRAND_COLOR)
    .setTitle(`ผลค้นหา: "${query}"`)
    .setDescription(rows.map(formatCmdLine).join('\n'));

  await interaction.editReply({ embeds: [embed] });
}

async function handleCmdAdd(interaction) {
  const modal = new ModalBuilder().setCustomId(ADD_MODAL_ID).setTitle('เพิ่มคำสั่งใหม่');

  const nameInput = new TextInputBuilder()
    .setCustomId('name')
    .setLabel('ชื่อคำสั่ง')
    .setStyle(TextInputStyle.Short)
    .setRequired(true);
  const commandInput = new TextInputBuilder()
    .setCustomId('command')
    .setLabel('คำสั่ง (command string)')
    .setStyle(TextInputStyle.Short)
    .setRequired(true);
  const categoryInput = new TextInputBuilder()
    .setCustomId('category')
    .setLabel('หมวด')
    .setStyle(TextInputStyle.Short)
    .setRequired(false);
  const descInput = new TextInputBuilder()
    .setCustomId('description')
    .setLabel('คำอธิบาย')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(false);

  modal.addComponents(
    new ActionRowBuilder().addComponents(nameInput),
    new ActionRowBuilder().addComponents(commandInput),
    new ActionRowBuilder().addComponents(categoryInput),
    new ActionRowBuilder().addComponents(descInput)
  );

  await interaction.showModal(modal);
}

async function handleAddModalSubmit(interaction) {
  const name = interaction.fields.getTextInputValue('name').trim();
  const command = interaction.fields.getTextInputValue('command').trim();
  const category = (interaction.fields.getTextInputValue('category') || '').trim() || 'Uncategorized';
  const description = (interaction.fields.getTextInputValue('description') || '').trim();

  if (!name || !command) {
    return interaction.reply({ content: 'ชื่อและคำสั่งห้ามว่าง', ephemeral: true });
  }

  const id = crypto.randomUUID();
  const { rows } = await pool.query(
    `INSERT INTO commands (id, category, name, command, description)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [id, category, name, command, description]
  );
  const row = rows[0];

  await interaction.reply({ content: `เพิ่มคำสั่ง **${row.name}** แล้ว`, ephemeral: true });
  await sendNotify(
    interaction.client,
    commandEmbed('create', { name: row.name, category: row.category, command: row.command })
  );
}

async function handleLogAdd(interaction) {
  const text = interaction.options.getString('text').trim();
  if (!text) {
    return interaction.reply({ content: 'ข้อความบันทึกห้ามว่าง', ephemeral: true });
  }

  const id = crypto.randomUUID();
  const { rows } = await pool.query('INSERT INTO logs (id, text) VALUES ($1, $2) RETURNING *', [id, text]);
  const row = rows[0];

  await interaction.reply(`บันทึกแล้ว: ${row.text}`);
  await sendNotify(interaction.client, logEmbed('create', { text: row.text }));
}

async function handleLogToday(interaction) {
  await interaction.deferReply();

  const { rows } = await pool.query(
    `SELECT * FROM logs WHERE created_at >= date_trunc('day', now()) ORDER BY created_at DESC`
  );

  if (rows.length === 0) {
    return interaction.editReply('วันนี้ยังไม่มีบันทึก');
  }

  const embed = new EmbedBuilder()
    .setColor(BRAND_COLOR)
    .setTitle('บันทึกวันนี้')
    .setDescription(
      rows
        .map((r) => {
          const t = new Date(r.created_at).toLocaleTimeString('th-TH', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
          });
          return `\`${t}\` ${r.text}`;
        })
        .join('\n')
    );

  await interaction.editReply({ embeds: [embed] });
}

async function handleStatus(interaction) {
  await interaction.deferReply();
  try {
    await pool.query('SELECT 1');
    await interaction.editReply('🟢 ฐานข้อมูลออนไลน์ ทุกอย่างปกติ');
  } catch (err) {
    await interaction.editReply('🔴 เชื่อมต่อฐานข้อมูลไม่ได้ตอนนี้');
  }
}

module.exports = { handleInteraction };
