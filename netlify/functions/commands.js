const crypto = require('crypto');
const { getStore } = require('@netlify/blobs');

const KEY = 'commands';

function store() {
  return getStore({ name: 'ark-console', consistency: 'strong' });
}

async function readAll() {
  const data = await store().get(KEY, { type: 'json' });
  return data || [];
}

async function writeAll(list) {
  await store().setJSON(KEY, list);
}

exports.handler = async (event) => {
  const headers = { 'Content-Type': 'application/json' };
  const segments = event.path.split('/').filter(Boolean);
  const last = segments[segments.length - 1];
  const hasId = last && last !== 'commands';

  try {
    if (event.httpMethod === 'GET') {
      const list = await readAll();
      return { statusCode: 200, headers, body: JSON.stringify(list) };
    }

    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}');
      const { category, name, command, description } = body;
      if (!name || !command) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'name และ command จำเป็นต้องระบุ' }) };
      }
      const list = await readAll();
      const entry = {
        id: crypto.randomUUID(),
        category: (category || 'Uncategorized').trim(),
        name: name.trim(),
        command: command.trim(),
        description: (description || '').trim(),
        createdAt: new Date().toISOString()
      };
      list.unshift(entry);
      await writeAll(list);
      return { statusCode: 201, headers, body: JSON.stringify(entry) };
    }

    if (event.httpMethod === 'PUT' && hasId) {
      const list = await readAll();
      const idx = list.findIndex((c) => c.id === last);
      if (idx === -1) {
        return { statusCode: 404, headers, body: JSON.stringify({ error: 'ไม่พบคำสั่งนี้' }) };
      }
      const body = JSON.parse(event.body || '{}');
      list[idx] = {
        ...list[idx],
        ...(body.category !== undefined && { category: body.category.trim() }),
        ...(body.name !== undefined && { name: body.name.trim() }),
        ...(body.command !== undefined && { command: body.command.trim() }),
        ...(body.description !== undefined && { description: body.description.trim() }),
        updatedAt: new Date().toISOString()
      };
      await writeAll(list);
      return { statusCode: 200, headers, body: JSON.stringify(list[idx]) };
    }

    if (event.httpMethod === 'DELETE' && hasId) {
      const list = await readAll();
      const next = list.filter((c) => c.id !== last);
      if (next.length === list.length) {
        return { statusCode: 404, headers, body: JSON.stringify({ error: 'ไม่พบคำสั่งนี้' }) };
      }
      await writeAll(next);
      return { statusCode: 204, headers, body: '' };
    }

    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
