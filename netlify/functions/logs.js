const crypto = require('crypto');
const { getStore } = require('@netlify/blobs');

const KEY = 'logs';

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
  const hasId = last && last !== 'logs';

  try {
    if (event.httpMethod === 'GET') {
      const list = await readAll();
      return { statusCode: 200, headers, body: JSON.stringify(list) };
    }

    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}');
      const { text } = body;
      if (!text || !text.trim()) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'ข้อความบันทึกห้ามว่าง' }) };
      }
      const list = await readAll();
      const entry = {
        id: crypto.randomUUID(),
        text: text.trim(),
        createdAt: new Date().toISOString(),
        updatedAt: null
      };
      list.unshift(entry);
      await writeAll(list);
      return { statusCode: 201, headers, body: JSON.stringify(entry) };
    }

    if (event.httpMethod === 'PUT' && hasId) {
      const list = await readAll();
      const idx = list.findIndex((l) => l.id === last);
      if (idx === -1) {
        return { statusCode: 404, headers, body: JSON.stringify({ error: 'ไม่พบบันทึกนี้' }) };
      }
      const body = JSON.parse(event.body || '{}');
      if (!body.text || !body.text.trim()) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'ข้อความบันทึกห้ามว่าง' }) };
      }
      list[idx] = { ...list[idx], text: body.text.trim(), updatedAt: new Date().toISOString() };
      await writeAll(list);
      return { statusCode: 200, headers, body: JSON.stringify(list[idx]) };
    }

    if (event.httpMethod === 'DELETE' && hasId) {
      const list = await readAll();
      const next = list.filter((l) => l.id !== last);
      if (next.length === list.length) {
        return { statusCode: 404, headers, body: JSON.stringify({ error: 'ไม่พบบันทึกนี้' }) };
      }
      await writeAll(next);
      return { statusCode: 204, headers, body: '' };
    }

    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
