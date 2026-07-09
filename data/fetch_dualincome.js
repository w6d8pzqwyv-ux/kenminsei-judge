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
    '&statsDataId=0000010206&cdCat01=%23F01503&metaGetFlg=Y';
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
    if (v['@area'] === '00000') return;
    const y = v['@time'];
    if (!best[v['@area']] || y > best[v['@area']].y) best[v['@area']] = { y, val: v['$'] };
  });
  const codes = Object.keys(best).sort();
  const csv =
    '都道府県コード,都道府県名,値(%),調査年,出典\n' +
    codes
      .map((c) => c.slice(0, 2) + ',' + areas[c] + ',' + best[c].val + ',' + best[c].y.slice(0, 4) + ',社会・人口統計体系 共働き世帯割合(e-Stat 0000010206 #F01503)')
      .join('\n');
  fs.writeFileSync(__dirname + '/raw/16_dualincome.csv', csv, 'utf8');
  console.log('OK: 16_dualincome.csv', codes.length + '県');
})();
