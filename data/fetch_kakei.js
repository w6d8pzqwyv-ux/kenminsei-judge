const https = require('https');
const fs = require('fs');
const APPID = fs.readFileSync(__dirname + '/estat_appid.txt', 'utf8').trim();

function get(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (r) => {
      let body = '';
      r.on('data', (d) => (body += d));
      r.on('end', () => resolve(body));
    }).on('error', reject);
  });
}

async function fetchAndSave(code, label, outFile) {
  const url =
    'https://api.e-stat.go.jp/rest/3.0/app/json/getStatsData?appId=' +
    APPID +
    '&statsDataId=0003348239&cdCat01=' +
    code +
    '&cdCat02=03&cdTime=2024000000&metaGetFlg=Y';
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
  const rows = vals
    .filter((v) => v['@area'] !== '00000' && v['$'] !== '-' && v['$'] !== '')
    .map((v) => ({ code: v['@area'], name: areas[v['@area']], val: v['$'] }));
  const csv =
    '都道府県コード,都道府県庁所在市名,値(円/年),調査年,出典\n' +
    rows
      .map((r) => r.code.slice(0, 2) + ',' + r.name + ',' + r.val + ',2024,家計調査 ' + label + '(県庁所在市・e-Stat 0003348239)')
      .join('\n');
  fs.writeFileSync(__dirname + '/raw/' + outFile, csv, 'utf8');
  console.log('OK:', outFile, rows.length + '市');
}

(async () => {
  await fetchAndSave('100300000', '交際費', '04_kousai.csv');
  await fetchAndSave('011200000', '外食', '05_gaishoku.csv');
})();
