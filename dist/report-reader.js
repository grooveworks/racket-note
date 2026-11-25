(function(){
  'use strict';
  let uid='',unsubscribe=null,reports=[],callback=()=>{};
  function read(user,listener){
    callback=listener;
    if((user?.uid||'')===uid)return;
    unsubscribe?.();unsubscribe=null;uid=user?.uid||'';reports=[];
    if(!uid)return callback([]);
    const owner=uid;
    try{unsubscribe=firebase.app().firestore().collection('users').doc(uid).collection('racketNoteReports').onSnapshot(snapshot=>{
      if(uid!==owner)return;
      reports=[];snapshot.forEach(doc=>{const r=doc.data();if(r.id!==doc.id||r.system!=='chatgpt'||typeof r.quote!=='string'||!/^https:\/\/chatgpt\.com\/c\/[a-z0-9-]+$/.test(r.url)||typeof r.sw!=='number')return;reports.push(r);});callback(structuredClone(reports));
    },()=>callback([], 'チャット資料を読み込めません。保存済みの測定履歴はそのまま表示しています。'));}catch{callback([],'チャット資料を読み込めません。');}
  }
  window.RacketReportReader=Object.freeze({read,data:()=>structuredClone(reports)});
})();
