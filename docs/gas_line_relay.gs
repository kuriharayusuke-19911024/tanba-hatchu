// ============================================================
// 丹農食品在庫アラート — LINE送信中継（Google Apps Script）
// 既存の doPost を、このコードに置き換えてください。
// ・type:"alert" … これまで通り、丹波農商グループ（DEFAULT_GROUP_ID）へ送信
// ・type:"push"  … 指定したグループ（to）へ送信（仕入れ発注で使用）
// ============================================================

// ↓ 既存コードで使っていたトークンとグループIDをそのまま入れてください
var LINE_TOKEN = PropertiesService.getScriptProperties().getProperty('LINE_TOKEN') || '（ここにチャネルアクセストークン）';
var DEFAULT_GROUP_ID = PropertiesService.getScriptProperties().getProperty('LINE_GROUP_ID') || '（ここに丹波農商グループのID）';

function doPost(e) {
  var out = { ok: false };
  try {
    var body = JSON.parse(e.postData.contents || '{}');
    var to = body.type === 'push' ? (body.to || '') : DEFAULT_GROUP_ID;
    var text = body.message || '';
    if (!to || !text) { out.error = 'missing to/message'; return json_(out); }
    var res = UrlFetchApp.fetch('https://api.line.me/v2/bot/message/push', {
      method: 'post',
      contentType: 'application/json',
      headers: { Authorization: 'Bearer ' + LINE_TOKEN },
      payload: JSON.stringify({ to: to, messages: [{ type: 'text', text: text }] }),
      muteHttpExceptions: true
    });
    out.ok = res.getResponseCode() === 200;
    if (!out.ok) out.error = res.getContentText();
    return json_(out);
  } catch (err) {
    out.error = String(err);
    return json_(out);
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// グループIDの確認用：グループで公式アカウント宛に「テスト」と送ると
// Webhookがここに届くので、ログにグループIDを残します（実行ログ or 下のスプレッドシート等で確認）
// ※ Webhook URL をこのGASのデプロイURLに設定している場合のみ動きます
function checkGroupId(e) {
  // 既存の checkGroupId があればそのままで構いません
}
