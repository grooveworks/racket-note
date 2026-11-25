/* Import only missing records from the signed-in user's existing Firebase data.
   Original documents are read in the same transaction and never written. */
(function(root) {
  'use strict';
  const server=typeof module!=='undefined'&&module.exports;
  const M=server?require('./model.js'):root.RacketLedgerModel,P=server?require('./protocol.js'):root.RacketNoteProtocol;
  const num=value=>{
    if(value===null||value===undefined||value==='')return '';
    if(typeof value==='number')return Number.isFinite(value)&&value>=0?value:'';
    const match=String(value).match(/^\s*(\d+(?:\.\d+)?)\s*(?:g|mm)?\s*$/i);return match?Number(match[1]):'';
  };
  const display=value=>String(value??'').replace(/&#x2b;/gi,'+').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'");
  const origin=(system,path,key,raw,at)=>({system,path,key:String(key),raw:JSON.stringify(raw),importedAt:at,current:raw.current===true});
  function convert(rackets,catalog,at) {
    if(!Array.isArray(rackets)||!Array.isArray(catalog))throw Error('既存のラケットデータを確認できません。元データは変更していません。');
    const result=[];
    for(const raw of rackets) {
      if(!raw||!raw.id||typeof raw.name!=='string')throw Error('Tennis DBのラケットID・名称を確認してください。');
      const key=String(raw.id),prefix='legacy:tennisdb:'+encodeURIComponent(key);
      if(raw.measurements!==undefined&&!Array.isArray(raw.measurements))throw Error('Tennis DBの計測履歴の形式を確認してください。');
      if((raw.measurements||[]).some(measure=>!measure||!measure.id))throw Error('Tennis DBの計測IDを確認してください。');
      const records=(raw.measurements||[]).map(measure=>({id:prefix+':'+encodeURIComponent(measure.id),date:'',createdAt:'',kind:'measured',state:/(?:\+|＋)OG|OG込み/i.test(measure.state||'')?'ready':'other',condition:measure.state||'状態未記録',tensionUnit:'lb',weight:num(measure.weight),balance:num(measure.balance),gripW:num(measure.gripW),gripT:num(measure.gripT),note:measure.note||'',source:origin('tennis-db','data/rackets',key+'/'+measure.id,measure,at)}));
      const weight=num(raw.weight),balance=num(raw.balance);
      if((weight!==''||balance!=='')&&!records.some(m=>m.weight===weight&&m.balance===balance))records.push({id:prefix+':basic',date:'',createdAt:'',kind:'legacy',state:'unknown',condition:'Tennis DBの基本スペック。計測日・測定状態・種別は未記録。',tensionUnit:'lb',weight,balance,source:origin('tennis-db','data/rackets',key+'/basic',{weight:raw.weight??'',balance:raw.balance??''},at)});
      result.push({id:prefix,name:raw.name,face:String(raw.face||'').replace(/\s*in[²2]\s*$/i,''),note:raw.note||'',createdAt:'',updatedAt:'',records,source:origin('tennis-db','data/rackets',key,raw,at)});
    }
    for(const raw of catalog) {
      if(!raw||!raw.slug||!raw.name)throw Error('ラボデータの名称・出典IDを確認してください。');
      const prefix='legacy:racketpedia:'+raw.slug,source=origin('racketpedia','cloudpages/rackets',raw.slug,raw,at);
      result.push({id:prefix,name:display(raw.fullName||[raw.brand,raw.name].filter(Boolean).join(' ')),maker:raw.brand||'',individual:['Racketpedia',raw.year].filter(Boolean).join(' / '),face:String(raw.head??''),pattern:raw.pattern||'',length:raw.length==null?'':String(raw.length)+' cm',createdAt:'',updatedAt:'',source,records:[{id:prefix+':lab',date:'',createdAt:'',kind:'lab',state:'unknown',condition:'Racketpediaラボ値。本人の個体実測ではありません。測定状態・計測日は元データに未記録。',weight:num(raw.weight),balance:num(raw.balance),sw:num(raw.sw),tw:num(raw.twistw),ra:num(raw.ra),grip:raw.grip||'',tensionUnit:'lb',source}]});
    }
    return M.validate({app:'racket-note',version:1,rackets:result});
  }
  function missingEntries(data,existing) {return [...P.flatten(data)].filter(([key])=>!existing.has(key));}
  async function importLegacy(db,uid,{isCurrent,serverTimestamp}) {
    const owner=db.collection('users').doc(uid),target=owner.collection('racketNoteEntries'),old=owner.collection('data'),pages=owner.collection('cloudpages');
    return db.runTransaction(async tx=>{
      if(!isCurrent())throw Error('アカウントが変わったため、既存データの引継ぎを停止しました。');
      const racketsDoc=await tx.get(old.doc('rackets')),metaDoc=await tx.get(pages.doc('rackets__meta'));
      let rackets=[],catalog=[];
      if(racketsDoc.exists){rackets=racketsDoc.data().items;if(!Array.isArray(rackets))throw Error('既存のラケット一覧の形式を確認できません。');}
      if(metaDoc.exists){
        const total=metaDoc.data().total;
        if(!Number.isInteger(total)||total<1||total>30)throw Error('ラボデータの分割数を確認できません。');
        const parts=[];
        for(let i=0;i<total;i++){const part=await tx.get(pages.doc('rackets__'+i));if(!part.exists||typeof part.data().part!=='string')throw Error('ラボデータが揃っていません。元データは変更していません。');parts.push(part.data().part);}
        catalog=JSON.parse(parts.join(''));
      }
      const data=convert(rackets,catalog,new Date().toISOString()),all=[...P.flatten(data)];
      if(all.length>400)throw Error('既存データの件数が一括引継ぎの上限を超えています。元データは変更していません。');
      const existing=new Set();
      const destinations=await Promise.all(all.map(([key])=>tx.get(target.doc(key))));
      destinations.forEach((doc,index)=>{if(doc.exists)existing.add(all[index][0]);});
      const additions=missingEntries(data,existing);
      if(!isCurrent())throw Error('アカウントが変わったため、既存データの引継ぎを停止しました。');
      for(const [key,entry] of additions)tx.set(target.doc(key),{...entry,deleted:false,revision:1,serverUpdatedAt:serverTimestamp()});
      return {added:additions.length,rackets:data.rackets.length,records:data.rackets.reduce((n,r)=>n+r.records.length,0)};
    },{maxAttempts:3});
  }
  const api={convert,missingEntries,importLegacy};if(server)module.exports=api;else root.RacketLegacyBridge=Object.freeze(api);
})(typeof globalThis!=='undefined'?globalThis:this);
