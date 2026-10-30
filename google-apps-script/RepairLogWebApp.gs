/**
 * ATV Service Hub → Google Sheets Repair Log Web App
 *
 * วิธีใช้:
 * 1) เปิด Google Sheet แล้วไปที่ Extensions → Apps Script
 * 2) วางโค้ดนี้แทนโค้ดเดิม หรือสร้างไฟล์ใหม่
 * 3) Deploy → New deployment → Web app
 * 4) Execute as: Me
 * 5) Who has access: Anyone
 * 6) นำ URL ที่ลงท้ายด้วย /exec ไปบันทึกในหน้า
 *    โมดูลช่าง → ตั้งค่า → ตั้งค่าการส่งข้อมูล Google Sheet
 */

const CONFIG = {
  spreadsheetId: '1aZVFSY2sx2Qsog-6E_0oGStpYVtGaP-vKBhsMhxSsyA',
  sheetName: 'RepairLog',
  timezone: 'Asia/Bangkok',
};

// ต้องตรงกับคอลัมน์ที่ ATV Service Hub ส่งมา ทุกตัวและทุกลำดับ
const EXPECTED_COLUMNS = [
  'รหัสรายการ',
  'วันที่และเวลา',
  'วันที่แก้ไข',
  'เวลาซ่อมรวม',
  'เบอร์รถ',
  'รายละเอียด',
  'อะไหล่เบิกซ่อม',
  'ชื่อช่างผู้ทำรายการ',
  'ชั่วโมงสะสม',
  'สถานะ',
  'ตัวเลือก',
  'รหัสแจ้งซ่อมจากไกด์',
  'ประเภท',
];

/**
 * รับข้อมูล POST จากแอป
 */
function doPost(event) {
  try {
    const payload = parsePayload_(event);
    validatePayload_(payload);

    const sheet = getRepairLogSheet_();
    ensureHeader_(sheet, payload.columns);

    const rows = payload.rows.map(function(row) {
      return row.map(function(value, index) {
        return readableValue_(value, index);
      });
    });

    if (rows.length > 0) {
      sheet
        .getRange(sheet.getLastRow() + 1, 1, rows.length, EXPECTED_COLUMNS.length)
        .setValues(rows);
    }

    formatSheet_(sheet);

    return jsonResponse_({
      ok: true,
      message: 'บันทึกประวัติซ่อมลง Google Sheets แล้ว',
      sheetName: CONFIG.sheetName,
      receivedRows: rows.length,
      receivedColumns: EXPECTED_COLUMNS.length,
      receivedAt: formatDate_(new Date()),
    });
  } catch (error) {
    console.error(error && error.stack ? error.stack : error);
    return jsonResponse_({
      ok: false,
      error: error && error.message ? error.message : String(error),
    });
  }
}

/**
 * เปิด URL /exec ในเบราว์เซอร์เพื่อดูสถานะการเชื่อมต่อ
 */
function doGet() {
  return jsonResponse_({
    ok: true,
    service: 'ATV Service Hub Repair Log',
    sheetName: CONFIG.sheetName,
    columns: EXPECTED_COLUMNS,
    message: 'Google Apps Script พร้อมรับข้อมูลแล้ว',
  });
}

function parsePayload_(event) {
  if (!event || !event.postData || typeof event.postData.contents !== 'string') {
    throw new Error('ไม่พบข้อมูล POST จากแอป');
  }

  let payload;
  try {
    payload = JSON.parse(event.postData.contents);
  } catch (error) {
    throw new Error('ข้อมูลที่ส่งมาไม่ใช่ JSON ที่ถูกต้อง');
  }

  if (!payload || typeof payload !== 'object') {
    throw new Error('รูปแบบข้อมูลไม่ถูกต้อง');
  }

  return payload;
}

function validatePayload_(payload) {
  if (payload.source !== 'guide-module-dashboard') {
    throw new Error('แหล่งข้อมูลไม่ตรงกับ ATV Service Hub');
  }

  if (payload.sheetName !== CONFIG.sheetName) {
    throw new Error('ชื่อชุดข้อมูลไม่ตรงกับ RepairLog');
  }

  if (!Array.isArray(payload.columns)) {
    throw new Error('ไม่พบรายการชื่อคอลัมน์');
  }

  if (payload.columns.length !== EXPECTED_COLUMNS.length) {
    throw new Error('จำนวนคอลัมน์ไม่ครบ: ได้รับ ' + payload.columns.length + ' แต่ต้องมี ' + EXPECTED_COLUMNS.length);
  }

  payload.columns.forEach(function(column, index) {
    if (column !== EXPECTED_COLUMNS[index]) {
      throw new Error('คอลัมน์ลำดับที่ ' + (index + 1) + ' ไม่ตรง: ' + column);
    }
  });

  if (!Array.isArray(payload.rows) || payload.rows.length === 0) {
    throw new Error('ไม่มีแถวข้อมูลสำหรับบันทึก');
  }

  if (payload.rows.length > 1000) {
    throw new Error('ส่งข้อมูลได้ไม่เกิน 1,000 รายการต่อครั้ง');
  }

  payload.rows.forEach(function(row, rowIndex) {
    if (!Array.isArray(row) || row.length !== EXPECTED_COLUMNS.length) {
      throw new Error('แถวที่ ' + (rowIndex + 1) + ' มีจำนวนคอลัมน์ไม่ครบ');
    }
  });
}

