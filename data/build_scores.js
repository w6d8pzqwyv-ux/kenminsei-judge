// data/raw/*.csv を読み込み、5軸のスコア(偏差値合成)+根拠(元データ)+一言解説を計算して scores.json を出力する
const fs = require('fs');
const path = require('path');
const RAW = path.join(__dirname, 'raw');

function readCsv(file) {
  const text = fs.readFileSync(path.join(RAW, file), 'utf8').trim();
  const lines = text.split('\n').slice(1);
  const map = {};
  lines.forEach((line) => {
    const cols = line.split(',');
    const code = cols[0].padStart(2, '0');
    const value = parseFloat(cols[2]);
    map[code] = value;
  });
  return map;
}

// 都道府県一覧(コード→名前)
const prefNames = {};
readCsvNames('00_population.csv');
function readCsvNames(file) {
  const text = fs.readFileSync(path.join(RAW, file), 'utf8').trim();
  text.split('\n').slice(1).forEach((line) => {
    const cols = line.split(',');
    prefNames[cols[0].padStart(2, '0')] = cols[1];
  });
}

// 偏差値化(平均50・SD10)
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

// 47県内の順位(1位=最大値)
function toRank(map) {
  const codes = Object.keys(map);
  const sorted = [...codes].sort((a, b) => map[b] - map[a]);
  const result = {};
  sorted.forEach((code, i) => { result[code] = i + 1; });
  return result;
}

// 図書館貸出冊数は人口比に変換(人口CSVの単位は「万人」なので×10000して実人数に戻す)
const population = readCsv('00_population.csv');
const libraryRaw = readCsv('14_library.csv');
const libraryPerCapita = {};
Object.entries(libraryRaw).forEach(([code, v]) => {
  libraryPerCapita[code] = Math.round((v / (population[code] * 10000)) * 10) / 10; // 冊/人
});

// 指標の表示メタ情報(ラベル・単位・出典短縮名)
const META = {
  '01_sports.csv': { label: 'スポーツ行動者率', unit: '%', source: '社会生活基本調査(2021)' },
  '02_travel.csv': { label: '旅行・行楽行動者率', unit: '%', source: '社会生活基本調査(2021)' },
  '04_kousai.csv': { label: '交際費(県庁所在市・年間)', unit: '円', source: '家計調査(2024)' },
  '05_gaishoku.csv': { label: '外食費(県庁所在市・年間)', unit: '円', source: '家計調査(2024)' },
  '06_owarai.csv': { label: 'お笑い芸人輩出数(人口10万人あたり)', unit: '人', source: 'とどラン(民間集計)' },
  '07_savings.csv': { label: '平均貯蓄率', unit: '%', source: '全国家計構造調査(2024)' },
  '08_home.csv': { label: '持ち家比率', unit: '%', source: '住宅・土地統計調査(2023)' },
  '10_volunteer.csv': { label: 'ボランティア行動者率', unit: '%', source: '社会生活基本調査(2021)' },
  '11_kenketsu.csv': { label: '献血率', unit: '%', source: '厚労省 献血率統計(2009)' },
  '12_sansedai.csv': { label: '三世代同居率', unit: '%', source: '国勢調査(2020)' },
  '13_culture.csv': { label: '教養娯楽費の割合', unit: '%', source: '家計調査(2024)' },
  '13b_books.csv': { label: '書籍・雑誌購入額(人口1人あたり)', unit: '円', source: '社会・人口統計体系(2006)' },
  '15_university.csv': { label: '大学等進学率', unit: '%', source: '学校基本調査(2023)' },
  LIBRARY_PERCAPITA: { label: '図書館貸出冊数(人口1人あたり)', unit: '冊', source: '社会教育調査(2014年度)' },
  '09_gakuryoku.csv': { label: '全国学力調査 平均正答率(小中4区分平均)', unit: '%', source: '全国学力・学習状況調査(文科省・2024年度)' },
  '17_tennyu.csv': { label: '転入率(日本人移動者)', unit: '%', source: '社会・人口統計体系(2024)' },
  '18_passport.csv': { label: '一般旅券発行件数(人口千人当たり)', unit: '件', source: '社会・人口統計体系(2024)' },
  '19_minsei.csv': { label: '民生委員(児童委員)数(人口10万人あたり)', unit: '人', source: '社会・人口統計体系(2023)' },
  '20_kaigai.csv': { label: '海外旅行の年間行動者率(10歳以上)', unit: '%', source: '社会生活基本調査(2021)' },
};

