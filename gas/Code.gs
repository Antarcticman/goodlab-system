/**
 * GOODLAB 排程寄信（Google Apps Script）
 *
 * 僅處理固定排程：
 * - 每週四：值日工作未完成提醒
 * - 每週一：Admin 週報
 *
 * 不提供 doGet/doPost，也不接受前端指定收件者或信件 HTML。
 */

const TIME_ZONE = 'Asia/Taipei';
const FIRESTORE_PAGE_SIZE = 300;
const MAX_EMAIL_LIST_ITEMS = 20;
const PROPERTY_KEYS = {
  projectId: 'FIREBASE_PROJECT_ID',
  siteUrl: 'GOODLAB_SITE_URL'
};

function testSendToMe() {
  runJob_('TEST', function () {
    const recipient = Session.getEffectiveUser().getEmail();
    if (!recipient) throw new Error('無法取得目前 GAS 帳號 Email。');

    const members = fetchCollection_('members');
    const logs = fetchCollection_('logs');
    const routines = fetchCollection_('routines');

    sendEmail_({
      to: recipient,
      subject: '【GOODLAB 測試】GAS 連線與寄信成功',
      htmlBody: emailLayout_(
        'GAS 連線測試成功',
        '<p>Firestore 已可讀取，資料筆數如下：</p>'
          + '<ul>'
          + '<li>members：' + members.length + ' 筆</li>'
          + '<li>logs：' + logs.length + ' 筆</li>'
          + '<li>routines：' + routines.length + ' 筆</li>'
          + '</ul>'
          + '<p>此測試信寄送至建立與執行此 GAS 專案的帳號。</p>'
      )
    });
  });
}

function checkDutyReminder() {
  runJob_('DUTY_REMINDER', function () {
    const members = fetchCollection_('members');
    const dutyRecords = fetchCollection_('duty_records');
    const weekId = mondayDateKey_(new Date());
    const record = dutyRecords.find(function (item) { return item._id === weekId; });

    if (!record || !record.assigned_to) {
      console.log('本週沒有值日生紀錄，不寄信。');
      return;
    }
    if (record.submitted) {
      console.log('本週值日工作已提交，不寄信。');
      return;
    }

    const person = members.find(function (member) {
      return member.Student_ID === record.assigned_to;
    });
    if (!person || !isEmail_(person.Email)) {
      throw new Error('本週值日生沒有有效 Email：' + record.assigned_to);
    }

    const safeName = escapeHtml_(person.Name_Ch || person.Student_ID);
    sendEmail_({
      to: person.Email,
      subject: '【GOODLAB】本週值日工作尚未完成（' + weekId + '）',
      htmlBody: emailLayout_(
        '值日工作提醒',
        '<p>' + safeName + '：</p>'
          + '<p>本週（' + weekId + ' 起）的值日工作尚未完成提交，請完成清潔與耗材清點後到系統送出。</p>'
          + siteLinkHtml_('開啟 GOODLAB')
      )
    });
    console.log('值日提醒已寄給 ' + person.Student_ID);
  });
}

function checkWeeklyAdminReport() {
  runJob_('WEEKLY_ADMIN_REPORT', function () {
    const members = fetchCollection_('members');
    const dutyRecords = fetchCollection_('duty_records');
    const routines = fetchCollection_('routines');
    const logs = fetchCollection_('logs');
    const accounting = fetchCollection_('accounting');

    const adminEmails = members
      .filter(function (member) {
        return member.Role === 'Admin' && member.Status === 'Active' && isEmail_(member.Email);
      })
      .map(function (member) { return member.Email; })
      .filter(unique_);
    if (!adminEmails.length) throw new Error('找不到 Active Admin 的有效 Email。');

    const today = dateKey_(new Date());
    const thisMonday = mondayDateKey_(new Date());
    const lastMonday = shiftDateKey_(thisMonday, -7);
    const lastSunday = shiftDateKey_(thisMonday, -1);

    const dutyHtml = buildDutySummary_(dutyRecords, members, lastMonday);
    const routineHtml = buildRoutineSummary_(routines, today);
    const logsHtml = buildLogsSummary_(logs, lastMonday, thisMonday);
    const accountingHtml = buildAccountingSummary_(accounting, lastMonday, thisMonday);

    const reportBody = '<p style="color:#526075;">報表期間：' + lastMonday + '～' + lastSunday + '</p>'
      + sectionHtml_('1. 值日生狀況', dutyHtml)
      + sectionHtml_('2. Routine', routineHtml)
      + sectionHtml_('3. 維修紀錄', logsHtml)
      + sectionHtml_('4. 公積金異動', accountingHtml)
      + siteLinkHtml_('開啟 GOODLAB');

    sendEmail_({
      to: adminEmails.join(','),
      subject: '【GOODLAB 每週報表】' + today + ' 狀態總覽',
      htmlBody: emailLayout_('GOODLAB 實驗室每週報表', reportBody)
    });
    console.log('週報已寄給 ' + adminEmails.length + ' 位 Admin。');
  });
}

