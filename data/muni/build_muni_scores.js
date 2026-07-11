// data/muni/raw/*.csv を読み込み、5軸のスコア(偏差値合成)を計算して muni_scores.json を出力する。
// 方式(2026-07-11 統括レビュー反映):
//   指標→上下1%ウィンザライズ(clip)→全国偏差値化→軸平均→
//   1-10点は「順位ベース(パーセンタイル)」で均等割当(上位10%=10点…下位10%=1点)+全国順位。称号は付けない。
//   ※県版のmin-max方式は1,725件規模だと外れ値(例: 大熊町の転入率=原発避難からの帰還による異常値)に
//     引きずられて分布が壊れるため、市区町村版では順位ベースに変更した。
// 欠損ルール: ある市区町村で指標の元データ(分子/分母)が欠けている場合、その指標は「無し」として軸平均の計算から除外する
//            (他の指標だけで平均を取る)。
// 【出力から除外する自治体】基礎統計が存在せず全軸nullになるため muni_scores.json から除外(2026-07-11 統括指示):
//   01695 色丹村 / 01696 泊村(色丹郡) / 01697 留夜別村 / 01698 留別村 / 01699 紗那村 / 01700 蘂取村
//     → 北方領土(行政管轄外)のため国勢調査等の統計自体が存在しない
//   07546 福島県 双葉町 → 原発事故の帰還困難区域で基礎統計の大半が取得不能
const EXCLUDED_CODES = new Set(['01695', '01696', '01697', '01698', '01699', '01700', '07546']);
const fs = require('fs');
const path = require('path');
const RAW = path.join(__dirname, 'raw');

function readCsv(file) {
  const text = fs.readFileSync(path.join(RAW, file), 'utf8').trim();
  const lines = text.split('\n').slice(1);
  const map = {};
  lines.forEach((line) => {
    const cols = line.split(',');
    const code = cols[0];
    const value = parseFloat(cols[cols.length - 3]);
    if (!Number.isNaN(value)) map[code] = value;
  });
  return map;
}

const muniNames = JSON.parse(fs.readFileSync(path.join(RAW, '_muni_names.json'), 'utf8'));
EXCLUDED_CODES.forEach((code) => { delete muniNames[code]; });
// 表示名の調整: 「東京都 特別区部」は分かりにくいので「東京都 東京23区(特別区部)」にする
if (muniNames['13100']) muniNames['13100'] = '東京都 東京23区(特別区部)';
const muniCodes = Object.keys(muniNames).sort();

// 生データ読み込み
const A1101 = readCsv('01_A1101_population.csv'); // 総人口(2020)
const A5101 = readCsv('02_A5101_tennyu.csv'); // 転入者数(2024)
const A6103 = readCsv('03_A6103_ryushutsu_kennai.csv'); // 流出人口・県内(2020)
const A6104 = readCsv('04_A6104_ryushutsu_kengai.csv'); // 流出人口・他県(2020)
const A6108 = readCsv('05_A6108_chuya_ratio.csv'); // 昼夜間人口比率(2020,%)
const A710101 = readCsv('06_A710101_ippan_setai.csv'); // 一般世帯数(2020)
const A810105 = readCsv('07_A810105_tandoku_setai.csv'); // 単独世帯数(2020)
const A810103 = readCsv('08_A810103_kakukazoku_igai.csv'); // 核家族以外の世帯数(2020)
const A9101 = readCsv('09_A9101_kon-in.csv'); // 婚姻件数(2023)
const H1100 = readCsv('10_H1100_juutaku_su.csv'); // 総住宅数(2023)
const H1310 = readCsv('11_H1310_mochiie.csv'); // 持ち家数(2023)
const H5508 = readCsv('12_H5508_suisenka_ritsu.csv'); // 水洗化率(2023,%)
// 13_H1800(着工新設住宅戸数)は取得できた市区町村が793/1725(約46%)と欠損が多いため不採用(2026-07-11)
const F1101 = readCsv('14_F1101_roudouryoku.csv'); // 労働力人口(2020)
const F1107 = readCsv('15_F1107_shitsugyousha.csv'); // 完全失業者数(2020)
const C2207 = readCsv('16_C2207_juugyousha.csv'); // 従業者数(2014)
const C2210 = readCsv('17_C2210_1ji.csv'); // 第1次産業従業者数(2014)
const C2212 = readCsv('18_C2212_3ji.csv'); // 第3次産業従業者数(2014)
const G1201 = readCsv('19_G1201_kouminkan.csv'); // 公民館数(2021)
const G1401 = readCsv('20_G1401_toshokan.csv'); // 図書館数(2021)
const E9106 = readCsv('21_E9106_daigaku_sotsu.csv'); // 最終学歴人口・大学大学院(2020)
const E9101 = readCsv('22_E9101_sotsugyosha.csv'); // 最終学歴人口・卒業者総数(2020)
const C210721 = readCsv('23_C210721_gakushu_jigyosho.csv'); // 事業所数・教育学習支援業(2014)
const C2107 = readCsv('24_C2107_jigyosho_kei.csv'); // 事業所数・総数(2014)

