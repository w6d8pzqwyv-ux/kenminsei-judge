const fs = require('fs');
const path = __dirname + '/raw/';

// 県庁所在市コード(01100〜47201相当)のみ残す。重複する政令市の余分な行を除外するため、
// 各都道府県コードごとに「先頭2桁+100」または実際の県庁所在地コードに最も近い行を1つだけ残す。
const KEEP = new Set([
  '01100', '02201', '03201', '04100', '05201', '06201', '07201', '08201', '09201', '10201',
  '11100', '12100', '13100', '14100', '15100', '16201', '17201', '18201', '19201', '20201',
  '21201', '22100', '23100', '24201', '25201', '26100', '27100', '28100', '29201', '30201',
  '31201', '32201', '33100', '34100', '35203', '36201', '37201', '38201', '39201', '40130',
  '41201', '42201', '43100', '44201', '45201', '46201', '47201',
]);

function clean(file) {
  const text = fs.readFileSync(path + file, 'utf8');
  const lines = text.trim().split('\n');
  const header = lines[0];
  const body = lines.slice(1).filter((line) => {
    const cityCode = line.split(',')[1].split(' ')[0];
    return KEEP.has(cityCode);
  });
  fs.writeFileSync(path + file, header + '\n' + body.join('\n') + '\n', 'utf8');
  console.log(file, '->', body.length, '件');
}

clean('04_kousai.csv');
clean('05_gaishoku.csv');
