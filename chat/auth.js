let cookie = null;

function setCookie(c) {
  cookie = c;
}

function getCookie() {
  return cookie;
}

function clearCookie() {
  cookie = null;
}

module.exports = { setCookie, getCookie, clearCookie };