// 派生指標(比率)を計算するヘルパー。分子・分母どちらか欠けている市区町村は結果に含めない(=その指標は「無し」)。
function ratio(numMap, denomMap, mul, codes) {
  const result = {};
  codes.forEach((code) => {
    const n = numMap[code];
    const d = denomMap[code];
    if (n === undefined || d === undefined || d === 0) return;
    result[code] = (n / d) * mul;
  });
  return result;
}
function sum2(mapA, mapB, codes) {
  const result = {};
  codes.forEach((code) => {
    const a = mapA[code];
    const b = mapB[code];
    if (a === undefined || b === undefined) return;
    result[code] = a + b;
  });
  return result;
}
function inverseRatio(numMap, denomMap, mul, codes) {
  // (1 - num/denom) の割合(%)
  const result = {};
  codes.forEach((code) => {
    const n = numMap[code];
    const d = denomMap[code];
    if (n === undefined || d === undefined || d === 0) return;
    result[code] = (1 - n / d) * mul;
  });
  return result;
}

const ryushutsuKei = sum2(A6103, A6104, muniCodes);

// 指標メタ情報(表示ラベル・単位・出典)
const META = {
  tennyu_ritsu: { label: '転入率(人口比・日本人移動者)', unit: '%', source: '社会・人口統計体系(2024)/国勢調査(2020)' },
  tsukin_ryushutsu_ritsu: { label: '通勤・通学流出率(人口比)', unit: '%', source: '国勢調査(2020)' },
  chuya_hiritsu: { label: '昼夜間人口比率', unit: '%', source: '国勢調査(2020)' },
  sanji_hiritsu: { label: '第3次産業従業者比率', unit: '%', source: '経済センサス‐基礎調査(2014)' },
  tanindou_setai_ritsu: { label: '複数人世帯率', unit: '%', source: '国勢調査(2020)' },
  mochiie_ritsu: { label: '持ち家率', unit: '%', source: '住宅・土地統計調査(2023)' },
  suisenka_ritsu: { label: '水洗化率', unit: '%', source: '社会・人口統計体系(2023)' },
  shugyou_antei_ritsu: { label: '就業安定率(1-完全失業率)', unit: '%', source: '国勢調査(2020)' },
  hikakukazoku_ritsu: { label: '非核家族世帯率', unit: '%', source: '国勢調査(2020)' },
  kon_in_ritsu: { label: '婚姻率(人口千人あたり)', unit: '‰', source: '社会・人口統計体系(2023)/国勢調査(2020)' },
  ichiji_hiritsu: { label: '第1次産業従業者比率', unit: '%', source: '経済センサス‐基礎調査(2014)' },
  toshokan_mitsudo: { label: '図書館密度(人口10万人あたり)', unit: '館', source: '社会教育調査(2021)' },
  kouminkan_mitsudo: { label: '公民館密度(人口10万人あたり)', unit: '館', source: '社会教育調査(2021)' },
  daisotsu_ritsu: { label: '大学・大学院卒業者比率(卒業者総数比)', unit: '%', source: '国勢調査(2020)' },
  gakushu_jigyosho_ritsu: { label: '教育・学習支援業事業所比率(全事業所比)', unit: '%', source: '経済センサス‐基礎調査(2014)' },
};

