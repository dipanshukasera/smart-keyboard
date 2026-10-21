/**
 * Receives the website's "Request a feature" form and adds each request as a
 * row in this Google Sheet. Free: Google Apps Script web apps need no server.
 * Setup steps are in SETUP.md.
 */
var SHEET_NAME = 'Requests';
var HEADERS = ['Received', 'Name', 'Email', 'Feature', 'Area', 'Details', 'Sent from browser at'];

function doPost(e) {
  var p = (e && e.parameter) || {};
  // The form has a hidden "website" box that people never fill in; bots do.
  if (p.website) return ok();
  var title = clean(p.title, 90);
  var details = clean(p.details, 1200);
  if (!title || !details) return ok();

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var book = SpreadsheetApp.getActive();
    var sheet = book.getSheetByName(SHEET_NAME);
    if (!sheet) {
      sheet = book.insertSheet(SHEET_NAME);
      sheet.appendRow(HEADERS);
      sheet.setFrozenRows(1);
    }
    sheet.appendRow([new Date(), clean(p.name, 80), clean(p.email, 120), title, clean(p.category, 60), details, clean(p.submitted_at, 40)]);
  } finally {
    lock.releaseLock();
  }
  return ok();
}

// Trims, limits the length, and stops a value from being read as a
// spreadsheet formula if it starts with = + - or @.
function clean(value, max) {
  var text = String(value || '').trim().slice(0, max);
  return /^[=+\-@]/.test(text) ? "'" + text : text;
}

function ok() {
  return ContentService.createTextOutput('ok');
}

// Opening the web app address in a browser shows this, which is a quick way
// to check the deployment is live.
function doGet() {
  return ContentService.createTextOutput('Smart Keyboard feature requests: this address accepts form posts.');
}
