// api/routes/sam.js
const express = require('express');
const router = express.Router();
const Sam = require('../../SAM'); 
const { v4: uuidv4 } = require('uuid');

const samSockets = new Map();
const buffers = new Map();
let SamHost = '127.0.0.1';
let SamPort = 7656;
/**
 * @swagger
 * /sam/setSAM:
 *   post:
 *     summary: Set settings of SAM (host and port)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               host:
 *                 type: string
 *                 default: "localhost"
 *               port:
 *                 type: number
 *                 default: 7656
 *             required:
 *               - host
 *               - port
 *     responses:
 *       200:
 *         description: Settings were applied
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                status:
 *                  type: string
 *                  default: ok
 */
router.post('/setSAM', async (req,res)=> {
  console.log(`set SAM`)
  const {host, port} = req.body;
  SamPort = Number(port) || 7656
  SamHost = host
  res.json({'status': 'ok'})
})
/**
 * @swagger
 * /sam/clear:
 *   get:
 *     summary: Clear all buffers, all sockets, close all connections
 *     responses:
 *       200:
 *         description: Settings were applied
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                status:
 *                  type: string
 *                  default: ok
 *                message:
 *                  type: string
 *                  default: All sockets closed
 */
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
/**
 * @swagger
 * /sam/session-create:
 *   post:
 *     summary: Create SAM session from nickname and privkey (json data)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               nickname:
 *                 type: string
 *               privkey:
 *                 type: string
 *             required:
 *               - nickname
 *               - privkey
 *     responses:
 *       200:
 *         description: Session created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                 id:
 *                   type: string
 *       400:
 *         description: Nickname is required
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *       500:
 *         description: Failed to create session
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 */

router.post('/session-create', async (req, res) => {
  console.log(`create session`)
  const { nickname, privkey } = req.body;
  if (!nickname) return res.status(400).json({ error: 'nickname required' });

  try {
    const mSam = new Sam(SamHost, SamPort);
    const socket = await mSam.sessionCreate(nickname, privkey);
    const id = uuidv4();
    samSockets.set(id, socket);
    await res.json({ status: 'ok', id });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Failed to create session' });
  }
});
/**
 * @swagger
 * /sam/session-accept:
 *   post:
 *     summary: Accept connection for some SAM Session (nickname)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               nickname:
 *                 type: string
 *             required:
 *               - nickname
 *     responses:
 *       200:
 *         description: did accept new connection
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   default: ok
 *                 id:
 *                   type: string
 *                   default: socketId
 *       500:
 *         description: error with accept
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                 status:
 *                   type: boolean
 *                   default: false 
 */
router.post('/session-accept', async (req, res) => {
  const { nickname } = req.body;
  if (!nickname) return res.status(400).json({ error: 'nickname required' });

  try {
    const mSam = new Sam(SamHost, SamPort);
    const acceptResult = await mSam.streamAccept(nickname);
    if (!acceptResult) return res.status(500).json({ status: false, error: 'Error while accept' });

    const id = uuidv4();
    samSockets.set(id, acceptResult.socket || acceptResult);
    const socket = acceptResult.socket || acceptResult;

    samSockets.set(id, socket);
    buffers.set(id, '');

    socket.on('data', (data) => {
      const current = buffers.get(id) || '';
      buffers.set(id, current + data.toString());
      console.log(`Data received on socket ${id}: ${data.toString()}`);
    });
 
    return res.json({ status: 'ok', id });
  } catch (e) {
    return res.status(500).json({ status: false, error: e.message || 'Accept failed' });
  }
});
/**
 * @swagger
 * /sam/close-socket/{socketId}:
 *   delete:
 *     summary: Close a SAM socket by ID and delete its buffer
 *     parameters:
 *       - in: path
 *         name: socketId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID of the socket to close
 *     responses:
 *       200:
 *         description: Socket closed and buffer deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: ok
 *                 message:
 *                   type: string
 *                   example: Socket {socketId} closed and buffer deleted
 *       400:
 *         description: Missing socketId parameter
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: socketId required
 *       404:
 *         description: Socket with given ID not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: Socket not found
 */
router.delete('/close-socket/:socketId', async (req, res) => {
  const socketId = req.params.socketId;

  if (!socketId) {
    return res.status(400).json({ error: 'socketId required' });
  }

  const socket = samSockets.get(socketId);
  if (!socket) {
    return res.status(404).json({ error: 'Socket not found' });
  }

  if (typeof socket.destroy === 'function') {
    socket.destroy();
  } else if (typeof socket.close === 'function') {
    socket.close();
  }

  samSockets.delete(socketId);

  for (const [bufName, _] of buffers.entries()) {
    if (bufName.includes(socketId)) {
      buffers.delete(bufName);
    }
  }

  res.json({ status: 'ok', message: `Socket ${socketId} closed and buffer deleted` });
});
/**
 * @swagger
 * /sam/sockets:
 *   get:
 *     summary: Get list of all active sockets with buffer info
 *     responses:
 *       200:
 *         description: List of sockets with their buffer data length
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 sockets:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       bufferLength:
 *                         type: number
 *                       bufferPreview:
 *                         type: string
 *                       friendPubKey:
 *                         type: string
 */
