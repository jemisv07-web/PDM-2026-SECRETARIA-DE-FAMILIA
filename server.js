'use strict';

const express = require('express');
const fs = require('fs');
const path = require('path');
const chokidar = require('chokidar');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data', 'dashboard-data.json');
const DATA_DIR = path.join(__dirname, 'data');

// Rate limiter for API routes that perform file system access
const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60,             // max 60 requests per minute per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiadas solicitudes. Por favor espere un momento antes de intentar nuevamente.' },
});

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/api', apiLimiter);

// SSE clients registry
const sseClients = new Set();

// ─── SSE endpoint ────────────────────────────────────────────────────────────
app.get('/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.flushHeaders();

  // Send initial connection confirmation
  res.write('event: connected\ndata: {}\n\n');

  sseClients.add(res);

  req.on('close', () => {
    sseClients.delete(res);
  });
});

// Broadcast updated data to all SSE clients
function broadcastUpdate(data) {
  const payload = `event: update\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(payload);
    } catch {
      sseClients.delete(client);
    }
  }
}

// ─── REST API ────────────────────────────────────────────────────────────────

// GET all dashboard data
app.get('/api/data', (req, res) => {
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    res.json(JSON.parse(raw));
  } catch (err) {
    res.status(500).json({ error: 'No se pudo leer el archivo de datos.', detail: err.message });
  }
});

// PUT – replace the entire dashboard data (used by the editor UI)
app.put('/api/data', (req, res) => {
  try {
    const payload = req.body;
    payload.fechaActualizacion = new Date().toISOString().slice(0, 10);
    fs.writeFileSync(DATA_FILE, JSON.stringify(payload, null, 2), 'utf8');
    res.json({ ok: true, fechaActualizacion: payload.fechaActualizacion });
  } catch (err) {
    res.status(500).json({ error: 'No se pudo guardar el archivo de datos.', detail: err.message });
  }
});

// PATCH – update a single indicador by id
app.patch('/api/data/indicadores/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    const data = JSON.parse(raw);
    const idx = data.indicadores.findIndex((i) => i.id === id);
    if (idx === -1) return res.status(404).json({ error: 'Indicador no encontrado.' });
    data.indicadores[idx] = { ...data.indicadores[idx], ...req.body, id };
    data.fechaActualizacion = new Date().toISOString().slice(0, 10);
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
    res.json({ ok: true, indicador: data.indicadores[idx] });
  } catch (err) {
    res.status(500).json({ error: 'No se pudo actualizar el indicador.', detail: err.message });
  }
});

// PATCH – update a single programa by id
app.patch('/api/data/programas/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    const data = JSON.parse(raw);
    const idx = data.programas.findIndex((p) => p.id === id);
    if (idx === -1) return res.status(404).json({ error: 'Programa no encontrado.' });
    data.programas[idx] = { ...data.programas[idx], ...req.body, id };
    data.fechaActualizacion = new Date().toISOString().slice(0, 10);
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
    res.json({ ok: true, programa: data.programas[idx] });
  } catch (err) {
    res.status(500).json({ error: 'No se pudo actualizar el programa.', detail: err.message });
  }
});

// POST – add a new novedad
app.post('/api/data/novedades', (req, res) => {
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    const data = JSON.parse(raw);
    const maxId = data.novedades.reduce((m, n) => Math.max(m, n.id), 0);
    const nuevaNovedad = { ...req.body, id: maxId + 1, fecha: new Date().toISOString().slice(0, 10) };
    data.novedades.unshift(nuevaNovedad);
    data.fechaActualizacion = new Date().toISOString().slice(0, 10);
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
    res.status(201).json({ ok: true, novedad: nuevaNovedad });
  } catch (err) {
    res.status(500).json({ error: 'No se pudo agregar la novedad.', detail: err.message });
  }
});

// DELETE – remove a novedad by id
app.delete('/api/data/novedades/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    const data = JSON.parse(raw);
    const before = data.novedades.length;
    data.novedades = data.novedades.filter((n) => n.id !== id);
    if (data.novedades.length === before) return res.status(404).json({ error: 'Novedad no encontrada.' });
    data.fechaActualizacion = new Date().toISOString().slice(0, 10);
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'No se pudo eliminar la novedad.', detail: err.message });
  }
});

// ─── File watcher ────────────────────────────────────────────────────────────
const watcher = chokidar.watch(DATA_DIR, {
  persistent: true,
  ignoreInitial: true,
  awaitWriteFinish: { stabilityThreshold: 300, pollInterval: 100 },
});

watcher.on('change', (filePath) => {
  if (path.basename(filePath) !== 'dashboard-data.json') return;
  console.log(`[watcher] Archivo modificado: ${filePath}`);
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const data = JSON.parse(raw);
    broadcastUpdate(data);
    console.log(`[watcher] Transmitiendo actualización a ${sseClients.size} cliente(s).`);
  } catch (err) {
    console.error(`[watcher] Error al leer el archivo modificado: ${err.message}`);
  }
});

watcher.on('add', (filePath) => {
  console.log(`[watcher] Nuevo archivo detectado: ${filePath}`);
});

// ─── Start server ─────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`✅  Servidor iniciado en http://localhost:${PORT}`);
  console.log(`📂  Vigilando cambios en: ${DATA_DIR}`);
});
