// ========== CONFIG ==========
var SETTINGS_SHEET = 'Settings';
var REPORTS_SHEET = 'Reports';
var WORKITEMS_SHEET = 'WorkItems';
var FOLDER_ROOT = 'DailyReport_Fotos';

// ========== WEB APP ENTRY ==========
function doGet(e) {
  var page = (e && e.parameter && e.parameter.page) ? e.parameter.page : 'form';

  if (page === 'admin') {
    var html = HtmlService.createTemplateFromFile('Admin');
    return html.evaluate()
      .setTitle('Daily Report - Dashboard Admin')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');
  }

  var html = HtmlService.createTemplateFromFile('Index');
  return html.evaluate()
    .setTitle('Daily Report - Input Laporan')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

// ========== GET SETTINGS ==========
function getSettings() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SETTINGS_SHEET);
  if (!sheet) return {project_name: '', header_title: '', admin_emails: '', stakeholder_emails: '', header_banner_url: '', sections: []};

  var data = sheet.getDataRange().getValues();
  var settings = {project_name: '', header_title: '', admin_emails: '', stakeholder_emails: '', header_banner_url: '', sections: []};

  for (var i = 1; i < data.length; i++) {
    var key = String(data[i][0]).trim();
    var val = String(data[i][1]).trim();
    if (key === 'Project Name') settings.project_name = val;
    if (key === 'Header Title') settings.header_title = val;
    if (key === 'Admin Emails') settings.admin_emails = val;
    if (key === 'Stakeholder Emails') settings.stakeholder_emails = val;
    if (key === 'Header Banner URL') settings.header_banner_url = val;
    if (key === 'Section') settings.sections.push(val);
  }

  return settings;
}

// ========== GENERATE REPORT ID ==========
function generateReportId() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(REPORTS_SHEET);
  if (!sheet) return 'R-0001';

  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) return 'R-0001';

  var lastId = sheet.getRange(lastRow, 1).getValue();
  var num = parseInt(String(lastId).replace('R-', '')) || 0;
  return 'R-' + String(num + 1).padStart(4, '0');
}

// ========== SUBMIT REPORT ==========
function submitReport(formData) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var reportsSheet = ss.getSheetByName(REPORTS_SHEET);
    var workItemsSheet = ss.getSheetByName(WORKITEMS_SHEET);
    if (!reportsSheet) return {status:'error', message:'Sheet Reports tidak ditemukan. Jalankan setupSpreadsheet() dulu.'};

    if (!formData.section) return {status:'error', message:'Section wajib dipilih'};
    if (!formData.tanggal) return {status:'error', message:'Tanggal Laporan wajib diisi'};
    if (!formData.kegiatan || formData.kegiatan.length === 0) return {status:'error', message:'Minimal 1 Kegiatan wajib diisi'};

    for (var k = 0; k < formData.kegiatan.length; k++) {
      var item = formData.kegiatan[k];
      if (!item.nama) return {status:'error', message:'Nama Kegiatan #' + (k + 1) + ' wajib diisi'};
      var prog = parseFloat(item.progress);
      if (isNaN(prog) || prog < 0 || prog > 100) return {status:'error', message:'Progress "' + item.nama + '" harus antara 0-100'};
    }

    var linkFolder = '';
    if (formData.fotos && formData.fotos.length > 0) {
      linkFolder = uploadPhotosToDrive(formData.fotos, formData.section, formData.tanggal);
    }

    var reportId = generateReportId();

    reportsSheet.appendRow([
      reportId,
      new Date(),
      formData.section,
      formData.tanggal,
      formData.nama_pelapor || '',
      formData.cuaca || '',
      parseInt(formData.tenaga_kerja) || 0,
      formData.alat_berat || '',
      (formData.kendala && formData.kendala.length > 0) ? formData.kendala.join('\n') : '',
      linkFolder,
      'Menunggu Approval',
      '',
      '',
      ''
    ]);

    if (workItemsSheet) {
      for (var w = 0; w < formData.kegiatan.length; w++) {
        var wi = formData.kegiatan[w];
        workItemsSheet.appendRow([
          reportId,
          w + 1,
          wi.nama,
          parseFloat(wi.progress) || 0,
          wi.keterangan || ''
        ]);
      }
    }

    var settings = getSettings();
    if (settings.admin_emails) {
      notifyAdmin(settings, reportId, formData);
    }

    return {status:'ok', message:'Laporan berhasil disubmit! Menunggu approval admin.', report_id: reportId};

  } catch (err) {
    return {status:'error', message:'Gagal submit: ' + err.toString()};
  }
}

