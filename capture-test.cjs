const test=require('node:test'),assert=require('node:assert/strict');
const M=require('./dist/model.js'),P=require('./dist/protocol.js'),F=require('./dist/workspace-forms.js'),H=require('./dist/history-ledger.js'),V=require('./dist/voice-input.js');
test('音声で6測定とOGの変更をまとめて読み、cmだけをmmへ換算する',()=>{
 const p=V.parse('オーバーグリップを追加、SW322、BP32センチ、TW14.2、重量335グラム、グリップ幅33.5、厚さ29.7');
 assert.equal(p.fields.sw,322);assert.equal(p.fields.balance,320);assert.equal(p.fields.tw,14.2);assert.equal(p.fields.weight,335);assert.equal(p.fields.gripW,33.5);assert.equal(p.fields.gripT,29.7);assert.equal(p.fields.overgrip,'あり（品名未記録）');
});
test('発話にない測定値や装着条件を作らず、漢数字・全角数字を扱う',()=>{
 const p=V.parse('スイングウェイト三百二十九、ツイストウェイト１４．２');assert.equal(p.fields.sw,329);assert.equal(p.fields.tw,14.2);assert.equal(p.fields.weight,undefined);assert.equal(p.fields.baseGrip,undefined);
});
test('弦なしは弦条件を消し、OGの取り外し・元グリップ交換を扱う',()=>{
 const p=V.parse('ガットなし、OG外した、元グリップをフェアウェイレザーに交換、SW300');assert.equal(p.fields.state,'bare');assert.equal(p.fields.tensionMain,'');assert.equal(p.fields.overgrip,'なし');assert.equal(p.fields.baseGrip,'フェアウェイレザー');
});
test('加重の追加から全配置を捏造せず、重複する測定値を警告する',()=>{
 const p=V.parse('3時9時に各1g追加、鉛追加、SW329、訂正SW328');assert.equal(p.fields.sw,328);assert.equal(p.fields.custom,undefined);assert.equal(p.warnings.length,2);assert.match(p.transcript,/3時9時/);
});
test('単位なしのBPを勝手に10倍しない、不明文・負値は数値化しない',()=>{
 assert.equal(V.parse('BP32').fields.balance,32);assert.equal(V.parse('SWマイナス').fields.sw,undefined);assert.equal(V.parse('SW-3').fields.sw,undefined);assert.ok(V.parse('聞き取り不明').warnings.length);
});
const base=()=>M.validate({app:'racket-note',version:1,rackets:[{id:'r1',name:'同名',individual:'1',records:[{id:'m1',date:'2026-01-01',kind:'measured',state:'strung',condition:'旧状態',baseGrip:'革',overgrip:'なし',custom:'3時に1g',weight:333,balance:320,sw:329,tw:14.2,gripW:33.5,gripT:29.7,tensionUnit:'lb'}]},{id:'r2',name:'同名',individual:'2',records:[]}]});
test('条件も数値もない入力に自動の題名だけを付けて保存しない',()=>{const values=F.nextRecord();values.condition=H.conditionName(values);assert.equal(values.condition,'');assert.throws(()=>F.buildChange({type:'record',racketId:'r2',targetId:'empty',createdAt:'2026-11-25T00:00:00Z',base:base()},values));});
test('音声原文・今回値だけを保存し、元記録と別個体を変えない',()=>{
 const old=base(),values={...F.nextRecord(old.rackets[0].records[0]),...V.parse('OG追加、SW330').fields,inputTranscript:'OG追加、SW330'};
 const next=F.buildChange({type:'record',racketId:'r1',targetId:'m2',createdAt:'2026-11-25T00:00:00Z',base:old},values),record=next.rackets[0].records[1];assert.equal(record.weight,'');assert.equal(record.sw,330);assert.equal(record.inputTranscript,'OG追加、SW330');assert.equal(record.baseGrip,'革');assert.deepEqual(next.rackets[0].records[0],old.rackets[0].records[0]);assert.deepEqual(next.rackets[1],old.rackets[1]);assert.equal(P.plan(old,next).length,1);
});
test('個体未照合の報告は明示選択した一本へ別記録として追加し、重複追加を拒否する',()=>{
 const report={id:'chat:original:329',sw:329,condition:'張り上げ＋OG',quote:'本人原文',url:'https://chatgpt.com/c/6ace009d-fd74-83ee-ae47-6c0bca2fab42',uncertainties:'測定日未記録'};
 assert.throws(()=>H.linkedReport(report,'',base()));const old=base(),next=H.linkedReport(report,'r2',old);assert.deepEqual(next.rackets[0],old.rackets[0]);assert.equal(next.rackets[1].records[0].date,'');assert.equal(next.rackets[1].records[0].balance,'');assert.equal(next.rackets[1].records[0].source.system,'chatgpt');assert.throws(()=>H.linkedReport(report,'r1',next));assert.equal(P.plan(old,next).length,1);
});
test('履歴全行を表示し、条件/6列/原文を保持し、入力では旧数値を複写しない',()=>{
 const old=base(),r=old.rackets[0],html=H.group(r,[],''),form=H.inlineForm(r,r.records[0]);assert.equal((html.match(/data-hl-record=/g)||[]).length,1);for(const key of ['SW','BP','TW','重量','幅','厚'])assert.ok(html.includes(key));assert.match(form,/name="sw"[^>]*value=""/);assert.match(form,/name="baseGrip"[^>]*value="革"/);assert.match(form,/name="weight"[^>]*value=""/);
});
