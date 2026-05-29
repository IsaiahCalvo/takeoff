(function () {
  const UNIT_TO_INCH = { in: 1, ft: 12, yd: 36, cm: 0.393700787, m: 39.3700787 };
  const UNIT_LABEL = { in: 'in', ft: 'ft', yd: 'yd', cm: 'cm', m: 'm' };
  const HEADERS = ['Page', 'Name', 'Category', 'Notes', 'Type', 'Length', 'Unit', 'Scaled'];

  function inchesToUnit(inches, unit) {
    return inches / (UNIT_TO_INCH[unit] || UNIT_TO_INCH.ft);
  }

  function cleanName(value, fallback) {
    const name = String(value || '').trim();
    return name || fallback;
  }

  function buildExportRows(measurements, options = {}) {
    const unit = options.unit || 'ft';
    const unitLabel = UNIT_LABEL[unit] || unit;
    return (measurements || [])
      .slice()
      .sort((a, b) => (a.page || 1) - (b.page || 1))
      .map((measurement, index) => {
        const scaled = measurement.lengthInches != null && Number.isFinite(measurement.lengthInches);
        return {
          page: measurement.page || 1,
          name: cleanName(measurement.name, `Run ${index + 1}`),
          category: String(measurement.category || '').trim(),
          notes: String(measurement.notes || '').trim(),
          type: String(measurement.drawType || measurement.type || 'line').toLowerCase(),
          length: scaled ? Number(inchesToUnit(measurement.lengthInches, unit).toFixed(2)) : null,
          unit: unitLabel,
          scaled: scaled ? 'Y' : 'N',
        };
      });
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
        row.category,
        row.notes,
        row.type,
        formatLength(row.length),
        row.unit,
        row.scaled,
      ].map(csvCell).join(','));
    }
    return lines.join('\r\n');
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
      for (const row of byPage.get(page)) {
        const category = row.category ? ` [${row.category}]` : '';
        const notes = row.notes ? ` - ${row.notes}` : '';
        if (row.scaled === 'Y' && row.length != null) {
          pageTotal += row.length;
          lines.push(`- ${row.name}${category}: ${formatLength(row.length)} ${row.unit}${notes}`);
        } else {
          unscaledCount += 1;
          lines.push(`- ${row.name}${category}: Unscaled${notes}`);
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
    const data = [];
    data.push(`<row r="1">${HEADERS.map((header, i) => textCell(1, i + 1, header, 1)).join('')}</row>`);
    (rows || []).forEach((row, i) => {
      const r = i + 2;
      data.push(`<row r="${r}">` + [
        numberCell(r, 1, row.page, 1),
        textCell(r, 2, row.name, 2),
        textCell(r, 3, row.category, 2),
        textCell(r, 4, row.notes, 2),
        textCell(r, 5, row.type, 2),
        row.length == null ? blankCell(r, 6, 3) : numberCell(r, 6, formatLength(row.length), 3),
        textCell(r, 7, row.unit, 1),
        textCell(r, 8, row.scaled, 1),
      ].join('') + '</row>');
    });

    const conditionalRange = 'H2:H1000';
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <dimension ref="A1:H${rowCount}"/>
  <sheetViews><sheetView workbookViewId="0"/></sheetViews>
  <sheetFormatPr defaultRowHeight="15"/>
  <cols>
    <col min="1" max="1" width="10.83" customWidth="1"/>
    <col min="2" max="2" width="19.33" customWidth="1"/>
    <col min="3" max="3" width="16" customWidth="1"/>
    <col min="4" max="4" width="24" customWidth="1"/>
    <col min="5" max="5" width="11" customWidth="1"/>
    <col min="6" max="6" width="13" customWidth="1"/>
    <col min="7" max="7" width="13" customWidth="1"/>
    <col min="8" max="8" width="12.33" customWidth="1"/>
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
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<table xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" id="1" name="Table1" displayName="Table1" ref="A1:H${rowCount}" totalsRowShown="0">
  <autoFilter ref="A1:H${rowCount}"/>
  <tableColumns count="8">
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
