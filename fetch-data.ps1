param([switch]$ReuseExisting)
$ErrorActionPreference = 'Stop'
$markets = @(
  @{id='brazil-coffee';country='Brazil';code=76;region='Americas';product='Coffee';hs='0901';sector='Coffee & cocoa';description='Coffee, whether or not roasted or decaffeinated; coffee husks and skins; coffee substitutes containing coffee';color='coffee'},
  @{id='ivory-coast-cocoa';country="Cote d'Ivoire";code=384;region='Africa';product='Cocoa beans';hs='1801';sector='Coffee & cocoa';description='Cocoa beans, whole or broken, raw or roasted';color='cocoa'},
  @{id='india-rice';country='India';code=699;region='Asia';product='Rice';hs='1006';sector='Grains & cereals';description='Rice, including paddy, husked, semi-milled or wholly milled, and broken rice';color='rice'},
  @{id='indonesia-palm-oil';country='Indonesia';code=360;region='Asia';product='Palm oil';hs='1511';sector='Oils & oilseeds';description='Palm oil and its fractions, whether or not refined, but not chemically modified';color='oil'},
  @{id='vietnam-pepper';country='Viet Nam';code=704;region='Asia';product='Pepper & capsicum';hs='0904';sector='Spices';description='Pepper of the genus Piper; dried, crushed or ground fruits of the genus Capsicum or of the genus Pimenta';color='pepper'},
  @{id='usa-wheat';country='United States';code=842;region='Americas';product='Wheat & meslin';hs='1001';sector='Grains & cereals';description='Wheat and meslin';color='wheat'}
)
$dataOutput = @()
if ($ReuseExisting) {
  $prior = Get-Content (Join-Path $PSScriptRoot 'dist/data.json') -Raw | ConvertFrom-Json -AsHashtable
}
foreach ($market in $markets) {
  $existing = if ($ReuseExisting) { $prior.markets | Where-Object { $_.id -eq $market.id -and $_.records.Count -gt 0 } } else { $null }
  if ($existing) {
    $market.records = $existing.records
    $market.sourceUrls = $existing.sourceUrls
    $market.sourceUrl = $existing.sourceUrl
    $dataOutput += $market
    Write-Output "$($market.id): reusing verified records"
    continue
  }
  $market.records = @()
  $market.sourceUrls = @()
  foreach ($year in 2023,2024,2025) {
    $url = "https://comtradeapi.un.org/public/v1/preview/C/A/HS?period=$year&reporterCode=$($market.code)&cmdCode=$($market.hs)&flowCode=X,M&partnerCode=0&partner2Code=0&customsCode=C00&motCode=0&maxRecords=30"
    for ($attempt = 1; $attempt -le 4; $attempt++) {
      try { $response = Invoke-RestMethod -Uri $url -TimeoutSec 40; break }
      catch { if ($attempt -eq 4 -or $_.Exception.Response.StatusCode.value__ -ne 429) { throw }; Start-Sleep -Seconds (3 * $attempt) }
    }
    if ($response.error) { throw "Data error for $($market.id): $($response.error)" }
    $market.sourceUrls += $url
    $market.records += @($response.data | ForEach-Object { @{year=[int]$_.period;flow=$_.flowCode;value=$_.primaryValue;classification=$_.classificationCode;isReported=$_.isReported;isAggregate=$_.isAggregate} })
    Start-Sleep -Seconds 3
  }
  $market.sourceUrl = $market.sourceUrls[-1]
  $dataOutput += $market
  Write-Output "$($market.id): $($market.records.Count) records"
}
$dataset = @{retrievedAt=[DateTime]::UtcNow.ToString('o');source='UN Comtrade';frequency='Annual';partner='World';markets=$dataOutput}
$jsonText = $dataset | ConvertTo-Json -Depth 10
[IO.File]::WriteAllText((Join-Path $PSScriptRoot 'dist/data.json'), $jsonText, [Text.UTF8Encoding]::new($false))