function installTriggers() {
  const managedHandlers = ['checkDutyReminder', 'checkWeeklyAdminReport'];
  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    if (managedHandlers.indexOf(trigger.getHandlerFunction()) !== -1) {
      ScriptApp.deleteTrigger(trigger);
    }
  });

  ScriptApp.newTrigger('checkDutyReminder')
    .timeBased()
    .inTimezone(TIME_ZONE)
    .onWeekDay(ScriptApp.WeekDay.THURSDAY)
    .atHour(22)
    .create();

  ScriptApp.newTrigger('checkWeeklyAdminReport')
    .timeBased()
    .inTimezone(TIME_ZONE)
    .onWeekDay(ScriptApp.WeekDay.MONDAY)
    .atHour(8)
    .create();

  console.log('已建立週四值日提醒與週一 Admin 週報觸發器。');
}

function removeManagedTriggers() {
  const managedHandlers = ['checkDutyReminder', 'checkWeeklyAdminReport'];
  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    if (managedHandlers.indexOf(trigger.getHandlerFunction()) !== -1) {
      ScriptApp.deleteTrigger(trigger);
    }
  });
  console.log('GOODLAB 排程觸發器已移除。');
}

function showAutomationStatus() {
  const properties = PropertiesService.getScriptProperties().getProperties();
  console.log(JSON.stringify({
    projectConfigured: Boolean(properties[PROPERTY_KEYS.projectId]),
    siteUrlConfigured: Boolean(properties[PROPERTY_KEYS.siteUrl]),
    remainingDailyQuota: MailApp.getRemainingDailyQuota(),
    lastSuccessDutyReminder: properties.LAST_SUCCESS_DUTY_REMINDER || null,
    lastSuccessWeeklyReport: properties.LAST_SUCCESS_WEEKLY_ADMIN_REPORT || null,
    lastErrorDutyReminder: properties.LAST_ERROR_DUTY_REMINDER || null,
    lastErrorWeeklyReport: properties.LAST_ERROR_WEEKLY_ADMIN_REPORT || null,
    triggers: ScriptApp.getProjectTriggers().map(function (trigger) {
      return trigger.getHandlerFunction();
    })
  }, null, 2));
}

function buildDutySummary_(records, members, weekId) {
  const record = records.find(function (item) { return item._id === weekId; });
  if (!record) return '<p>上週沒有值日生紀錄。</p>';

  const person = members.find(function (member) { return member.Student_ID === record.assigned_to; });
  const name = escapeHtml_(person ? person.Name_Ch : (record.assigned_to || '未指定'));
  return record.submitted
    ? '<p>上週值日生（' + name + '）已完成提交。</p>'
    : '<p style="color:#b91c1c;"><strong>待確認：</strong>上週值日生（' + name + '）尚未提交。</p>';
}

function buildRoutineSummary_(routines, today) {
  const soonLimit = shiftDateKey_(today, 7);
  const overdue = routines
    .filter(function (routine) { return routine.next_due && routine.next_due < today; })
    .sort(byNextDue_);
  const soon = routines
    .filter(function (routine) {
      return routine.next_due && routine.next_due >= today && routine.next_due <= soonLimit;
    })
    .sort(byNextDue_);

  if (!overdue.length && !soon.length) return '<p>未發現逾期或七天內到期項目。</p>';

  let html = '';
  if (overdue.length) {
    html += '<h4 style="color:#b91c1c;">已逾期</h4>'
      + limitedListHtml_(overdue, function (routine) {
        return '<strong>' + escapeHtml_(routine.name || '未命名') + '</strong>（' + escapeHtml_(routine.next_due) + '）';
      });
  }
  if (soon.length) {
    html += '<h4 style="color:#b45309;">七天內到期</h4>'
      + limitedListHtml_(soon, function (routine) {
        return '<strong>' + escapeHtml_(routine.name || '未命名') + '</strong>（' + escapeHtml_(routine.next_due) + '）';
      });
  }
  return html;
}

