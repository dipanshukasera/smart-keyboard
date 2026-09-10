require('dotenv').config();

const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');

const gifRoutes = require('./routes/gif.routes');
const translateRoutes = require('./routes/translate.routes');
const themeRoutes = require('./routes/theme.routes');
const userRoutes = require('./routes/user.routes');
const {requestLogger} = require('./middleware/requestLogger');
const {errorHandler} = require('./middleware/errorHandler');
const {installConsoleCapture} = require('./services/logStore');

const app = express();

app.use(cors());
app.use(express.json());
app.use(requestLogger);

app.get('/health', (req, res) => res.json({status: 'ok'}));

app.use('/api/gif', gifRoutes);
app.use('/api/translate', translateRoutes);
app.use('/api/themes', themeRoutes);
app.use('/api/users', userRoutes);

// Must be registered after the routes: Express only reaches an
// error-handling middleware (the 4-argument signature) for failures
// raised by what was mounted before it.
app.use(errorHandler);

const PORT = process.env.PORT || 4000;

async function start() {
  if (process.env.MONGODB_URI) {
    await mongoose.connect(process.env.MONGODB_URI);
    // Installed only once the connection is up, so the very first
    // captured console call already has somewhere to be written.
    installConsoleCapture();
    console.log('Connected to MongoDB - console output is now also stored in the "logs" collection');
  } else {
    console.warn('MONGODB_URI not set - theme/user persistence and log storage will not work');
  }

  app.listen(PORT, () => {
    console.log(`keyboard-backend listening on port ${PORT}`);
  });
}

start();
