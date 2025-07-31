const assert = require('assert');
const SAM = require('./SAM');

async function runTests() {
    const sam = new SAM();

    await sam.init();
    console.log('Init OK');

    const { pub, priv } = await sam.generateDestination();
    assert.ok(pub && priv, 'Should generate pub and priv keys');
    console.log(`Destination generated OK ${pub} / ${priv}`);

    const socket = await sam.sessionCreate('test-session', destination=priv);
    assert.ok(socket, 'SessionCreate should return socket');
    console.log('Session created OK');

    console.log(`Open your sam sessions and connect to b32.i2p`)
    const acceptResult = await sam.streamAccept('test-session');
    assert.ok(acceptResult.socket, 'StreamAccept should return socket');
    console.log('Stream accepted OK');
    acceptResult.socket.write(
        `HTTP/1.1 200 OK\r\n` +
        `Content-Type: text/html; charset=utf-8\r\n` +
        `Content-Length: ${Buffer.byteLength('<h1>test pass</h1>')}\r\n` +
        `Connection: close\r\n` +
        `\r\n` +
        `<h1>test pass</h1>`
      );

    const connectSocket = await sam.connect('test-session', 'Lz7qHnOHfwbHA-vxM0xaDtfiq48qsRZrbmbqj20U2~kIy7p18-ivxnydy0lgqPKgmdF2c-a9U8Upht5uBUL~53PgWz7cuyw~uuWsYBwm6pRUhpNrDTEhnL8jnhs4JYms3cjjZ2bZF8HmAn1A2V6Mmffjj0lketnEdPERGwahjuOrfHHepFVjHtvGCh9ubUKeEEdrHxgbMHhi1XdcLoNQZAONVsUu0LBDHVNq3k6ldL-7E14LLSBdHLhnZchnrY10S8hZTQJ-cWKYnqaX5pYZErrxIfVAgr9axG6lwv0EzHh4D~4FuSqsRBli7pF9Yeo-LZPbfNSnGV00pcMNnX-~QMSfPgTKpOHoFXv0O1dIbgczzdlki-q4D1R6lF5autG1DjC6sjcilhd1WnT1TN3NWaac4KvISZw4gac06ZVrAweFntH117Fg78CCAy5WJ0I8dqLlYa1D829B-6BNk0VifIiIKyNjmYsXv~0IK28UbWd0rfKvv21Ke~HJeiNI8r6SBQAEAAEAAA==');
    assert.ok(connectSocket, 'Connect should return socket');
    console.log('Connected OK');
    const httpRequest = [
        'GET / HTTP/1.1',
        'Host: some.i2p',
        'User-Agent: SAM-test',
        'Connection: close',
        '', ''
    ].join('\r\n');
    connectSocket.socket.write(httpRequest);
    connectSocket.socket.on('data', (data) => {
        console.log(data.toString())
    })  
    console.log('done tests!');
}

runTests().catch(err => {
    console.error('Test failed:', err);
    process.exit(1);
});
