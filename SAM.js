const net = require('net');
const EventEmitter = require('events');

class SAM extends EventEmitter {
    constructor(host = '127.0.0.1', port = 7656) {
        super();
        this.host = host;
        this.port = port;
        this.mainSocket = null;
        //this.init();
    }

    init() {
        return new Promise(function (resolve, reject) {
            this.emit("init");
            this.mainSocket = net.connect(this.port, this.host, function () {
                this.mainSocket.write("HELLO VERSION MIN=3.0 MAX=3.2\n");
            }.bind(this));

            this.mainSocket.on('data', function (data) {
                const msg = data.toString();
                if (msg.includes('HELLO REPLY RESULT=OK')) {
                    this.emit("ProtocolOK");
                    return resolve(true);
                } else if (msg.includes('HELLO REPLY RESULT=I2P_ERROR')) {
                    return reject('SAM Error');
                }
            }.bind(this));

            this.mainSocket.on('error', reject);
        }.bind(this));
    }

    sessionCreate(id, destination = 'TRANSIENT', style = 'STREAM') {
        return new Promise(function (resolve, reject) {
            const socket = net.connect(this.port, this.host, function () {
                socket.write("HELLO VERSION MIN=3.0 MAX=3.2\n");
                socket.write(`SESSION CREATE STYLE=${style} ID=${id} DESTINATION=${destination}\n`);
                console.log("Init Session")
            });

            const chunks = [];

            socket.on('data', function (data) {
                chunks.push(data.toString());
                const joined = chunks.join('');
                const match = joined.match(/SESSION STATUS RESULT=OK DESTINATION=([^\s]+)/);
                if (match) {
                    this.emit('SessionCreated', id);
                    return resolve(socket);
                } else {
                    console.log(`data on session create: ${joined}`)
                }
                const error = joined.match(/SESSION STATUS RESULT=(\w+)/);
                if (error) {
                    console.error(`[SAM PROTOCOL]: ${error[1]}`);
                    socket.end();
                    return reject(error[1]);
                }
            }.bind(this));
        }.bind(this));
    }

    generateDestination(keyType = 7) {
        return new Promise(function (resolve, reject) {
            const chunks = [];
            const socket = net.connect(this.port, this.host, function () {
                socket.write("HELLO VERSION MIN=3.0 MAX=3.2\r\n\r\n");
                socket.write(`DEST GENERATE SIGNATURE_TYPE=${keyType}\r\n\r\n`);
                console.log("generate dstionations")
            });

            socket.on('data', function (data) {
                chunks.push(data.toString());
                const joined = chunks.join('');
                const match = joined.match(/DEST REPLY PUB=([^\s]+) PRIV=([^\s]+)/);
                if (match) {
                    const [, pub, priv] = match;
                    socket.end();
                    this.emit('DestinationGenerated', pub);
                    return resolve({ pub, priv });
                } else {
                    console.log(`data: ${joined}`)
                }
            }.bind(this));

            socket.on('error', reject);

            socket.on('end', function () {
                if (!chunks.join('').includes('DEST REPLY')) {
                    return reject(new Error(`Unexpected SAM response ${chunks.join('')}`));
                }
            });
        }.bind(this));
    }

    streamAccept(id, silent = false) {
        const self = this;
    
        return new Promise(function (resolve, reject) {
            const socket = net.connect(self.port, self.host, function () {
                socket.write('HELLO VERSION MIN=3.0 MAX=3.2\n');
            });
    
            const chunks = [];
            let phase = 'handshake';
    
            socket.on('data', function (data) {
                chunks.push(data.toString());
                const joined = chunks.join('');
    
                if (phase === 'handshake') {
                    if (/HELLO REPLY RESULT=OK/.test(joined)) {
                        phase = 'accept';
                        const silentStr = silent ? 'true' : 'false';
                        socket.write(`STREAM ACCEPT ID=${id} SILENT=${silentStr}\n`);
                        chunks.length = 0;
                        return;
                    } else if (/RESULT=/.test(joined)) {
                        return reject(new Error('[SAM] Handshake failed: ' + joined.trim()));
                    }
                }
    
                if (phase === 'accept') {
                    const match = joined.match(/STREAM STATUS RESULT=([A-Z_]+)/);
                    if (match) {
                        const result = match[1];
                        if (result !== 'OK') {
                            return reject(new Error(`[SAM] STREAM ACCEPT failed: ${result}`));
                        } else {
                            phase = 'wait-conn';
                            chunks.length = 0;
                            if (typeof self.emit === 'function') {
                                self.emit('StreamAccepted', id);
                            }
    
                            if (silent) {
                                return resolve({ socket });
                            }
                        }
                    }
                }
    
                if (phase === 'wait-conn' && !silent) {
                    const lines = joined.split('\n');
                    const destLine = lines.find(line => /^[A-Za-z0-9~\-+=\/]{512,}/.test(line));
                    if (destLine) {
                        const peerDest = destLine.trim();
                        return resolve({ socket, peerDest });
                    }
                }
            });
    
            socket.on('error', function (err) {
                return reject(new Error(`[SOCKET ERROR]: ${err.message}`));
            });
        });
    }
    

    connect(id, destination, silent = false) {
        return new Promise(function (resolve, reject) {
            const socket = net.connect(this.port, this.host, function () {
                socket.write('HELLO VERSION MIN=3.0 MAX=3.2\n');
                socket.write(`STREAM CONNECT ID=${id} DESTINATION=${destination} SILENT=${silent}\n`);
            });

            const chunks = [];

            socket.on('data', function (data) {
                chunks.push(data.toString());
                const joined = chunks.join('');

                const result = joined.match(/STREAM STATUS RESULT=([A-Z_]+)/);
                if (result) {
                    if (result[1] === 'OK') {
                        this.emit('Connected', id);
                        return resolve({socket});
                    } else {
                        socket.end();
                        return reject(new Error(`CONNECT failed: ${result[1]}`));
                    }
                }
            }.bind(this));

            socket.on('error', reject);
        }.bind(this));
    }
}

module.exports = SAM;
