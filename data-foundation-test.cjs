const test=require('node:test'),assert=require('node:assert/strict');
const M=require('./dist/model.js'),P=require('./dist/protocol.js');
const NEW=['stringMainGauge','stringCrossGauge','customMaterial','customParts'];
const record=(id,extra={})=>({id,date:'2026-10-18',kind:'measured',state:'ready',tensionUnit:'lb',weight:327.5,sw:329,balance:'',note:'メモ',...extra});
const racket=(id,records=[],extra={})=>({id,name:'検証用ラケット',individual:'検証個体',records,...extra});
const data=rackets=>({app:'racket-note',version:1,rackets});
const old=()=>data([racket('r1',[record('m1'),record('m2',{baseGrip:'純正',overgrip:'なし'})])]);
const one=extra=>M.validate(data([racket('r1',[record('m1',extra)])])).rackets[0].records[0];

test('古い形の記録を検証しても新しい4欄は現れず、変更とも見なされない',()=>{
  const source=old(),checked=M.validate(source);
  for(const item of checked.rackets[0].records)for(const key of NEW)assert.equal(Object.hasOwn(item,key),false,key);
  assert.equal(P.plan(source,checked).length,0);
});
test('新しい4欄は検証を通り値のまま返り、変更は追加した1件だけになる',()=>{
  const extra={stringMainGauge:1.25,stringCrossGauge:1.3,customMaterial:'鉛テープ',customParts:[{position:'3時',grams:1},{position:'9時',grams:1}]};
  const before=old(),after=old();Object.assign(after.rackets[0].records[0],extra);
  const checked=M.validate(after);
  for(const key of NEW)assert.deepEqual(checked.rackets[0].records[0][key],extra[key]);
  const changes=P.plan(before,checked);
  assert.equal(changes.length,1);assert.equal(changes[0].key,'m_m1');
});
test('空の配列は「加重なし」として保持され、キーなしと区別される',()=>{
  assert.deepEqual(one({customParts:[]}).customParts,[]);
  assert.equal(Object.hasOwn(one({}),'customParts'),false);
  const before=old(),after=old();after.rackets[0].records[0].customParts=[];
  assert.equal(P.plan(before,M.validate(after)).length,1);
});
test('不正な値を拒否する',()=>{
  const bad=[{customParts:'3時'},{customParts:{}},{customParts:[{position:'',grams:1}]},{customParts:[{position:'  ',grams:1}]},{customParts:[{grams:1}]},{customParts:[{position:'3時',grams:-1}]},{customParts:[{position:'3時',grams:NaN}]},{customParts:[{position:'3時',grams:'1'}]},{customParts:[{position:'3時'}]},{customParts:[null]},{customParts:Array.from({length:41},()=>({position:'3時',grams:1}))},{stringMainGauge:-1},{stringMainGauge:'1.25'},{stringCrossGauge:NaN},{stringCrossGauge:'abc'},{customMaterial:5}];
  for(const extra of bad)assert.throws(()=>one(extra),undefined,JSON.stringify(extra));
  assert.equal(one({customParts:Array.from({length:40},()=>({position:'3時',grams:1}))}).customParts.length,40);
  assert.equal(one({stringMainGauge:'',stringCrossGauge:null}).stringMainGauge,'');
  assert.equal(one({stringCrossGauge:null}).stringCrossGauge,'');
});
test('加重の要素に余計なキーがあっても出力は位置と量だけ',()=>{
  const parts=one({customParts:[{position:'3時',grams:1.5,extra:'x',note:'y'}]}).customParts;
  assert.deepEqual(parts,[{position:'3時',grams:1.5}]);assert.deepEqual(Object.keys(parts[0]),['position','grams']);
});
test('リコイルウェイトは3値がそろう時だけ計算し、欠けていれば空にする',()=>{
  const rw=(sw,weight,balance)=>M.recoilWeight({sw,weight,balance});
  assert.equal(rw(310,308.0,316).toFixed(1),'166.3');
  assert.equal(rw(314.4,309.4,317).toFixed(1),'168.7');
  assert.equal(rw(337.3,327.7,330).toFixed(1),'163.9');
  assert.equal(rw(310,308,316),310-(308/1000)*(31.6-10)**2);
  for(const args of [['',308,316],[310,'',316],[310,308,''],[undefined,308,316],[310,undefined,316],[310,308,undefined],[null,308,316],['310',308,316],[NaN,308,316]])assert.equal(rw(...args),'');
  assert.equal(M.recoilWeight({}),'');
  assert.equal(rw(0,0,0),0);
});
test('RWは保存しない',()=>{
  const checked=M.validate(data([racket('r1',[record('m1',{weight:308,balance:316,sw:310})])]));
  assert.equal(Object.hasOwn(checked.rackets[0].records[0],'recoilWeight'),false);
  assert.equal(Object.hasOwn(checked.rackets[0].records[0],'rw'),false);
});
test('CSVは末尾に4列を足し、全行の列数が見出しと一致する',()=>{
  const csv=M.csv(data([
    racket('r1',[
      record('m1',{date:'2026-10-18'}),
      record('m2',{date:'2026-10-19',stringMainGauge:1.25,stringCrossGauge:1.3,customMaterial:'鉛テープ',customParts:[{position:'3時',grams:1},{position:'9時',grams:1}]}),
      record('m3',{date:'2026-10-20',customParts:[]})
    ]),
    racket('r2',[],{note:'未測定'})
  ]));
  const lines=csv.replace('﻿','').split('\r\n'),rows=lines.map(line=>line.slice(1,-1).split('","'));
  assert.equal(rows.length,5);
  assert.deepEqual(rows[0].slice(-4),['縦糸太さ(mm)','横糸太さ(mm)','加重の素材','加重（位置別）']);
  assert.equal(rows[0][rows[0].length-5],'オーバーグリップ');
  for(const row of rows)assert.equal(row.length,rows[0].length);
  const byDate=date=>rows.find(row=>row[7]===date);
  assert.deepEqual(byDate('2026-10-18').slice(-4),['','','','']);
  assert.deepEqual(byDate('2026-10-19').slice(-4),['1.25','1.3','鉛テープ','3時:1g / 9時:1g']);
  assert.deepEqual(byDate('2026-10-20').slice(-4),['','','','なし']);
  assert.deepEqual(rows[4].slice(-4),['','','','']);
});