// ========== NOTIFY ADMIN ==========
function notifyAdmin(settings, reportId, formData) {
  try {
    var emails = settings.admin_emails.split(',').map(function(e){ return e.trim(); }).filter(function(e){ return e.length > 0; });
    if (emails.length === 0) return;

    var subject = 'Laporan Harian Baru - ' + settings.project_name + ' (' + formData.section + ')';

    var kegiatanText = '';
    for (var i = 0; i < formData.kegiatan.length; i++) {
      var item = formData.kegiatan[i];
      kegiatanText += (i + 1) + '. ' + item.nama + ' - <strong>' + item.progress + '%</strong>';
      if (item.keterangan) kegiatanText += ' <em>(' + item.keterangan + ')</em>';
      kegiatanText += '<br>';
    }

    var body = '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">';
    body += '<div style="background:linear-gradient(135deg,#1B4F72,#2980b9);color:white;padding:20px;border-radius:12px 12px 0 0;">';
    body += '<h2 style="margin:0;font-size:18px;">Laporan Harian Baru Masuk</h2>';
    body += '<p style="margin:4px 0 0;font-size:13px;opacity:0.8;">Menunggu approval Anda</p></div>';
    body += '<div style="background:white;padding:20px;border:1px solid #eee;border-top:none;border-radius:0 0 12px 12px;">';
    body += '<table style="width:100%;font-size:14px;border-collapse:collapse;">';
    body += '<tr><td style="padding:8px 0;color:#7f8c8d;width:130px;">Proyek</td><td><strong>' + settings.project_name + '</strong></td></tr>';
    body += '<tr><td style="padding:8px 0;color:#7f8c8d;">Section</td><td>' + formData.section + '</td></tr>';
    body += '<tr><td style="padding:8px 0;color:#7f8c8d;">Tanggal</td><td>' + formData.tanggal + '</td></tr>';
    body += '<tr><td style="padding:8px 0;color:#7f8c8d;">Pelapor</td><td>' + (formData.nama_pelapor || '-') + '</td></tr>';
    body += '<tr><td style="padding:8px 0;color:#7f8c8d;">Cuaca</td><td>' + (formData.cuaca || '-') + '</td></tr>';
    body += '<tr><td style="padding:8px 0;color:#7f8c8d;">Tenaga Kerja</td><td>' + (formData.tenaga_kerja || '0') + ' orang</td></tr>';
    body += '<tr><td style="padding:8px 0;color:#7f8c8d;">Alat Berat</td><td>' + (formData.alat_berat || '-') + '</td></tr>';
    if (formData.kendala && formData.kendala.length > 0) {
      var kendalaText = '';
      for (var k = 0; k < formData.kendala.length; k++) {
        if (formData.kendala[k]) kendalaText += (k + 1) + '. ' + formData.kendala[k] + '<br>';
      }
      body += '<tr><td style="padding:8px 0;color:#7f8c8d;vertical-align:top;">Kendala</td><td style="color:#e74c3c;">' + kendalaText + '</td></tr>';
    }
    body += '</table>';
    body += '<hr style="border:none;border-top:1px solid #eee;margin:12px 0;">';
    body += '<h3 style="font-size:14px;color:#2c3e50;margin-bottom:8px;">Progress Pekerjaan</h3>';
    body += '<div style="background:#f8f9fa;padding:12px;border-radius:8px;font-size:13px;">' + kegiatanText + '</div>';
    body += '<div style="text-align:center;margin-top:16px;">';
    body += '<a href="' + ScriptApp.getService().getUrl() + '?page=admin" style="display:inline-block;background:#E67E22;color:white;padding:12px 30px;text-decoration:none;border-radius:8px;font-weight:700;">Buka Dashboard Admin</a>';
    body += '</div></div></div>';

    MailApp.sendEmail({to: emails.join(','), subject: subject, htmlBody: body});

  } catch (err) {
    Logger.log('Notify admin error: ' + err.toString());
  }
}