// 5軸 × 材料指標(ファイル名)
const AXES = {
  行動力: ['01_sports.csv', '02_travel.csv', '17_tennyu.csv', '18_passport.csv'],
  社交性: ['04_kousai.csv', '05_gaishoku.csv', '06_owarai.csv'],
  きちょうめん度: ['07_savings.csv', '08_home.csv', '09_gakuryoku.csv'],
  人情深さ: ['10_volunteer.csv', '11_kenketsu.csv', '12_sansedai.csv', '19_minsei.csv'],
  // 海外旅行行動者率(20_kaigai)は2021年=コロナ禍で値がノイズ(全県0.1-0.7%)のため不採用(2026-07-10 統括判断)
  好奇心: ['13_culture.csv', '13b_books.csv', '15_university.csv', 'LIBRARY_PERCAPITA'],
};

const rawByFile = {};
const deviationByFile = {};
const rankByFile = {};
Object.values(AXES).flat().forEach((file) => {
  if (rawByFile[file]) return;
  const map = file === 'LIBRARY_PERCAPITA' ? libraryPerCapita : readCsv(file);
  rawByFile[file] = map;
  deviationByFile[file] = toDeviation(map);
  rankByFile[file] = toRank(map);
});

// 47県の最低〜最高を 1〜10 に割り当てる(min-max方式)
function toScale10(avgMap) {
  const vals = Object.values(avgMap);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const result = {};
  Object.entries(avgMap).forEach(([code, v]) => {
    result[code] = max === min ? 6 : Math.round(1 + ((v - min) / (max - min)) * 9);
  });
  return result;
}

const prefCodes = Object.keys(prefNames).sort();

// 軸ごとに47県ぶんの平均偏差値を計算
const axisAverages = {};
Object.entries(AXES).forEach(([axisName, files]) => {
  axisAverages[axisName] = {};
  prefCodes.forEach((code) => {
    const devs = files.map((f) => deviationByFile[f][code]);
    axisAverages[axisName][code] = devs.reduce((a, b) => a + b, 0) / devs.length;
  });
});

// 軸ごとに1〜10へ変換 + 全国順位
const axisScale10 = {};
const axisRank = {};
Object.keys(AXES).forEach((axisName) => {
  axisScale10[axisName] = toScale10(axisAverages[axisName]);
  axisRank[axisName] = toRank(axisAverages[axisName]);
});

// 軸×順位帯(5分位)ごとの一言解説(中立〜ポジティブのみ・断定を避ける)
const COMMENTS = {
  行動力: [
    '外に出て体を動かしたり出かけたりする人が多く、全国でもとりわけ活動的な傾向がうかがえます。',
    '行動的な人が比較的多い、フットワークの軽い傾向がうかがえます。',
    '出かける日とゆっくり過ごす日をバランスよく楽しむ、標準的な傾向です。',
    'じっくり腰を据えて過ごす時間を大切にする、落ち着いた傾向がうかがえます。',
    '自分のペースでゆったり過ごすことを大切にする、マイペースな傾向がうかがえます。',
  ],
  社交性: [
    '人との交流を積極的に楽しむ、社交的な傾向が全国でも際立っています。',
    '人付き合いを大切にする、にぎやかな傾向がうかがえます。',
    '交流も一人の時間も、程よく楽しむ標準的な傾向です。',
    '少人数でのじっくりした付き合いを大切にする、落ち着いた傾向がうかがえます。',
    '一人の時間や気心の知れた仲間との時間を大切にする、さっぱりした傾向がうかがえます。',
  ],
  きちょうめん度: [
    '計画的にコツコツ備える、堅実さが全国でもとりわけ際立つ傾向がうかがえます。',
    '計画的で堅実な傾向が比較的強く見られます。',
    '堅実さとおおらかさをバランスよく持つ、標準的な傾向です。',
    '肩の力を抜いて、おおらかに構える傾向がうかがえます。',
    'あまり細かいことにこだわらない、おおらかな傾向が全国でも際立っています。',
  ],
  人情深さ: [
    '困った人を放っておけない、情に厚い傾向が全国でもとりわけ強く見られます。',
    '人とのつながりや助け合いを大切にする傾向が比較的強く見られます。',
    '人との距離感を程よく保つ、標準的な傾向です。',
    'それぞれのペースや距離感を大切にする、さっぱりした傾向がうかがえます。',
    '個人の自由や独立した時間を大切にする傾向が全国でも際立っています。',
  ],
  好奇心: [
    '新しい知識や体験に貪欲な、好奇心旺盛な傾向が全国でもとりわけ強く見られます。',
    '学びや新しいものへの関心が比較的高い傾向がうかがえます。',
    '新しいものと慣れ親しんだものを、バランスよく楽しむ標準的な傾向です。',
    '使い慣れたものやなじみのやり方を大事にする、堅実な傾向がうかがえます。',
    'いつもの安心できるスタイルを大切にする傾向が全国でも際立っています。',
  ],
};

