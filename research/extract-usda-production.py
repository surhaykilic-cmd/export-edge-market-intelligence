"""Bounded food-production extraction from official USDA PSD bulk; preserve marketing years and units."""
import csv,datetime,hashlib,io,json,pathlib,zipfile
root=pathlib.Path(__file__).parent
source_url='https://apps.fas.usda.gov/PSDOnline/downloads/psd_alldata_csv.zip'
selected={'Wheat','Corn','Rice, Milled','Coffee, Green','Oil, Palm','Oil, Soybean','Oil, Sunflowerseed','Oilseed, Soybean','Sugar, Centrifugal','Barley','Sorghum','Almonds, Shelled Basis','Pistachios, Inshell Basis','Walnuts, Inshell Basis','Apples, Fresh','Oranges, Fresh','Meat, Beef and Veal','Meat, Chicken','Dairy, Milk, Fluid'}
records=[]
current_year=datetime.datetime.now(datetime.timezone.utc).year
with zipfile.ZipFile(root/'usda-psd.zip') as z:
    with io.TextIOWrapper(z.open('psd_alldata.csv'),encoding='utf-8-sig') as f:
        for r in csv.DictReader(f):
            if r['Commodity_Description'] not in selected or r['Attribute_Description']!='Production' or not current_year-3<=int(r['Market_Year'])<=current_year:
                continue
            records.append({'country':r['Country_Name'],'countryCode':r['Country_Code'],'isAggregate':r['Country_Name'] in {'European Union','Other'},'geographyType':'aggregate' if r['Country_Name'] in {'European Union','Other'} else 'country_or_territory','product':r['Commodity_Description'],'productCode':r['Commodity_Code'],'year':int(r['Market_Year']),'periodType':'marketing_year','attribute':r['Attribute_Description'],'unit':r['Unit_Description'],'value':float(r['Value']),'source':'USDA PSD','sourceId':'usda-psd','sourceUrl':source_url,'releaseYear':int(r['Calendar_Year']),'releaseMonth':int(r['Month']),'status':'USDA estimate/forecast; see marketing year and release vintage'})
out={'retrievedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'source':'USDA PSD','sourceUrl':source_url,'sourceSha256':hashlib.sha256((root/'usda-psd.zip').read_bytes()).hexdigest(),'periodType':'marketing_year','notes':'Production quantities, not calendar-year trade values. USDA marketing years and releases vary by commodity and country. Preserve the original unit; no conversion or cross-commodity summation is valid. Recent years can include forecasts and estimates. Zero is retained only where the source reports zero.','records':records}
target=root.parent/'dist'/'production.json'
target.write_text(json.dumps(out,separators=(',',':')),encoding='utf-8')
print(json.dumps({'file':str(target),'records':len(records),'countries':len(set(r['country'] for r in records)),'products':len(set(r['product'] for r in records)),'bytes':target.stat().st_size,'units':sorted(set(r['unit'] for r in records))}))
