const swaggerJSDoc = require('swagger-jsdoc');
require('dotenv').config()
const PORT = Number(process.env.PORT||3001);

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'DummyChat API',
      version: '1.0.0',
      description: 'Documentation of DummyChat',
    },
    servers: [
      {
        url: `http://localhost:${PORT}/api`,
      },
    ],
  },
  apis: ['./routes/*.js'], 
};

const swaggerSpec = swaggerJSDoc(options);

module.exports = swaggerSpec;