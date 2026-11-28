(function(root){
  'use strict';
  const digits={'〇':0,'零':0,'一':1,'二':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9};
  function japaneseNumber(s){
    if(!/[一二三四五六七八九十百千〇零]/.test(s))return s;
    const [whole,fraction]=s.split(/[点・]/);let total=0,n=0;
    if(!/[十百千]/.test(whole))total=Number([...whole].map(c=>digits[c]??c).join(''));
    else{for(const c of whole){if(Object.hasOwn(digits,c))n=digits[c];else if('十百千'.includes(c)){total+=(n||1)*({'十':10,'百':100,'千':1000}[c]);n=0;}}total+=n;}
    return String(total)+(fraction!==undefined?'.'+[...fraction].map(c=>digits[c]??c).join(''):'');
  }
  const aliases=[['sw','SW|S\\s*W|スイングウェイト|スイングウエイト|スイングウェート|スイングウエート|エスダブリュー'],['balance','BP|B\\s*P|バランスポイント|バランス|ビーピー'],['tw','TW|T\\s*W|ツイストウェイト|ツイストウエイト|ツイストウェート|ツイストウエート|ティーダブリュー'],['weight','重量|重さ|ウェイト|ウエイト'],['gripW','グリップ幅|グリップの幅|幅'],['gripT','グリップ厚さ|グリップの厚さ|グリップ厚|厚さ|厚み'],['tensionMain','縦テンション|縦のテンション'],['tensionCross','横テンション|横のテンション']];
  const metricPattern=aliases.map(([key,re])=>`(?<${key}>${re})`).join('|');
  function parse(transcript){
    let text=String(transcript||'').normalize('NFKC').replace(/([一二三四五六七八九十百千〇零]+(?:[点・][一二三四五六七八九〇零]+)?)/g,japaneseNumber).replace(/(\d)\s*点\s*(\d)/g,'$1.$2');
    const fields={},warnings=[],hits=[];
    const re=new RegExp(`(?:${metricPattern})\\s*(?:は|が|を|:|=)?\\s*(-?\\d+(?:\\.\\d+)?)\\s*(ミリメートル|センチメートル|ミリ|センチ|mm|cm|キログラム|グラム|kg|g|ポンド|lb)?`,'gi');
    for(const hit of text.matchAll(re)){
      const key=Object.keys(hit.groups).find(k=>hit.groups[k]),parts=hit[0].match(/(-?\d+(?:\.\d+)?)\s*(ミリメートル|センチメートル|ミリ|センチ|mm|cm|キログラム|グラム|kg|g|ポンド|lb)?$/i);let value=Number(parts[1]),unit=(parts[2]||'').toLowerCase();
      if(value<0||value>10000){warnings.push(hit[0]+'は範囲を確認してください');continue;}
      if(['balance','gripW','gripT'].includes(key)&&['cm','センチ','センチメートル'].includes(unit))value*=10;
      if(key==='weight'&&['kg','キログラム'].includes(unit))value*=1000;
      if(key.startsWith('tension')&&unit)fields.tensionUnit=['kg','キログラム'].includes(unit)?'kg':'lb';
      if(Object.hasOwn(fields,key))warnings.push(key+'を複数回認識しました。最後の値を確認してください');
      fields[key]=value;hits.push({start:hit.index,end:hit.index+hit[0].length});
    }
    const stripped=text.replace(re,'、');
    if(/(?:ガット|ストリング|弦)(?:は|を|が)?\s*(?:なし|無し|外し|外した|外す|抜き)|(?:ガット|ストリング|弦)なし/.test(stripped)){Object.assign(fields,{state:'bare',stringMain:'',stringCross:'',tensionMain:'',tensionCross:''});}
    else if(/張り(?:上げ|上がり)|(?:ガット|ストリング|弦)(?:は|が)?あり/.test(stripped))fields.state='strung';
    const og=stripped.match(/(?:オーバーグリップ|OG)(?:を|は|が)?\s*(なし|無し|外した|外す|除去|あり|有り|追加|巻いた|巻く)/i);
    if(og)fields.overgrip=/なし|無し|外|除去/.test(og[1])?'なし':'あり（品名未記録）';
    const base=stripped.match(/元グリップ(?:を|は|が)?\s*(.+?)(?:に(?:交換|変更|する)|へ(?:交換|変更)|[、。\n]|$)/);
    if(base&&base[1].trim())fields.baseGrip=base[1].trim();
    const custom=stripped.match(/(?:鉛の配置|加重の配置|鉛|加重)(?:は|全体は|全配置は)\s*(.+?)(?:[、。\n]|$)/);
    if(custom)fields.custom=custom[1].trim();
    if(hits.length===0&&!Object.keys(fields).length)warnings.push('項目を判別できません。原文を見ながら入力してください');
    const condition=stripped.replace(/[、。\s]+/g,' ').trim();
    if(condition)fields.condition=condition;
    return {fields,warnings,transcript:String(transcript||'')};
  }
  function attach(form,onChange=()=>{},onSpeechEvent=()=>{}){
    const input=form.querySelector('[data-voice-text]'),status=form.querySelector('[data-voice-status]'),mic=form.querySelector('[data-voice-mic]'),apply=form.querySelector('[data-voice-apply]');
    if(!input||!mic)return ()=>{};
    const Recognition=root.SpeechRecognition||root.webkitSpeechRecognition;let recognition=null,alive=true,listening=false;
    const tell=t=>{if(alive&&status)status.textContent=t;};
    let busy=false;
    const reasons={offline:'通信できません',quota:'回数の上限です。1分ほど待ってください',timeout:'時間切れです',error:'その他のエラー'};
    function finish(){const original=form.elements.namedItem('inputTranscript');if(original)original.value=[original.value,input.value].filter(Boolean).join('\n').slice(-20000);form.dispatchEvent(new Event('change',{bubbles:true}));onChange();}
    function applyFixed(prefix){
      const parsed=parse(input.value);let count=0;
      for(const [key,value] of Object.entries(parsed.fields)){const field=form.elements.namedItem(key);if(!field)continue;field.value=value;field.dataset.voiceChanged='true';count++;}
      finish();
      tell(prefix+(count?`${count}項目を反映。色付きの欄を確認して保存してください。`:'')+parsed.warnings.join('。'));
    }
    function applyAI(result){
      let count=0;
      for(const [key,value] of Object.entries(result.fields||{})){const field=form.elements.namedItem(key);if(!field)continue;field.value=value;field.dataset.voiceChanged='true';count++;}
      const parts=Array.isArray(result.parts)?result.parts:[];let added=0,skipped=0,unsupported=false;
      if(parts.length){const detail={parts,added:undefined,skipped:0};form.dispatchEvent(new CustomEvent('racket-add-parts',{bubbles:true,detail}));if(detail.added===undefined)unsupported=true;else{added=detail.added;skipped=detail.skipped||0;}}
      finish();
      const what=count&&added?`${count}項目と加重に反映`:added?'加重に反映':count?`${count}項目に反映`:'';
      const notes=[];
      if(skipped)notes.push(`同じ位置の加重 ${skipped}件は既にあるため足していません`);
      if(unsupported)notes.push('この画面では加重の行を足せません');
      if(result.unknown)notes.push('読み取れなかった言葉：'+result.unknown);
      tell((what?what+'。色付きの欄を確認して保存してください。':'反映できる項目がありませんでした。')+notes.join('。'));
    }
    async function applyText(){
      if(!input.value.trim())return tell('話した内容か、まとめて入力した文章を入れてください。');
      const name=form.querySelector('[name=name]');
      if(name){name.value=input.value.trim();name.dataset.voiceChanged='true';onChange();tell('ラケット名に反映しました。名前を確認して登録してください。');return;}
      const ai=root.RacketVoiceAI;
      if(!ai||typeof ai.parse!=='function')return applyFixed('');
      if(busy)return;
      busy=true;apply.disabled=true;mic.disabled=true;tell('読み取り中…');
      let result=null,reason='';
      try{result=await ai.parse(input.value);}catch(error){reason=reasons[error&&error.code]?error.code:'error';}
      busy=false;
      if(!alive)return;
      apply.disabled=false;mic.disabled=false;
      if(result)applyAI(result);else applyFixed(`AI で読み取れなかったため、決まった語だけを反映しました（${reasons[reason]}）。`);
    }
    function stop(){if(recognition){const old=recognition;recognition=null;old.abort();}listening=false;mic.textContent='音声で入力';mic.setAttribute('aria-pressed','false');}
    apply.addEventListener('click',applyText);
    mic.addEventListener('click',()=>{
      if(listening){recognition?.stop();return;}
      if(!Recognition)return tell('このブラウザーはアプリの音声認識に対応していません。この欄へ端末のキーボード音声入力で話し、「欄に反映」を押せます。');
      try{
        const current=new Recognition();recognition=current;current.lang='ja-JP';current.interimResults=true;current.continuous=false;let finalText='';
        current.onstart=event=>{if(!alive||recognition!==current)return;onSpeechEvent({type:'start',trusted:event?.isTrusted===true});listening=true;mic.textContent='音声入力を終了';mic.setAttribute('aria-pressed','true');tell('聞き取り中…話し終えると入力欄へ反映します。');};
        current.onresult=event=>{if(!alive||recognition!==current)return;let final='',interim='';for(let i=0;i<event.results.length;i++){const item=event.results[i];if(item.isFinal)final+=item[0].transcript+'、';else interim+=item[0].transcript;}finalText=final;onSpeechEvent({type:'result',trusted:event.isTrusted===true,final,interim});if(finalText)input.value=finalText;if(interim)tell('聞き取り中：'+interim);else if(finalText)tell('聞き取りました。音声入力の終了後に欄へ反映します。');};
        current.onerror=event=>{if(!alive||recognition!==current)return;onSpeechEvent({type:'error',trusted:event.isTrusted===true,error:event.error});const messages={'not-allowed':'マイクが許可されていません。ブラウザーのマイク許可を確認してください。','audio-capture':'マイクを利用できません。接続を確認してください。','no-speech':'音声を聞き取れませんでした。もう一度話せます。','network':'音声認識サービスへ接続できません。文章入力はそのまま使えます。'};tell(messages[event.error]||'音声認識を終了しました。入力済みの内容は残っています。');};
        current.onend=event=>{if(recognition!==current)return;recognition=null;listening=false;if(alive){onSpeechEvent({type:'end',trusted:event?.isTrusted===true});mic.textContent='音声で入力';mic.setAttribute('aria-pressed','false');if(finalText){input.value=finalText;applyText();}}};current.start();
      }catch{stop();tell('音声入力を開始できません。文章入力か端末のキーボード音声入力を使えます。');}
    });
    if(!Recognition)tell('このブラウザーでは、下の欄に端末のキーボード音声入力を使えます。');
    return ()=>{alive=false;stop();};
  }
  function controls(nameOnly=false,value=''){const safe=String(value).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));return `<div class="capture-voice"><button class="button" type="button" data-voice-mic aria-pressed="false">音声で入力</button><label><span class="sr-only">${nameOnly?'ラケット名を音声・文章で入力':'測定と条件を音声・文章で入力'}</span><input data-voice-text name="voiceDraft" value="${safe}" type="text" maxlength="10000" placeholder="${nameOnly?'ラケット名を話す／入力':'例：スイング310、バランス316、ツイスト12.3、重量308'}"></label><button class="button" type="button" data-voice-apply>欄に反映</button><p data-voice-status role="status">${nameOnly?'話した内容を確認してから保存できます。音声認識はブラウザーのサービスを使います。':'決まった言い方はなし · 聞き取った内容は下の欄に入り、違えば触って直す'}</p>${nameOnly?'':'<p class="capture-voice-privacy">話した文は、読み取りのために Google の AI に送られます</p>'}</div>`;}
  const api={parse,attach,controls};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.RacketVoiceInput=Object.freeze(api);
})(typeof globalThis!=='undefined'?globalThis:this);
