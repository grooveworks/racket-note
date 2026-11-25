const test=require('node:test'),assert=require('node:assert/strict');
const M=require('./dist/model.js'),P=require('./dist/protocol.js'),U=require('./dist/workspace-ui.js'),F=require('./dist/workspace-forms.js');
const meta=(base=M.empty())=>({type:'racket',base,targetId:'r1',initialRecordId:'m1',createdAt:'2026-10-19T02:00:00.000Z'});
const values={name:'検証専用',maker:'メーカー',individual:'1号機',racketNote:'個体メモ',...F.nextRecord(),weight:'326.5',balance:'321',sw:'328',tw:'14.1',note:'測定メモ'};
test('ラケットと初回測定は一度の変更で2文書になり、メモが混ざらない',()=>{
  const next=F.buildChange(meta(),values),r=next.rackets[0];assert.equal(r.note,'個体メモ');assert.equal(r.records[0].note,'測定メモ');assert.equal(r.records[0].weight,326.5);assert.equal(r.records[0].id,'m1');assert.equal(P.plan(M.empty(),next).length,2);
});
test('名前だけの登録は空の測定を作らず、0と未記入を区別する',()=>{
  const blank=F.buildChange(meta(),{name:'名前のみ',...F.nextRecord()});assert.equal(blank.rackets[0].records.length,0);
  const zero=F.buildChange(meta(),{name:'ゼロ',...F.nextRecord(),sw:'0'});assert.equal(zero.rackets[0].records[0].sw,0);assert.equal(zero.rackets[0].records[0].weight,'');
});
test('条件再利用は弦・テンション・グリップを残し、数値と測定メモを引き継がない',()=>{
  const source={weight:326.5,sw:328,tw:14.1,note:'古い実測',state:'ready',condition:'OGあり',stringMain:'検証糸',tensionMain:46,tensionUnit:'lb',grip:'革＋OG',custom:'3時に1g'};
  const next=F.nextRecord(source);assert.equal(next.stringMain,'検証糸');assert.equal(next.tensionMain,46);assert.equal(next.custom,'3時に1g');assert.equal(next.sw,undefined);assert.equal(next.weight,undefined);assert.equal(next.note,undefined);assert.equal(next.date,F.today());
});
test('測定追加は過去の測定とラケット基本情報を変更しない',()=>{
  const before=F.buildChange(meta(),values),next=F.buildChange({type:'record',base:before,racketId:'r1',targetId:'m2',createdAt:'2026-10-19T03:00:00Z'},{...F.nextRecord(),sw:'324'});
  assert.equal(next.rackets[0].records.length,2);assert.deepEqual(next.rackets[0].records[0],before.rackets[0].records[0]);assert.equal(P.plan(before,next).length,1);
});
test('保存再試行は同じIDと時刻になり二重登録しない',()=>{
  const a=F.buildChange(meta(),values),b=F.buildChange(meta(),values);assert.deepEqual(a,b);assert.equal(P.checkChange(P.plan(M.empty(),a)[0],{...P.flatten(a).get('r_r1'),deleted:false,revision:1},0),'already-applied');
});
test('基本情報の編集で測定履歴や測定メモを消さない',()=>{
  const before=F.buildChange(meta(),values);const next=F.buildChange({...meta(before),racketId:'r1'},{...before.rackets[0],name:'変更後',racketNote:'個体メモ変更'});assert.deepEqual(next.rackets[0].records,before.rackets[0].records);assert.equal(next.rackets[0].note,'個体メモ変更');
});
test('絞り込みは条件に一致する最新の測定を使い、ストリング検索も過去を探す',()=>{
  const data=F.buildChange(meta(),{...values,date:'2026-10-18',stringMain:'旧糸'});data.rackets[0].records.push({...data.rackets[0].records[0],id:'m2',date:'2026-10-19',kind:'catalog',state:'bare',weight:300,stringMain:'新糸'});
  assert.equal(U.matchingRows(data,{kind:'measured'})[0].record.id,'m1');assert.equal(U.matchingRows(data,{query:'旧糸'})[0].record.id,'m1');assert.equal(U.matchingRows(data,{state:'ready'}).length,0);assert.equal(U.matchingRows(data,{})[0].record.id,'m2');
});
test('数値の並べ替えで空欄をゼロとして先頭にしない',()=>{
  const data=F.buildChange(meta(),values);data.rackets.push({...data.rackets[0],id:'r2',name:'未記入',records:[{...data.rackets[0].records[0],id:'m2',sw:''}]});assert.equal(U.matchingRows(data,{sort:'sw'})[0].racket.id,'r1');
});
test('基準差分は正負と小数を保ち、未記録の数値を計算しない',()=>{
  assert.equal(U.difference(323,326.5),'−3.5');assert.equal(U.difference(328,324),'+4');assert.equal(U.difference('',0),'');assert.equal(U.difference(0,0),'差なし');assert.equal(U.difference(14.1,13.8),'+0.3');
});
test('比較表は条件を常に残し、テンションの異なる単位を同一視しない',()=>{
  const data=F.buildChange(meta(),{...values,state:'ready',tensionMain:'46',tensionUnit:'lb'});data.rackets[0].records.push({...data.rackets[0].records[0],id:'m2',state:'bare',tensionUnit:'kg'});const html=U.comparison(data,[{racketId:'r1',recordId:'m1'},{racketId:'r1',recordId:'m2'}],'m1',true);assert.match(html,/測定状態/);assert.match(html,/46 lb/);assert.match(html,/46 kg/);assert.match(html,/ガットなし/);assert.match(html,/張り上がり/);assert.match(html,/data-metric="weight"/);assert.doesNotMatch(html,/>RA</);
});
test('入力文字列を一覧・比較のHTMLとして実行させない',()=>{
  const data=F.buildChange(meta(),{...values,name:'<img src=x onerror=alert(1)>',condition:'<script>alert(1)</script>'});const html=U.results(data,[],{});assert.match(html,/&lt;img/);assert.doesNotMatch(html,/<img src=x/);assert.doesNotMatch(html,/<script>/);
});
test('編集画面が公称値・測定状態・kg単位を既定値へ戻さない',()=>{
  const data=F.buildChange(meta(),{...values,kind:'catalog',state:'bare',tensionUnit:'kg'}),r=data.rackets[0],k=r.records[0];
  const html=F.form({type:'record',recordId:k.id},r,k,k);
  assert.match(html,/<option value="catalog" selected>公称値/);assert.match(html,/<option value="bare" selected>ガットなし/);assert.match(html,/<option value="kg" selected>kg/);
  const reuse=F.form({type:'record'},r,null,{...k,state:'ready'});assert.match(reuse,/<option value="ready" selected>/);
});
