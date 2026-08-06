# PHASE 1 census, Word half -- the S02 "CSP" (Contractor Start-up) masters.
#
# The Excel half of the corpus turned out to be almost entirely the placeholder
# "SHEET INTENTIONALLY LEFT BLANK FOR INDIVIDUAL TO POPULATE AS NEEDED". Before
# concluding anything about Phase 1's yield, the Word half has to be measured on
# its own -- a conclusion drawn from one half of a corpus is a projection, not a
# measurement.
#
# Counts CONTENT-BEARING TABLE ROWS, not paragraphs. These forms are tables; a
# paragraph count is inflated by empty layout paragraphs and would flatter a
# blank form exactly the way it must not.
#
# Same two rules as every COM script here: never ShareSync (Word writes an
# owner-lock file beside whatever it opens), and every call bounded by a job
# timeout so a hang is reported rather than waited on.
#
# Run: powershell -ExecutionPolicy Bypass -File census-csp-word.ps1 [-Max N]

param([int]$Max = 12)

$ErrorActionPreference = 'Stop'
$TimeoutSec = 120
$Repo = $PSScriptRoot
$Root = Join-Path $Repo 'samples\forms'

if ($Root -like '*ShareSync*') { Write-Host 'REFUSE: root is inside ShareSync'; exit 1 }
& git -C $Repo check-ignore -q -- 'samples/forms'
if ($LASTEXITCODE -ne 0) { Write-Host 'REFUSE: samples/forms is NOT gitignored'; exit 1 }

$all = @(Get-ChildItem -Path $Root -Recurse -Filter '*CSP*.doc' -File | Sort-Object FullName)
Write-Host "CSP corpus: $($all.Count) files; sampling $([Math]::Min($Max, $all.Count))"
if ($all.Count -eq 0) { Write-Host 'REFUSE: no CSP files found -- nothing measured'; exit 1 }

# Evenly spaced across the corpus, not the first N: the first N share a folder
# and a template, so they would measure one form N times.
$step = [Math]::Max(1, [Math]::Floor($all.Count / [Math]::Min($Max, $all.Count)))
$pick = @()
for ($i = 0; $i -lt $all.Count -and $pick.Count -lt $Max; $i += $step) { $pick += $all[$i] }

$before = @(Get-Process WINWORD -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Id)
$results = @()

foreach ($f in $pick) {
  $job = Start-Job -ScriptBlock {
    param($src)
    $word = New-Object -ComObject Word.Application
    $word.Visible = $false; $word.DisplayAlerts = 0
    try {
      $doc = $word.Documents.Open($src, $false, $true, $false)
      $tables = $doc.Tables.Count
      $rows = 0; $filled = 0
      foreach ($t in $doc.Tables) {
        $rows += $t.Rows.Count
        foreach ($r in $t.Rows) {
          # A row counts as CONTENT when its widest cell holds a real phrase.
          $best = 0
          foreach ($c in $r.Cells) {
            $txt = $c.Range.Text -replace "[\a\r\n]", ''
            if ($txt.Trim().Length -gt $best) { $best = $txt.Trim().Length }
          }
          if ($best -ge 12) { $filled++ }
        }
      }
      try { $doc.Close($false) } catch { }
      "OK tables=$tables rows=$rows content=$filled"
    } finally {
      try { $word.Quit() } catch { }
      try { [Runtime.InteropServices.Marshal]::ReleaseComObject($word) | Out-Null } catch { }
    }
  } -ArgumentList $f.FullName

  $done = Wait-Job $job -Timeout $TimeoutSec
  if ($null -eq $done) {
    Stop-Job $job -ErrorAction SilentlyContinue; Remove-Job $job -Force -ErrorAction SilentlyContinue
    $results += [pscustomobject]@{ file = $f.Name; content = -1; note = 'HANG' }
    Write-Host ("  {0,-52} HANG" -f $f.Name.Substring(0, [Math]::Min(52, $f.Name.Length)))
  } else {
    $out = (Receive-Job $job -ErrorAction SilentlyContinue) -join ' '
    Remove-Job $job -Force -ErrorAction SilentlyContinue
    if ($out -match 'content=(\d+)') {
      $n = [int]$Matches[1]
      $results += [pscustomobject]@{ file = $f.Name; content = $n; note = $out }
      Write-Host ("  {0,-52} {1}" -f $f.Name.Substring(0, [Math]::Min(52, $f.Name.Length)), $out)
    } else {
      $results += [pscustomobject]@{ file = $f.Name; content = -1; note = $out }
      Write-Host ("  {0,-52} FAIL {1}" -f $f.Name.Substring(0, [Math]::Min(52, $f.Name.Length)), $out)
    }
  }
}

Get-Process WINWORD -ErrorAction SilentlyContinue |
  Where-Object { $before -notcontains $_.Id } |
  ForEach-Object {
    try { Stop-Process -Id $_.Id -Force -ErrorAction Stop }
    catch { Write-Host "  (could not stop WINWORD pid $($_.Id))" }
  }

$ok = @($results | Where-Object { $_.content -ge 0 })
if ($ok.Count -eq 0) { Write-Host ''; Write-Host 'REFUSE: zero files read -- nothing measured'; exit 1 }

# NOT $THIN / $thin. PowerShell variable names are CASE-INSENSITIVE, so the
# array assignment silently clobbered the threshold and the summary printed
# "usable (>=  rows)" with the number missing. The counts were right -- the
# filter evaluated before the clobber -- but a report whose stated threshold is
# blank is a report you cannot check.
$ThinLimit = 8
$thin = @($ok | Where-Object { $_.content -lt $ThinLimit })
$sum = ($ok | Measure-Object -Property content -Sum).Sum
$med = ($ok | Sort-Object content)[[Math]::Floor($ok.Count / 2)].content

Write-Host ''
Write-Host '-- WORD CSP CENSUS --'
Write-Host "read                : $($ok.Count)/$($pick.Count) sampled, of $($all.Count) in corpus"
Write-Host "usable (>= $ThinLimit rows) : $($ok.Count - $thin.Count)"
Write-Host "thin (< $ThinLimit rows)    : $($thin.Count)"
Write-Host "content rows        : $sum  (median $med/form)"
Write-Host "PROJECTION over $($all.Count) CSP forms: ~$([Math]::Round($sum / $ok.Count * $all.Count)) content rows"
Write-Host ''
Write-Host 'NOTHING SEEDED. This run measures.'