function commentFor(axisName, rank, total) {
  // 5分位(quintile)に分けてコメントを選ぶ(1位に近いほど0番目)
  const idx = Math.min(4, Math.floor(((rank - 1) / total) * 5));
  return COMMENTS[axisName][idx];
}

// 都道府県 称号(称号決定版.md 準拠・文言変更禁止)
const TITLES = {
  '01': 'でっかい心の冒険家',
  '02': '冬に備える計画家',
  '03': 'みんなを包むお助け名人',
  '04': '杜の都のフットワーカー',
  '05': '世話焼きあったかさん',
  '06': 'ぬくもり配りの達人',
  '07': '頼れるご近所ヒーロー',
  '08': '未来に貯めるしっかり屋',
  '09': 'コツコツ積み立て職人',
  '10': '元気いっぱい風の子',
  '11': 'みんなのムードメーカー',
  '12': '人の輪づくり上手',
  '13': '好奇心モンスター',
  '14': 'フットワークの化身',
  '15': '雪国育ちのしっかり者',
  '16': '石橋たたいて渡る名人',
  '17': '段取り上手な計画屋',
  '18': 'コツコツ貯蓄の達人',
  '19': '富士のふもとの人情家',
  '20': '山国のコツコツ職人',
  '21': '無駄なしやりくり名人',
  '22': 'ほどよき暮らしの匠',
  '23': '動いて学ぶ欲張りさん',
  '24': '家計簿きっちり名人',
  '25': '動く好奇心のかたまり',
  '26': '知りたがりの読書家',
  '27': '笑いと好奇心の発電所',
  '28': 'アンテナ高めの流行通',
  '29': 'きっちり者の付き合い上手',
  '30': '実りを蓄える堅実さん',
  '31': '砂丘より広い思いやり',
  '32': '縁むすびのお助け人',
  '33': '晴れの国の社交家',
  '34': '流行キャッチの名人',
  '35': '静かに備える計画派',
  '36': '蓄え上手な備えの人',
  '37': 'じっくり構える安定派',
  '38': 'みかん色のほんわかさん',
  '39': '宴会だいすき盛り上げ役',
  '40': '九州のフットワーク番長',
  '41': '思いやり満タンさん',
  '42': '港町のおもてなし上手',
  '43': '火の国の熱血社交家',
  '44': '温泉級のバランス名人',
  '45': '太陽みたいな気さくさん',
  '46': '桜島級のあったか心',
  '47': 'なんくるないさの社交家',
};

const scores = {};
prefCodes.forEach((code) => {
  scores[code] = { name: prefNames[code], title: TITLES[code], axes: {} };
  Object.entries(AXES).forEach(([axisName, files]) => {
    const detail = files.map((f) => ({
      label: META[f].label,
      value: rawByFile[f][code],
      unit: META[f].unit,
      rank: rankByFile[f][code],
      source: META[f].source,
    }));
    scores[code].axes[axisName] = {
      score: axisScale10[axisName][code],
      rank: axisRank[axisName][code],
      comment: commentFor(axisName, axisRank[axisName][code], prefCodes.length),
      detail,
    };
  });
});

fs.writeFileSync(path.join(__dirname, 'scores.json'), JSON.stringify(scores, null, 2), 'utf8');
console.log('OK: scores.json 生成完了(' + prefCodes.length + '県)');

// サンプル表示
console.log(JSON.stringify(scores['13'].axes['行動力'], null, 1));
