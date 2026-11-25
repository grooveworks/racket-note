(function(){
 'use strict';
 const H=window.RacketHistoryLedger,V=window.RacketVoiceInput,events=[],expected={sw:300,balance:320,tw:13,weight:330,gripW:33,gripT:29};
 document.getElementById('voice-check-form').innerHTML='<table class="hl-table"><tbody><tr>'+H.inlineForm({id:'voice-check',name:'音声動作の確認',individual:'検証専用',records:[]})+'</tr></tbody></table>';
 const form=document.getElementById('edit-form'),summary=document.getElementById('voice-check-summary'),output=document.getElementById('voice-check-results');
 form.querySelector('#draft-status').textContent='このページの値は保存しません';
 form.querySelector('[type=submit]').textContent='結果を確認';
 form.querySelector('#cancel-edit').textContent='入力を消す';
 const result=()=>{
   const values=Object.fromEntries(Object.keys(expected).map(k=>[k,form.elements.namedItem(k).value]));
   const nativeFinal=events.some(e=>e.type==='result'&&e.trusted&&e.final?.trim()),matches=Object.keys(expected).filter(k=>values[k]!==''&&Number(values[k])===expected[k]);
   output.textContent=JSON.stringify({nativeFinal,matches:matches.length,total:6,values,events},null,2);
   summary.textContent=nativeFinal?(matches.length===6?'実音声の認識と6項目への反映を確認できました。':'実音声を認識しました。6項目中'+matches.length+'項目が確認文の数値と一致しています。'):events.some(e=>e.type==='error')?'音声認識からエラーが返りました。下の認識イベントに原因を表示しています。':'実音声の確定結果を待っています。';
 };
 const stop=V.attach(form,result,event=>{events.push({...event,at:new Date().toISOString()});result();});
 form.addEventListener('submit',e=>{e.preventDefault();result();});
 form.addEventListener('change',result);
 form.querySelector('#cancel-edit').addEventListener('click',()=>{stop();location.reload();});
 document.getElementById('voice-check-copy').addEventListener('click',async()=>{result();try{await navigator.clipboard.writeText(output.textContent);summary.textContent+=' 確認結果をコピーしました。';}catch{summary.textContent+=' 下の認識イベントと反映結果を選択してコピーできます。';}});
 window.addEventListener('pagehide',stop);
})();
