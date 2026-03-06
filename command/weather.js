const fetch = require("node-fetch");

/* 한국 주요 도시 */
const cityMap = {
  서울: { lat: 37.5665, lon: 126.9780 },
  부산: { lat: 35.1796, lon: 129.0756 },
  대구: { lat: 35.8714, lon: 128.6014 },
  인천: { lat: 37.4563, lon: 126.7052 },
  대전: { lat: 36.3504, lon: 127.3845 },
  광주: { lat: 35.1595, lon: 126.8526 },
  울산: { lat: 35.5384, lon: 129.3114 },
  제주: { lat: 33.4996, lon: 126.5312 },
  제주도: { lat: 33.4996, lon: 126.5312 },
  울릉도: { lat: 37.4844, lon: 130.9057 },
  독도: { lat: 37.2417, lon: 131.8667 },
  경주: { lat: 35.8562, lon: 129.2247 }
};

/* 날씨 코드 해석 */
function parseWeather(code) {

  if (code === 0) return "☀️ 맑음";
  if (code >= 1 && code <= 3) return "⛅ 흐림";
  if (code === 45 || code === 48) return "🌫 안개";

  if (code >= 51 && code <= 67) return "🌧 비";
  if (code >= 71 && code <= 77) return "❄️ 눈";

  if (code >= 80 && code <= 82) return "🌦 소나기";
  if (code >= 95) return "⛈ 천둥번개";

  return "🌤 날씨";
}

/* 도시 → 좌표 */
async function getCoords(city) {

  if (cityMap[city]) {
    return {
      name: city,
      lat: cityMap[city].lat,
      lon: cityMap[city].lon
    };
  }

  const url =
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1`;

  const res = await fetch(url);
  const data = await res.json();

  if (!data.results || data.results.length === 0) return null;

  const r = data.results[0];

  return {
    name: r.name,
    lat: r.latitude,
    lon: r.longitude
  };
}

/* 날씨 */
async function getWeather(city = "서울") {

  try {

    const coords = await getCoords(city);

    if (!coords) {
      return `❌ ${city} 지역을 찾을 수 없습니다.`;
    }

    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${coords.lat}&longitude=${coords.lon}&current=temperature_2m,weather_code`;

   // const res = await fetch(url);

    const res = await fetch(url, {
        headers: {
          "User-Agent": "ttinglive-weather-bot"
        }
    });
    const data = await res.json();

    const temp = data?.current?.temperature_2m;
    const code = data?.current?.weather_code;

    if (temp === undefined) {
      console.log("weather raw:", data);
      return "🌤 날씨 데이터를 가져오지 못했습니다.";
    }

    const weather = parseWeather(code);

    return `🌏 ${coords.name} 날씨 ${weather} 🌡 ${temp}°C`;

  } catch (err) {

    console.error("weather error", err);
    return "🌤 날씨 API 오류";

  }
}

module.exports = getWeather;