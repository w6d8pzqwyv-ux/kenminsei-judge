// 指標拡張(2026-07-10 統括承認分)のe-Stat取得スクリプト。fetch_dualincome.js を踏襲。
// 5指標のうち4指標をe-Statから取得: 転入率・旅券発行件数・民生委員数・海外旅行行動者率
const https = require('https');
const fs = require('fs');
const path = require('path');
const APPID = fs.readFileSync(__dirname + '/estat_appid.txt', 'utf8').trim();
const RAW = path.join(__dirname, 'raw');

function get(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (r) => {
      let body = '';
      r.on('data', (d) => (body += d));
      r.on('end', () => resolve(body));
    }).on('error', reject);
  });
}

async function fetchLatest(statsDataId, cdCat01) {
  const url =
    'https://api.e-stat.go.jp/rest/3.0/app/json/getStatsData?appId=' +
    APPID +
    '&statsDataId=' +
    statsDataId +
    '&cdCat01=' +
    encodeURIComponent(cdCat01) +
    '&metaGetFlg=Y';
  const raw = await get(url);
  const data = JSON.parse(raw);
  const inf = data.GET_STATS_DATA.STATISTICAL_DATA;
  const areaObj = inf.CLASS_INF.CLASS_OBJ.find((o) => o['@id'] === 'area');
  const areas = {};
  (Array.isArray(areaObj.CLASS) ? areaObj.CLASS : [areaObj.CLASS]).forEach((a) => {
    areas[a['@code']] = a['@name'];
  });
  let vals = inf.DATA_INF.VALUE;
  if (!Array.isArray(vals)) vals = [vals];
  const best = {};
  vals.forEach((v) => {
    if (v['@area'] === '00000') return; // 全国計は除外
    const y = v['@time'];
    if (!best[v['@area']] || y > best[v['@area']].y) best[v['@area']] = { y, val: v['$'] };
  });
  return { areas, best };
}

function toCsv(areas, best, unitLabel, sourceLabel) {
  const codes = Object.keys(best)
    .filter((c) => c.length === 5 && c.endsWith('000')) // 都道府県コードのみ(市区町村コード除外)
    .sort();
  const header = '都道府県コード,都道府県名,値(' + unitLabel + '),調査年,出典\n';
  const rows = codes
    .map(
      (c) =>
        c.slice(0, 2) +
        ',' +
        areas[c] +
        ',' +
        best[c].val +
        ',' +
        best[c].y.slice(0, 4) +
        ',' +
        sourceLabel
    )
    .join('\n');
  return header + rows;
}

(async () => {
  // 1. 転入率(日本人移動者) #A05308
  {
    const { areas, best } = await fetchLatest('0000010201', '#A05308');
    const csv = toCsv(areas, best, '%', '社会・人口統計体系 転入率(日本人移動者)(e-Stat 0000010201 #A05308)');
    fs.writeFileSync(path.join(RAW, '17_tennyu.csv'), csv, 'utf8');
    console.log('OK: 17_tennyu.csv', Object.keys(best).filter((c) => c.endsWith('000')).length + '件');
  }

  // 2. 一般旅券発行件数(人口千人当たり) #G0430501
  {
    const { areas, best } = await fetchLatest('0000010207', '#G0430501');
    const csv = toCsv(areas, best, '件', '社会・人口統計体系 一般旅券発行件数(人口千人当たり)(e-Stat 0000010207 #G0430501)');
    fs.writeFileSync(path.join(RAW, '18_passport.csv'), csv, 'utf8');
    console.log('OK: 18_passport.csv', Object.keys(best).filter((c) => c.endsWith('000')).length + '件');
  }

  // 3. 民生委員(児童委員)数(人口10万人あたり) #J05101
  {
    const { areas, best } = await fetchLatest('0000010210', '#J05101');
    const csv = toCsv(areas, best, '人', '社会・人口統計体系 民生委員(児童委員)数(人口10万人あたり)(e-Stat 0000010210 #J05101)');
    fs.writeFileSync(path.join(RAW, '19_minsei.csv'), csv, 'utf8');
    console.log('OK: 19_minsei.csv', Object.keys(best).filter((c) => c.endsWith('000')).length + '件');
  }

  // 4. 海外旅行の年間行動者率(10歳以上) #G043071
  {
    const { areas, best } = await fetchLatest('0000010207', '#G043071');
    const csv = toCsv(areas, best, '%', '社会生活基本調査 海外旅行の年間行動者率(10歳以上)(e-Stat 0000010207 #G043071)');
    fs.writeFileSync(path.join(RAW, '20_kaigai.csv'), csv, 'utf8');
    console.log('OK: 20_kaigai.csv', Object.keys(best).filter((c) => c.endsWith('000')).length + '件');
  }
})();
