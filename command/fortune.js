const crypto = require("crypto");

/*
hash 기반 선택
*/
function pickByHash(hash, index, list) {

  const start = index * 8;
  const hex = hash.substring(start, start + 8);
  const num = parseInt(hex, 16);

  return list[num % list.length];

}

/*
오늘 날짜 키
*/
function getDateKey(offsetDays = 0) {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  kst.setUTCDate(kst.getUTCDate() + offsetDays);

  const year = kst.getUTCFullYear();
  const month = String(kst.getUTCMonth() + 1).padStart(2, "0");
  const day = String(kst.getUTCDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}


/*
운세
*/
function getFortune(nickname) {

  try {

    const dateStr = getDateKey();
    const seed = `${nickname}|${dateStr}`;

    const hash = crypto
      .createHash("sha256")
      .update(seed)
      .digest("hex");


    /*
    전체운
    */

    const overallList = [

      "오늘은 묘하게 흐름이 잘 맞는 날입니다 😎",
      "오늘은 슬슬 운이 붙기 시작합니다.",
      "괜히 나서면 터질 수도 있는 날입니다.",
      "분위기만 잘 타면 오늘 꽤 재밌어집니다.",
      "오늘은 존재감이 자연스럽게 올라갑니다 ✨",
      "의외의 타이밍에 기회가 툭 튀어나옵니다.",
      "오늘은 괜히 말 한마디가 잘 먹힐 수 있습니다.",
      "오늘은 은근히 운빨이 따라주는 날입니다.",
      "오늘은 텐션 관리만 잘하면 상타입니다.",
      "오늘은 생각보다 일이 쉽게 풀립니다.",
      "오늘은 예상 못한 반전이 숨어 있습니다.",
      "오늘은 평소보다 타이밍이 중요합니다.",
      "오늘은 작은 선택이 큰 차이를 만듭니다.",
      "오늘은 사람운이 꽤 좋은 날입니다.",
      "오늘은 괜히 기분 좋은 일이 생길 수 있습니다."

    ];


    /*
    운세 점수
    */

    const scoreList = [

      "🍀 행운 수치 51점 — 무난한 흐름입니다.",
      "🍀 행운 수치 60점 — 슬슬 기세가 붙습니다.",
      "🍀 행운 수치 66점 — 오늘 꽤 괜찮습니다.",
      "🍀 행운 수치 71점 — 밀어볼 타이밍입니다.",
      "🍀 행운 수치 77점 — 존재감 상승 중입니다.",
      "🍀 행운 수치 81점 — 체감 운빨 좋습니다.",
      "🍀 행운 수치 85점 — 채팅 운도 좋은 편입니다.",
      "🍀 행운 수치 89점 — 작은 도전이 크게 돌아옵니다.",
      "🍀 행운 수치 93점 — 오늘 꽤 강한 날입니다.",
      "🍀 행운 수치 97점 — 거의 대박권입니다 🔥"

    ];


    /*
    연애운
    */

    const loveList = [

      "💘 오늘은 리액션이 연애운을 살립니다.",
      "💘 장난 한마디가 분위기를 바꿀 수 있습니다.",
      "💘 괜히 밀당하면 타이밍 놓칠 수 있습니다.",
      "💘 먼저 웃어주는 쪽이 이기는 날입니다.",
      "💘 오늘은 은근히 관심 받을 수 있습니다.",
      "💘 말투 하나가 설렘 포인트가 됩니다.",
      "💘 무심한 척보다 반응이 중요합니다.",
      "💘 예상 못한 대화가 시작될 수 있습니다.",
      "💘 짧은 대화가 길게 이어질 수 있습니다.",
      "💘 오늘은 괜히 설레는 일이 생길 수 있습니다."

    ];


    /*
    재물운
    */

    const moneyList = [

      "💰 충동구매만 막으면 지갑이 평화롭습니다.",
      "💰 오늘은 가성비 선택이 정답입니다.",
      "💰 작은 이득이 여러 번 생길 수 있습니다.",
      "💰 얻어먹을 운이 살짝 있습니다.",
      "💰 괜히 비싼 선택만 피하면 성공입니다.",
      "💰 커피값 정도의 소확행 운이 있습니다.",
      "💰 오늘은 새는 돈만 막아도 이득입니다.",
      "💰 뜻밖의 공짜 운이 숨어 있습니다.",
      "💰 오늘은 지출 관리가 중요합니다.",
      "💰 작은 선물운이 있습니다."

    ];


    /*
    추천 행동
    */

    const actionList = [

      "🎯 오늘은 한 번 더 시도해보기.",
      "🎯 고민보다 실행 1회 추가.",
      "🎯 괜히 빼지 말고 존재감 드러내기.",
      "🎯 장난 한 스푼 던져보기.",
      "🎯 오늘 할 일 하나 확실히 끝내기.",
      "🎯 타이밍 왔을 때 바로 움직이기.",
      "🎯 텐션 좋은 사람 옆에 붙어 있기.",
      "🎯 오늘은 먼저 인사해보기.",
      "🎯 미뤄둔 일을 하나 끝내기.",
      "🎯 분위기 좋을 때 바로 행동하기."

    ];


    /*
    주의
    */

    const cautionList = [

      "⚠️ 괜히 오버하면 역효과 날 수 있습니다.",
      "⚠️ 말 길어지면 분위기 깨질 수 있습니다.",
      "⚠️ 충동적인 확신은 금물입니다.",
      "⚠️ 사소한 약속 까먹지 마세요.",
      "⚠️ 오늘은 괜히 예민해질 수 있습니다.",
      "⚠️ 선 넘는 농담 조심하세요.",
      "⚠️ 막판 방심이 변수입니다.",
      "⚠️ 피곤할 때 말실수 조심.",
      "⚠️ 급한 판단은 피하는 게 좋습니다.",
      "⚠️ 오늘은 체력 관리도 중요합니다."

    ];


    /*
    총평
    */

    const closingList = [

      "📢 총평: 오늘은 흐름만 타면 꽤 재밌는 하루입니다.",
      "📢 총평: 은근히 되는 날이라 쫄 필요 없습니다.",
      "📢 총평: 오늘은 타이밍 잡는 사람이 이깁니다.",
      "📢 총평: 오늘은 채팅력 = 운빨입니다 😏",
      "📢 총평: 괜히 움츠리면 운도 같이 줄어듭니다.",
      "📢 총평: 가볍게 던진 말이 잘 먹힐 수 있습니다.",
      "📢 총평: 오늘은 존재감이 곧 행운입니다.",
      "📢 총평: 천천히 가도 결과는 좋습니다.",
      "📢 총평: 오늘은 작은 기회를 잡는 사람이 이깁니다.",
      "📢 총평: 기대 안 한 곳에서 반전이 나옵니다."

    ];


    /*
    운세 등급
    */

    const gradeList = [

      "🏆 운세 등급: SS",
      "⭐ 운세 등급: S",
      "✨ 운세 등급: A",
      "🙂 운세 등급: B",
      "😅 운세 등급: C"

    ];


    /*
    행운 색
    */

    const colorList = [

      "🎨 행운 색: 빨강 🔴",
      "🎨 행운 색: 파랑 🔵",
      "🎨 행운 색: 초록 🟢",
      "🎨 행운 색: 보라 🟣",
      "🎨 행운 색: 검정 ⚫",
      "🎨 행운 색: 노랑 🟡"

    ];


    /*
    행운 숫자
    */

    const numberList = [

      "🔢 행운 숫자: 3",
      "🔢 행운 숫자: 7",
      "🔢 행운 숫자: 11",
      "🔢 행운 숫자: 17",
      "🔢 행운 숫자: 21",
      "🔢 행운 숫자: 28"

    ];


    /*
    행운 시간
    */

    const timeList = [

      "⏰ 행운 시간: 오전 10시",
      "⏰ 행운 시간: 오후 2시",
      "⏰ 행운 시간: 오후 6시",
      "⏰ 행운 시간: 밤 9시",
      "⏰ 행운 시간: 밤 11시"

    ];


    /*
    결과
    */
    const parts = [

    `🔮 ${nickname}님의 오늘 운세`,
    "",

    pickByHash(hash,0,gradeList),
    pickByHash(hash,1,overallList),
    pickByHash(hash,2,scoreList),

    "",

    pickByHash(hash,3,loveList),
    pickByHash(hash,4,moneyList),

    "",

    pickByHash(hash,5,actionList),
    pickByHash(hash,6,cautionList),

    "",

    pickByHash(hash,7,closingList),

    pickByHash(hash,8,colorList),
    pickByHash(hash,9,numberList),
    pickByHash(hash,10,timeList)

    ];


    return parts.join("\n");


  } catch {

    return "🔮 오늘은 무난한 흐름입니다.\n괜한 오버만 피하면 평타 이상입니다 😄";

  }

}


module.exports = {
  getFortune
};