const DERIVED = {
  tennyu_ritsu: ratio(A5101, A1101, 100, muniCodes),
  tsukin_ryushutsu_ritsu: ratio(ryushutsuKei, A1101, 100, muniCodes),
  chuya_hiritsu: { ...A6108 },
  sanji_hiritsu: ratio(C2212, C2207, 100, muniCodes),
  tanindou_setai_ritsu: inverseRatio(A810105, A710101, 100, muniCodes),
  mochiie_ritsu: ratio(H1310, H1100, 100, muniCodes),
  suisenka_ritsu: { ...H5508 },
  shugyou_antei_ritsu: inverseRatio(F1107, F1101, 100, muniCodes),
  hikakukazoku_ritsu: ratio(A810103, A710101, 100, muniCodes),
  kon_in_ritsu: ratio(A9101, A1101, 1000, muniCodes),
  ichiji_hiritsu: ratio(C2210, C2207, 100, muniCodes),
  toshokan_mitsudo: ratio(G1401, A1101, 100000, muniCodes),
  kouminkan_mitsudo: ratio(G1201, A1101, 100000, muniCodes),
  daisotsu_ritsu: ratio(E9106, E9101, 100, muniCodes),
  gakushu_jigyosho_ritsu: ratio(C210721, C2107, 100, muniCodes),
};

// 5軸 × 材料指標(2026-07-11 実データ確認済み。H-3案の生指標を人口/世帯数で正規化した派生指標を採用)
const AXES = {
  行動力: ['tennyu_ritsu', 'tsukin_ryushutsu_ritsu'],
  社交性: ['chuya_hiritsu', 'sanji_hiritsu', 'tanindou_setai_ritsu'],
  きちょうめん度: ['mochiie_ritsu', 'suisenka_ritsu', 'shugyou_antei_ritsu'],
  人情深さ: ['hikakukazoku_ritsu', 'kon_in_ritsu', 'ichiji_hiritsu'],
  // 好奇心(2026-07-12 再構成): 図書館・公民館の人口あたり密度だけだと構造的に小規模町村が有利で
  // 大都市が最低点になる歪みがあった。人口規模と無相関の「比率系」2指標(大卒比率・学習支援業比率)を主軸にし、
  // 施設系は図書館密度のみ残す(公民館密度は小自治体バイアスが最も強いため不採用)。
  好奇心: ['daisotsu_ritsu', 'gakushu_jigyosho_ritsu', 'toshokan_mitsudo'],
};

// ウィンザライズ: 上下1%の極端値を1%タイル・99%タイルの値に丸める(外れ値対策)
function winsorize(map) {
  const values = Object.values(map).sort((a, b) => a - b);
  const n = values.length;
  const lo = values[Math.floor(n * 0.01)];
  const hi = values[Math.min(n - 1, Math.floor(n * 0.99))];
  const result = {};
  Object.entries(map).forEach(([code, v]) => {
    result[code] = Math.min(hi, Math.max(lo, v));
  });
  return result;
}

// 偏差値化(平均50・SD10)。全国(取得できた市区町村)を母集団にする。
function toDeviation(map) {
  const values = Object.values(map);
  const n = values.length;
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
  const sd = Math.sqrt(variance);
  const result = {};
  Object.entries(map).forEach(([code, v]) => {
    result[code] = sd === 0 ? 50 : 50 + ((v - mean) / sd) * 10;
  });
  return result;
}

