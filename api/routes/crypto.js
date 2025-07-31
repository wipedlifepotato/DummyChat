const express = require('express');
const router = express.Router();
const encrypt = require('../../encryption'); 

router.post('/encrypt', async (req, res) => {
  const { message, key } = req.body;
  const msgenc = encrypt.encrypt(message, key)
  res.json(msgenc);
});

module.exports = router;
