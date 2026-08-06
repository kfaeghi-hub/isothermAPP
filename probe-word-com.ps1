# WORD COM PROBE -- gate (a) of the Start-Up campaign.
#
# History: on 2026-07-21 `Documents.Open` hung MACHINE-WIDE, on files that had
# converted fine before (PFC-SEEDING-LOG Batch F; EXTRACTION-PLAYBOOK "Word COM
# environment flag"). Batch F was extracted from PDF render twins instead. Tony
# fixed the environment; this re-verifies it independently before Phase 1 leans
# on it for ~216 Start-Up sheets.
#
# TWO RULES THIS SCRIPT OBEYS
#   1. SHARESYNC IS NEVER TOUCHED. The probe runs only against working copies
#      already sitting in gitignored samples/. Word writes an owner-lock file
#      (~$name.doc) NEXT TO whatever it opens -- which is exactly why a "read-only
#      probe" run against the ShareSync tree would still be a write to it.
#   2. IT CANNOT HANG THE SESSION. Every COM call runs inside a job with a hard
#      timeout; on expiry the job is killed and every WINWORD process this script
#      started is stopped by PID. A hang is reported as FAIL, not waited on.
#
# Run: powershell -ExecutionPolicy Bypass -File probe-word-com.ps1

$ErrorActionPreference = 'Stop'
$TimeoutSec = 90
$Repo = $PSScriptRoot
$OutDir = Join-Path $Repo 'samples\word-probe'

# Targets: the file the 2026-07-21 probe hung on, plus one CSA .doc that had
# converted successfully before it. One of each, deliberately -- a probe that
# only tries the known-bad file cannot tell "fixed" from "that file was special".
$Targets = @(
  'samples\forms\ats_checklist.doc',
  'samples\forms\csa-ivc\2.1 CSA Z318 - HVAC System - Word\01 Air Handling Systems - Word\01 Air Cooled Package AlC\S01-Air Cooled Packaged AC VP.doc'
)

# REFUSE if any target is not gitignored. The whole safety argument rests on the
# working copies being outside version control and outside ShareSync.
foreach ($t in $Targets) {
  $full = Join-Path $Repo $t
  if (-not (Test-Path -LiteralPath $full)) { Write-Host "SKIP (absent): $t"; continue }
  & git -C $Repo check-ignore -q -- $t
  if ($LASTEXITCODE -ne 0) { Write-Host "REFUSE: $t is NOT gitignored"; exit 1 }
}
if ($OutDir -like '*ShareSync*') { Write-Host 'REFUSE: output path is inside ShareSync'; exit 1 }
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

$before = @(Get-Process WINWORD -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Id)
$results = @()

foreach ($t in $Targets) {
  $full = Join-Path $Repo $t
  if (-not (Test-Path -LiteralPath $full)) { continue }
  $name = [IO.Path]::GetFileNameWithoutExtension($full)
  $dest = Join-Path $OutDir "$name.docx"
  Write-Host "probe: $name"

  $job = Start-Job -ScriptBlock {
    param($src, $dst)
    $word = New-Object -ComObject Word.Application
    $word.Visible = $false
    $word.DisplayAlerts = 0
    try {
      # ReadOnly + AddToRecentFiles:$false + NoEncodingDialog -- open, never author.
      $doc = $word.Documents.Open($src, $false, $true, $false)
      $count = $doc.Paragraphs.Count
      $doc.SaveAs2($dst, 16)   # 16 = wdFormatDocumentDefault (.docx)
      $doc.Close($false)
      "OK paragraphs=$count"
    } finally {
      $word.Quit()
      [Runtime.InteropServices.Marshal]::ReleaseComObject($word) | Out-Null
    }
  } -ArgumentList $full, $dest

  $done = Wait-Job $job -Timeout $TimeoutSec
  # ASSERT THE WAIT'S RETURN VALUE, not that we got here. A bounded wait that
  # times out and a wait that succeeds both reach the next line.
  if ($null -eq $done) {
    Stop-Job $job -ErrorAction SilentlyContinue
    Remove-Job $job -Force -ErrorAction SilentlyContinue
    $results += [pscustomobject]@{ file = $name; verdict = "HANG (>${TimeoutSec}s)"; detail = '' }
    Write-Host "  HANG after ${TimeoutSec}s"
  } else {
    $out = (Receive-Job $job -ErrorAction SilentlyContinue) -join ' '
    $err = $job.ChildJobs[0].Error | Out-String
    Remove-Job $job -Force -ErrorAction SilentlyContinue
    if ($out -match '^OK' -and (Test-Path -LiteralPath $dest)) {
      $kb = [math]::Round((Get-Item -LiteralPath $dest).Length / 1KB)
      $results += [pscustomobject]@{ file = $name; verdict = 'OK'; detail = "$out, ${kb} kB" }
      Write-Host "  OK -- $out, ${kb} kB"
    } else {
      $results += [pscustomobject]@{ file = $name; verdict = 'FAIL'; detail = ($out + ' ' + $err).Trim() }
      Write-Host "  FAIL -- $($out) $($err)"
    }
  }
}

# Kill only WINWORD processes this script started; leave any the user had open.
Get-Process WINWORD -ErrorAction SilentlyContinue |
  Where-Object { $before -notcontains $_.Id } |
  ForEach-Object {
    try { Stop-Process -Id $_.Id -Force -ErrorAction Stop }
    catch { Write-Host "  (could not stop WINWORD pid $($_.Id))" }
  }

Write-Host ''
if ($results.Count -eq 0) { Write-Host 'REFUSE: zero targets probed -- nothing was tested'; exit 1 }
$results | Format-Table -AutoSize | Out-String | Write-Host
$bad = @($results | Where-Object { $_.verdict -ne 'OK' })
if ($bad.Count -eq 0) { Write-Host "GATE (a) PASS -- $($results.Count)/$($results.Count) converted"; exit 0 }
Write-Host "GATE (a) FAIL -- $($bad.Count) of $($results.Count)"; exit 1
