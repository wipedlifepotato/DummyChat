// api/routes/sam.js
const express = require('express');
const router = express.Router();
const Sam = require('../../SAM'); 
const { v4: uuidv4 } = require('uuid');

const samSockets = new Map();
const buffers = new Map();
const SamHost = '127.0.0.1';
const SamPort = 7656;

router.get('/clear', async (req, res) => {
  for (const [_, socket] of samSockets.entries()) {
    if (socket) {
      if (typeof socket.destroy === 'function') {
        socket.destroy();
      } else if (typeof socket.close === 'function') {
        socket.close();
      }
    }
  }
  samSockets.clear(); 
  res.json({ status: 'ok', message: 'All sockets closed' });
});

router.get('/generateDestination/:type', async (req, res) => {
  let type = req.params.type;
  type = Number(type); 
  const mSam = new Sam(SamHost, SamPort);
  try {
    const { pub, priv } = await mSam.generateDestination(type);
    return res.json({ privkey: priv, pubkey: pub });
  } catch (e) {
    return res.status(500).json({ error: e.message || 'Failed to generate destination' });
  }
});

router.post('/session-create', async (req, res) => {
  const { nickname, privkey } = req.body;
  if (!nickname) return res.status(400).json({ error: 'nickname required' });

  try {
    const mSam = new Sam(SamHost, SamPort);
    const socket = await mSam.sessionCreate(nickname, privkey);
    const id = uuidv4();
    samSockets.set(id, socket);
    res.json({ status: 'ok', id });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Failed to create session' });
  }
});

router.post('/session-accept', async (req, res) => {
  const { nickname } = req.body;
  if (!nickname) return res.status(400).json({ error: 'nickname required' });

  try {
    const mSam = new Sam(SamHost, SamPort);
    const acceptResult = await mSam.streamAccept(nickname);
    if (!acceptResult) return res.status(500).json({ status: false, error: 'Error while accept' });

    const id = uuidv4();
    samSockets.set(id, acceptResult.socket || acceptResult); // если acceptResult — объект с socket
    return res.json({ status: 'ok', id });
  } catch (e) {
    return res.status(500).json({ status: false, error: e.message || 'Accept failed' });
  }
});

router.post('/session-connect', async (req, res) => {
  const { nickname, destination } = req.body;
  if (!nickname || !destination) return res.status(400).json({ error: 'nickname and destination required' });

  try {
    const mSam = new Sam(SamHost, SamPort);
    const connectSocket = await mSam.connect(nickname, destination);
    if (!connectSocket) return res.status(500).json({ status: false, error: 'Error while connect' });

    const id = uuidv4();
    samSockets.set(id, connectSocket.socket || connectSocket); // как выше — может быть объект с socket
    return res.json({ status: 'ok', id });
  } catch (e) {
    return res.status(500).json({ status: false, error: e.message || 'Connect failed' });
  }
});

router.post('/send', async (req, res) => {
  const { sockId, data } = req.body;
  if (!sockId || !data) return res.status(400).json({ error: 'id and data required' });

  const socket = samSockets.get(sockId);
  if (!socket) return res.status(404).json({ error: 'Socket not found' });

  try {
    socket.write(data);
    res.json({ status: 'sent' });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Failed to send data' });
  }
});

router.get('/getBuffer/:bufName', async (req, res) => {
  const bufName = req.params.bufName;
  if (!bufName) {
    return res.status(400).json({ error: 'bufName parameter required' });
  }

  const data = buffers.get(bufName) || '';
  res.json({ status: 'ok', buffer: data });
});

router.post('/setBuffer', async (req, res) => {
  const { sockId, bufName } = req.body;
  if (!sockId || !bufName) {
    return res.status(400).json({ error: 'sockId and bufName are required' });
  }

  const socket = samSockets.get(sockId);
  if (!socket) {
    return res.status(404).json({ error: 'Socket not found' });
  }

  if (!buffers.has(bufName)) {
    buffers.set(bufName, '');
    return res.status(500).json({error: "already exists, clear buf"})
  }

  socket.on('data', (data) => {
    const current = buffers.get(bufName) || '';
    buffers.set(bufName, current + data.toString());
  });

  res.json({ status: 'ok', message: `Buffer "${bufName}" is set on socket "${id}"` });
});


module.exports = router;
