const {
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder
} = require('discord.js');
const crypto = require('crypto');
const { pool } = require('../db');
const { isDiscordAdmin } = require('./isDiscordAdmin');
const { createAuditLog } = require('../utils/audit');

const ADD_MODAL_ID = 'ark-console-cmd-add';
const BRAND_COLOR = 0x5865f2;

const UNAUTHORIZED_MESSAGE = { content: 'You do not have permission to use this command.', ephemeral: true };

// Checks ADMIN_IDS for the interaction's invoking user. Replies and
// returns false (caller must stop) if the user is not authorized.
// Handles both slash-command invocations and modal submits, logging
// the attempt either way.
function assertAdmin(interaction, commandLabel) {
  if (isDiscordAdmin(interaction.user.id)) return true;

  console.warn(
    `Unauthorized Discord command attempt\nUser ID: ${interaction.user.id}\nCommand: ${commandLabel}`
  );
  interaction.reply(UNAUTHORIZED_MESSAGE).catch(() => {});
  return false;
}

async function handleInteraction(interaction) {
  if (interaction.isChatInputCommand()) {
    return handleSlashCommand(interaction);
  }
  if (interaction.isAutocomplete()) {
    return handleAutocomplete(interaction);
  }
  if (interaction.isModalSubmit() && interaction.customId === ADD_MODAL_ID) {
    return handleAddModalSubmit(interaction);
  }
}

async function handleAutocomplete(interaction) {
  const { commandName } = interaction;
  const focused = interaction.options.getFocused() || '';

  if (commandName === 'cmd' && interaction.options.getSubcommand() === 'delete') {
    if (!isDiscordAdmin(interaction.user.id)) {
      return interaction.respond([]);
    }
    const { rows } = await pool.query(
      `SELECT id, name, command, category FROM commands
       WHERE name ILIKE $1 OR command ILIKE $1
       ORDER BY created_at DESC LIMIT 25`,
      [`%${focused}%`]
    );
    return interaction.respond(
      rows.map((r) => ({
        name: `${r.name} — ${r.command}`.slice(0, 100),
        value: r.id
      }))
    );
  }

  return interaction.respond([]);
}

async function handleSlashCommand(interaction) {
  const { commandName } = interaction;

  if (commandName === 'cmd') {
    const sub = interaction.options.getSubcommand();
    if (sub === 'list') return handleCmdList(interaction);
    if (sub === 'add') return handleCmdAdd(interaction);
    if (sub === 'search') return handleCmdSearch(interaction);
    if (sub === 'delete') return handleCmdDelete(interaction);
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
  if (!assertAdmin(interaction, '/cmd add')) return;

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
  if (!assertAdmin(interaction, '/cmd add (modal submit)')) return;

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

  await createAuditLog({
    userId: interaction.user.id,
    username: interaction.user.globalName || interaction.user.username,
    source: 'discord',
    action: 'CREATE_COMMAND',
    targetType: 'command',
    targetId: row.id,
    targetName: row.name,
    details: { category: row.category, command: row.command }
  });

  await interaction.reply({ content: `เพิ่มคำสั่ง **${row.name}** แล้ว`, ephemeral: true });
}

async function handleCmdDelete(interaction) {
  if (!assertAdmin(interaction, '/cmd delete')) return;

  const id = interaction.options.getString('target');
  await interaction.deferReply();

  const { rows } = await pool.query('DELETE FROM commands WHERE id = $1 RETURNING *', [id]);
  if (rows.length === 0) {
    return interaction.editReply('ไม่พบคำสั่งนี้ (อาจถูกลบไปแล้ว) ลองพิมพ์ค้นหาใหม่แล้วเลือกจากรายการ');
  }

  await createAuditLog({
    userId: interaction.user.id,
    username: interaction.user.globalName || interaction.user.username,
    source: 'discord',
    action: 'DELETE_COMMAND',
    targetType: 'command',
    targetId: rows[0].id,
    targetName: rows[0].name,
    details: { category: rows[0].category, command: rows[0].command }
  });

  await interaction.editReply(`ลบคำสั่ง **${rows[0].name}** แล้ว`);
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
