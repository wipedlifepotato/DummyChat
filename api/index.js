// api/index.js
const express = require('express');
const cors = require('cors');
const samRoutes = require('./routes/sam');
const cryptoRoutes = require('./routes/crypto');

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

app.use('/api/sam', samRoutes);
app.use('/api/crypto', cryptoRoutes);

app.listen(PORT, () => {
  console.log(`API сервер запущен на http://localhost:${PORT}`);
});
