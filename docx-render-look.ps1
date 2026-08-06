# DOCX RENDER-AND-LOOK -- closes the gap doc-palette-sweep names by its own limit.
#
# The sweep greps a DOCX's WordprocessingML, which proves no retired hex SURVIVES.
# It does not prove the document LOOKS right: styles.xml can be clean while a
# heading inherits from a theme, a band renders at the wrong level, or white text
# lands on a fill that is no longer dark. Only Word knows what Word will draw.
#
# This exports a .docx to PDF through Word itself, so the PDF is Word's own
# rendering rather than a second engine's opinion of it. doc-palette-shots then
# turns that PDF into page images the same way it does every other family.
#
# Available only because gate (a) cleared -- Word COM was blocked until
# 2026-08-05. Same two rules as probe-word-com.ps1: never ShareSync (Word writes
# an owner-lock file beside whatever it opens), and every COM call is bounded by
# a job timeout so a hang is reported rather than waited on.
#
# Run: powershell -ExecutionPolicy Bypass -File docx-render-look.ps1 <path.docx> [more.docx ...]

$ErrorActionPreference = 'Stop'
$TimeoutSec = 120
$Repo = $PSScriptRoot

if ($args.Count -eq 0) { Write-Host 'usage: docx-render-look.ps1 <path.docx> [...]'; exit 1 }

$before = @(Get-Process WINWORD -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Id)
$results = @()

foreach ($rel in $args) {
  $src = if ([IO.Path]::IsPathRooted($rel)) { $rel } else { Join-Path $Repo $rel }
  if ($src -like '*ShareSync*') { Write-Host "REFUSE: $rel is inside ShareSync"; exit 1 }
  if (-not (Test-Path -LiteralPath $src)) { Write-Host "SKIP (absent): $rel"; continue }
  $dst = [IO.Path]::ChangeExtension($src, '.word.pdf')
  Write-Host "render: $([IO.Path]::GetFileName($src))"

  $job = Start-Job -ScriptBlock {
    param($s, $d)
    $word = New-Object -ComObject Word.Application
    $word.Visible = $false
    $word.DisplayAlerts = 0
    try {
      $doc = $word.Documents.Open($s, $false, $true, $false)
      # Fields are NOT updated: a TOC that self-updates would repaginate the
      # export, and the page images would not match what a reader first sees.
      $doc.ExportAsFixedFormat($d, 17)   # 17 = wdExportFormatPDF
      # THE PDF IS THE PROOF, NOT A CLEAN SHUTDOWN. On this machine Word tears
      # its own RPC channel down immediately after ExportAsFixedFormat, so Close
      # and Quit throw RPC_E_DISCONNECTED (0x80010108) on a run that fully
      # succeeded. Swallowing that would be wrong if the export were the thing
      # in doubt -- it is not; the caller verifies the file exists on disk.
      try { $doc.Close($false) } catch { }
      'OK exported'
    } finally {
      try { $word.Quit() } catch { }
      try { [Runtime.InteropServices.Marshal]::ReleaseComObject($word) | Out-Null } catch { }
    }
  } -ArgumentList $src, $dst

  $done = Wait-Job $job -Timeout $TimeoutSec
  if ($null -eq $done) {
    Stop-Job $job -ErrorAction SilentlyContinue
    Remove-Job $job -Force -ErrorAction SilentlyContinue
    $results += [pscustomobject]@{ file = [IO.Path]::GetFileName($src); verdict = "HANG (>${TimeoutSec}s)" }
    Write-Host "  HANG after ${TimeoutSec}s"
  } else {
    $out = (Receive-Job $job -ErrorAction SilentlyContinue) -join ' '
    $err = $job.ChildJobs[0].Error | Out-String
    Remove-Job $job -Force -ErrorAction SilentlyContinue
    if ($out -match '^OK' -and (Test-Path -LiteralPath $dst)) {
      $kb = [math]::Round((Get-Item -LiteralPath $dst).Length / 1KB)
      $results += [pscustomobject]@{ file = [IO.Path]::GetFileName($src); verdict = "OK $out, ${kb} kB" }
      Write-Host "  OK -- $out -> $([IO.Path]::GetFileName($dst)) (${kb} kB)"
    } else {
      $results += [pscustomobject]@{ file = [IO.Path]::GetFileName($src); verdict = "FAIL $out $err" }
      Write-Host "  FAIL -- $out $err"
    }
  }
}

Get-Process WINWORD -ErrorAction SilentlyContinue |
  Where-Object { $before -notcontains $_.Id } |
  ForEach-Object {
    try { Stop-Process -Id $_.Id -Force -ErrorAction Stop }
    catch { Write-Host "  (could not stop WINWORD pid $($_.Id))" }
  }

Write-Host ''
if ($results.Count -eq 0) { Write-Host 'REFUSE: zero documents rendered -- nothing was looked at'; exit 1 }
$results | Format-Table -AutoSize | Out-String | Write-Host
$bad = @($results | Where-Object { $_.verdict -notlike 'OK*' })
if ($bad.Count -eq 0) { Write-Host "RENDERED $($results.Count)/$($results.Count) -- now LOOK at the .word.pdf files"; exit 0 }
Write-Host "FAILED $($bad.Count) of $($results.Count)"; exit 1
