// e-Stat API から全市区町村ぶんの5軸材料指標(基データ)を取得し、data/muni/raw/ にCSV保存する。
// 実行: node fetch_muni.js
// 出力形式(県版と同じ): 市区町村コード,市区町村名,値,調査年,出典
const fs = require('fs');
const path = require('path');
const https = require('https');

const APP_ID = fs.readFileSync(path.join(__dirname, '..', 'estat_appid.txt'), 'utf8').trim();
const RAW = path.join(__dirname, 'raw');
if (!fs.existsSync(RAW)) fs.mkdirSync(RAW, { recursive: true });

function apiGet(params) {
  const qs = Object.entries(params).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
  const url = `https://api.e-stat.go.jp/rest/3.0/app/json/getStatsData?${qs}`;
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', (d) => { data += d; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

function apiGetMeta(statsDataId) {
  const url = `https://api.e-stat.go.jp/rest/3.0/app/json/getMetaInfo?appId=${APP_ID}&statsDataId=${statsDataId}`;
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', (d) => { data += d; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 統計表ID(社会・人口統計体系 市区町村データ 基礎データ・オリジナル)
const STATS = {
  A: '0000020101', // 人口・世帯
  C: '0000020103', // 経済基盤
  E: '0000020105', // 教育
  F: '0000020106', // 労働
  G: '0000020107', // 文化・スポーツ
  H: '0000020108', // 居住
};

// 取得する指標: {出力ファイル名: {statsDataId, cat01, time, label, unit, source}}
// 年度はカテゴリごとに最新の実データがある年度を採用(指標により異なるのは県版build_scores.jsと同じ扱い)
const INDICATORS = {
  '01_A1101_population.csv': { stat: 'A', cat: 'A1101', time: '2020100000', label: '総人口', unit: '人', source: '国勢調査(2020)' },
  '02_A5101_tennyu.csv': { stat: 'A', cat: 'A5101', time: '2024100000', label: '転入者数(日本人移動者)', unit: '人', source: '社会・人口統計体系(2024)' },
  '03_A6103_ryushutsu_kennai.csv': { stat: 'A', cat: 'A6103', time: '2020100000', label: '流出人口(県内他市区町村)', unit: '人', source: '国勢調査(2020)' },
  '04_A6104_ryushutsu_kengai.csv': { stat: 'A', cat: 'A6104', time: '2020100000', label: '流出人口(他県)', unit: '人', source: '国勢調査(2020)' },
  '05_A6108_chuya_ratio.csv': { stat: 'A', cat: 'A6108', time: '2020100000', label: '昼夜間人口比率', unit: '%', source: '国勢調査(2020)' },
  '06_A710101_ippan_setai.csv': { stat: 'A', cat: 'A710101', time: '2020100000', label: '一般世帯数', unit: '世帯', source: '国勢調査(2020)' },
  '07_A810105_tandoku_setai.csv': { stat: 'A', cat: 'A810105', time: '2020100000', label: '単独世帯数', unit: '世帯', source: '国勢調査(2020)' },
  '08_A810103_kakukazoku_igai.csv': { stat: 'A', cat: 'A810103', time: '2020100000', label: '核家族以外の世帯数', unit: '世帯', source: '国勢調査(2020)' },
  '09_A9101_kon-in.csv': { stat: 'A', cat: 'A9101', time: '2023100000', label: '婚姻件数', unit: '組', source: '社会・人口統計体系(2023)' },
  '10_H1100_juutaku_su.csv': { stat: 'H', cat: 'H1100', time: '2023100000', label: '総住宅数', unit: '戸', source: '住宅・土地統計調査(2023)' },
  '11_H1310_mochiie.csv': { stat: 'H', cat: 'H1310', time: '2023100000', label: '持ち家数', unit: '戸', source: '住宅・土地統計調査(2023)' },
  '12_H5508_suisenka_ritsu.csv': { stat: 'H', cat: 'H5508', time: '2023100000', label: '水洗化率', unit: '%', source: '社会・人口統計体系(2023)' },
  '13_H1800_chakko_juutaku.csv': { stat: 'H', cat: 'H1800', time: '2024100000', label: '着工新設住宅戸数', unit: '戸・件', source: '社会・人口統計体系(2024)' },
  '14_F1101_roudouryoku.csv': { stat: 'F', cat: 'F1101', time: '2020100000', label: '労働力人口', unit: '人', source: '国勢調査(2020)' },
  '15_F1107_shitsugyousha.csv': { stat: 'F', cat: 'F1107', time: '2020100000', label: '完全失業者数', unit: '人', source: '国勢調査(2020)' },
  '16_C2207_juugyousha.csv': { stat: 'C', cat: 'C2207', time: '2014100000', label: '従業者数(経済センサス)', unit: '人', source: '経済センサス‐基礎調査(2014)' },
  '17_C2210_1ji.csv': { stat: 'C', cat: 'C2210', time: '2014100000', label: '第1次産業従業者数', unit: '人', source: '経済センサス‐基礎調査(2014)' },
  '18_C2212_3ji.csv': { stat: 'C', cat: 'C2212', time: '2014100000', label: '第3次産業従業者数', unit: '人', source: '経済センサス‐基礎調査(2014)' },
  '19_G1201_kouminkan.csv': { stat: 'G', cat: 'G1201', time: '2021100000', label: '公民館数', unit: '館', source: '社会教育調査(2021)' },
  '20_G1401_toshokan.csv': { stat: 'G', cat: 'G1401', time: '2021100000', label: '図書館数', unit: '館', source: '社会教育調査(2021)' },
  // 好奇心軸の再構成用(2026-07-12 統括依頼): 比率化すれば人口規模バイアスがかからない学歴・産業構成の指標
  '21_E9106_daigaku_sotsu.csv': { stat: 'E', cat: 'E9106', time: '2020100000', label: '最終学歴人口(大学・大学院)', unit: '人', source: '国勢調査(2020)' },
  '22_E9101_sotsugyosha.csv': { stat: 'E', cat: 'E9101', time: '2020100000', label: '最終学歴人口(卒業者総数)', unit: '人', source: '国勢調査(2020)' },
  '23_C210721_gakushu_jigyosho.csv': { stat: 'C', cat: 'C210721', time: '2014100000', label: '事業所数(教育、学習支援業)', unit: '所', source: '経済センサス‐基礎調査(2014)' },
  '24_C2107_jigyosho_kei.csv': { stat: 'C', cat: 'C2107', time: '2014100000', label: '事業所数(総数)', unit: '事業所', source: '経済センサス‐基礎調査(2014)' },
};

// 都道府県コード一覧(01〜47)。市区町村メタ情報が3000件超と大きいため都道府県ごとにcdArea範囲を絞って取得する。
const PREF_CODES = Array.from({ length: 47 }, (_, i) => String(i + 1).padStart(2, '0'));

async function getCurrentMuniCodes() {
  // Aの統計表のメタ情報から「現在の」市区町村コード一覧を取得(廃止市町村＝名前が「（旧）」始まりは除外、levelは2=市区町村)
  const meta = await apiGetMeta(STATS.A);
  const classObj = meta.GET_META_INFO.METADATA_INF.CLASS_INF.CLASS_OBJ;
  const arr = Array.isArray(classObj) ? classObj : [classObj];
  const area = arr.find((c) => c['@id'] === 'area');
  const items = Array.isArray(area.CLASS) ? area.CLASS : [area.CLASS];
  const current = items.filter((i) => i['@level'] === '2' && !i['@name'].startsWith('（旧）'));
  const map = {};
  current.forEach((i) => { map[i['@code']] = i['@name']; });
  return map;
}

async function fetchIndicator(fileName, def, muniNames) {
  const outPath = path.join(RAW, fileName);
  if (fs.existsSync(outPath)) {
    console.log('SKIP(既存)', fileName);
    return;
  }
  const statsDataId = STATS[def.stat];
  const res = await apiGet({
    appId: APP_ID,
    statsDataId,
    cdCat01: def.cat,
    cdTime: def.time,
    metaGetFlg: 'N',
  });
  const result = res.GET_STATS_DATA.RESULT;
  if (result.STATUS !== 0) {
    console.log('ERROR', fileName, JSON.stringify(result));
    return;
  }
  const sd = res.GET_STATS_DATA.STATISTICAL_DATA;
  const values = sd.DATA_INF && sd.DATA_INF.VALUE ? (Array.isArray(sd.DATA_INF.VALUE) ? sd.DATA_INF.VALUE : [sd.DATA_INF.VALUE]) : [];
  const rows = ['市区町村コード,市区町村名,値,調査年,出典'];
  let n = 0;
  values.forEach((v) => {
    const code = v['@area'];
    if (!muniNames[code]) return; // 現在の市区町村のみ(廃置分合前の旧コード等は除外)
    const name = muniNames[code].replace(/^.+?　?/, '').trim(); // 「県名 市町村名」→市町村名のみに整形は build 側で行うためここでは元名称のまま保存
    rows.push(`${code},${muniNames[code]},${v['$']},${def.time.slice(0, 4)},${def.source}`);
    n++;
  });
  fs.writeFileSync(outPath, rows.join('\n') + '\n', 'utf8');
  console.log('OK', fileName, n + '件');
}

async function main() {
  console.log('市区町村コード一覧を取得中...');
  const muniNames = await getCurrentMuniCodes();
  console.log('現存市区町村数:', Object.keys(muniNames).length);
  fs.writeFileSync(path.join(RAW, '_muni_names.json'), JSON.stringify(muniNames, null, 1), 'utf8');

  for (const [fileName, def] of Object.entries(INDICATORS)) {
    await fetchIndicator(fileName, def, muniNames);
    await sleep(300); // API負荷配慮
  }
  console.log('完了');
}

main().catch((e) => { console.error(e); process.exit(1); });