function buildLogsSummary_(logs, rangeStart, rangeEnd) {
  const recent = logs
    .filter(function (log) {
      const date = String(log.Date_Reported || '').slice(0, 10);
      return date >= rangeStart && date < rangeEnd;
    })
    .sort(function (a, b) { return String(b.Date_Reported || '').localeCompare(String(a.Date_Reported || '')); });
  const unresolved = logs.filter(function (log) { return log.Status !== 'Closed'; });

  return '<p>上週新增：<strong>' + recent.length + '</strong> 筆；目前未結案：<strong>' + unresolved.length + '</strong> 筆。</p>'
    + (recent.length ? limitedListHtml_(recent, function (log) {
      return escapeHtml_(log.Instrument_ID || '未指定儀器')
        + '：' + escapeHtml_(truncate_(log.Problem_Desc || '未填描述', 80));
    }) : '<p>上週沒有新增維修紀錄。</p>');
}

function buildAccountingSummary_(accounting, rangeStart, rangeEnd) {
  const recent = accounting
    .filter(function (item) {
      const date = String(item.Created_At || item.Date || '').slice(0, 10);
      return date >= rangeStart && date < rangeEnd;
    })
    .sort(function (a, b) {
      return String(b.Created_At || b.Date || '').localeCompare(String(a.Created_At || a.Date || ''));
    });

  if (!recent.length) return '<p>上週沒有新增帳務紀錄。</p>';
  return '<p>上週新增：<strong>' + recent.length + '</strong> 筆。</p>'
    + limitedListHtml_(recent, function (item) {
      const amount = Number(item.Amount) || 0;
      return escapeHtml_(String(item.Date || '').slice(0, 10) || '未填日期')
        + '｜' + escapeHtml_(item.Description || '未填項目')
        + '｜' + formatMoney_(amount);
    });
}

function fetchCollection_(collectionName) {
  const projectId = getRequiredProperty_(PROPERTY_KEYS.projectId);
  const token = ScriptApp.getOAuthToken();
  const baseUrl = 'https://firestore.googleapis.com/v1/projects/'
    + encodeURIComponent(projectId)
    + '/databases/(default)/documents/'
    + encodeURIComponent(collectionName);
  let pageToken = '';
  let documents = [];

  do {
    const url = baseUrl + '?pageSize=' + FIRESTORE_PAGE_SIZE
      + (pageToken ? '&pageToken=' + encodeURIComponent(pageToken) : '');
    const response = UrlFetchApp.fetch(url, {
      method: 'get',
      headers: { Authorization: 'Bearer ' + token },
      muteHttpExceptions: true
    });
    const status = response.getResponseCode();
    const body = response.getContentText();
    if (status !== 200) {
      throw new Error('讀取 Firestore ' + collectionName + ' 失敗（HTTP ' + status + '）：' + truncate_(body, 300));
    }

    const payload = JSON.parse(body || '{}');
    documents = documents.concat(payload.documents || []);
    pageToken = payload.nextPageToken || '';
  } while (pageToken);

  return documents.map(function (document) {
    const data = {};
    Object.keys(document.fields || {}).forEach(function (key) {
      data[key] = parseFirestoreValue_(document.fields[key]);
    });
    data._id = document.name.split('/').pop();
    return data;
  });
}

function parseFirestoreValue_(valueObject) {
  if (!valueObject) return null;
  if (Object.prototype.hasOwnProperty.call(valueObject, 'nullValue')) return null;
  if (Object.prototype.hasOwnProperty.call(valueObject, 'stringValue')) return valueObject.stringValue;
  if (Object.prototype.hasOwnProperty.call(valueObject, 'integerValue')) return Number(valueObject.integerValue);
  if (Object.prototype.hasOwnProperty.call(valueObject, 'doubleValue')) return Number(valueObject.doubleValue);
  if (Object.prototype.hasOwnProperty.call(valueObject, 'booleanValue')) return valueObject.booleanValue;
  if (Object.prototype.hasOwnProperty.call(valueObject, 'timestampValue')) return valueObject.timestampValue;
  if (Object.prototype.hasOwnProperty.call(valueObject, 'referenceValue')) return valueObject.referenceValue;
  if (Object.prototype.hasOwnProperty.call(valueObject, 'bytesValue')) return valueObject.bytesValue;
  if (Object.prototype.hasOwnProperty.call(valueObject, 'geoPointValue')) return valueObject.geoPointValue;
  if (Object.prototype.hasOwnProperty.call(valueObject, 'arrayValue')) {
    return (valueObject.arrayValue.values || []).map(parseFirestoreValue_);
  }
  if (Object.prototype.hasOwnProperty.call(valueObject, 'mapValue')) {
    const result = {};
    Object.keys(valueObject.mapValue.fields || {}).forEach(function (key) {
      result[key] = parseFirestoreValue_(valueObject.mapValue.fields[key]);
    });
    return result;
  }
  return null;
}

