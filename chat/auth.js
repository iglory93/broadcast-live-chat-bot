let cookie = null;

function setCookie(c) {
  cookie = c;
}

function getCookie() {
  return cookie;
}

module.exports = { setCookie, getCookie };