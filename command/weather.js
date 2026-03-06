const cache = {};
const CACHE_TIME = 300000; // 5분

/* 한국 도시 → 영어 */
const cityMap = {
  서울: "Seoul",
  부산: "Busan",
  대구: "Daegu",
  인천: "Incheon",
  대전: "Daejeon",
  광주: "Gwangju",
  울산: "Ulsan",
  제주: "Jeju",
  제주도: "Jeju",
  수원: "Suwon",
  성남: "Seongnam",
  고양: "Goyang",
  용인: "Yongin",
  창원: "Changwon",
  청주: "Cheongju",
  전주: "Jeonju",
  천안: "Cheonan",
  포항: "Pohang",
  경주: "Gyeongju"
};

async function getWeather(city = "서울") {

  try {

    const now = Date.now();

    /* 캐시 */
    if (cache[city]) {
      const c = cache[city];
      if (now - c.time < CACHE_TIME) {
        return c.value;
      }
    }

    const query = cityMap[city] || city;

    const url =
      `https://api.weatherapi.com/v1/current.json?key=${process.env.WEATHER_API_KEY}&q=${encodeURIComponent(query)}&lang=ko`;

    const res = await fetch(url, {
      headers: {
        "User-Agent": "ttinglive-bot"
      }
    });

    const data = await res.json();

    if (data.error) {

      console.log("weather api error:", data);

      if (cache[city]) {
        return cache[city].value;
      }

      return `❌ ${city} 지역을 찾을 수 없습니다.`;
    }

    const name = city;
    const temp = data.current.temp_c;
    const text = data.current.condition.text;
    const humidity = data.current.humidity;
    const wind = data.current.wind_kph;

    const result =
      `🌏 ${name} 날씨 ${text} 🌡 ${temp}°C 💧습도 ${humidity}% 🌬 ${wind}km/h`;

    cache[city] = {
      time: now,
      value: result
    };

    return result;

  } catch (err) {

    console.error("weather error:", err);

    if (cache[city]) {
      return cache[city].value;
    }

    return "🌤 날씨 정보를 가져오지 못했습니다.";
  }
}

module.exports = getWeather;