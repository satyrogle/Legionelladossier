import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { decodeText, detectDelimiter, parseDelimited, parseHtmlTable, parseJsonRecords, parseSpreadsheet, parseSpreadsheetMl, readXlsx, toDelimited, writeXlsx, columnIndex } from '../src/index.js';

const enc = (s: string) => new TextEncoder().encode(s);

describe('delimited text', () => {
  it('parses quotes, embedded delimiters and newlines', () => {
    const rows = parseDelimited('ID,Name,Notes\r\nA1,"Tap, hot","line one\nline two"\r\nA2,"Say ""hi""",\r\n');
    expect(rows).toEqual([
      ['ID', 'Name', 'Notes'],
      ['A1', 'Tap, hot', 'line one\nline two'],
      ['A2', 'Say "hi"', ''],
    ]);
  });

  it('detects tab, comma and semicolon', () => {
    expect(detectDelimiter('triIdTX\ttriNameTX\tpath')).toBe('\t');
    expect(detectDelimiter('a;b;c')).toBe(';');
    expect(detectDelimiter('"a,b";c;d')).toBe(';');
    expect(detectDelimiter('a,b,c')).toBe(',');
  });

  it('neutralises formulas in CSV but keeps numbers', () => {
    expect(toDelimited([['=HYPERLINK("x")', '+1+1', '@SUM(A1)', '-2.5', '55.2', 'Hot tap']], ',')).toBe(`"'=HYPERLINK(""x"")",'+1+1,'@SUM(A1),-2.5,55.2,Hot tap\r\n`);
    expect(toDelimited([['=A1']], '\t')).toBe('=A1\r\n');
  });

  it('writes CSV with quoting and TSV without', () => {
    expect(toDelimited([['a', 'b,c', 'say "x"']], ',')).toBe('a,"b,c","say ""x"""\r\n');
    expect(toDelimited([['a', 'b\tc', 'd\ne']], '\t')).toBe('a\tb c\td e\r\n');
  });

  it('decodes UTF-16 LE text with a BOM (Excel "Unicode text")', () => {
    const body = 'ID\tName';
    const bytes = new Uint8Array(2 + body.length * 2);
    bytes[0] = 0xff;
    bytes[1] = 0xfe;
    for (let i = 0; i < body.length; i += 1) bytes[2 + i * 2] = body.charCodeAt(i);
    expect(decodeText(bytes)).toBe(body);
    expect(parseSpreadsheet(bytes)).toMatchObject({ format: 'delimited', rows: [['ID', 'Name']] });
  });
});

describe('xlsx', () => {
  it('round-trips through the writer', () => {
    const bytes = writeXlsx(
      [
        ['ID', 'Name', 'Spec Name'],
        ['EQ-1', 'Calorifier & pump <1>', 'Calorifier'],
        ['EQ-2', '', 'TMV3'],
      ],
      'Building Equipment',
    );
    const sheet = readXlsx(bytes);
    expect(sheet.name).toBe('Building Equipment');
    expect(sheet.rows).toEqual([
      ['ID', 'Name', 'Spec Name'],
      ['EQ-1', 'Calorifier & pump <1>', 'Calorifier'],
      ['EQ-2', '', 'TMV3'],
    ]);
  });

  it('reads shared strings, rich text, gaps, booleans and absolute targets', () => {
    const files = {
      '[Content_Types].xml': strToU8('<Types/>'),
      'xl/workbook.xml': strToU8('<workbook xmlns:r="r"><sheets><sheet name="Report" sheetId="7" r:id="rId3"/></sheets></workbook>'),
      'xl/_rels/workbook.xml.rels': strToU8('<Relationships><Relationship Id="rId3" Type="ws" Target="/xl/worksheets/data.xml"/></Relationships>'),
      'xl/sharedStrings.xml': strToU8('<sst><si><t>ID</t></si><si><r><t>Bu</t></r><r><t xml:space="preserve">ilding</t></r></si><si><t>Nobel &amp; Co</t><rPh><t>ignored</t></rPh></si></sst>'),
      'xl/worksheets/data.xml': strToU8(
        '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="C1" t="s"><v>1</v></c></row><row r="2"><c r="A2"><v>42</v></c><c r="B2" t="b"><v>1</v></c><c r="C2" t="s"><v>2</v></c></row></sheetData></worksheet>',
      ),
    };
    const sheet = readXlsx(zipSync(files));
    expect(sheet.name).toBe('Report');
    expect(sheet.rows).toEqual([
      ['ID', '', 'Building'],
      ['42', 'TRUE', 'Nobel & Co'],
    ]);
    expect(columnIndex('AA12')).toBe(26);
  });
});

describe('markup exports', () => {
  it('reads HTML tables saved as .xls', () => {
    const html = '<html><body><table><tr><th>ID</th><th colspan="2">Name</th></tr><tr><td>1</td><td>WC&nbsp;hot tap<br>north</td><td>x</td></tr></table></body></html>';
    expect(parseHtmlTable(html)).toEqual([
      ['ID', 'Name', ''],
      ['1', 'WC hot tap north', 'x'],
    ]);
    expect(parseSpreadsheet(enc(html)).format).toBe('html');
  });

  it('reads SpreadsheetML 2003 with sparse cells', () => {
    const xml =
      '<?xml version="1.0"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Worksheet ss:Name="S"><Table><Row><Cell><Data ss:Type="String">ID</Data></Cell><Cell ss:Index="3"><Data ss:Type="String">Floor</Data></Cell></Row></Table></Worksheet></Workbook>';
    expect(parseSpreadsheetMl(xml)).toEqual([['ID', '', 'Floor']]);
    expect(parseSpreadsheet(enc(xml)).format).toBe('spreadsheetml');
  });
});

describe('OSLC JSON', () => {
  it('flattens rdfs:member records and drops namespaces', () => {
    const json = JSON.stringify({
      'oslc:responseInfo': { 'oslc:totalCount': 2 },
      'rdfs:member': [
        { 'spi:triIdTX': 'EQ-1', 'spi:triNameTX': 'Calorifier 1', 'spi:triPathTX': '\\Locations\\P\\B\\Plant', 'dcterms:identifier': '135580867', 'spi:SysReserveFlag': false },
        { 'spi:triIdTX': 'EQ-2', 'spi:triNameTX': null, 'spi:triAPICBuildingParent3LR': { 'spi:triNameTX': 'P' } },
      ],
    });
    const rows = parseJsonRecords(json);
    expect(rows[0]).toEqual(['triIdTX', 'triNameTX', 'triPathTX', 'identifier', 'SysReserveFlag', 'triAPICBuildingParent3LR.triNameTX']);
    expect(rows[1]).toEqual(['EQ-1', 'Calorifier 1', '\\Locations\\P\\B\\Plant', '135580867', 'FALSE', '']);
    expect(rows[2]).toEqual(['EQ-2', '', '', '', '', 'P']);
    expect(parseSpreadsheet(enc(json)).format).toBe('json');
  });
});

describe('parseSpreadsheet', () => {
  it('drops blank rows and refuses legacy binary .xls', () => {
    expect(parseSpreadsheet(enc('a,b\n,\n1,2\n')).rows).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
    expect(() => parseSpreadsheet(Uint8Array.of(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1))).toThrow(/legacy binary/);
  });
});
