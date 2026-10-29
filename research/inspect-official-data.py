import csv, io, json, pathlib, zipfile, xml.etree.ElementTree as ET
root=pathlib.Path(__file__).parent
ns={'s':'http://schemas.openxmlformats.org/spreadsheetml/2006/main','r':'http://schemas.openxmlformats.org/officeDocument/2006/relationships'}
with zipfile.ZipFile(root/'worldbank-monthly.xlsx') as z:
    strings=[]
    if 'xl/sharedStrings.xml' in z.namelist():
        strings=[''.join(x.itertext()) for x in ET.fromstring(z.read('xl/sharedStrings.xml')).findall('s:si',ns)]
    wb=ET.fromstring(z.read('xl/workbook.xml'))
    print('WORLD BANK SHEETS',[(x.attrib) for x in wb.findall('s:sheets/s:sheet',ns)])
    for file in z.namelist():
        if file.startswith('xl/worksheets/sheet') and file.endswith('.xml'):
            tree=ET.fromstring(z.read(file))
            rows=tree.findall('s:sheetData/s:row',ns)
            for row in rows[:12]:
                cells=[]
                for c in row:
                    v=c.find('s:v',ns)
                    val=v.text if v is not None else ''.join(c.itertext())
                    if c.get('t')=='s': val=strings[int(val)]
                    cells.append((c.get('r'),val))
                print(file,row.get('r'),json.dumps(cells))
            print('ROWS',file,len(rows))
with zipfile.ZipFile(root/'usda-psd.zip') as z:
    print('USDA FILES',z.namelist())
    for file in z.namelist()[:1]:
        with z.open(file) as f:
            rd=csv.DictReader(io.TextIOWrapper(f,encoding='utf-8-sig'))
            print('USDA HEADERS',rd.fieldnames)
            for i,r in enumerate(rd):
                if i<3:print('USDA SAMPLE',r)
                if i>=3:break
