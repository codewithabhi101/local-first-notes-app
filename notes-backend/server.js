const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

const DB_FILE = path.join(__dirname, 'notes.json');

function loadNotes() {
  if (!fs.existsSync(DB_FILE)) return [];
  return JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
}

function saveNotes(notes) {
  fs.writeFileSync(DB_FILE, JSON.stringify(notes, null, 2));
}

app.post('/api/notes', (req, res) => {
  const { id, title, content, folder, created_at, updated_at } = req.body;
  const notes = loadNotes();
  const index = notes.findIndex((n) => n.id === id);

  if (index >= 0) {
    if (updated_at > notes[index].updated_at) {
      notes[index] = { id, title, content, folder, created_at, updated_at };
    }
  } else {
    notes.push({ id, title, content, folder, created_at, updated_at });
  }

  saveNotes(notes);
  res.json({ id });
});

app.put('/api/notes/:id', (req, res) => {
  const { title, content, folder, updated_at } = req.body;
  const { id } = req.params;
  const notes = loadNotes();
  const index = notes.findIndex((n) => n.id === id);

  if (index === -1) return res.status(404).json({ error: 'Not found' });

  if (updated_at > notes[index].updated_at) {
    notes[index] = { ...notes[index], title, content, folder, updated_at };
  }

  saveNotes(notes);
  res.json({ id });
});

app.get('/api/notes', (req, res) => {
  res.json(loadNotes());
});

const PORT = 4000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running at http://localhost:${PORT}`);
});