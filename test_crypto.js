// by chatgpt
const assert = require('assert');
const encryption = require("./encryption")
// ======== TEST ========
const password = 'test_password';
const message = 'Hello, DummyChat encrypted world!';

const encrypted = encryption.encrypt(message, password);
const decrypted = encryption.decrypt(encrypted, password);

assert.strictEqual(decrypted, message);

console.log('✅ Encryption/decryption test passed.');