// ========== UPLOAD PHOTOS TO DRIVE ==========
function uploadPhotosToDrive(fotos, section, tanggal) {
  try {
    var rootFolders = DriveApp.getFoldersByName(FOLDER_ROOT);
    var rootFolder = rootFolders.hasNext() ? rootFolders.next() : DriveApp.createFolder(FOLDER_ROOT);

    var sectionFolders = rootFolder.getFoldersByName(section);
    var sectionFolder = sectionFolders.hasNext() ? sectionFolders.next() : rootFolder.createFolder(section);

    var dateFolderName = tanggal.replace(/-/g, '');
    var dateFolders = sectionFolder.getFoldersByName(dateFolderName);
    var dateFolder = dateFolders.hasNext() ? dateFolders.next() : sectionFolder.createFolder(dateFolderName);

    for (var i = 0; i < fotos.length; i++) {
      var foto = fotos[i];
      var blob = Utilities.newBlob(Utilities.base64Decode(foto.data), foto.mimeType, foto.name);
      var file = dateFolder.createFile(blob);
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    }

    return dateFolder.getUrl();
  } catch (err) {
    Logger.log('Upload foto error: ' + err.toString());
    return '';
  }
}

// ========== HELPER: COLUMN MAP (auto-detect dari header) ==========
function getReportsColumnMap(reportsSheet) {
  var headers = reportsSheet.getRange(1, 1, 1, reportsSheet.getLastColumn()).getValues()[0];
  var map = {};
  for (var i = 0; i < headers.length; i++) {
    var h = String(headers[i]).trim().toLowerCase();
    if (h === 'report id') map.report_id = i;
    if (h === 'timestamp') map.timestamp = i;
    if (h === 'section') map.section = i;
    if (h === 'tanggal' || h === 'tanggal laporan') map.tanggal = i;
    if (h === 'nama pelapor') map.nama_pelapor = i;
    if (h === 'cuaca') map.cuaca = i;
    if (h === 'tenaga kerja' || h === 'jumlah tenaga kerja') map.tenaga_kerja = i;
    if (h === 'alat berat') map.alat_berat = i;
    if (h === 'kendala') map.kendala = i;
    if (h === 'link foto' || h === 'link folder foto') map.link_folder = i;
    if (h === 'status') map.status = i;
    if (h === 'catatan admin') map.catatan = i;
    if (h === 'approver' || h === 'nama pc approver' || h === 'nama approver') map.approver = i;
    if (h === 'waktu approval') map.waktu_approval = i;
  }
  return map;
}

// ========== MIGRATE OLD SHEET (tambah kolom "Kendala" jika belum ada) ==========
function migrateReportsSheet() {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(REPORTS_SHEET);
    if (!sheet) return {status:'error', message:'Sheet Reports tidak ditemukan'};

    var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    var hasKendala = false;
    var alatBeratCol = -1;
    for (var i = 0; i < headers.length; i++) {
      var h = String(headers[i]).trim().toLowerCase();
      if (h === 'kendala') hasKendala = true;
      if (h === 'alat berat') alatBeratCol = i + 1;
    }

    if (hasKendala) {
      return {status:'ok', message:'Sheet sudah memiliki kolom Kendala. Tidak perlu migrasi.'};
    }

    if (alatBeratCol === -1) {
      return {status:'error', message:'Kolom "Alat Berat" tidak ditemukan. Header sheet tidak sesuai.'};
    }

    sheet.insertColumnAfter(alatBeratCol);
    sheet.getRange(1, alatBeratCol + 1).setValue('Kendala').setFontWeight('bold').setBackground('#1B4F72').setFontColor('white');

    return {status:'ok', message:'Kolom "Kendala" berhasil ditambahkan setelah "Alat Berat". Data existing sudah bergeser otomatis. Silakan deploy ulang dan test.'};

  } catch (err) {
    return {status:'error', message:'Gagal migrasi: ' + err.toString()};
  }
}

