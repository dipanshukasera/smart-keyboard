require('dotenv').config();

const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');

const gifRoutes = require('./routes/gif.routes');
const translateRoutes = require('./routes/translate.routes');
const themeRoutes = require('./routes/theme.routes');
const userRoutes = require('./routes/user.routes');

const app = express();

app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => res.json({status: 'ok'}));

app.use('/api/gif', gifRoutes);
app.use('/api/translate', translateRoutes);
app.use('/api/themes', themeRoutes);
app.use('/api/users', userRoutes);

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({error: 'Internal server error'});
});

const PORT = process.env.PORT || 4000;

async function start() {
  if (process.env.MONGODB_URI) {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');
  } else {
    console.warn('MONGODB_URI not set - theme/user persistence will fail');
  }

  app.listen(PORT, () => {
    console.log(`keyboard-backend listening on port ${PORT}`);
  });
}

start();
