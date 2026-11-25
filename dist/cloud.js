(function() {
  'use strict';
  const M = window.RacketLedgerModel, P = window.RacketNoteProtocol;
  const config = {
    apiKey:'AIzaSyAXWAtHjBOi31FoNXZiAwW-A7ywZcDY2mM',
    authDomain:'tennis-db-ca9ae.firebaseapp.com',
    projectId:'tennis-db-ca9ae',
    storageBucket:'tennis-db-ca9ae.firebasestorage.app',
    messagingSenderId:'1031131288345',
    appId:'1:1031131288345:web:2adcb9f2eeafa5801ceb88'
  };
  let auth,db,user = null,unsubscribe,ready = false,busy = false,entries = new Map(),revision = {},current = M.empty(),started=false,lastStatus='loading',lastError='';
  const listeners=new Set();
  let connectionDeadline,receivedServer=false;
  function clearConnectionCheck(){if(connectionDeadline!==undefined&&connectionDeadline!==null)clearTimeout(connectionDeadline);connectionDeadline=undefined;}
  function scheduleConnectionCheck(){
    ready=false;
    if(navigator.onLine===false){clearConnectionCheck();emit('offline','通信が切れています。入力は下書きに保持し、サーバーには未保存です。');return;}
    if(connectionDeadline===null)return;
    emit('loading');
    if(connectionDeadline!==undefined)return;
    const uid=user?.uid;if(!uid)return;
    connectionDeadline=setTimeout(()=>{connectionDeadline=null;if(auth.currentUser?.uid===uid&&!ready)emit('offline','サーバーの応答を10秒以内に確認できませんでした。入力は保持しています。接続が戻ると自動で再確認します。');},10000);
  }
  function emit(status,error) {lastStatus=status;lastError=error||'';listeners.forEach(callback=>callback({user,ready,busy,status,error:lastError,data:current}));}
  function collection(uid) {return db.collection('users').doc(uid).collection('racketNoteEntries');}
  function init(callback) {
    listeners.add(callback);
    const cancel=()=>listeners.delete(callback);
    if(started){callback({user,ready,busy,status:lastStatus,error:lastError,data:current});return cancel;}
    started=true;
    try {
      if (!window.firebase) throw Error('Firebaseの読み込みに失敗しました。通信を確認して再読み込みしてください。');
      const app = firebase.apps.length ? firebase.app() : firebase.initializeApp(config);
      auth = app.auth();db = app.firestore();auth.useDeviceLanguage();
      // Memory cache only. Records are authoritative on the server; no local-only mode.
      auth.onAuthStateChanged(async nextUser => {
        clearConnectionCheck();receivedServer=false;
        if (unsubscribe) unsubscribe();
        user = nextUser;ready = false;entries = new Map();revision = {};current = M.empty();
        emit(user ? 'loading' : 'signed-out');
        if (!user) return;
        scheduleConnectionCheck();
        const uid = user.uid;
        unsubscribe = collection(uid).onSnapshot({includeMetadataChanges:true},snapshot => {
          if (auth.currentUser?.uid !== uid) return;
          if (snapshot.metadata.hasPendingWrites) {emit('saving');return;}
          if (snapshot.metadata.fromCache) {
            ready=false;
            if(!receivedServer)scheduleConnectionCheck();
            else{clearConnectionCheck();emit('offline','サーバーとの接続を確認できません。表示は直前にサーバーで確認した内容です。入力は保持しています。');}
            return;
          }
          clearConnectionCheck();receivedServer=true;
          try {
            const nextEntries = new Map(),nextRevision = {};
            snapshot.forEach(doc => {
              const entry = doc.data();
              if (doc.id !== P.keyFor(entry.type,entry.id)) throw Error('記録IDが一致しません。');
              nextEntries.set(doc.id,entry);nextRevision[doc.id] = entry.revision;
            });
            const next = P.assemble([...nextEntries.values()]);
            entries = nextEntries;revision = nextRevision;current = next;ready = true;emit(busy ? 'saving' : 'connected');
          } catch(error) {ready = false;emit('error',error.message);}
        },error => {clearConnectionCheck();ready = false;emit('error',error.code === 'permission-denied' ? '記録へのアクセス権を確認できません。ログイン中のアカウントを確認してください。' : 'サーバーから記録を読み込めません。通信を確認してください。エラー：'+(error.code||'unknown'));});
      },error => emit('error',error.message));
      auth.getRedirectResult().catch(error => emit('error',loginMessage(error)));
      window.addEventListener('offline',() => {clearConnectionCheck();ready = false;emit('offline','通信が切れています。入力は下書きに保持し、サーバーには未保存です。');});
      window.addEventListener('online',() => {if(user){receivedServer=false;scheduleConnectionCheck();}});
    } catch(error) {started=false;emit('error',error.message);}
    return cancel;
  }
  function loginMessage(error) {
    if (error.code === 'auth/popup-closed-by-user') return 'ログイン画面が閉じられました。もう一度ログインできます。';
    if (error.code === 'auth/unauthorized-domain') return 'このアプリのログイン許可が設定されていません。公開設定を確認する必要があります。';
    return 'ログインできませんでした。通信を確認して、もう一度お試しください。';
  }
  async function login() {
    if (!auth) throw Error('Firebaseを読み込めていません。再読み込みしてください。');
    const provider = new firebase.auth.GoogleAuthProvider();provider.setCustomParameters({prompt:'select_account'});
    try {await auth.signInWithPopup(provider);}
    catch(error) {
      if (error.code === 'auth/popup-blocked') {await auth.signInWithRedirect(provider);return;}
      throw Error(loginMessage(error));
    }
  }
  async function commit(before,after,baseRevision) {
    if (!user || !auth.currentUser || auth.currentUser.uid !== user.uid) throw Error('保存するにはGoogleアカウントでログインしてください。');
    if (!ready || navigator.onLine === false) throw Error('サーバーに接続できていません。入力はこの画面に残しています。');
    if (busy) throw Error('前の保存が完了するまでお待ちください。');
    const uid = user.uid,changes = P.plan(before,after);let failure = '';
    if (!changes.length) return current;
    busy = true;emit('saving');
    try {
      const source = collection(uid);
      const needed = new Set(changes.map(change => change.key));
      changes.forEach(change => {if (change.next?.type === 'record') needed.add(P.keyFor('racket',change.next.racketId));});
      await db.runTransaction(async transaction => {
        if (auth.currentUser?.uid !== uid) throw Error('アカウントが変わりました。元のアカウントでログインして保存してください。');
        const docs = new Map();
        for (const key of needed) {const snapshot = await transaction.get(source.doc(key));docs.set(key,snapshot.exists ? snapshot.data() : null);}
        const writes = [];
        for (const change of changes) {
          if(change.previous?.type === 'record' && change.previous.payload.source) throw Error('引き継いだ記録の原文は保持します。「この条件で記録」から新しい測定を追加してください。');
          const server = docs.get(change.key);
          if (P.checkChange(change,server,baseRevision[change.key] || 0) === 'already-applied') continue;
          if (change.next?.type === 'record') {
            const parentKey = P.keyFor('racket',change.next.racketId);
            const parentChange = changes.find(item => item.key === parentKey);
            const parent = parentChange ? parentChange.next : docs.get(parentKey);
            if (!parent || parent.deleted) throw Error('このラケットは削除されています。記録を上書きしません。');
          }
          const entity = change.next || change.previous;
          writes.push([change.key,{...entity,deleted:!change.next,revision:(server?.revision || 0)+1,serverUpdatedAt:firebase.firestore.FieldValue.serverTimestamp()}]);
        }
        for (const [key,payload] of writes) transaction.set(source.doc(key),payload);
      },{maxAttempts:3});
      // A successful transaction is the server acknowledgement. Re-read from server
      // to compose the result with unrelated concurrent edits instead of an old array.
      const fresh = await source.get({source:'server'});
      const updated = new Map(),versions = {};
      fresh.forEach(doc => {updated.set(doc.id,doc.data());versions[doc.id] = doc.data().revision;});
      const result = P.assemble([...updated.values()]);
      if (auth.currentUser?.uid !== uid) throw Error('アカウントが変更されました。保存先は元のアカウントです。');
      entries = updated;revision = versions;current = result;ready = true;
      return result;
    } catch(error) {
      const message = error.code === 'permission-denied' ? 'サーバーへの保存権限を確認できません。入力は残しています。' : error.message || 'サーバーへの保存を確認できませんでした。入力は残しています。';
      failure = message;throw Error(message);
    } finally {busy = false;emit(failure ? 'error' : ready ? 'connected' : 'offline',failure);}
  }
  window.RacketLedgerCloud = Object.freeze({init,login,commit,logout:() => auth.signOut(),user:() => user,revisions:() => ({...revision}),data:() => structuredClone(current)});
})();
