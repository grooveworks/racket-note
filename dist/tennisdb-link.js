/* Identity mapping and a read-only projection. No name matching, source writes, or automatic import. */
(function(root){
  'use strict';
  const server=typeof module!=='undefined'&&module.exports;
  const M=server?require('./model.js'):root.RacketLedgerModel,B=server?require('./legacy-bridge.js'):root.RacketLegacyBridge;
  const owner=r=>r.tennisDbRacketId||(r.source?.system==='tennis-db'&&r.source.path==='data/rackets'?r.source.key:'');
  function resolve(data,master){
    const matches=data.rackets.filter(r=>owner(r)===String(master.id));
    if(matches.length>1)throw Error('同じ個体に複数の記録先が結び付いています。自動統合せず、対応の確認が必要です。');
    return matches[0]||null;
  }
  function unlinked(data){return data.rackets.filter(r=>r.source?.system!=='racketpedia'&&!owner(r));}
  function attach(data,master,ledgerId){
    if(resolve(data,master))throw Error('この個体には既に記録先があります。');
    const next=M.validate(data),r=next.rackets.find(r=>r.id===ledgerId);
    if(!r||r.source?.system==='racketpedia'||owner(r))throw Error('この記録先は別の個体かラボデータです。結び付けを変更しません。');
    r.tennisDbRacketId=String(master.id);return M.validate(next);
  }
  function prepare(data,master,at){
    const next=M.validate(data);let r=resolve(next,master);
    if(!r){
      const key='tennisdb:'+encodeURIComponent(master.id);
      if(next.rackets.some(item=>item.id===key))throw Error('個体の識別子が重複しています。既存の記録を変更しません。');
      r={id:key,tennisDbRacketId:String(master.id),name:master.name,records:[],createdAt:at,updatedAt:at};next.rackets.push(r);
    }
    return {data:M.validate(next),racketId:r.id};
  }
  const canonical=value=>JSON.stringify(value,(key,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
  function project(data,master){
    const existing=resolve(data,master),old=B.convert([master],[],'').rackets[0];
    const records=[...(existing?.records||[])],conflicts=[];
    for(const record of old.records){
      const copy=records.find(k=>k.source?.system==='tennis-db'&&k.source.key===record.source.key&&k.source.path==='data/rackets');
      if(copy){
        if(canonical(JSON.parse(copy.source.raw))!==canonical(JSON.parse(record.source.raw))){
          conflicts.push(record.source.key);records.push({...record,id:'tennisdb-current:'+record.id,condition:'TENNISDB更新分：'+record.condition});
        }
      }else records.push(record);
    }
    const racket={...(existing||old),id:existing?.id||'tennisdb:'+encodeURIComponent(master.id),name:master.name,records};
    return {racket,existing,conflicts,savedName:existing?.name!==master.name?existing?.name||'':'',unlinked:unlinked(data)};
  }
  const api={owner,resolve,unlinked,attach,prepare,project};if(server)module.exports=api;else root.RacketLedgerLink=Object.freeze(api);
})(typeof globalThis!=='undefined'?globalThis:this);
