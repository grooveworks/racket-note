(function(root) {
  'use strict';
  const M = typeof module !== 'undefined' && module.exports ? require('./model.js') : root.RacketLedgerModel;
  const keyFor = (type,id) => (type === 'racket' ? 'r_' : 'm_') + encodeURIComponent(id);
  const signature = object => JSON.stringify(object, (key,value) => value && typeof value === 'object' && !Array.isArray(value) ? Object.fromEntries(Object.keys(value).sort().map(name => [name,value[name]])) : value);
  function flatten(data) {
    const result = new Map();
    M.validate(data).rackets.forEach(racket => {
      const {records,...info} = racket;
      result.set(keyFor('racket',racket.id),{type:'racket',id:racket.id,payload:info});
      records.forEach(record => result.set(keyFor('record',record.id),{type:'record',id:record.id,racketId:racket.id,payload:record}));
    });
    return result;
  }
  function same(left,right) {
    if (!left || !right) return left === right;
    return left.type === right.type && left.id === right.id && left.racketId === right.racketId && signature(left.payload) === signature(right.payload);
  }
  function plan(before,after) {
    const old = flatten(before), next = flatten(after), changes = [];
    for (const [key,entity] of next) {
      if (!same(old.get(key),entity)) changes.push({key,previous:old.get(key) || null,next:entity});
    }
    for (const [key,entity] of old) {
      if (!next.has(key)) {
        // Parent tombstones hide all its records. Keep record documents recoverable.
        if (entity.type === 'record' && !next.has(keyFor('racket',entity.racketId))) continue;
        changes.push({key,previous:entity,next:null});
      }
    }
    if (changes.length > 400) throw Error('一度に読み込めるのはラケットと測定を合わせて400件までです。ファイルを分けてください。');
    return changes;
  }
  function assemble(entries) {
    const rackets = new Map();
    for (const entry of entries) {
      if (!entry || !['racket','record'].includes(entry.type) || typeof entry.deleted !== 'boolean' || !Number.isSafeInteger(entry.revision) || entry.revision < 1 || !entry.payload || entry.id !== entry.payload.id) throw Error('サーバーの記録形式を確認できません。既存データを保護するため保存を止めています。');
      if (!entry.deleted && entry.type === 'racket') rackets.set(entry.id,{...entry.payload,records:[]});
    }
    for (const entry of entries) {
      if (!entry.deleted && entry.type === 'record' && rackets.has(entry.racketId)) rackets.get(entry.racketId).records.push(entry.payload);
    }
    return M.validate({app:'racket-note',version:1,rackets:[...rackets.values()]});
  }
  function checkChange(change,server,expectedRevision) {
    if (change.next && server && !server.deleted && same(change.next,server)) return 'already-applied';
    if (!change.next && server?.deleted) return 'already-applied';
    if (!change.previous) {
      if (server) throw Error('同じIDの記録が既にサーバーにあります。既存の記録は上書きしません。');
    } else if (!server || server.deleted || server.revision !== expectedRevision || !same(change.previous,server)) {
      throw Error('この記録は別の画面で変更されています。入力は下書きに残しました。画面を再読み込みし、最新の記録を確認してから編集してください。');
    }
    return 'write';
  }
  const api = {keyFor,flatten,same,plan,assemble,checkChange};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.RacketNoteProtocol = Object.freeze(api);
})(typeof globalThis !== 'undefined' ? globalThis : this);
