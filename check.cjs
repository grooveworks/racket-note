const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('./dist/model.js');
const record = (id, extra = {}) => ({id,date:'2026-10-18',kind:'measured',state:'ready',tensionUnit:'lb',weight:'',sw:329,stringMain:'test string',note:'条件は原文のまま',...extra});
const racket = (id, records = [], extra = {}) => ({id,name:'検証用ラケット',individual:'検証個体',records,...extra});
const data = rackets => M.validate({app:'racket-note',version:1,rackets});

test('不明な数値を0へ変えず、実測・条件・原文を保持してJSONを往復する',() => {
  const original = data([racket('r1',[record('m1',{weight:327.5,balance:'',condition:'張り上げ＋OG、3時9時に各0.5g'})])]);
  const restored = M.validate(JSON.parse(JSON.stringify(original)));
  assert.deepEqual(restored,original);
  assert.equal(restored.rackets[0].records[0].balance,'');
  assert.equal(restored.rackets[0].records[0].sw,329);
});
test('保存前に不正な数値と存在しない日付を拒否する',() => {
  for (const extra of [{sw:NaN},{weight:-1},{date:'2026-02-30'},{kind:'made-up'}]) {
    assert.throws(() => data([racket('r1',[record('m1',extra)])]));
  }
});
test('ラケット・測定記録の重複IDを拒否する',() => {
  assert.throws(() => data([racket('r1'),racket('r1')]));
  assert.throws(() => data([racket('r1',[record('m1')]),racket('r2',[record('m1')])]));
});
test('バックアップ復元は既存の修正を上書きせず、新しい履歴だけを追加する',() => {
  const current = data([racket('r1',[record('m1',{sw:325})],{name:'現在の名前'})]);
  const backup = data([racket('r1',[record('m1',{sw:329}),record('m2')],{name:'古い名前'}),racket('r2')]);
  const result = M.merge(current,backup);
  assert.equal(result.data.rackets[0].name,'現在の名前');
  assert.equal(result.data.rackets[0].records[0].sw,325);
  assert.equal(result.addedRecords,1);assert.equal(result.skippedRecords,1);assert.equal(result.addedRackets,1);
  assert.equal(M.merge(result.data,backup).addedRecords,0);
  assert.equal(current.rackets[0].records.length,1);
});
test('日付順表示は入力配列を変更しない',() => {
  const records = data([racket('r1',[record('old',{date:'2026-09-01'}),record('new')])]).rackets[0].records;
  assert.equal(M.sorted(records)[0].id,'new');assert.equal(records[0].id,'old');
});
test('CSVは日本語・小数・引用符を保持し、式の実行を防ぐ',() => {
  const csv = M.csv(data([racket('r1',[record('m1',{weight:327.5,note:'"テスト",メモ'})],{name:'=SUM(1,2)'})]));
  assert.ok(csv.startsWith('\uFEFF'));assert.ok(csv.includes('327.5'));assert.ok(csv.includes("'=SUM"));assert.ok(csv.includes('""テスト""'));
  assert.equal(csv.split('\r\n').length,2);
});
test('測定のないラケットもCSVに残す',() => {
  const csv = M.csv(data([racket('r1',[],{note:'未測定です'})]));
  assert.ok(csv.includes('未測定です'));assert.equal(csv.split('\r\n').length,2);
});
