// Runs automatically on first container start (mounted into
// /docker-entrypoint-initdb.d/ by docker-compose.yml). Seeds a default
// sticker pack so the GIF/sticker panel has something to show in local dev
// even without a Tenor API key configured.
db = db.getSiblingDB('smart_keyboard');

db.stickerpacks.insertOne({
  name: 'Starter Pack',
  stickerUrls: [],
  isDefault: true,
  createdAt: new Date(),
  updatedAt: new Date(),
});
