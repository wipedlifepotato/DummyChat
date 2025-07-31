const crypto = require('crypto');
const mEncrypt = {};
function encrypt(text, password) {
    const iv = crypto.randomBytes(12);
    const key = crypto.scryptSync(password, 'salt', 32);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

    const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();

    return {
        iv: iv.toString('hex'),
        tag: tag.toString('hex'),
        data: encrypted.toString('hex')
    };
}

function decrypt(encrypted, password) {
    const key = crypto.scryptSync(password, 'salt', 32);
    const decipher = crypto.createDecipheriv(
        'aes-256-gcm',
        key,
        Buffer.from(encrypted.iv, 'hex')
    );
    decipher.setAuthTag(Buffer.from(encrypted.tag, 'hex'));

    const decrypted = Buffer.concat([
        decipher.update(Buffer.from(encrypted.data, 'hex')),
        decipher.final()
    ]);

    return decrypted.toString('utf8');
}
mEncrypt.decrypt = decrypt
mEncrypt.encrypt = encrypt
module.exports = mEncrypt