function getRepairLogSheet_() {
  const spreadsheet = SpreadsheetApp.openById(CONFIG.spreadsheetId);
  let sheet = spreadsheet.getSheetByName(CONFIG.sheetName);

  if (!sheet) {
    sheet = spreadsheet.insertSheet(CONFIG.sheetName);
  }

  return sheet;
}

function ensureHeader_(sheet, columns) {
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, columns.length).setValues([columns]);
    return;
  }

  const currentHeader = sheet.getRange(1, 1, 1, columns.length).getValues()[0];
  const isSame = columns.every(function(column, index) {
    return String(currentHeader[index] || '') === column;
  });

  if (!isSame) {
    throw new Error('หัวตารางแถวแรกไม่ตรงกับ 13 คอลัมน์ของแอป กรุณาตรวจสอบชีต RepairLog');
  }
}

function readableValue_(value, columnIndex) {
  if (value === null || value === undefined || value === '') {
    return '';
  }

  // วันที่จากแอปเป็น ISO เช่น 2026-10-30T11:00:00.000Z
  if (columnIndex === 1 || columnIndex === 2) {
    return readableDate_(value);
  }

  // แปลงข้อความสถานะให้คนหน้างานอ่านตรงกัน
  if (columnIndex === 9) {
    return readableStatus_(String(value));
  }

  if (columnIndex === 10) {
    return readableDecision_(String(value));
  }

  return value;
}

function readableDate_(value) {
  const date = new Date(value);
  if (isNaN(date.getTime())) {
    return String(value);
  }
  return Utilities.formatDate(date, CONFIG.timezone, 'dd/MM/yyyy HH:mm:ss');
}

function readableStatus_(value) {
  const statusMap = {
    'กำลังซ่อม': 'กำลังซ่อม',
    'แจ้งรับรถ': 'แจ้งรับรถแล้ว',
    'เสร็จแล้ว': 'ซ่อมเสร็จแล้ว',
    'ซ่อมเสร็จ': 'ซ่อมเสร็จแล้ว',
  };
  return statusMap[value] || value;
}

function readableDecision_(value) {
  const decisionMap = {
    'แจ้งรับรถ': 'แจ้งรับรถแล้ว',
    'ไม่แจ้งรับรถ': 'ยังไม่แจ้งรับรถ',
  };
  return decisionMap[value] || value;
}

function formatSheet_(sheet) {
  const lastRow = sheet.getLastRow();
  const lastColumn = EXPECTED_COLUMNS.length;
  if (lastRow < 1) return;

  const header = sheet.getRange(1, 1, 1, lastColumn);
  header
    .setFontWeight('bold')
    .setFontColor('#ffffff')
    .setBackground('#1f4e78')
    .setHorizontalAlignment('center');

  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, lastRow, lastColumn).setVerticalAlignment('middle');
  sheet.getRange(2, 1, Math.max(1, lastRow - 1), lastColumn).setWrap(true);
  sheet.autoResizeColumns(1, lastColumn);

  // จำกัดความกว้างคอลัมน์ข้อความไม่ให้ยาวจนอ่านยาก
  [6, 7, 8, 10, 11, 12, 13].forEach(function(column) {
    sheet.setColumnWidth(column, 180);
  });
  sheet.setColumnWidth(1, 150);
  sheet.setColumnWidth(2, 145);
  sheet.setColumnWidth(3, 145);
  sheet.setColumnWidth(4, 110);
  sheet.setColumnWidth(5, 80);
  sheet.setColumnWidth(9, 100);
}

function formatDate_(date) {
  return Utilities.formatDate(date, CONFIG.timezone, 'dd/MM/yyyy HH:mm:ss');
}

function jsonResponse_(body) {
  return ContentService
    .createTextOutput(JSON.stringify(body))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * ทดสอบด้วยข้อมูลจำลองจาก Apps Script editor ได้โดยเรียกฟังก์ชันนี้
 */
function testWriteRepairLog_() {
  const sample = {
    source: 'guide-module-dashboard',
    sheetName: 'RepairLog',
    columns: EXPECTED_COLUMNS,
    rows: [[
      'test-001',
      '2026-10-30T10:00:00.000Z',
      '2026-10-30T11:00:00.000Z',
      '1.0 ชม.',
      12,
      'ตรวจเบรกและเปลี่ยนผ้าเบรก',
      'ผ้าเบรกหน้า 1 ชุด',
      'ช่างทดสอบ',
      2.5,
      'ซ่อมเสร็จ',
      'แจ้งรับรถ',
      'guide-test-001',
      'รายการซ่อม',
    ]],
  };

  validatePayload_(sample);
  const sheet = getRepairLogSheet_();
  ensureHeader_(sheet, sample.columns);
  sheet.getRange(sheet.getLastRow() + 1, 1, 1, EXPECTED_COLUMNS.length)
    .setValues([sample.rows[0].map(function(value, index) { return readableValue_(value, index); })]);
  formatSheet_(sheet);
}