// ---- 4a: 欄の土台 ----
const F=require('./dist/workspace-forms.js');
const SRC={system:'tennis-db',key:'k1',path:'p',raw:JSON.stringify({a:1}),importedAt:'2026-10-01',current:true};
const fullRecord=()=>record('m1',{stringMainGauge:1.25,stringCrossGauge:1.3,customMaterial:'鉛',customParts:[{position:'3時',grams:1,material:'鉛'},{position:'9時',grams:1}],gripSizeCustom:'テーピング1周',inputTranscript:'3時に1g',source:SRC,archive:SRC,baseGrip:'b',overgrip:'o'});
const correct=(rec,values)=>{
  const base=M.validate(data([racket('r1',[rec])]));
  return F.buildChange({base,type:'record',racketId:'r1',recordId:rec.id,targetId:rec.id,createdAt:'z'},values).rackets[0].records[0];
};
const formValues={date:'2026-10-18',kind:'measured',state:'ready',tensionUnit:'lb',weight:'330',note:'直した'};
test('新しい欄を持つ記録を訂正しても、送らなかった欄が残る',()=>{
  const out=correct(fullRecord(),formValues);
  assert.equal(out.weight,330);assert.equal(out.note,'直した');
  for(const key of ['stringMainGauge','stringCrossGauge','customMaterial','customParts','gripSizeCustom','inputTranscript','source','archive'])assert.deepEqual(out[key],fullRecord()[key],key);
});
test('送った欄は置き換わる',()=>{
  const out=correct(fullRecord(),{...formValues,stringMainGauge:'1.30',gripSizeCustom:'',customPartsJson:'[{"position":"6時","grams":2,"material":"タングステン"}]'});
  assert.equal(out.stringMainGauge,1.3);assert.equal(out.gripSizeCustom,'');
  assert.deepEqual(out.customParts,[{position:'6時',grams:2,material:'タングステン'}]);
});
test('古い形の記録を訂正しても新しい欄は生えず、読んで保存し直しても中身は変わらない',()=>{
  const out=correct(record('m1',{custom:'鉛1g',baseGrip:'b'}),formValues);
  for(const key of [...NEW,'gripSizeCustom','inputTranscript','source','archive'])assert.equal(Object.hasOwn(out,key),false,key);
  const before=old(),once=M.validate(before);
  assert.equal(JSON.stringify(M.validate(once)),JSON.stringify(once));
  assert.equal(P.plan(before,once).length,0);
  const kinded=M.validate(data([racket('r1',[record('m1',{kind:'estimated'})])]));
  assert.equal(correct(kinded.rackets[0].records[0],{...formValues,kind:'estimated'}).kind,'estimated');
});
test('gripSizeCustom・部位ごとの material・種別 other が往復する',()=>{
  const r=one({gripSizeCustom:'パレット削り',customParts:[{position:'3時',grams:1,material:'鉛'},{position:'9時',grams:1}],kind:'other'});
  assert.equal(r.gripSizeCustom,'パレット削り');assert.equal(r.kind,'other');
  assert.deepEqual(r.customParts,[{position:'3時',grams:1,material:'鉛'},{position:'9時',grams:1}]);
  assert.equal(Object.hasOwn(r.customParts[1],'material'),false);
  assert.equal(Object.hasOwn(one({}),'gripSizeCustom'),false);
  assert.equal(M.kinds.other,'その他');
  assert.throws(()=>one({gripSizeCustom:5}));assert.throws(()=>one({customParts:[{position:'3時',grams:1,material:3}]}));
  assert.equal(correct(record('m1'),{...formValues,kind:'other',gripSizeCustom:'シム'}).kind,'other');
});
test('customPartsJson が壊れていると保存を止める',()=>{
  for(const bad of ['{','[{"position":"3時"','{"a":1}','"x"','[{"position":"","grams":1}]'])assert.throws(()=>correct(record('m1'),{...formValues,customPartsJson:bad}),undefined,bad);
  assert.deepEqual(correct(record('m1'),{...formValues,customPartsJson:'[]'}).customParts,[]);
});
test('nextRecord は欄がある時だけ新しい欄を引き継ぎ、無ければ作らない',()=>{
  const n=F.nextRecord(M.validate(data([racket('r1',[fullRecord()])])).rackets[0].records[0]);
  assert.equal(n.stringMainGauge,1.25);assert.equal(n.stringCrossGauge,1.3);assert.equal(n.customMaterial,'鉛');assert.equal(n.gripSizeCustom,'テーピング1周');
  assert.deepEqual(n.customParts,fullRecord().customParts);
  assert.equal(Object.hasOwn(n,'source'),false);
  const o=F.nextRecord(M.validate(old()).rackets[0].records[1]);
  for(const key of [...NEW,'gripSizeCustom'])assert.equal(Object.hasOwn(o,key),false,key);
  for(const key of [...NEW,'gripSizeCustom'])assert.equal(Object.hasOwn(F.nextRecord(),key),false,key);
});
test('hasRecord は新しい欄だけの入力も入力ありと見なす',()=>{
  assert.equal(F.hasRecord({kind:'measured',state:'unknown'}),false);
  for(const v of [{stringMainGauge:'1.25'},{stringCrossGauge:'1.3'},{customMaterial:'鉛'},{gripSizeCustom:'シム'},{customPartsJson:'[{"position":"3時","grams":1}]'},{customParts:[{position:'3時',grams:1}]}])assert.equal(F.hasRecord({kind:'measured',state:'unknown',...v}),true,JSON.stringify(v));
  assert.equal(F.hasRecord({kind:'measured',state:'unknown',customPartsJson:'[]',stringMainGauge:''}),false);
});
test('CSV の見出しは「カスタム（記録の原文）」と「グリップサイズのカスタム」',()=>{
  const csv=M.csv(data([racket('r1',[record('m1',{custom:'原文',gripSizeCustom:'シム',customParts:[{position:'3時',grams:1,material:'鉛'}]})]),racket('r2',[])]));
  const rows=csv.replace('﻿','').split('\r\n').map(l=>l.slice(1,-1).split('","'));
  assert(!rows[0].includes('鉛・加重（位置と量）'));
  const i=rows[0].indexOf('カスタム（記録の原文）');assert(i>0);assert.equal(rows[0][i+1],'グリップサイズのカスタム');
  assert.equal(rows[1][i],'原文');assert.equal(rows[1][i+1],'シム');assert.equal(rows[1].at(-1),'3時:1g(鉛)');
  for(const row of rows)assert.equal(row.length,rows[0].length);
});