// ========== GET REPORTS ==========
function getReports(filter) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var reportsSheet = ss.getSheetByName(REPORTS_SHEET);
  var workItemsSheet = ss.getSheetByName(WORKITEMS_SHEET);
  if (!reportsSheet) return [];

  var colMap = getReportsColumnMap(reportsSheet);
  var data = reportsSheet.getDataRange().getValues();
  var allWorkItems = [];
  if (workItemsSheet && workItemsSheet.getLastRow() > 1) {
    allWorkItems = workItemsSheet.getDataRange().getValues();
  }

  var reports = [];
  for (var i = 1; i < data.length; i++) {
    var reportId = String(data[i][colMap.report_id] || '').trim();
    var section = String(data[i][colMap.section] || '').trim();
    var status = String(data[i][colMap.status] || '').trim();
    var tanggal = String(data[i][colMap.tanggal] || '').trim();

    if (filter) {
      if (filter.section && filter.section !== '' && section !== filter.section) continue;
      if (filter.status && filter.status !== '' && status !== filter.status) continue;
      if (filter.tanggal && filter.tanggal !== '' && tanggal !== filter.tanggal) continue;
    }

    var items = [];
    for (var j = 0; j < allWorkItems.length; j++) {
      if (String(allWorkItems[j][0]).trim() === reportId) {
        items.push({
          no: allWorkItems[j][1],
          nama: String(allWorkItems[j][2]).trim(),
          progress: allWorkItems[j][3],
          keterangan: String(allWorkItems[j][4]).trim()
        });
      }
    }

    reports.push({
      report_id: reportId,
      timestamp: formatDate(data[i][colMap.timestamp]),
      section: section,
      tanggal: tanggal,
      nama_pelapor: String(data[i][colMap.nama_pelapor] || '').trim(),
      cuaca: String(data[i][colMap.cuaca] || '').trim(),
      tenaga_kerja: data[i][colMap.tenaga_kerja] || 0,
      alat_berat: String(data[i][colMap.alat_berat] || '').trim(),
      kendala: String(data[i][colMap.kendala] || '').trim(),
      link_folder: String(data[i][colMap.link_folder] || '').trim(),
      status: status,
      catatan: String(data[i][colMap.catatan] || '').trim(),
      approver: String(data[i][colMap.approver] || '').trim(),
      waktu_approval: formatDate(data[i][colMap.waktu_approval]),
      kegiatan: items
    });
  }

  return reports;
}

// ========== APPROVE REPORT ==========
function approveReport(reportId, approverEmail) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(REPORTS_SHEET);
    if (!sheet) return {status:'error', message:'Sheet Reports tidak ditemukan'};

    var colMap = getReportsColumnMap(sheet);
    var now = new Date();

    var data = sheet.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][colMap.report_id] || '').trim() === reportId) {
        var rowNum = i + 1;
        sheet.getRange(rowNum, colMap.status + 1).setValue('Approved');
        if (colMap.catatan !== undefined) sheet.getRange(rowNum, colMap.catatan + 1).setValue('');
        sheet.getRange(rowNum, (colMap.approver || colMap.status + 2) + 1).setValue(approverEmail || '');
        sheet.getRange(rowNum, (colMap.waktu_approval || colMap.status + 3) + 1).setValue(now);

        sendApprovedEmail(reportId, data[i], colMap, approverEmail);
        return {status:'ok', message:'Laporan ' + reportId + ' berhasil di-approve!'};
      }
    }

    return {status:'error', message:'Laporan ' + reportId + ' tidak ditemukan'};

  } catch (err) {
    return {status:'error', message:'Gagal approve: ' + err.toString()};
  }
}

