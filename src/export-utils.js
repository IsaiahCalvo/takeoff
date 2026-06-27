(function () {
  const UNIT_LABEL = { in: 'in', ft: 'ft', yd: 'yd', cm: 'cm', m: 'm' };
  const LEGACY_PATH_DISPLAY_NAME = 'Legacy measurements';
  const UNCATEGORIZED_DISPLAY_NAME = 'Uncategorized';
  const HEADERS = [
    'Page',
    'Name',
    'Type',
    'Length',
    'Unit',
    'Scaled',
    'Path',
    'Category',
    'Group Run Count',
    'Group Total',
    'Group Unit',
    'Visible',
    'Note',
    'Photo Count',
    'Video Count',
    'Attachments',
  ];

  function cleanName(value, fallback) {
    const name = String(value || '').trim();
    return name || fallback;
  }

  function measurementType(measurement) {
    const value = measurement?.shape?.active
      || measurement?.shape?.kind
      || measurement?.drawType
      || measurement?.type
      || 'line';
    const normalized = String(value).toLowerCase();
    if (normalized === 'path') return 'path';
    if (normalized === 'circle') return 'circle';
    if (normalized === 'arc') return 'arc';
    if (measurement?.circle?.center && Number.isFinite(measurement.circle.radius)) return 'circle';
    if (measurement?.arc?.center && Number.isFinite(measurement.arc.radius)) return 'arc';
    return normalized === 'freehand' ? 'freehand' : 'line';
  }

  function exportAggregation() {
    const aggregation = window.TakeoffPathAggregation;
    if (!aggregation || typeof aggregation.buildPathRunGroups !== 'function') {
      throw new Error('TakeoffPathAggregation.buildPathRunGroups is required for measurement exports.');
    }
    return aggregation;
  }

  function roundExportNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) ? Number(number.toFixed(2)) : 0;
  }

  function fallbackNormalizeRunDetails(details = {}) {
    const source = details && typeof details === 'object' && !Array.isArray(details) ? details : {};
    return {
      text: String(source.text ?? ''),
      photos: Array.isArray(source.photos) ? source.photos.filter(item => item && typeof item === 'object' && !Array.isArray(item)) : [],
      videos: Array.isArray(source.videos) ? source.videos.filter(item => item && typeof item === 'object' && !Array.isArray(item)) : [],
    };
  }

  function normalizeRunDetails(details = {}) {
    const helper = window.TakeoffRunDetails;
    if (helper && typeof helper.normalizeRunDetails === 'function') {
      return helper.normalizeRunDetails(details);
    }
    return fallbackNormalizeRunDetails(details);
  }

  function attachmentIndicator(photoCount, videoCount) {
    const parts = [];
    if (photoCount) parts.push(`${photoCount} photo${photoCount === 1 ? '' : 's'}`);
    if (videoCount) parts.push(`${videoCount} video${videoCount === 1 ? '' : 's'}`);
    return parts.join('; ');
  }

  function summaryDetailText(row) {
    const parts = [];
    const note = String(row?.note || '').replace(/\s+/g, ' ').trim();
    if (note) parts.push(`Note: ${note.length > 120 ? `${note.slice(0, 117)}...` : note}`);
    if (row?.attachments) parts.push(`Media: ${row.attachments}`);
    return parts.length ? ` | ${parts.join(' | ')}` : '';
  }

  function categoryDisplayName(run) {
    return cleanName(run?.categoryName, run?.isLegacy ? LEGACY_PATH_DISPLAY_NAME : UNCATEGORIZED_DISPLAY_NAME);
  }

  function breakdownKey(run) {
    return [
      run?.page || 1,
      run?.groupKey || LEGACY_PATH_DISPLAY_NAME,
      run?.pathCategoryVisibilityKey || run?.categoryKey || UNCATEGORIZED_DISPLAY_NAME,
    ].join('\u001f');
  }

  function buildBreakdowns(groups, unit) {
    const breakdowns = new Map();
    (groups || []).forEach((group, groupOrder) => {
      for (const run of group.runs || []) {
        const key = breakdownKey(run);
        let breakdown = breakdowns.get(key);
        if (!breakdown) {
          breakdown = {
            groupOrder,
            path: cleanName(group.displayName || run.pathName, LEGACY_PATH_DISPLAY_NAME),
            category: categoryDisplayName(run),
            runCount: 0,
            total: 0,
          };
          breakdowns.set(key, breakdown);
        }
        breakdown.runCount += 1;
        const total = Number(run.totalsByUnit?.[unit]);
        if (Number.isFinite(total)) breakdown.total += total;
      }
    });
    return breakdowns;
  }

  function attachSummaryGroupKey(row, key) {
    Object.defineProperty(row, '_summaryGroupKey', {
      value: key,
      enumerable: false,
      configurable: true,
    });
    return row;
  }

  function buildExportRows(measurements, options = {}) {
    const unit = options.unit || 'ft';
    const unitLabel = UNIT_LABEL[unit] || unit;
    const aggregation = exportAggregation().buildPathRunGroups(measurements, {
      ...options,
      unit,
      units: [unit],
      totalsScope: 'all',
    });
    const breakdowns = buildBreakdowns(aggregation.groups, unit);
    const rows = [];

    for (const group of aggregation.groups || []) {
      for (const run of group.runs || []) {
        const details = normalizeRunDetails(measurements?.[run.sourceIndex]?.runDetails);
        const photoCount = details.photos.length;
        const videoCount = details.videos.length;
        const breakdown = breakdowns.get(breakdownKey(run)) || {
          groupOrder: 0,
          path: cleanName(group.displayName || run.pathName, LEGACY_PATH_DISPLAY_NAME),
          category: categoryDisplayName(run),
          runCount: 1,
          total: Number(run.totalsByUnit?.[unit]) || 0,
        };
        rows.push({
          _sourceIndex: run.sourceIndex,
          _groupOrder: breakdown.groupOrder,
          _summaryGroupKey: breakdownKey(run),
          page: run.page || 1,
          name: cleanName(run.displayName, `Run ${(run.sourceIndex || 0) + 1}`),
          type: run.measurementType || measurementType(run),
          length: run.scaled ? roundExportNumber(run.totalsByUnit?.[unit]) : null,
          unit: unitLabel,
          scaled: run.scaled ? 'Y' : 'N',
          path: breakdown.path,
          category: breakdown.category,
          groupRunCount: breakdown.runCount,
          groupTotal: roundExportNumber(breakdown.total),
          groupUnit: unitLabel,
          visible: run.isVisible ? 'Y' : 'N',
          note: details.text,
          photoCount,
          videoCount,
          attachments: attachmentIndicator(photoCount, videoCount),
        });
      }
    }

    return rows
      .sort((a, b) => (a.page - b.page) || (a._groupOrder - b._groupOrder) || (a._sourceIndex - b._sourceIndex))
      .map(({ _sourceIndex, _groupOrder, _summaryGroupKey, ...row }) => attachSummaryGroupKey(row, _summaryGroupKey));
  }

  function csvCell(value) {
    if (value == null) return '';
    const text = String(value);
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }

  function formatLength(length) {
    return length == null ? '' : Number(length).toFixed(2);
  }

  function generateCsv(rows) {
    const lines = [HEADERS.join(',')];
    for (const row of rows || []) {
      lines.push([
        row.page,
        row.name,
        row.type,
        formatLength(row.length),
        row.unit,
        row.scaled,
        row.path,
        row.category,
        row.groupRunCount,
        formatLength(row.groupTotal),
        row.groupUnit,
        row.visible,
        row.note,
        row.photoCount,
        row.videoCount,
        row.attachments,
      ].map(csvCell).join(','));
    }
    return lines.join('\r\n');
  }

  function rowGroupKey(row) {
    if (row?._summaryGroupKey) return row._summaryGroupKey;
    return [
      row?.page || 1,
      row?.path || LEGACY_PATH_DISPLAY_NAME,
      row?.category || UNCATEGORIZED_DISPLAY_NAME,
    ].join('\u001f');
  }

  function groupedPageRows(rows) {
    const groups = [];
    const byKey = new Map();
    for (const row of rows || []) {
      const key = rowGroupKey(row);
      let group = byKey.get(key);
      if (!group) {
        group = {
          path: cleanName(row.path, LEGACY_PATH_DISPLAY_NAME),
          category: cleanName(row.category, UNCATEGORIZED_DISPLAY_NAME),
          runCount: Number(row.groupRunCount) || 0,
          total: Number(row.groupTotal) || 0,
          unit: row.groupUnit || row.unit,
          rows: [],
        };
        byKey.set(key, group);
        groups.push(group);
      }
      group.rows.push(row);
    }
    return groups;
  }

  function generateSummary(rows) {
    const byPage = new Map();
    for (const row of rows || []) {
      if (!byPage.has(row.page)) byPage.set(row.page, []);
      byPage.get(row.page).push(row);
    }

    const lines = ['Takeoff summary', ''];
    let grandTotal = 0;
    let unscaledCount = 0;
    const pages = [...byPage.keys()].sort((a, b) => a - b);
    const unit = rows && rows[0] ? rows[0].unit : 'ft';

    for (const page of pages) {
      let pageTotal = 0;
      lines.push(`Page ${page}`);
      for (const group of groupedPageRows(byPage.get(page))) {
        lines.push(`Path: ${group.path} | Category: ${group.category} | Runs: ${group.runCount} | Total: ${formatLength(group.total)} ${group.unit}`);
        for (const row of group.rows) {
          const visibilityNote = row.visible === 'N' ? ' (hidden)' : '';
          if (row.scaled === 'Y' && row.length != null) {
            pageTotal += row.length;
            lines.push(`- ${row.name}: ${formatLength(row.length)} ${row.unit}${visibilityNote}${summaryDetailText(row)}`);
          } else {
            unscaledCount += 1;
            lines.push(`- ${row.name}: Unscaled${visibilityNote}${summaryDetailText(row)}`);
          }
        }
      }
      grandTotal += pageTotal;
      lines.push(`Page total: ${formatLength(pageTotal)} ${unit}`, '');
    }

    lines.push(`Grand total: ${formatLength(grandTotal)} ${unit}`);
    lines.push(`Unscaled measurements: ${unscaledCount}`);
    if (unscaledCount) {
      lines.push('', 'Note: Unscaled measurements are not included in totals.');
    }
    return lines.join('\n');
  }

  function xmlEscape(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  function columnName(index) {
    let name = '';
    let n = index;
    while (n > 0) {
      const r = (n - 1) % 26;
      name = String.fromCharCode(65 + r) + name;
      n = Math.floor((n - 1) / 26);
    }
    return name;
  }

  function cellRef(row, col) {
    return `${columnName(col)}${row}`;
  }

  function textCell(row, col, value, style = 0) {
    return `<c r="${cellRef(row, col)}" t="inlineStr"${style ? ` s="${style}"` : ''}><is><t>${xmlEscape(value)}</t></is></c>`;
  }

  function numberCell(row, col, value, style = 0) {
    return `<c r="${cellRef(row, col)}"${style ? ` s="${style}"` : ''}><v>${value}</v></c>`;
  }

  function blankCell(row, col, style = 0) {
    return `<c r="${cellRef(row, col)}"${style ? ` s="${style}"` : ''}/>`;
  }

  function buildSheetXml(rows) {
    const rowCount = Math.max(1, (rows || []).length + 1);
    const lastColumn = columnName(HEADERS.length);
    const columnWidths = [10.83, 19.33, 11, 13, 13, 12.33, 20, 18, 17, 14, 13, 12.33, 28, 13, 13, 18];
    const data = [];
    data.push(`<row r="1">${HEADERS.map((header, i) => textCell(1, i + 1, header, 1)).join('')}</row>`);
    (rows || []).forEach((row, i) => {
      const r = i + 2;
      data.push(`<row r="${r}">` + [
        numberCell(r, 1, row.page, 1),
        textCell(r, 2, row.name, 2),
        textCell(r, 3, row.type, 2),
        row.length == null ? blankCell(r, 4, 3) : numberCell(r, 4, formatLength(row.length), 3),
        textCell(r, 5, row.unit, 1),
        textCell(r, 6, row.scaled, 1),
        textCell(r, 7, row.path, 2),
        textCell(r, 8, row.category, 2),
        numberCell(r, 9, Number(row.groupRunCount) || 0, 1),
        numberCell(r, 10, formatLength(row.groupTotal), 3),
        textCell(r, 11, row.groupUnit, 1),
        textCell(r, 12, row.visible, 1),
        textCell(r, 13, row.note, 2),
        numberCell(r, 14, Number(row.photoCount) || 0, 1),
        numberCell(r, 15, Number(row.videoCount) || 0, 1),
        textCell(r, 16, row.attachments, 2),
      ].join('') + '</row>');
    });

    const conditionalRange = 'F2:F1000';
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <dimension ref="A1:${lastColumn}${rowCount}"/>
  <sheetViews><sheetView workbookViewId="0"/></sheetViews>
  <sheetFormatPr defaultRowHeight="15"/>
  <cols>
    ${columnWidths.map((width, index) => `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`).join('\n    ')}
  </cols>
  <sheetData>${data.join('')}</sheetData>
  <conditionalFormatting sqref="${conditionalRange}">
    <cfRule type="cellIs" dxfId="0" priority="1" operator="equal"><formula>"Y"</formula></cfRule>
    <cfRule type="cellIs" dxfId="1" priority="2" operator="equal"><formula>"N"</formula></cfRule>
  </conditionalFormatting>
  <tableParts count="1"><tablePart r:id="rId1"/></tableParts>
</worksheet>`;
  }

  function buildTableXml(rows) {
    const rowCount = Math.max(1, (rows || []).length + 1);
    const lastColumn = columnName(HEADERS.length);
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<table xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" id="1" name="Table1" displayName="Table1" ref="A1:${lastColumn}${rowCount}" totalsRowShown="0">
  <autoFilter ref="A1:${lastColumn}${rowCount}"/>
  <tableColumns count="${HEADERS.length}">
    ${HEADERS.map((header, i) => `<tableColumn id="${i + 1}" name="${xmlEscape(header)}"/>`).join('')}
  </tableColumns>
  <tableStyleInfo name="TableStyleMedium2" showFirstColumn="0" showLastColumn="0" showRowStripes="1" showColumnStripes="0"/>
</table>`;
  }

  function buildStylesXml() {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="1">
    <font><sz val="12"/><name val="Calibri"/></font>
  </fonts>
  <fills count="2">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
  </fills>
  <borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="4">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf>
    <xf numFmtId="2" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>
  </cellXfs>
  <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
  <dxfs count="2">
    <dxf><fill><patternFill patternType="solid"><bgColor rgb="FFCEEED0"/></patternFill></fill></dxf>
    <dxf><fill><patternFill patternType="solid"><bgColor rgb="FFF6C9CE"/></patternFill></fill></dxf>
  </dxfs>
</styleSheet>`;
  }

  function makeCrcTable() {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c >>> 0;
    }
    return table;
  }

  const CRC_TABLE = makeCrcTable();

  function crc32(bytes) {
    let crc = 0xffffffff;
    for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
  }

  function writeUint16(parts, value) {
    parts.push(value & 0xff, (value >>> 8) & 0xff);
  }

  function writeUint32(parts, value) {
    parts.push(value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff);
  }

  function generateZip(files) {
    const encoder = new TextEncoder();
    const bytes = [];
    const central = [];
    let offset = 0;

    for (const file of files) {
      const nameBytes = encoder.encode(file.name);
      const dataBytes = encoder.encode(file.content);
      const crc = crc32(dataBytes);
      const local = [];
      writeUint32(local, 0x04034b50);
      writeUint16(local, 20);
      writeUint16(local, 0);
      writeUint16(local, 0);
      writeUint16(local, 0);
      writeUint16(local, 0);
      writeUint32(local, crc);
      writeUint32(local, dataBytes.length);
      writeUint32(local, dataBytes.length);
      writeUint16(local, nameBytes.length);
      writeUint16(local, 0);
      bytes.push(...local, ...nameBytes, ...dataBytes);

      const record = [];
      writeUint32(record, 0x02014b50);
      writeUint16(record, 20);
      writeUint16(record, 20);
      writeUint16(record, 0);
      writeUint16(record, 0);
      writeUint16(record, 0);
      writeUint16(record, 0);
      writeUint32(record, crc);
      writeUint32(record, dataBytes.length);
      writeUint32(record, dataBytes.length);
      writeUint16(record, nameBytes.length);
      writeUint16(record, 0);
      writeUint16(record, 0);
      writeUint16(record, 0);
      writeUint16(record, 0);
      writeUint32(record, 0);
      writeUint32(record, offset);
      central.push(...record, ...nameBytes);
      offset = bytes.length;
    }

    const centralOffset = bytes.length;
    bytes.push(...central);
    const end = [];
    writeUint32(end, 0x06054b50);
    writeUint16(end, 0);
    writeUint16(end, 0);
    writeUint16(end, files.length);
    writeUint16(end, files.length);
    writeUint32(end, central.length);
    writeUint32(end, centralOffset);
    writeUint16(end, 0);
    bytes.push(...end);

    return new Uint8Array(bytes);
  }

  function generateXlsxPackage(rows) {
    return generateZip([
      { name: '[Content_Types].xml', content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/tables/table1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.table+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>` },
      { name: '_rels/.rels', content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>` },
      { name: 'xl/workbook.xml', content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets><sheet name="takeoff-measurements" sheetId="1" r:id="rId1"/></sheets>
</workbook>` },
      { name: 'xl/_rels/workbook.xml.rels', content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>` },
      { name: 'xl/worksheets/sheet1.xml', content: buildSheetXml(rows) },
      { name: 'xl/worksheets/_rels/sheet1.xml.rels', content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/table" Target="../tables/table1.xml"/>
</Relationships>` },
      { name: 'xl/tables/table1.xml', content: buildTableXml(rows) },
      { name: 'xl/styles.xml', content: buildStylesXml() },
    ]);
  }

  function makeDownloadBlob(bytes, mimeType) {
    return new Blob([bytes], { type: mimeType });
  }

  window.TakeoffExportUtils = {
    buildExportRows,
    generateCsv,
    generateSummary,
    generateXlsxPackage,
    makeDownloadBlob,
  };
})();
