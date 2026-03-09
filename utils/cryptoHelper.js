const crypto = require("crypto");
const youtubeConfig = require("../config/youtube");

function getKey() {
  const secret = String(youtubeConfig.tokenSecret || "");

  if (!secret) {
    throw new Error("YOUTUBE_TOKEN_SECRET is required");
  }

  return crypto.createHash("sha256").update(secret).digest();
}

function encryptText(plainText) {
  const text = String(plainText || "");
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getKey(), iv);

  const encrypted = Buffer.concat([
    cipher.update(text, "utf8"),
    cipher.final()
  ]);

  const tag = cipher.getAuthTag();

  return `${iv.toString("base64")}:${tag.toString("base64")}:${encrypted.toString("base64")}`;
}

function decryptText(payload) {
  const value = String(payload || "");

  if (!value) {
    return "";
  }

  const [ivBase64, tagBase64, encryptedBase64] = value.split(":");

  if (!ivBase64 || !tagBase64 || !encryptedBase64) {
    throw new Error("Invalid encrypted payload");
  }

  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    getKey(),
    Buffer.from(ivBase64, "base64")
  );

  decipher.setAuthTag(Buffer.from(tagBase64, "base64"));

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedBase64, "base64")),
    decipher.final()
  ]);

  return decrypted.toString("utf8");
}

module.exports = {
  encryptText,
  decryptText
};