function toRank(map) {
  const codes = Object.keys(map);
  const sorted = [...codes].sort((a, b) => map[b] - map[a]);
  const result = {};
  sorted.forEach((code, i) => { result[code] = i + 1; });
  return result;
}

// 1〜10点: 順位ベース(パーセンタイル)で均等割当。上位10%=10点、次の10%=9点…下位10%=1点。
// min-max方式は外れ値1件でスケール全体が歪むため不採用(2026-07-11 統括レビュー)。
function toScale10(avgMap, rankMap) {
  const total = Object.keys(avgMap).length;
  const result = {};
  Object.keys(avgMap).forEach((code) => {
    const rank = rankMap[code];
    result[code] = 10 - Math.floor(((rank - 1) / total) * 10);
  });
  return result;
}

const deviationByKey = {};
Object.keys(DERIVED).forEach((key) => { deviationByKey[key] = toDeviation(winsorize(DERIVED[key])); });

// 軸ごとに市区町村の平均偏差値を計算(欠損指標は平均計算から除外)
const axisAverages = {};
const axisIndicatorCount = {}; // 市区町村ごとに、その軸で実際に使えた指標数
Object.entries(AXES).forEach(([axisName, keys]) => {
  axisAverages[axisName] = {};
  axisIndicatorCount[axisName] = {};
  muniCodes.forEach((code) => {
    const devs = keys.map((k) => deviationByKey[k][code]).filter((v) => v !== undefined);
    axisIndicatorCount[axisName][code] = devs.length;
    if (devs.length > 0) {
      axisAverages[axisName][code] = devs.reduce((a, b) => a + b, 0) / devs.length;
    }
  });
});

const axisScale10 = {};
const axisRank = {};
Object.keys(AXES).forEach((axisName) => {
  axisRank[axisName] = toRank(axisAverages[axisName]);
  axisScale10[axisName] = toScale10(axisAverages[axisName], axisRank[axisName]);
});

// 軸×順位帯(5分位)ごとの一言解説(県版と同じ文言・中立〜ポジティブのみ・断定を避ける)
const COMMENTS = {
  行動力: [
    '外に出て活動したり移動したりする人が多く、全国でもとりわけ活動的な傾向がうかがえます。',
    '行動的な人が比較的多い、フットワークの軽い傾向がうかがえます。',
    '出かける機会とゆっくり過ごす時間をバランスよく楽しむ、標準的な傾向です。',
    'じっくり腰を据えて過ごす時間を大切にする、落ち着いた傾向がうかがえます。',
    '自分のペースでゆったり過ごすことを大切にする、マイペースな傾向がうかがえます。',
  ],
  社交性: [
    '人の行き来や交流が盛んな、にぎやかな傾向が全国でも際立っています。',
    '人付き合いを大切にする、にぎやかな傾向がうかがえます。',
    '交流も一人の時間も、程よく楽しむ標準的な傾向です。',
    '少人数でのじっくりした付き合いを大切にする、落ち着いた傾向がうかがえます。',
    '一人の時間や気心の知れた仲間との時間を大切にする、さっぱりした傾向がうかがえます。',
  ],
  きちょうめん度: [
    '暮らしの基盤をしっかり整える、堅実さが全国でもとりわけ際立つ傾向がうかがえます。',
    '計画的で堅実な傾向が比較的強く見られます。',
    '堅実さとおおらかさをバランスよく持つ、標準的な傾向です。',
    '肩の力を抜いて、おおらかに構える傾向がうかがえます。',
    'あまり細かいことにこだわらない、おおらかな傾向が全国でも際立っています。',
  ],
  人情深さ: [
    '家族や地域とのつながりを大切にする傾向が全国でもとりわけ強く見られます。',
    '人とのつながりや助け合いを大切にする傾向が比較的強く見られます。',
    '人との距離感を程よく保つ、標準的な傾向です。',
    'それぞれのペースや距離感を大切にする、さっぱりした傾向がうかがえます。',
    '個人の自由や独立した時間を大切にする傾向が全国でも際立っています。',
  ],
  好奇心: [
    '学びや文化に触れる場が身近に多い、知的好奇心を育てやすい傾向が全国でもとりわけ強く見られます。',
    '学びや新しいものへの関心を育てやすい環境が比較的整っている傾向がうかがえます。',
    '身近な学びの場と暮らしやすさを、バランスよく持つ標準的な傾向です。',
    '使い慣れたものやなじみのやり方を大事にする、堅実な傾向がうかがえます。',
    'いつもの安心できるスタイルを大切にする傾向が全国でも際立っています。',
  ],
};

