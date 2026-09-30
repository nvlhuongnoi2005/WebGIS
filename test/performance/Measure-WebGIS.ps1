[CmdletBinding()]
param(
  [string]$BaseUrl = "http://webgis.localhost",
  [ValidateSet("health", "tile", "suggestions", "nominatim", "route")]
  [string[]]$Scenario = @("suggestions", "nominatim", "route", "tile"),
  [string]$AccessToken = $env:WEBGIS_ACCESS_TOKEN,
  [ValidateRange(0, 1000)]
  [int]$Warmup = 5,
  [ValidateRange(1, 10000)]
  [int]$Iterations = 30,
  [ValidateRange(1, 120)]
  [int]$TimeoutSeconds = 30,
  [string]$TilePath = "/api/tile-catalog",
  [string]$OutputPath
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Get-Percentile {
  param(
    [double[]]$Values,
    [ValidateRange(0, 1)]
    [double]$Percentile
  )

  if ($Values.Count -eq 0) {
    return $null
  }
  $sorted = @($Values | Sort-Object)
  $index = [Math]::Max(0, [Math]::Ceiling($sorted.Count * $Percentile) - 1)
  return [Math]::Round([double]$sorted[$index], 2)
}

function Get-RootErrorMessage {
  param([System.Exception]$Exception)

  $current = $Exception
  while ($current.InnerException) {
    $current = $current.InnerException
  }
  return $current.Message
}

function New-ScenarioRequest {
  param(
    [string]$Name,
    [string]$RootUrl,
    [string]$Token,
    [string]$RequestedTilePath
  )

  switch ($Name) {
    "health" {
      $request = [System.Net.Http.HttpRequestMessage]::new([System.Net.Http.HttpMethod]::Get, "$RootUrl/health")
    }
    "tile" {
      if (-not $RequestedTilePath.StartsWith("/api/")) {
        throw "TilePath must be a Controller path such as /api/tile-catalog or /api/tiles/..."
      }
      $request = [System.Net.Http.HttpRequestMessage]::new([System.Net.Http.HttpMethod]::Get, "$RootUrl$RequestedTilePath")
    }
    "suggestions" {
      $request = [System.Net.Http.HttpRequestMessage]::new([System.Net.Http.HttpMethod]::Get, "$RootUrl/api/suggestions?q=ha%20noi")
    }
    "nominatim" {
      $request = [System.Net.Http.HttpRequestMessage]::new(
        [System.Net.Http.HttpMethod]::Get,
        "$RootUrl/api/nominatim/search?q=ha%20noi&format=jsonv2&addressdetails=1&namedetails=1&extratags=1&polygon_geojson=1&limit=6&accept-language=vi%2Cen"
      )
    }
    "route" {
      $request = [System.Net.Http.HttpRequestMessage]::new([System.Net.Http.HttpMethod]::Post, "$RootUrl/api/gateway/route")
      $body = @{
        locations = @(
          @{ lat = 21.0285; lon = 105.8542 },
          @{ lat = 21.0368; lon = 105.8342 }
        )
        costing = "auto"
        units = "kilometers"
        language = "vi-VN"
        directions_type = "instructions"
        shape_format = "polyline6"
      } | ConvertTo-Json -Depth 4 -Compress
      $request.Content = [System.Net.Http.StringContent]::new($body, [System.Text.Encoding]::UTF8, "application/json")
    }
  }

  if ($Name -in @("suggestions", "nominatim", "route")) {
    if ([string]::IsNullOrWhiteSpace($Token)) {
      $request.Dispose()
      throw "Scenario '$Name' requires -AccessToken or WEBGIS_ACCESS_TOKEN."
    }
    $request.Headers.Authorization = [System.Net.Http.Headers.AuthenticationHeaderValue]::new("Bearer", $Token)
  }

  return $request
}

function Invoke-Measurement {
  param(
    [System.Net.Http.HttpClient]$Client,
    [string]$Name,
    [string]$RootUrl,
    [string]$Token,
    [string]$RequestedTilePath
  )

  $request = New-ScenarioRequest -Name $Name -RootUrl $RootUrl -Token $Token -RequestedTilePath $RequestedTilePath
  $watch = [System.Diagnostics.Stopwatch]::StartNew()
  try {
    $response = $Client.SendAsync($request).GetAwaiter().GetResult()
    try {
      # Include the full response body in timing, because map and geocoding
      # results are only useful after they have reached the client.
      $bytes = $response.Content.ReadAsByteArrayAsync().GetAwaiter().GetResult()
      return [PSCustomObject]@{
        Milliseconds = $watch.Elapsed.TotalMilliseconds
        StatusCode = [int]$response.StatusCode
        Success = $response.IsSuccessStatusCode
        Bytes = $bytes.Length
        Error = if ($response.IsSuccessStatusCode) { $null } else { "HTTP $([int]$response.StatusCode) $($response.ReasonPhrase)" }
      }
    } finally {
      $response.Dispose()
    }
  } catch {
    return [PSCustomObject]@{
      Milliseconds = $watch.Elapsed.TotalMilliseconds
      StatusCode = $null
      Success = $false
      Bytes = 0
      Error = Get-RootErrorMessage -Exception $_.Exception
    }
  } finally {
    $watch.Stop()
    $request.Dispose()
  }
}

Add-Type -AssemblyName System.Net.Http
$rootUrl = $BaseUrl.TrimEnd("/")
$client = [System.Net.Http.HttpClient]::new()
$client.Timeout = [TimeSpan]::FromSeconds($TimeoutSeconds)

try {
  $report = foreach ($name in $Scenario) {
    for ($index = 0; $index -lt $Warmup; $index++) {
      $warmupResult = Invoke-Measurement -Client $client -Name $name -RootUrl $rootUrl -Token $AccessToken -RequestedTilePath $TilePath
    }

    $watch = [System.Diagnostics.Stopwatch]::StartNew()
    $samples = @(for ($index = 0; $index -lt $Iterations; $index++) {
      Invoke-Measurement -Client $client -Name $name -RootUrl $rootUrl -Token $AccessToken -RequestedTilePath $TilePath
    })
    $watch.Stop()

    $latencies = @($samples | ForEach-Object { $_.Milliseconds })
    $successful = @($samples | Where-Object Success)
    $failures = @($samples | Where-Object { -not $_.Success })
    $statusSummary = @($samples | Group-Object StatusCode | ForEach-Object {
      $label = if ([string]::IsNullOrWhiteSpace($_.Name)) { "network_error" } else { $_.Name }
      "${label}:$($_.Count)"
    }) -join ", "
    $errorSummary = @($failures | Select-Object -First 3 -ExpandProperty Error | Where-Object { $_ }) -join " | "

    [PSCustomObject]@{
      Scenario = $name
      Requests = $samples.Count
      Succeeded = $successful.Count
      Failed = $failures.Count
      SuccessRate = [Math]::Round(($successful.Count / $samples.Count) * 100, 2)
      RequestsPerSecond = [Math]::Round($samples.Count / $watch.Elapsed.TotalSeconds, 2)
      MeanMs = [Math]::Round((($latencies | Measure-Object -Average).Average), 2)
      MinMs = [Math]::Round((($latencies | Measure-Object -Minimum).Minimum), 2)
      P50Ms = Get-Percentile -Values $latencies -Percentile 0.5
      P95Ms = Get-Percentile -Values $latencies -Percentile 0.95
      P99Ms = Get-Percentile -Values $latencies -Percentile 0.99
      MaxMs = [Math]::Round((($latencies | Measure-Object -Maximum).Maximum), 2)
      MeanBytes = [Math]::Round((($samples | Measure-Object -Property Bytes -Average).Average), 2)
      StatusCodes = $statusSummary
      Errors = $errorSummary
    }
  }

  $report | Format-Table Scenario, Requests, Succeeded, Failed, SuccessRate, RequestsPerSecond, MeanMs, P50Ms, P95Ms, P99Ms, MaxMs, MeanBytes, StatusCodes -AutoSize

  if ($OutputPath) {
    $directory = Split-Path -Parent $OutputPath
    if ($directory) {
      New-Item -ItemType Directory -Force -Path $directory | Out-Null
    }
    $report | ConvertTo-Json -Depth 4 | Set-Content -Path $OutputPath -Encoding UTF8
    Write-Host "Saved JSON metrics to $OutputPath"
  }

  $failedReports = @($report | Where-Object { $_.Failed -gt 0 })
  if ($failedReports.Count -gt 0) {
    foreach ($failedReport in $failedReports) {
      Write-Warning "$($failedReport.Scenario) failed: $($failedReport.Errors)"
    }
    exit 1
  }
} finally {
  $client.Dispose()
}
