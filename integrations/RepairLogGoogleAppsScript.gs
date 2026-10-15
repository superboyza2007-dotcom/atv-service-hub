/**
 * ATV repair-log receiver for Google Apps Script Web App.
 *
 * Script Properties required:
 *   SPREADSHEET_ID = the ID from the target Google Sheets URL
 *   SHARED_TOKEN   = a long random secret (at least 32 characters recommended)
 *
 * Deploy as a Web App that executes as the spreadsheet owner. The endpoint can
 * be publicly reachable because doPost checks the shared token. Configure the
 * app's APP_REPAIR_LOG_SCRIPT_URL as:
 *   https://script.google.com/macros/s/DEPLOYMENT_ID/exec?token=SHARED_TOKEN
 */
const SHEET_NAME = "RepairLog";
const EXPECTED_SOURCE = "guide-module-dashboard";
const COLUMNS = [
  "รหัสรายการ",
  "วันที่และเวลา",
  "วันที่แก้ไข",
  "เวลาซ่อมรวม",
  "เบอร์รถ",
  "รายละเอียด",
  "อะไหล่เบิกซ่อม",
  "ชื่อช่างผู้ทำรายการ",
  "ชั่วโมงสะสม",
  "สถานะ",
  "ตัวเลือก",
  "รหัสแจ้งซ่อมจากไกด์",
  "ประเภท",
];

function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    const properties = PropertiesService.getScriptProperties();
    const expectedToken = properties.getProperty("SHARED_TOKEN") || "";
    const receivedToken = (e && e.parameter && e.parameter.token) || "";
    if (!expectedToken || !constantTimeEquals_(receivedToken, expectedToken)) {
      return json_({ ok: false, error: "unauthorized" });
    }

    const rawBody = e && e.postData && e.postData.contents;
    if (!rawBody) return json_({ ok: false, error: "empty_body" });
    const payload = JSON.parse(rawBody);
    validatePayload_(payload);

    const spreadsheetId = properties.getProperty("SPREADSHEET_ID") || "";
    if (!spreadsheetId) throw new Error("Missing SPREADSHEET_ID script property");
    if (!lock.tryLock(8000)) throw new Error("Could not obtain sheet lock");
    const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
    const sheet = spreadsheet.getSheetByName(SHEET_NAME) || spreadsheet.insertSheet(SHEET_NAME);

    ensureHeader_(sheet);
    const result = upsertRows_(sheet, payload.rows);
    return json_({ ok: true, inserted: result.inserted, updated: result.updated });
  } catch (error) {
    // Do not log request bodies or tokens; they may contain private business data.
    console.error("RepairLog export failed: " + (error && error.message ? error.message : "unknown error"));
    return json_({ ok: false, error: "write_failed" });
  } finally {
    if (lock.hasLock()) lock.releaseLock();
  }
}

function validatePayload_(payload) {
  if (!payload || payload.source !== EXPECTED_SOURCE || payload.sheetName !== SHEET_NAME) {
    throw new Error("Unexpected payload source or sheet name");
  }
  if (!Array.isArray(payload.columns) || payload.columns.length !== COLUMNS.length ||
      payload.columns.some((column, index) => column !== COLUMNS[index])) {
    throw new Error("Unexpected column schema");
  }
  if (!Array.isArray(payload.rows) || payload.rows.length < 1 || payload.rows.length > 1000) {
    throw new Error("Invalid row count");
  }
  if (typeof payload.sentAt !== "string" || isNaN(Date.parse(payload.sentAt))) {
    throw new Error("Invalid sentAt");
  }

  const seenIds = Object.create(null);
  payload.rows.forEach((row) => {
    if (!Array.isArray(row) || row.length !== COLUMNS.length) throw new Error("Invalid row shape");
    row.forEach((cell) => {
      if (typeof cell === "string") {
        if (cell.length > 20000) throw new Error("Cell is too long");
      } else if (typeof cell !== "number" || !Number.isFinite(cell)) {
        throw new Error("Invalid cell value");
      }
    });
    const id = String(row[0]).trim();
    if (!id || seenIds[id]) throw new Error("Missing or duplicate row ID");
    seenIds[id] = true;
  });
}

function ensureHeader_(sheet) {
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, COLUMNS.length).setValues([COLUMNS]);
    sheet.setFrozenRows(1);
    return;
  }
  const current = sheet.getRange(1, 1, 1, COLUMNS.length).getDisplayValues()[0];
  if (current.some((value, index) => value !== COLUMNS[index])) {
    throw new Error("RepairLog header does not match expected columns");
  }
}

/** Update rows with matching IDs and append new IDs; retries do not duplicate rows. */
function upsertRows_(sheet, incomingRows) {
  const lastRow = sheet.getLastRow();
  const existingRowById = Object.create(null);
  if (lastRow > 1) {
    const ids = sheet.getRange(2, 1, lastRow - 1, 1).getDisplayValues();
    ids.forEach((entry, index) => {
      const id = String(entry[0]).trim();
      if (id) existingRowById[id] = index + 2;
    });
  }

  const updates = [];
  const inserts = [];
  incomingRows.forEach((row) => {
    const existingRow = existingRowById[String(row[0]).trim()];
    if (existingRow) updates.push({ sheetRow: existingRow, values: row });
    else inserts.push(row);
  });

  updates.sort((a, b) => a.sheetRow - b.sheetRow);
  let start = 0;
  while (start < updates.length) {
    let end = start + 1;
    while (end < updates.length && updates[end].sheetRow === updates[end - 1].sheetRow + 1) end++;
    const group = updates.slice(start, end);
    sheet.getRange(group[0].sheetRow, 1, group.length, COLUMNS.length)
      .setValues(group.map((item) => item.values));
    start = end;
  }

  if (inserts.length) {
    const firstInsertRow = sheet.getLastRow() + 1;
    sheet.getRange(firstInsertRow, 1, inserts.length, COLUMNS.length).setValues(inserts);
  }
  SpreadsheetApp.flush();
  return { inserted: inserts.length, updated: updates.length };
}

function constantTimeEquals_(a, b) {
  a = String(a);
  b = String(b);
  if (!a || a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return difference === 0;
}

function json_(value) {
  return ContentService.createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}
