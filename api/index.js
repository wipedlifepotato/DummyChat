// api/index.js
const express = require('express');
const cors = require('cors');
const samRoutes = require('./routes/sam');
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./swagger');
require('dotenv').config()
const path = require('path')
const app = express();
const PORT = Number(process.env.PORT||3001);

app.use(cors());
app.use(express.json());
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
app.use('/api/sam', samRoutes);
app.use('/', express.static(path.join(__dirname, 'public')))
app.use('/static', express.static(path.join(__dirname, 'public')));
app.listen(PORT, () => {
  console.log(`API server runs http://localhost:${PORT}`);
});
