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

(async () => {
  const url =
    'https://api.e-stat.go.jp/rest/3.0/app/json/getStatsData?appId=' +
    APPID +
    '&statsDataId=0003348634&cdCat01=090&metaGetFlg=Y';
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
    .filter((v) => v['@area'] !== '00000')
    .map((v) => ({ code: v['@area'].slice(0, 2), name: areas[v['@area']], val: v['$'] }));
  const csv =
    '都道府県コード,都道府県名,値(冊/年度),調査年,出典\n' +
    rows
      .map((r) => r.code + ',' + r.name + ',' + r.val + ',2014,社会教育調査 図書館貸出冊数(総数)(e-Stat 0003348634)')
      .join('\n');
  fs.writeFileSync(__dirname + '/raw/14_library.csv', csv, 'utf8');
  console.log('OK: 14_library.csv', rows.length + '県');
})();