// ========== REJECT REPORT ==========
function rejectReport(reportId, catatan) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(REPORTS_SHEET);
    if (!sheet) return {status:'error', message:'Sheet Reports tidak ditemukan'};

    var colMap = getReportsColumnMap(sheet);

    var data = sheet.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][colMap.report_id] || '').trim() === reportId) {
        var rowNum = i + 1;
        sheet.getRange(rowNum, colMap.status + 1).setValue('Ditolak');
        if (colMap.catatan !== undefined) sheet.getRange(rowNum, colMap.catatan + 1).setValue(catatan || 'Ditolak oleh admin');
        return {status:'ok', message:'Laporan ' + reportId + ' ditolak.'};
      }
    }

    return {status:'error', message:'Laporan ' + reportId + ' tidak ditemukan'};

  } catch (err) {
    return {status:'error', message:'Gagal tolak: ' + err.toString()};
  }
}

// ========== SEND APPROVED EMAIL ==========
function sendApprovedEmail(reportId, row, colMap, approverEmail) {
  try {
    var settings = getSettings();
    if (!settings.stakeholder_emails) return;
    var emails = settings.stakeholder_emails.split(',').map(function(e){ return e.trim(); }).filter(function(e){ return e.length > 0; });
    if (emails.length === 0) return;

    var workItemsSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(WORKITEMS_SHEET);
    var kegiatanText = '';
    if (workItemsSheet && workItemsSheet.getLastRow() > 1) {
      var wiData = workItemsSheet.getDataRange().getValues();
      for (var w = 1; w < wiData.length; w++) {
        if (String(wiData[w][0]).trim() === reportId) {
          kegiatanText += wiData[w][1] + '. ' + wiData[w][2] + ' - <strong>' + wiData[w][3] + '%</strong>';
          if (wiData[w][4]) kegiatanText += ' <em>(' + wiData[w][4] + ')</em>';
          kegiatanText += '<br>';
        }
      }
    }

    var subject = 'Laporan Harian (Approved) - ' + settings.project_name + ' - ' + String(row[colMap.tanggal] || '').trim();

    var body = '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">';
    body += '<div style="background:linear-gradient(135deg,#1e8449,#27ae60);color:white;padding:20px;border-radius:12px 12px 0 0;">';
    body += '<h2 style="margin:0;font-size:18px;">Laporan Harian (Sudah Di-approve)</h2>';
    body += '<p style="margin:4px 0 0;font-size:13px;opacity:0.8;">Verified by: ' + (approverEmail || '') + '</p></div>';
    body += '<div style="background:white;padding:20px;border:1px solid #eee;border-top:none;border-radius:0 0 12px 12px;">';
    body += '<table style="width:100%;font-size:14px;">';
    body += '<tr><td style="padding:6px 0;color:#7f8c8d;width:120px;">Proyek</td><td><strong>' + settings.project_name + '</strong></td></tr>';
    body += '<tr><td style="padding:6px 0;color:#7f8c8d;">Section</td><td>' + String(row[colMap.section] || '').trim() + '</td></tr>';
    body += '<tr><td style="padding:6px 0;color:#7f8c8d;">Tanggal</td><td>' + String(row[colMap.tanggal] || '').trim() + '</td></tr>';
    body += '<tr><td style="padding:6px 0;color:#7f8c8d;">Pelapor</td><td>' + String(row[colMap.nama_pelapor] || '').trim() + '</td></tr>';
    body += '<tr><td style="padding:6px 0;color:#7f8c8d;">Cuaca</td><td>' + String(row[colMap.cuaca] || '').trim() + '</td></tr>';
    body += '<tr><td style="padding:6px 0;color:#7f8c8d;">Tenaga Kerja</td><td>' + (row[colMap.tenaga_kerja] || 0) + ' orang</td></tr>';
    body += '<tr><td style="padding:6px 0;color:#7f8c8d;">Alat Berat</td><td>' + String(row[colMap.alat_berat] || '').trim() + '</td></tr>';
    var kendalaVal = String(row[colMap.kendala] || '').trim();
    if (kendalaVal) {
      var kendalaLines = kendalaVal.split('\n');
      var kendalaHtml = '';
      for (var k = 0; k < kendalaLines.length; k++) {
        if (kendalaLines[k].trim()) kendalaHtml += (k + 1) + '. ' + kendalaLines[k].replace(/^\d+\.\s*/, '') + '<br>';
      }
      body += '<tr><td style="padding:6px 0;color:#7f8c8d;vertical-align:top;">Kendala</td><td style="color:#e74c3c;">' + kendalaHtml + '</td></tr>';
    }
    body += '</table>';
    if (kegiatanText) {
      body += '<hr style="border:none;border-top:1px solid #eee;margin:12px 0;">';
      body += '<h3 style="font-size:14px;color:#2c3e50;margin-bottom:8px;">Progress Pekerjaan</h3>';
      body += '<div style="background:#f8f9fa;padding:12px;border-radius:8px;font-size:13px;">' + kegiatanText + '</div>';
    }
    var linkFoto = String(row[colMap.link_folder] || '').trim();
    if (linkFoto) {
      body += '<p style="margin-top:12px;"><a href="' + linkFoto + '" style="color:#2980b9;font-size:13px;">Lihat Foto Dokumentasi</a></p>';
    }
    body += '</div></div>';

    MailApp.sendEmail({to: emails.join(','), subject: subject, htmlBody: body});

  } catch (err) {
    Logger.log('Send approved email error: ' + err.toString());
  }
}

