// 「地域統計ランキング」コーナー用データを生成する。
// 県民性診断(build_scores.js)とは完全に別系統。ここでは性格解釈や一言コメントを一切付けず、
// 政府統計等の事実を出典つきでランキング表示するだけにする(2階建て構成の②)。
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
    map[code] = parseFloat(cols[2]);
  });
  return map;
}

const prefNames = {};
fs.readFileSync(path.join(RAW, '00_population.csv'), 'utf8').trim().split('\n').slice(1).forEach((line) => {
  const cols = line.split(',');
  prefNames[cols[0].padStart(2, '0')] = cols[1];
});

const population = readCsv('00_population.csv');
const libraryRaw = readCsv('14_library.csv');
const libraryPerCapita = {};
Object.entries(libraryRaw).forEach(([code, v]) => {
  libraryPerCapita[code] = Math.round((v / (population[code] * 10000)) * 10) / 10;
});

// カテゴリ一覧(既存データの再利用のみ。新規取得は無し)
const CATEGORIES = [
  { key: 'university', label: '大学等進学率', unit: '%', source: '学校基本調査(2023)', file: '15_university.csv' },
  { key: 'home', label: '持ち家比率', unit: '%', source: '住宅・土地統計調査(2023)', file: '08_home.csv' },
  { key: 'savings', label: '平均貯蓄率', unit: '%', source: '全国家計構造調査(2024)', file: '07_savings.csv' },
  { key: 'sansedai', label: '三世代同居率', unit: '%', source: '国勢調査(2020)', file: '12_sansedai.csv' },
  { key: 'owarai', label: 'お笑い芸人輩出数(人口10万人あたり)', unit: '人', source: 'とどラン(民間集計・2023)', file: '06_owarai.csv' },
  { key: 'sports', label: 'スポーツ行動者率', unit: '%', source: '社会生活基本調査(2021)', file: '01_sports.csv' },
  { key: 'travel', label: '旅行・行楽行動者率', unit: '%', source: '社会生活基本調査(2021)', file: '02_travel.csv' },
  { key: 'gaishoku', label: '外食費(県庁所在市・年間)', unit: '円', source: '家計調査(2024)', file: '05_gaishoku.csv' },
  { key: 'kousai', label: '交際費(県庁所在市・年間)', unit: '円', source: '家計調査(2024)', file: '04_kousai.csv' },
  { key: 'kenketsu', label: '献血率', unit: '%', source: '厚労省 献血率統計(2009)', file: '11_kenketsu.csv' },
  { key: 'volunteer', label: 'ボランティア行動者率', unit: '%', source: '社会生活基本調査(2021)', file: '10_volunteer.csv' },
  { key: 'culture', label: '教養娯楽費の割合', unit: '%', source: '家計調査(2024)', file: '13_culture.csv' },
  { key: 'books', label: '書籍・雑誌購入額(人口1人あたり)', unit: '円', source: '社会・人口統計体系(2006)', file: '13b_books.csv' },
  { key: 'library', label: '図書館貸出冊数(人口1人あたり)', unit: '冊', source: '社会教育調査(2014年度)', file: null },
  { key: 'dualincome', label: '共働き世帯割合(一般世帯全体に占める割合)', unit: '%', source: '社会・人口統計体系(2020)', file: '16_dualincome.csv' },
  { key: 'tennyu', label: '転入率(日本人移動者)', unit: '%', source: '社会・人口統計体系(2024)', file: '17_tennyu.csv' },
  { key: 'passport', label: '一般旅券発行件数(人口千人当たり)', unit: '件', source: '社会・人口統計体系(2024)', file: '18_passport.csv' },
  { key: 'minsei', label: '民生委員(児童委員)数(人口10万人あたり)', unit: '人', source: '社会・人口統計体系(2023)', file: '19_minsei.csv' },
  // 海外旅行行動者率(2021)はコロナ禍でノイズのため不掲載(2026-07-10 統括判断)
  { key: 'gakuryoku', label: '全国学力調査 平均正答率(小中4区分平均)', unit: '%', source: '全国学力・学習状況調査(文科省・2024年度)', file: '09_gakuryoku.csv' },
];

const categories = CATEGORIES.map((cat) => {
  const map = cat.file ? readCsv(cat.file) : libraryPerCapita;
  const codes = Object.keys(map).sort((a, b) => map[b] - map[a]);
  const ranking = codes.map((code, i) => ({
    rank: i + 1,
    code,
    name: prefNames[code],
    value: map[code],
  }));
  return { key: cat.key, label: cat.label, unit: cat.unit, source: cat.source, ranking };
});

fs.writeFileSync(path.join(__dirname, 'stats.json'), JSON.stringify({ categories }, null, 2), 'utf8');
console.log('OK: stats.json 生成完了(' + categories.length + 'カテゴリ)');