function runJob_(jobName, callback) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) {
    console.log(jobName + ' 已有執行中的工作，本次略過。');
    return;
  }

  const properties = PropertiesService.getScriptProperties();
  try {
    callback();
    properties.setProperty('LAST_SUCCESS_' + jobName, new Date().toISOString());
    properties.deleteProperty('LAST_ERROR_' + jobName);
  } catch (error) {
    const message = error && error.message ? error.message : String(error);
    properties.setProperty('LAST_ERROR_' + jobName, new Date().toISOString() + '｜' + truncate_(message, 500));
    console.error(jobName + ' 失敗：' + message);
    throw error;
  } finally {
    lock.releaseLock();
  }
}

function sendEmail_(message) {
  if (MailApp.getRemainingDailyQuota() < 1) {
    throw new Error('GAS 今日寄信配額已用完。');
  }
  MailApp.sendEmail({
    to: message.to,
    subject: message.subject,
    htmlBody: message.htmlBody,
    name: 'GOODLAB'
  });
}

function emailLayout_(title, body) {
  return '<div style="font-family:Arial,\'Noto Sans TC\',sans-serif;line-height:1.7;color:#0f172a;max-width:680px;margin:auto;">'
    + '<h2 style="color:#1d4ed8;margin-bottom:8px;">' + escapeHtml_(title) + '</h2>'
    + body
    + '<hr style="border:0;border-top:1px solid #dce3ec;margin:24px 0;">'
    + '<p style="font-size:12px;color:#526075;">此信由 GOODLAB 排程寄送。若內容有誤，請由系統管理員檢查 Firestore 資料與 GAS 執行紀錄。</p>'
    + '</div>';
}

function sectionHtml_(title, content) {
  return '<section style="border-top:1px solid #dce3ec;padding-top:12px;margin-top:18px;">'
    + '<h3 style="font-size:17px;margin:0 0 8px;">' + escapeHtml_(title) + '</h3>'
    + content
    + '</section>';
}

function limitedListHtml_(items, renderItem) {
  const visible = items.slice(0, MAX_EMAIL_LIST_ITEMS);
  let html = '<ul>' + visible.map(function (item) { return '<li>' + renderItem(item) + '</li>'; }).join('') + '</ul>';
  if (items.length > visible.length) html += '<p>另有 ' + (items.length - visible.length) + ' 筆，請至系統查看。</p>';
  return html;
}

function siteLinkHtml_(label) {
  const url = PropertiesService.getScriptProperties().getProperty(PROPERTY_KEYS.siteUrl) || '';
  if (!/^https:\/\//i.test(url)) return '';
  return '<p><a href="' + escapeHtml_(url) + '" style="display:inline-block;padding:10px 14px;border-radius:8px;background:#1d4ed8;color:#fff;text-decoration:none;">'
    + escapeHtml_(label) + '</a></p>';
}

function getRequiredProperty_(key) {
  const value = (PropertiesService.getScriptProperties().getProperty(key) || '').trim();
  if (!value) throw new Error('尚未設定 Script Property：' + key);
  return value;
}

function dateKey_(date) {
  return Utilities.formatDate(date, TIME_ZONE, 'yyyy-MM-dd');
}

function mondayDateKey_(date) {
  const isoDay = Number(Utilities.formatDate(date, TIME_ZONE, 'u'));
  return dateKey_(new Date(date.getTime() - (isoDay - 1) * 86400000));
}

function shiftDateKey_(dateKey, days) {
  const date = new Date(dateKey + 'T12:00:00+08:00');
  date.setTime(date.getTime() + days * 86400000);
  return dateKey_(date);
}

function formatMoney_(amount) {
  const rounded = Math.round(Number(amount) || 0);
  return (rounded >= 0 ? '+' : '-') + '$' + Math.abs(rounded).toLocaleString('zh-TW');
}

function escapeHtml_(value) {
  return String(value == null ? '' : value).replace(/[&<>'"]/g, function (character) {
    return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character];
  });
}

function truncate_(value, maxLength) {
  const text = String(value == null ? '' : value);
  return text.length > maxLength ? text.slice(0, maxLength - 1) + '…' : text;
}

function isEmail_(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
}

function unique_(value, index, array) {
  return array.indexOf(value) === index;
}

function byNextDue_(a, b) {
  return String(a.next_due || '').localeCompare(String(b.next_due || ''));
}