// ========== DASHBOARD STATS ==========
function getDashboardStats() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var reportsSheet = ss.getSheetByName(REPORTS_SHEET);
  var settings = getSettings();

  var stats = {
    project_name: settings.project_name,
    sections: settings.sections,
    total: 0,
    pending: 0,
    approved: 0,
    rejected: 0,
    per_section: {}
  };

  for (var s = 0; s < settings.sections.length; s++) {
    stats.per_section[settings.sections[s]] = {total: 0, pending: 0, approved: 0, rejected: 0};
  }

  if (!reportsSheet || reportsSheet.getLastRow() <= 1) return stats;

  var colMap = getReportsColumnMap(reportsSheet);
  var data = reportsSheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    var section = String(data[i][colMap.section] || '').trim();
    var status = String(data[i][colMap.status] || '').trim();

    stats.total++;

    if (status === 'Menunggu Approval') stats.pending++;
    else if (status === 'Approved') stats.approved++;
    else if (status === 'Ditolak') stats.rejected++;

    if (stats.per_section[section]) {
      stats.per_section[section].total++;
      if (status === 'Menunggu Approval') stats.per_section[section].pending++;
      else if (status === 'Approved') stats.per_section[section].approved++;
      else if (status === 'Ditolak') stats.per_section[section].rejected++;
    }
  }

  return stats;
}

// ========== IS ADMIN ==========
function isAdmin(email) {
  if (!email) return false;
  var settings = getSettings();

  // Jika admin_emails kosong, izinkan login pertama kali
  if (!settings.admin_emails || settings.admin_emails.trim() === '') return true;

  var emails = settings.admin_emails.split(',').map(function(e){ return e.trim().toLowerCase(); });
  return emails.indexOf(email.toLowerCase().trim()) !== -1;
}

// ========== DEBUG: CEK SETTINGS ==========
function debugSettings() {
  var settings = getSettings();
  return {
    project_name: settings.project_name,
    header_title: settings.header_title,
    admin_emails_raw: settings.admin_emails,
    admin_emails_array: settings.admin_emails ? settings.admin_emails.split(',').map(function(e){ return e.trim(); }) : [],
    stakeholder_emails: settings.stakeholder_emails,
    sections: settings.sections,
    spreadsheet_url: SpreadsheetApp.getActiveSpreadsheet().getUrl()
  };
}

// ========== MANAGE SECTIONS ==========
function addSection(name) {
  try {
    if (!name || !name.trim()) return {status:'error', message:'Nama section wajib diisi'};
    name = name.trim();

    var settings = getSettings();
    if (settings.sections.indexOf(name) !== -1) return {status:'error', message:'Section "' + name + '" sudah ada'};

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(SETTINGS_SHEET);
    sheet.appendRow(['Section', name]);

    return {status:'ok', message:'Section "' + name + '" berhasil ditambahkan'};
  } catch (err) {
    return {status:'error', message:'Gagal tambah section: ' + err.toString()};
  }
}

