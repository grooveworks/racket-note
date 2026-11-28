const test=require('node:test'),assert=require('node:assert/strict');
const V=require('./dist/voice-ai.js');
const BASE='https://www.gstatic.com/firebasejs/13.4.0/';
function fake({reply,fail,never,state={}}={}){
  const calls={loads:[],app:[],check:[],models:[],prompts:[]};
  const load=async url=>{
    calls.loads.push(url);
    if(fail==='load'||state.loadFails)throw new TypeError('Failed to fetch dynamically imported module: '+url);
    if(url===BASE+'firebase-app.js')return {initializeApp:(config,name)=>{calls.app.push({config,name});return {name};}};
    if(url===BASE+'firebase-app-check.js')return {initializeAppCheck:(app,options)=>{calls.check.push({app,options});},ReCaptchaEnterpriseProvider:class{constructor(key){this.key=key;}}};
    if(url===BASE+'firebase-ai.js')return {GoogleAIBackend:class{},getAI:(app,options)=>({app,options}),Schema:{object:x=>({type:'object',...x}),array:x=>({type:'array',...x}),number:x=>({type:'number',...(x||{})}),string:x=>({type:'string',...(x||{})})},getGenerativeModel:(ai,params)=>{calls.models.push(params);return {generateContent:async prompt=>{calls.prompts.push(prompt);if(never)return new Promise(()=>{});if(fail instanceof Error)throw fail;return {response:{text:()=>reply}};}};}};
    throw Error('unexpected import '+url);
  };
  return {calls,api:V.create({load,timeoutMs:60})};
}
const full=o=>JSON.stringify({sw:null,balance:null,tw:null,weight:null,parts:[],unknown:null,...o});
test('成功：4項目と加重を返し、設定は別名の app・固定のモデル・固定の呼び出し方で作る',async()=>{
  const f=fake({reply:full({sw:310,balance:316,tw:12.3,weight:308,parts:[{position:'3時',grams:1,material:'鉛'},{position:'9時',grams:1,material:null}]})});
  const r=await f.api.parse('スイング310、バランス316、ツイスト12.3、重量308');
  assert.deepEqual(r,{fields:{sw:310,balance:316,tw:12.3,weight:308},parts:[{position:'3時',grams:1,material:'鉛'},{position:'9時',grams:1}],unknown:''});
  assert.deepEqual(f.calls.loads.sort(),[BASE+'firebase-ai.js',BASE+'firebase-app-check.js',BASE+'firebase-app.js']);
  assert.equal(f.calls.app[0].name,'racket-note-ai');assert.equal(f.calls.check[0].options.provider.key,'6LfeizYuAAAAADeSVEghlQ_B7kcg3Rr1dB79pv2q');assert.equal(f.calls.check[0].options.isTokenAutoRefreshEnabled,false);
  const m=f.calls.models[0];assert.equal(m.model,'gemini-3.5-flash-lite');assert.equal(m.generationConfig.temperature,0);assert.equal(m.generationConfig.maxOutputTokens,400);assert.equal(m.generationConfig.responseMimeType,'application/json');
  assert.match(m.systemInstruction,/6つの項目\(sw, balance, tw, weight, parts, unknown\)を必ず全部出す/);
  assert.deepEqual(Object.keys(m.generationConfig.responseSchema.properties),['sw','balance','tw','weight','parts','unknown']);
  assert.deepEqual(f.calls.prompts,['文: スイング310、バランス316、ツイスト12.3、重量308'],'only the sentence is sent');
  await f.api.parse('もう一度');assert.equal(f.calls.loads.length,3,'the components are loaded once');assert.equal(f.calls.models.length,1);
});
test('null・空は落とし、3時から4時のような位置の文字は変換しない',async()=>{
  const r=await fake({reply:full({parts:[{position:'2時から4時',grams:2,material:''}]})}).api.parse('x');
  assert.deepEqual(r,{fields:{},parts:[{position:'2時から4時',grams:2}],unknown:''});
  assert.deepEqual(await fake({reply:'{}'}).api.parse('x'),{fields:{},parts:[],unknown:''});
});
test('数値でない・負・範囲外・位置が空の物は捨てず unknown に回す',async()=>{
  const r=await fake({reply:full({sw:'三百十',balance:-3,tw:20000,parts:[{position:'',grams:1},{position:'3時',grams:-1},{position:'6時',grams:'1g'},{position:'9時',grams:1},'x'],unknown:'今日は寒い'})}).api.parse('x');
  assert.deepEqual(r.fields,{});assert.deepEqual(r.parts,[{position:'9時',grams:1}]);
  for(const text of ['SW 三百十','BP -3','TW 20000','"position":""','"grams":-1','"grams":"1g"','x','今日は寒い'])assert(r.unknown.includes(text),text+' in '+r.unknown);
});
test('形が壊れた応答は error で reject',async()=>{
  for(const reply of ['not json','[]','null','"x"'])await assert.rejects(fake({reply}).api.parse('x'),e=>e.code==='error',reply);
});
test('失敗の種類：quota・offline・timeout・error',async()=>{
  await assert.rejects(fake({fail:Object.assign(new Error('[GoogleGenerativeAI Error]: 429 RESOURCE_EXHAUSTED'),{status:429})}).api.parse('x'),e=>e.code==='quota');
  await assert.rejects(fake({fail:new Error('Quota exceeded for metric')}).api.parse('x'),e=>e.code==='quota');
  await assert.rejects(fake({fail:new TypeError('Failed to fetch')}).api.parse('x'),e=>e.code==='offline');
  await assert.rejects(fake({fail:'load'}).api.parse('x'),e=>e.code==='offline');
  await assert.rejects(fake({fail:new Error('permission denied: app check token invalid')}).api.parse('x'),e=>e.code==='error');
  const started=Date.now();await assert.rejects(fake({never:true}).api.parse('x'),e=>e.code==='timeout');assert(Date.now()-started<2000);
  await assert.rejects(fake({reply:'{}'}).api.parse('   '),e=>e.code==='error');
});
test('部品の読み込みに失敗しても、次の呼び出しでやり直す',async()=>{
  const state={loadFails:true},f=fake({reply:full({sw:300}),state});
  await assert.rejects(f.api.parse('x'),e=>e.code==='offline');
  state.loadFails=false;assert.deepEqual((await f.api.parse('x')).fields,{sw:300});
});
