// ============================================================
// 丹農食品在庫アラート — LINE送信中継（Google Apps Script）
// このファイルの内容を、GASの「コード.gs」の中身とまるごと置き換えてください。
//
// できること
//  1) アプリからの送信依頼
//     ・type:"alert" … 丹波農商グループ（DEFAULT_GROUP_ID）へ送信（今まで通り）
//     ・type:"push"  … 指定したグループ（to）へ送信（仕入れ発注で使用）
//  2) LINEからのWebhook受信 … グループで誰かが発言すると、そのグループIDを記録する
//     → エディタで showLastGroupId を実行するとIDが表示されます
// ============================================================

// ▼▼ ここだけ自分の値に書き換える（今のスクリプトに書いてある値をそのまま）▼▼
var LINE_TOKEN       = 'ここにチャネルアクセストークン';
var DEFAULT_GROUP_ID = 'ここに丹波農商グループのID（Cで始まる）';
// ▲▲ ここまで ▲▲

function doPost(e) {
  var body = {};
  try { body = JSON.parse(e.postData.contents || '{}'); } catch (err) { return json_({ ok: false, error: 'bad json' }); }

  // --- LINEからのWebhook（グループIDの記録）
  if (body.events && body.events.length) {
    var ev = body.events[0];
    var src = ev.source || {};
    var gid = src.groupId || src.roomId || src.userId || '';
    if (gid) {
      PropertiesService.getScriptProperties().setProperty('LAST_GROUP_ID', gid);
      PropertiesService.getScriptProperties().setProperty('LAST_GROUP_AT', new Date().toLocaleString('ja-JP'));
    }
    return json_({ ok: true });
  }

  // --- アプリからの送信依頼
  var to = body.type === 'push' ? (body.to || '') : DEFAULT_GROUP_ID;
  var text = body.message || '';
  if (!to || !text) return json_({ ok: false, error: 'missing to/message' });
  try {
    var res = UrlFetchApp.fetch('https://api.line.me/v2/bot/message/push', {
      method: 'post',
      contentType: 'application/json',
      headers: { Authorization: 'Bearer ' + LINE_TOKEN },
      payload: JSON.stringify({ to: to, messages: [{ type: 'text', text: text }] }),
      muteHttpExceptions: true
    });
    var ok = res.getResponseCode() === 200;
    return json_({ ok: ok, error: ok ? '' : res.getContentText() });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

// エディタでこの関数を選んで「実行」→ 下の「実行ログ」に最後に発言があったグループのIDが出ます
function showLastGroupId() {
  var p = PropertiesService.getScriptProperties();
  Logger.log('グループID: ' + p.getProperty('LAST_GROUP_ID'));
  Logger.log('記録日時: ' + p.getProperty('LAST_GROUP_AT'));
}

// GETで開かれたときの表示（動作確認用）
function doGet() {
  return ContentService.createTextOutput('OK: 丹農食品在庫アラート 中継は動いています');
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