function deleteSection(name) {
  try {
    if (!name) return {status:'error', message:'Nama section tidak valid'};

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(SETTINGS_SHEET);
    var data = sheet.getDataRange().getValues();

    for (var i = 1; i < data.length; i++) {
      if (String(data[i][0]).trim() === 'Section' && String(data[i][1]).trim() === name) {
        sheet.deleteRow(i + 1);
        return {status:'ok', message:'Section "' + name + '" berhasil dihapus'};
      }
    }

    return {status:'error', message:'Section "' + name + '" tidak ditemukan'};
  } catch (err) {
    return {status:'error', message:'Gagal hapus section: ' + err.toString()};
  }
}

// ========== MANAGE SETTINGS ==========
function updateSettings(data) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(SETTINGS_SHEET);
    if (!sheet) return {status:'error', message:'Sheet Settings tidak ditemukan'};

    var rowData = sheet.getDataRange().getValues();

    for (var i = 1; i < rowData.length; i++) {
      var key = String(rowData[i][0]).trim();
      if (key === 'Project Name') sheet.getRange(i + 1, 2).setValue(data.project_name || '');
      if (key === 'Header Title') sheet.getRange(i + 1, 2).setValue(data.header_title || '');
      if (key === 'Admin Emails') sheet.getRange(i + 1, 2).setValue(data.admin_emails || '');
      if (key === 'Stakeholder Emails') sheet.getRange(i + 1, 2).setValue(data.stakeholder_emails || '');
      if (key === 'Header Banner URL') sheet.getRange(i + 1, 2).setValue(data.header_banner_url || '');
    }

    // Add Header Banner URL row if missing
    var hasBannerRow = false;
    for (var j = 1; j < rowData.length; j++) {
      if (String(rowData[j][0]).trim() === 'Header Banner URL') { hasBannerRow = true; break; }
    }
    if (!hasBannerRow) {
      sheet.appendRow(['Header Banner URL', data.header_banner_url || '']);
    }

    return {status:'ok', message:'Pengaturan berhasil disimpan'};
  } catch (err) {
    return {status:'error', message:'Gagal simpan pengaturan: ' + err.toString()};
  }
}

// ========== UPLOAD BANNER IMAGE ==========
function uploadBannerImage(base64Data, fileName, mimeType) {
  try {
    var folder = getOrCreateFolder('Daily Report - Banner');
    var blob = Utilities.newBlob(Utilities.base64Decode(base64Data), mimeType, fileName);
    var file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    var fileId = file.getId();
    var viewUrl = 'https://drive.google.com/uc?export=view&id=' + fileId;

    return {status: 'ok', url: viewUrl, message: 'Banner berhasil di-upload'};
  } catch (err) {
    return {status: 'error', message: 'Gagal upload banner: ' + err.toString()};
  }
}

function getOrCreateFolder(folderName) {
  var folders = DriveApp.getFoldersByName(folderName);
  if (folders.hasNext()) return folders.next();
  return DriveApp.createFolder(folderName);
}

// ========== HELPER: FORMAT DATE ==========
function formatDate(d) {
  if (!d) return '-';
  if (d instanceof Date) {
    return Utilities.formatDate(d, Session.getScriptTimeZone(), 'dd MMM yyyy HH:mm');
  }
  return String(d);
}

