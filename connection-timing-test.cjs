const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const M=require('./dist/model.js'),P=require('./dist/protocol.js');
function setup(){
 const events=[],timers=new Map(),handlers={};let tick=0,listener,fail,authChange;
 const auth={currentUser:{uid:'a'},useDeviceLanguage(){},onAuthStateChanged(fn){authChange=fn;fn(this.currentUser);},getRedirectResult:async()=>({})};
 const collection={onSnapshot(options,fn,error){listener=fn;fail=error;return()=>{};}};
 const db={collection(){return{doc(){return{collection(){return collection;}};}};}};
 const firebase={apps:[],initializeApp(){return{auth:()=>auth,firestore:()=>db};}},network={onLine:true};
 const window={RacketLedgerModel:M,RacketNoteProtocol:P,firebase,addEventListener(k,fn){handlers[k]=fn;}};
 vm.runInNewContext(fs.readFileSync('./dist/cloud.js','utf8'),{window,firebase,navigator:network,structuredClone,setTimeout(fn){timers.set(++tick,fn);return tick;},clearTimeout(id){timers.delete(id);}});
 window.RacketLedgerCloud.init(e=>events.push(e));
 return{events,timers,auth,network,cloud:window.RacketLedgerCloud,snapshot(cache){listener({metadata:{fromCache:cache,hasPendingWrites:false},forEach(){}});},expire(){for(const [id,fn]of [...timers]){timers.delete(id);fn();}},error:code=>fail({code}),offline(){network.onLine=false;handlers.offline();},online(){network.onLine=true;handlers.online();},logout(){auth.currentUser=null;authChange(null);}};
}
test('正常な初期cache→serverを通信エラーにせず、確認前の保存は禁止',async()=>{
 const h=setup();h.snapshot(true);assert.equal(h.events.at(-1).status,'loading');assert.equal(h.events.at(-1).error,'');assert.equal(h.timers.size,1);await assert.rejects(h.cloud.commit(M.empty(),M.empty(),{}),/接続/);h.snapshot(false);assert.equal(h.events.at(-1).status,'connected');assert.equal(h.events.at(-1).ready,true);assert.equal(h.timers.size,0);h.expire();assert.equal(h.events.at(-1).status,'connected');
});
test('応答待ちを無期限に隠さず、期限後は未接続、後の応答で復旧',()=>{
 const h=setup();h.snapshot(true);h.expire();assert.equal(h.events.at(-1).status,'offline');assert.match(h.events.at(-1).error,/10秒/);assert.equal(h.events.at(-1).ready,false);h.snapshot(true);assert.equal(h.events.at(-1).status,'offline');assert.equal(h.timers.size,0);h.snapshot(false);assert.equal(h.events.at(-1).status,'connected');assert.equal(h.events.at(-1).error,'');
});
test('接続後のcache・実切断・再接続を区別し、サーバー確認まで保存しない',()=>{
 const h=setup();h.snapshot(false);h.snapshot(true);assert.equal(h.events.at(-1).status,'offline');h.offline();assert.equal(h.events.at(-1).ready,false);h.online();assert.equal(h.events.at(-1).status,'loading');h.snapshot(false);assert.equal(h.events.at(-1).status,'connected');
});
test('権限エラーとログアウト後の古い待機処理を取り違えない',()=>{
 const h=setup();h.snapshot(true);h.error('permission-denied');assert.equal(h.events.at(-1).status,'error');assert.match(h.events.at(-1).error,/アクセス権/);assert.equal(h.timers.size,0);const b=setup();b.snapshot(true);b.logout();b.expire();assert.equal(b.events.at(-1).status,'signed-out');
});
