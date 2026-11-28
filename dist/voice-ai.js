/* Reads a spoken sentence with Google's AI (Firebase AI Logic). Only the spoken sentence and a fixed instruction are sent. */
(function(root) {
  'use strict';
  // Same public web configuration as cloud.js (static-check.cjs keeps the two identical).
  const CONFIG = {
    apiKey:'AIzaSyAXWAtHjBOi31FoNXZiAwW-A7ywZcDY2mM',
    authDomain:'tennis-db-ca9ae.firebaseapp.com',
    projectId:'tennis-db-ca9ae',
    storageBucket:'tennis-db-ca9ae.firebasestorage.app',
    messagingSenderId:'1031131288345',
    appId:'1:1031131288345:web:2adcb9f2eeafa5801ceb88'
  };
  const SITE_KEY = '6LfeizYuAAAAADeSVEghlQ_B7kcg3Rr1dB79pv2q';
  const BASE = 'https://www.gstatic.com/firebasejs/13.4.0/';
  const MODEL = 'gemini-3.5-flash-lite';
  const APP_NAME = 'racket-note-ai';
  const TIMEOUT_MS = 8000;
  const NUMBER_FIELDS = [['sw','SW'],['balance','BP'],['tw','TW'],['weight','重量']];
  const SYSTEM = [
    'あなたはテニスラケットの測定を話した文を、決まった項目に分ける係です。',
    '文に出てきた項目は、すべて取り出してください。1つの文に複数の項目があれば、全部出します。',
    '項目と言い方:',
    '- sw: スイングウェイト。「スイング」「スイングウェイト」「SW」「エスダブリュー」。',
    '- balance: バランスポイント(mm)。「バランス」「バランスポイント」「BP」「ビーピー」。',
    '- tw: ツイストウェイト。「ツイスト」「ツイストウェイト」「TW」「ティーダブリュー」。',
    '- weight: 重量(g)。「重量」「重さ」「ウェイト」「グラム数」。',
    '- parts: 加重(おもり)の位置と量。position は「3時」「2〜4時」「スロート」「グリップの下」「グリップエンド」など。範囲は「2〜4時」の形。grams は1か所あたりの量(g)。「各1g」は位置ごとに 1。material は素材が言われた時だけ(鉛、タングステンなど)。',
    '決まり:',
    '- 言われていない項目は出さない。数値を推測で作らない。計算もしない。',
    '- どの項目か分からない言葉は、unknown に元の言葉のまま入れる。',
    '例:',
    '文: スイング310、バランス316、ツイスト12.3、重量308 → {"sw":310,"balance":316,"tw":12.3,"weight":308}',
    '文: BP 320 で重さ 305 → {"balance":320,"weight":305}',
    '文: 12時に鉛を2グラム → {"parts":[{"position":"12時","grams":2,"material":"鉛"}]}',
    '出力の決まり: 6つの項目(sw, balance, tw, weight, parts, unknown)を必ず全部出す。言われていない数値の項目は null、加重が無ければ parts は []、分からない言葉が無ければ unknown は null。'
  ].join('\n');
  function failure(code, message) {return Object.assign(new Error(message), {code});}
  const finite = v => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 10000;
  function normalize(raw) {
    let data;
    try {data = JSON.parse(raw);} catch {throw failure('error','読み取り結果の形が壊れています。');}
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw failure('error','読み取り結果の形が壊れています。');
    const fields = {}, parts = [], unknown = [];
    for (const [key,label] of NUMBER_FIELDS) {
      const v = data[key];
      if (v === null || v === undefined) continue;
      if (finite(v)) fields[key] = v; else unknown.push(label + ' ' + String(v));
    }
    if (data.parts !== null && data.parts !== undefined) {
      if (!Array.isArray(data.parts)) unknown.push('加重 ' + JSON.stringify(data.parts));
      else for (const item of data.parts) {
        if (item && typeof item === 'object' && typeof item.position === 'string' && item.position.trim() && finite(item.grams)) {
          const part = {position:item.position,grams:item.grams};
          if (typeof item.material === 'string' && item.material.trim()) part.material = item.material;
          parts.push(part);
        } else unknown.push('加重 ' + JSON.stringify(item));
      }
    }
    if (typeof data.unknown === 'string' && data.unknown.trim()) unknown.push(data.unknown.trim());
    else if (data.unknown !== null && data.unknown !== undefined && typeof data.unknown !== 'string') unknown.push(String(data.unknown));
    return {fields,parts,unknown:unknown.join(' / ')};
  }
  function classify(error) {
    if (error && ['offline','quota','timeout','error'].includes(error.code) && error instanceof Error && error.fromVoiceAi) return error;
    const text = String((error && (error.message || error)) || ''), status = error && (error.status || error.customErrorData?.status);
    if (status === 429 || /\b429\b|RESOURCE_EXHAUSTED|quota/i.test(text)) return Object.assign(failure('quota','回数の上限です。'),{fromVoiceAi:true});
    if ((typeof navigator !== 'undefined' && navigator.onLine === false) || /Failed to fetch|NetworkError|network|fetch-error/i.test(text) || (error && error.code === 'fetch-error' && !/\b4\d\d\b|\b5\d\d\b/.test(text))) return Object.assign(failure('offline','通信できません。'),{fromVoiceAi:true});
    return Object.assign(failure('error',text.slice(0,200) || '読み取りに失敗しました。'),{fromVoiceAi:true});
  }
  function create(deps = {}) {
    const load = deps.load || (url => import(url)), timeoutMs = deps.timeoutMs ?? TIMEOUT_MS;
    let ready = null;
    function setup() {
      if (!ready) ready = (async () => {
        const [appModule,checkModule,aiModule] = await Promise.all([load(BASE + 'firebase-app.js'),load(BASE + 'firebase-app-check.js'),load(BASE + 'firebase-ai.js')]);
        const app = appModule.initializeApp(CONFIG, APP_NAME);
        checkModule.initializeAppCheck(app,{provider:new checkModule.ReCaptchaEnterpriseProvider(SITE_KEY),isTokenAutoRefreshEnabled:false});
        const ai = aiModule.getAI(app,{backend:new aiModule.GoogleAIBackend()}), S = aiModule.Schema, nullable = {nullable:true};
        const schema = S.object({properties:{
          sw:S.number(nullable),balance:S.number(nullable),tw:S.number(nullable),weight:S.number(nullable),
          parts:S.array({items:S.object({properties:{position:S.string(),grams:S.number(),material:S.string(nullable)}})}),
          unknown:S.string(nullable)
        }});
        return aiModule.getGenerativeModel(ai,{model:MODEL,systemInstruction:SYSTEM,generationConfig:{responseMimeType:'application/json',responseSchema:schema,temperature:0,maxOutputTokens:400}});
      })().catch(error => {ready = null;throw error;});
      return ready;
    }
    function parse(text) {
      const sentence = String(text || '');
      if (!sentence.trim()) return Promise.reject(Object.assign(failure('error','話した文が空です。'),{fromVoiceAi:true}));
      let timer;
      const timeout = new Promise((resolve,reject) => {timer = setTimeout(() => reject(Object.assign(failure('timeout','時間切れです。'),{fromVoiceAi:true})),timeoutMs);});
      const work = (async () => {
        const model = await setup();
        const response = await model.generateContent('文: ' + sentence);
        return normalize(response.response.text());
      })();
      work.catch(() => {});
      return Promise.race([work,timeout]).then(value => {clearTimeout(timer);return value;},error => {clearTimeout(timer);throw classify(error);});
    }
    return {parse};
  }
  const api = {...create(),create,normalize};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.RacketVoiceAI = Object.freeze(api);
})(typeof globalThis !== 'undefined' ? globalThis : this);