// ========== DEBUG INFO ==========
function getDebugInfo() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var result = {
    spreadsheet_name: ss.getName(),
    spreadsheet_url: ss.getUrl(),
    sheets: {},
    settings_raw: [],
    reports_raw: [],
    workitems_raw: [],
    errors: []
  };

  // Check Settings sheet
  var settingsSheet = ss.getSheetByName(SETTINGS_SHEET);
  if (settingsSheet) {
    result.sheets.Settings = {rows: settingsSheet.getLastRow(), cols: settingsSheet.getLastColumn()};
    if (settingsSheet.getLastRow() > 1) {
      result.settings_raw = settingsSheet.getDataRange().getValues();
    }
  } else {
    result.errors.push('Sheet "Settings" tidak ditemukan!');
  }

  // Check Reports sheet
  var reportsSheet = ss.getSheetByName(REPORTS_SHEET);
  if (reportsSheet) {
    result.sheets.Reports = {rows: reportsSheet.getLastRow(), cols: reportsSheet.getLastColumn()};
    if (reportsSheet.getLastRow() > 1) {
      result.reports_raw = reportsSheet.getDataRange().getValues();
    }
  } else {
    result.errors.push('Sheet "Reports" tidak ditemukan!');
  }

  // Check WorkItems sheet
  var workItemsSheet = ss.getSheetByName(WORKITEMS_SHEET);
  if (workItemsSheet) {
    result.sheets.WorkItems = {rows: workItemsSheet.getLastRow(), cols: workItemsSheet.getLastColumn()};
    if (workItemsSheet.getLastRow() > 1) {
      result.workitems_raw = workItemsSheet.getDataRange().getValues();
    }
  } else {
    result.errors.push('Sheet "WorkItems" tidak ditemukan!');
  }

  return result;
}

// ========== SETUP SPREADSHEET (RUN ONCE) ==========
function setupSpreadsheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  var settingsSheet = ss.getSheetByName(SETTINGS_SHEET);
  if (!settingsSheet) {
    settingsSheet = ss.insertSheet(SETTINGS_SHEET);
    settingsSheet.appendRow(['Key', 'Value']);
    settingsSheet.appendRow(['Project Name', 'Nama Proyek']);
    settingsSheet.appendRow(['Header Title', 'Laporan Harian Lapangan']);
    settingsSheet.appendRow(['Admin Emails', 'admin@perusahaan.com']);
    settingsSheet.appendRow(['Stakeholder Emails', 'pm@perusahaan.com, owner@perusahaan.com']);
    settingsSheet.appendRow(['Header Banner URL', '']);
    settingsSheet.appendRow(['Section', 'Tower A']);
    settingsSheet.appendRow(['Section', 'Tower B']);
    settingsSheet.getRange(1, 1, 1, 2).setFontWeight('bold').setBackground('#1B4F72').setFontColor('white');
    settingsSheet.setColumnWidth(1, 160);
    settingsSheet.setColumnWidth(2, 300);
  }

  var reportsSheet = ss.getSheetByName(REPORTS_SHEET);
  if (!reportsSheet) {
    reportsSheet = ss.insertSheet(REPORTS_SHEET);
    reportsSheet.appendRow([
      'Report ID', 'Timestamp', 'Section', 'Tanggal', 'Nama Pelapor',
      'Cuaca', 'Tenaga Kerja', 'Alat Berat', 'Kendala', 'Link Foto',
      'Status', 'Catatan Admin', 'Approver', 'Waktu Approval'
    ]);
    reportsSheet.getRange(1, 1, 1, 14).setFontWeight('bold').setBackground('#1B4F72').setFontColor('white');
    reportsSheet.setColumnWidth(1, 100);
    reportsSheet.setColumnWidth(2, 140);
    reportsSheet.setColumnWidth(3, 120);
    reportsSheet.setColumnWidth(4, 100);
    reportsSheet.setColumnWidth(5, 130);
    reportsSheet.setColumnWidth(9, 200);
    reportsSheet.setColumnWidth(11, 130);
  }

  var workItemsSheet = ss.getSheetByName(WORKITEMS_SHEET);
  if (!workItemsSheet) {
    workItemsSheet = ss.insertSheet(WORKITEMS_SHEET);
    workItemsSheet.appendRow([
      'Report ID', 'No', 'Nama Kegiatan', 'Progress (%)', 'Keterangan'
    ]);
    workItemsSheet.getRange(1, 1, 1, 5).setFontWeight('bold').setBackground('#1B4F72').setFontColor('white');
    workItemsSheet.setColumnWidth(1, 100);
    workItemsSheet.setColumnWidth(3, 200);
    workItemsSheet.setColumnWidth(5, 200);
  }

  Logger.log('Spreadsheet berhasil dibuat! 3 sheets: Settings, Reports, WorkItems');
}
