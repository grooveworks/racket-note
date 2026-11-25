const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const M = require('./dist/model.js');
const P = require('./dist/protocol.js');
const data = (records = []) => M.validate({app:'racket-note',version:1,rackets:[{id:'r1',name:'検証専用',records}]});
const record = (id,sw = 329) => ({id,date:'2026-10-18',kind:'measured',state:'ready',tensionUnit:'lb',sw,condition:'張り上げ＋OG'});
const entity = (payload,revision = 1,deleted = false) => ({...payload,revision,deleted});

test('測定追加は1件の文書だけを変更する',() => {
  const changes = P.plan(data(),data([record('m1')]));
  assert.equal(changes.length,1);assert.equal(changes[0].next.type,'record');
  assert.equal(changes[0].next.racketId,'r1');
});
test('古い版の編集はサーバーの変更を上書きできない',() => {
  const change = P.plan(data([record('m1',325)]),data([record('m1',329)]))[0];
  assert.throws(() => P.checkChange(change,entity(change.previous,2),1),/別の画面/);
  assert.equal(P.checkChange(change,entity(change.previous,1),1),'write');
});
test('保存応答が途切れた後の同じ保存は重複しない',() => {
  const change = P.plan(data(),data([record('m1')]))[0];
  assert.equal(P.checkChange(change,entity(change.next),0),'already-applied');
});
test('ラケット削除は親の削除フラグだけを変更し、履歴文書を残す',() => {
  const before = data([record('m1')]);
  const changes = P.plan(before,M.empty());
  assert.equal(changes.length,1);assert.equal(changes[0].previous.type,'racket');
  const entries = [...P.flatten(before).values()].map(item => entity(item,1,item.type === 'racket'));
  assert.equal(P.assemble(entries).rackets.length,0);
});
test('不正なサーバー文書を空データとして扱わない',() => {
  assert.throws(() => P.assemble([{type:'racket',id:'r1',payload:{id:'r1',name:'x'}}]));
});
test('安全な文書IDを作り、元の識別子を保持する',() => {
  assert.equal(P.keyFor('racket','../a/b'),'r_..%2Fa%2Fb');
  const state = M.validate({app:'racket-note',version:1,rackets:[{id:'../a/b',name:'x',records:[]}]});
  assert.equal(P.assemble([...P.flatten(state).values()].map(item => entity(item))).rackets[0].id,'../a/b');
});

async function harness(initial = data(),options = {}) {
  const store = new Map([...P.flatten(initial)].map(([key,value]) => [key,entity(value)]));
  const events = [],paths = [],network = {onLine:true};let snapshotCallback,deny = false,authSubscriptions=0;
  const snapshot = () => ({metadata:{fromCache:!!options.cache,hasPendingWrites:false},forEach:callback => store.forEach((value,key) => callback({id:key,data:() => structuredClone(value)}))});
  const source = {doc:key => ({key}),onSnapshot:(settings,callback) => {snapshotCallback = callback;callback(snapshot());return () => {};},get:async () => snapshot()};
  const db = {settings:() => {},collection:name => {paths.push(name);return {doc:uid => {paths.push(uid);return {collection:name => {paths.push(name);return source;}};}};},runTransaction:async callback => {
    if(deny)throw {code:'permission-denied'};
    const writes = [];
    await callback({get:async ref => ({exists:store.has(ref.key),data:() => structuredClone(store.get(ref.key))}),set:(ref,value) => writes.push([ref.key,value])});
    if(options.gate) await options.gate;
    for(const [key,value] of writes)store.set(key,structuredClone(value));snapshotCallback(snapshot());
  }};
  const auth = {currentUser:{uid:'user-a',email:'owner@example.com'},useDeviceLanguage:() => {},onAuthStateChanged:callback => {authSubscriptions++;callback(auth.currentUser);return ()=>{};},getRedirectResult:async () => ({user:null}),signOut:async () => {}};
  const firebase = {apps:[],initializeApp:() => ({auth:() => auth,firestore:() => db}),firestore:{FieldValue:{serverTimestamp:() => 'server-time'}}};
  const window = {RacketLedgerModel:M,RacketNoteProtocol:P,RacketLegacyBridge:{importLegacy:async () => ({added:0})},firebase,addEventListener:() => {}};
  if(options.noLegacy)delete window.RacketLegacyBridge;
  vm.runInNewContext(fs.readFileSync('./dist/cloud.js','utf8'),{window,firebase,navigator:network,structuredClone,console,setTimeout:()=>1,clearTimeout:()=>{}});
  const cloud = window.RacketLedgerCloud;cloud.init(event => events.push(event));
  await new Promise(resolve => setImmediate(resolve));
  return {cloud,store,events,paths,network,authSubscriptions:()=>authSubscriptions,deny:() => {deny = true;}};
}
test('クラウド保存はユーザー専用のパスを使い、サーバー確認後に返る',async () => {
  let release;const gate = new Promise(resolve => {release = resolve;});
  const h = await harness(data(),{gate});let finished = false;
  const saved = h.cloud.commit(data(),data([record('m1')]),h.cloud.revisions()).then(value => {finished = true;return value;});
  await new Promise(resolve => setImmediate(resolve));assert.equal(finished,false);release();
  const result = await saved;assert.equal(result.rackets[0].records[0].sw,329);
  assert.deepEqual(h.paths.slice(0,3),['users','user-a','racketNoteEntries']);
  assert.equal(h.store.size,2);
});
test('通信不可・キャッシュだけの初期状態ではサーバー保存を認めない',async () => {
  const offline = await harness();offline.network.onLine = false;
  await assert.rejects(offline.cloud.commit(data(),data([record('m1')]),{}),/接続/);
  const cached = await harness(data(),{cache:true});
  await assert.rejects(cached.cloud.commit(data(),data([record('m1')]),{}),/接続/);
});
test('書込拒否は成功にせず、サーバー内容を変更しない',async () => {
  const h = await harness();h.deny();
  await assert.rejects(h.cloud.commit(data(),data([record('m1')]),h.cloud.revisions()),/保存権限/);
  assert.equal(h.store.size,1);
});
test('Tennis DBの読込機能が無くても専用の保存先だけで起動・保存できる',async () => {
  const h=await harness(data(),{noLegacy:true});
  const saved=await h.cloud.commit(data(),data([{...record('standalone'),balance:320,tw:14.2}]),h.cloud.revisions());
  assert.equal(saved.rackets[0].records[0].tw,14.2);
  assert.equal(saved.rackets[0].records[0].balance,320);
  assert.deepEqual(h.paths,['users','user-a','racketNoteEntries','users','user-a','racketNoteEntries']);
});
test('詳細と比較の購読を繰り返しても認証接続を増やさず、閉じた購読へ通知しない',async()=>{
  const h=await harness(),second=[];const unsubscribe=h.cloud.init(event=>second.push(event));assert.equal(h.authSubscriptions(),1);assert.equal(second.length,1);
  await h.cloud.commit(data(),data([record('m1')]),h.cloud.revisions());assert.ok(second.length>1);const count=second.length;unsubscribe();
  await h.cloud.commit(data([record('m1')]),data([record('m1'),record('m2')]),h.cloud.revisions());assert.equal(second.length,count);assert.equal(h.authSubscriptions(),1);
});
