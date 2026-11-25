const test=require('node:test'),assert=require('node:assert/strict');
const M=require('./dist/model.js'),P=require('./dist/protocol.js'),B=require('./dist/legacy-bridge.js'),L=require('./dist/tennisdb-link.js'),F=require('./dist/workspace-forms.js');
const master={id:'frame-1',name:'同名モデル',measurements:[{id:'old-1',state:'純正',weight:'310g',balance:'315mm'}]};
const imported=()=>B.convert([master],[],'2026-10-01T00:00:00Z');
test('改名でも元IDで同個体を解決し、同名の別個体を混ぜない',()=>{
  const data=imported();data.rackets.push({...data.rackets[0],id:'another',source:undefined,records:[]});
  const view=L.project(data,{...master,name:'訂正された名称'});assert.equal(view.existing.id,data.rackets[0].id);assert.equal(view.racket.name,'訂正された名称');assert.equal(view.savedName,'同名モデル');assert.equal(view.racket.records.length,1);assert.equal(L.resolve(data,{id:'frame-2',name:'同名モデル'}),null);
});
test('旧文書の署名は任意リンク欄で変わらず、リンクは親1文書だけを更新する',()=>{
  const data=imported(),before=M.validate(data);assert.equal(P.plan(data,before).length,0);assert.equal(Object.hasOwn(before.rackets[0],'tennisDbRacketId'),false);
  data.rackets.push({id:'new-ledger-frame',name:'登録済みの別個体',records:[]});const linked=L.attach(data,{id:'frame-2',name:'同名モデル'},'new-ledger-frame');const changes=P.plan(data,linked);assert.equal(changes.length,1);assert.equal(changes[0].next.type,'racket');assert.equal(L.resolve(linked,{id:'frame-2'}).id,'new-ledger-frame');assert.deepEqual(linked.rackets[0],data.rackets[0]);
});
test('ラボ・既存の別個体・複数対応は自動で合体しない',()=>{
  const data=imported();assert.throws(()=>L.attach(data,{id:'frame-2'},data.rackets[0].id),/別の個体/);
  data.rackets.push({id:'lab',name:'ラボ',source:{system:'racketpedia',key:'lab',path:'catalog',raw:'{}'},records:[]});assert.throws(()=>L.attach(data,{id:'frame-2'},'lab'),/ラボ/);
  data.rackets.push({id:'double',name:'複製',tennisDbRacketId:master.id,records:[]});assert.throws(()=>L.resolve(data,master),/複数/);
});
test('旧履歴の重複はIDと原文で判定し、旧側の変更は別版として保持する',()=>{
  const data=imported(),before=structuredClone(data);assert.equal(L.project(data,master).racket.records.length,1);
  const changed={...master,measurements:[{...master.measurements[0],weight:'311g'},{id:'old-2',state:'元グリップ交換',weight:'308g'}]};
  const view=L.project(data,changed);assert.equal(view.racket.records.length,3);assert.equal(view.conflicts.length,1);assert.match(view.racket.records[1].condition,/TENNISDB更新分/);assert.equal(view.racket.records[0].weight,310);assert.equal(view.racket.records[1].weight,311);assert.deepEqual(data,before);
});
test('初回測定は同じ共通保存先の親と測定だけを追加し、旧配列は変更しない',()=>{
  const empty=M.empty(),copy=structuredClone(master),prepared=L.prepare(empty,master,'2026-10-27T00:00:00Z');
  const next=F.buildChange({type:'record',base:prepared.data,racketId:prepared.racketId,targetId:'new-measurement',createdAt:'2026-10-27T00:00:00Z'},{...F.nextRecord(),sw:'322',tw:'14.3',baseGrip:'レザー'});
  const plan=P.plan(empty,next);assert.equal(plan.length,2);assert.equal(plan.filter(p=>p.next.type==='record').length,1);assert.equal(L.resolve(next,master).records[0].sw,322);assert.deepEqual(master,copy);assert.equal(L.project(next,master).racket.records.length,2);
});
test('元ID・原資料・空欄・推定は投影と追加の後も保持する',()=>{
  const data=imported(),r=data.rackets[0];r.records.push(M.validate({app:'racket-note',version:1,rackets:[{id:'a',name:'a',records:[{id:'prediction',date:'2026-10-01',kind:'estimated',state:'unknown',tensionUnit:'lb',sw:'',weight:315,archive:{system:'tennis-db',key:'source',path:'元資料',raw:'{"note":"予想"}'}}]}]}).rackets[0].records[0]);
  const view=L.project(data,master);assert.deepEqual(view.racket.records,data.rackets[0].records);assert.equal(view.racket.records[1].sw,'');assert.equal(view.racket.records[1].kind,'estimated');assert.match(view.racket.records[1].archive.raw,/予想/);
});
