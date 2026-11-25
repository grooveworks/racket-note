const test=require('node:test'),assert=require('node:assert/strict');
const M=require('./dist/model.js'),P=require('./dist/protocol.js'),F=require('./dist/workspace-forms.js'),U=require('./dist/workspace-ui.js');
function first(){return F.buildChange({type:'racket',base:M.empty(),targetId:'test-racket',initialRecordId:'bare-original',createdAt:'2026-10-23T01:00:00Z'},{name:'条件履歴の架空検証',...F.nextRecord(),date:'2026-10-23',state:'bare',baseGrip:'純正',overgrip:'なし',custom:'なし',condition:'ストリングなしの基準',sw:'280',balance:'310',tw:'13.1'});}
function add(base,id,time,changes){const source=M.sorted(base.rackets[0].records)[0];return F.buildChange({type:'record',base,racketId:'test-racket',targetId:id,createdAt:time},{...F.nextRecord(source),...changes});}
test('同じ個体で弦なし→元グリップ交換→複数位置の鉛を追記し、各時点の全条件を保持する',()=>{
  const original=first(),leather=add(original,'leather','2026-10-23T01:01:00Z',{condition:'レザーへ交換',baseGrip:'レザー 1.5mm',sw:'281',balance:'304',tw:'13.1'});
  const lead=add(leather,'lead','2026-10-23T01:02:00Z',{condition:'鉛を追加',custom:'3時・9時に各1g\nグリップ内に2g',sw:'285.25',balance:'306.5',tw:'14.2'});
  assert.deepEqual(lead.rackets[0].records.slice(0,1),original.rackets[0].records);
  assert.deepEqual(lead.rackets[0].records.slice(0,2),leather.rackets[0].records);
  const rows=M.sorted(lead.rackets[0].records);assert.deepEqual(rows.map(k=>k.id),['lead','leather','bare-original']);
  assert.equal(rows[0].baseGrip,'レザー 1.5mm');assert.equal(rows[0].overgrip,'なし');assert.equal(rows[1].custom,'なし');
  assert.equal(P.plan(leather,lead).length,1);assert.equal(P.plan(leather,lead)[0].previous,null);
  assert.deepEqual(P.assemble([...P.flatten(lead).values()].map(e=>({...e,revision:1,deleted:false}))),lead);
  assert.deepEqual(M.validate(JSON.parse(JSON.stringify(lead))),lead);
});
test('条件再利用は元グリップ・OG・全配置を残し、数値と今回の変更を複写しない',()=>{
  const k={...first().rackets[0].records[0],baseGrip:'革',overgrip:'白 1枚',custom:'12時 1g',condition:'前回の変更'};
  const next=F.nextRecord(k);assert.equal(next.baseGrip,'革');assert.equal(next.overgrip,'白 1枚');assert.equal(next.custom,'12時 1g');assert.equal(next.condition,'');
  for(const key of ['sw','balance','tw','weight','note'])assert.equal(next[key],undefined);
});
test('弦を外した新記録へ前回の弦名とテンションを残さず、元記録は変えない',()=>{
  const old={...first().rackets[0].records[0],state:'strung',stringMain:'旧糸125',stringCross:'旧糸130',tensionMain:46,tensionCross:44};
  const next=F.measurement({...F.nextRecord(old),state:'bare',sw:'280'},'new','2026-10-23T02:00:00Z');
  for(const key of ['stringMain','stringCross','tensionMain','tensionCross'])assert.equal(next[key],'');
  assert.equal(old.stringMain,'旧糸125');assert.equal(old.tensionMain,46);
});
test('新しい任意欄のない旧payloadを正規化で変えず、版照合と編集を維持する',()=>{
  const old=first();delete old.rackets[0].records[0].baseGrip;delete old.rackets[0].records[0].overgrip;
  assert.deepEqual(M.validate(old),old);assert.equal(P.plan(old,M.validate(old)).length,0);
  const next=add(old,'m2','2026-10-23T02:00:00Z',{sw:'281',baseGrip:'新グリップ'});
  assert.equal(P.plan(old,next).length,1);assert.deepEqual(next.rackets[0].records[0],old.rackets[0].records[0]);
  const edited=structuredClone(old);edited.rackets[0].records[0].note='旧記録の補足';
  const change=P.plan(old,edited)[0],server={...P.flatten(old).get(change.key),deleted:false,revision:1};assert.equal(P.checkChange(change,server,1),'write');
});
test('鉛取り外しの「なし」と条件未記録を区別し、検索と比較にも条件を出す',()=>{
  const data=add(first(),'added','2026-10-23T01:01:00Z',{baseGrip:'革TEST',overgrip:'青TEST',custom:'12時 2g',sw:'290',tw:'13.1'});
  const removed=add(data,'removed','2026-10-23T01:02:00Z',{custom:'なし',condition:'鉛を外した',sw:'280',tw:'13.1'});
  assert.equal(U.matchingRows(removed,{query:'12時 2g'})[0].record.id,'added');assert.equal(U.matchingRows(removed,{query:'革TEST'}).length,1);
  assert.match(U.picker(removed,[],'青TEST'),/TW 13.1/);
  const html=U.comparison(removed,[{racketId:'test-racket',recordId:'added'},{racketId:'test-racket',recordId:'removed'}],'added',true);
  for(const value of ['元グリップ','オーバーグリップ','革TEST','青TEST','12時 2g','なし'])assert.ok(html.includes(value),value);
  const card=U.detail(removed.rackets[0],[]);assert.match(card,/測定時のセッティング/);assert.match(card,/12時 2g/);assert.match(card,/鉛を外した/);
});
test('CSVに条件を残し、測定なしのラケットも同じ列数で書き出す',()=>{
  const data=first();data.rackets.push({id:'empty',name:'測定なし',records:[]});
  const lines=M.csv(data).split('\r\n');assert.equal(lines.length,3);assert.ok(lines[0].includes('元グリップ'));assert.ok(lines[1].includes('純正'));
  assert.equal(lines[0].split(',').length,lines[1].split(',').length);assert.equal(lines[0].split(',').length,lines[2].split(',').length);
});