router.get('/sockets', (req, res) => {
  try {
    const allSockets = [];

    for (const [id, socket] of samSockets.entries()) {
      const bufferData = buffers.get(id) || '';
      let friendPubKey = '';

      const regex = /{[^{}]*"pubkey"\s*:\s*"([^"]+)"[^{}]*}/g;
      const match = regex.exec(bufferData);
      if (match) {
        friendPubKey = match[1];
      }

      allSockets.push({
        id,
        bufferLength: bufferData.length,
        bufferPreview: bufferData.slice(0, 12000),
        friendPubKey
      });
    }

    res.json({ sockets: allSockets });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Failed to get sockets' });
  }
});
/**
 * @swagger
 * /sam/session-connect:
 *   post:
 *     summary: Connect to a destination via SAM session
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - nickname
 *               - destination
 *             properties:
 *               nickname:
 *                 type: string
 *                 description: name of SAM session
 *               destination:
 *                 type: string
 *                 description: Destination for connect
 *     responses:
 *       200:
 *         description: Successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: ok
 *                 id:
 *                   type: string
 *                   description: SocketId
 *       400:
 *         description: nickname or destination required
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: nickname and destination required
 *       500:
 *         description: server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: boolean
 *                   example: false
 *                 error:
 *                   type: string
 *                   example: Connect failed
 */
router.post('/session-connect', async (req, res) => {
  console.log(`session connect`)
  const { nickname, destination } = req.body;
  if (!nickname || !destination) return res.status(400).json({ error: 'nickname and destination required' });

  try {
    const mSam = new Sam(SamHost, SamPort);
    const connectSocket = await mSam.connect(nickname, destination);
    if (!connectSocket) return res.status(500).json({ status: false, error: 'Error while connect' });

    const id = uuidv4();
    samSockets.set(id, connectSocket.socket || connectSocket);
    const socket = connectSocket.socket || connectSocket;

    samSockets.set(id, socket);
    buffers.set(id, '');

    socket.on('data', (data) => {
      const current = buffers.get(id) || '';
      buffers.set(id, current + data.toString());
      console.log(`Data received on socket ${id}: ${data.toString()}`);
    });

    return res.json({ status: 'ok', id });
  } catch (e) {
    return res.status(500).json({ status: false, error: e.message || 'Connect failed' });
  }
});
/**
 * @swagger
 * /sam/send:
 *   post:
 *     summary: Send data through SAM socket by socket ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - sockId
 *               - data
 *             properties:
 *               sockId:
 *                 type: string
 *                 description: Socket identifier received when creating a session
 *               data:
 *                 type: string
 *                 description: Data to send (text)
 *     responses:
 *       200:
 *         description: Data successfully sent
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: sent
 *       400:
 *         description: Bad request, missing required fields
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: id and data required
 *       404:
 *         description: Socket with given ID not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: Socket not found
 *       500:
 *         description: Server error while sending data
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: Failed to send data
 */
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
/**
 * @swagger
 * /sam/getBuffer/{bufName}:
 *   get:
 *     summary: Get content of a named buffer
 *     parameters:
 *       - in: path
 *         name: bufName
 *         required: true
 *         schema:
 *           type: string
 *         description: Name of the buffer to retrieve
 *     responses:
 *       200:
 *         description: Buffer content returned successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: ok
 *                 buffer:
 *                   type: string
 *                   description: Content of the buffer
 *       400:
 *         description: Missing bufName parameter
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: bufName parameter required
 */
router.get('/getBuffer/:bufName', async (req, res) => {
  const bufName = req.params.bufName;

  if (!bufName) {
    return res.status(400).json({ error: 'bufName parameter required' });
  }

  if (!buffers.has(bufName)) {
    return res.status(404).json({ error: `Buffer "${bufName}" not found` });
  }

  const data = buffers.get(bufName);
  res.json({ status: 'ok', buffer: data });
});
/**
 * @swagger
 * /sam/setBuffer:
 *   post:
 *     summary: Attach a data buffer to a socket by ID and buffer name
 *     description: Sets up a buffer to accumulate data received from the specified socket.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - sockId
 *               - bufName
 *             properties:
 *               sockId:
 *                 type: string
 *                 description: The ID of the socket to listen on
 *               bufName:
 *                 type: string
 *                 description: The name of the buffer to store incoming data
 *     responses:
 *       200:
 *         description: Buffer successfully set on the socket
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: ok
 *                 message:
 *                   type: string
 *                   example: Buffer "testbuf" is set on socket "abcd-1234"
 *       400:
 *         description: Missing required parameters (sockId or bufName)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: sockId and bufName are required
 *       404:
 *         description: Socket with given ID not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: Socket not found
 */

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
  }

  if (!socket._bufferAttached) {
    socket._bufferAttached = true;
    console.log(`set socket`)
    socket.on('data', (data) => {
      console.log(`data on socket: ${data}`)
      const current = buffers.get(bufName) || '';
      buffers.set(bufName, current + data.toString());
      console.log(`bufName: ${bufName}, bufferData: ${buffers.get(bufName)}`)
    });
  }

  res.json({ status: 'ok', message: `Buffer "${bufName}" is set on socket "${sockId}"` });
});


module.exports = router;