function commentFor(axisName, rank, total) {
  const idx = Math.min(4, Math.floor(((rank - 1) / total) * 5));
  return COMMENTS[axisName][idx];
}

// 出力組み立て
const scores = {};
let zeroIndicatorMuniCount = 0;
muniCodes.forEach((code) => {
  const prefCode = code.slice(0, 2);
  scores[code] = {
    name: muniNames[code],
    prefCode,
    axes: {},
  };
  Object.entries(AXES).forEach(([axisName, keys]) => {
    const count = axisIndicatorCount[axisName][code];
    if (count === 0) {
      zeroIndicatorMuniCount++;
      scores[code].axes[axisName] = null; // この軸は算出不能(表示側でフォールバック要)
      return;
    }
    const rank = axisRank[axisName][code];
    const total = Object.keys(axisAverages[axisName]).length;
    const detail = keys
      .filter((k) => DERIVED[k][code] !== undefined)
      .map((k) => ({
        label: META[k].label,
        value: Math.round(DERIVED[k][code] * 100) / 100,
        unit: META[k].unit,
        source: META[k].source,
      }));
    scores[code].axes[axisName] = {
      score: axisScale10[axisName][code],
      rank,
      rankTotal: total,
      comment: commentFor(axisName, rank, total),
      detail,
      indicatorCount: count,
      indicatorMax: keys.length,
    };
  });
});

fs.writeFileSync(path.join(__dirname, 'muni_scores.json'), JSON.stringify(scores), 'utf8');

// 検証レポート
const total = muniCodes.length;
let nanFound = 0;
const missingByAxis = {};
Object.keys(AXES).forEach((a) => { missingByAxis[a] = 0; });
muniCodes.forEach((code) => {
  Object.keys(AXES).forEach((axisName) => {
    const ax = scores[code].axes[axisName];
    if (ax === null) { missingByAxis[axisName]++; return; }
    if (Number.isNaN(ax.score)) nanFound++;
  });
});

console.log('=== 検証結果 ===');
console.log('市区町村件数:', total);
console.log('NaNスコア件数:', nanFound);
console.log('軸ごとの「算出不能(指標が1つも取れない)」件数:', JSON.stringify(missingByAxis));
const stat = fs.statSync(path.join(__dirname, 'muni_scores.json'));
console.log('muni_scores.json サイズ:', (stat.size / 1024 / 1024).toFixed(2), 'MB');

// スコア分布(1〜10の件数)と10点の例
['行動力', '社交性', '好奇心'].forEach((axisName) => {
  const dist = {};
  const tens = [];
  muniCodes.forEach((code) => {
    const ax = scores[code].axes[axisName];
    if (!ax) return;
    dist[ax.score] = (dist[ax.score] || 0) + 1;
    if (ax.score === 10) tens.push(scores[code].name);
  });
  console.log(`--- ${axisName} 分布:`, JSON.stringify(dist));
  console.log(`    10点の例:`, tens.slice(0, 5).join(' / '));
});

// 大都市の自己点検
['01100', '13100', '27100', '47201'].forEach((code) => {
  if (!scores[code]) return;
  const s = Object.entries(scores[code].axes).map(([a, ax]) => `${a}:${ax ? ax.score : 'null'}`).join(' ');
  console.log('点検', scores[code].name, s);
});
