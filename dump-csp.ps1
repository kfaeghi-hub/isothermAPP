# Dump S02 "CSP" (Contractor Start-up) masters to JSON -- Phase 1's read leg.
#
# Word COM is the reader because these are legacy .doc binaries and the tables
# ARE the content. It emits structure, not prose: table index, row index, and
# every cell, so the mapper downstream can cite WHICH master and WHICH rows a
# line item came from. Source notes per form were ruled 2026-08-05, and a note
# that cannot name its rows is not a source note.
#
# It does not interpret. Interpretation is the mapper's job and belongs in code
# that can be read and re-run, not inside a COM loop.
#
# Same two rules as every COM script here: never ShareSync (Word writes an
# owner-lock file beside whatever it opens), and every call bounded by a job
# timeout so a hang is reported rather than waited on.
#
# TWO BUGS WORTH KEEPING IN THE HEADER, because both are silent classes:
#   1. PowerShell variable names are CASE-INSENSITIVE. `$out = Receive-Job ...`
#      inside the loop clobbered `$Out`, the output DIRECTORY, and the script
#      began writing files into a path named after its own success message.
#      Second occurrence of this class in one session (census-csp-word.ps1 was
#      the first). Every long-lived variable here is now PascalCase and every
#      scratch one is short and local; do not reintroduce a bare `$out`.
#   2. BaseName is NOT unique across the corpus -- "S02-Pump P- CSP.doc" exists
#      in several equipment folders. Writing by BaseName silently overwrote
#      earlier forms with later ones, which is the phantom-data shape: a
#      shortfall is visible, a duplicate looks like data. Output names now carry
#      the parent folder.
#
# Run: powershell -ExecutionPolicy Bypass -File dump-csp.ps1 [-Skip N] [-Take N]
#      -> out/startup-mining/csp/<folder>__<name>.json

param([int]$Skip = 0, [int]$Take = 10)

$ErrorActionPreference = 'Stop'
$TimeoutSec = 180
$Repo = $PSScriptRoot
$Root = Join-Path $Repo 'samples\forms'
$OutDir = Join-Path $Repo 'out\startup-mining\csp'

if ($Root -like '*ShareSync*') { Write-Host 'REFUSE: root is inside ShareSync'; exit 1 }
& git -C $Repo check-ignore -q -- 'samples/forms'
if ($LASTEXITCODE -ne 0) { Write-Host 'REFUSE: samples/forms is NOT gitignored'; exit 1 }
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

$all = @(Get-ChildItem -Path $Root -Recurse -Filter '*CSP*.doc' -File | Sort-Object FullName)
Write-Host "CSP corpus: $($all.Count) files. Batch: skip $Skip, take $Take."
if ($all.Count -eq 0) { Write-Host 'REFUSE: no CSP files found'; exit 1 }

$batch = @($all | Select-Object -Skip $Skip -First $Take)
if ($batch.Count -eq 0) { Write-Host 'REFUSE: batch is empty -- Skip is past the end of the corpus'; exit 1 }

$before = @(Get-Process WINWORD -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Id)
$okCount = 0; $failed = 0
$claimed = @{}

foreach ($f in $batch) {
  # FULL RELATIVE PATH, not the parent folder. Parent-folder + basename still
  # collided 81 masters down to 58 stems, because the same equipment folder name
  # recurs under different system trees -- "Pumps" appears under HVAC Water
  # Systems AND under Plumbing, four times over. 23 masters were silently
  # overwritten by later ones. A shortfall is visible; a duplicate looks like
  # data, and here it looked like a smaller corpus.
  $rel = $f.FullName.Substring($Root.Length).TrimStart([char]92)
  $stem = $rel -replace '\.docx?$', ''
  $stem = $stem -replace '[\\/]', '__'
  $stem = $stem -replace '[^A-Za-z0-9\-_ ]', ''
  $dest = Join-Path $OutDir "$stem.json"

  # TRIPWIRE, not a rename. If two masters ever map to one output name again,
  # the run REFUSES and says which two. Auto-suffixing would keep both files and
  # hide that the naming rule had failed.
  if ($claimed.ContainsKey($stem)) {
    Write-Host "REFUSE: output-name collision '$stem'"
    Write-Host "  already claimed by: $($claimed[$stem])"
    Write-Host "  now also wanted by: $($f.FullName)"
    exit 1
  }
  $claimed[$stem] = $f.FullName
  $job = Start-Job -ScriptBlock {
    param($src, $dst, $rel)
    $word = New-Object -ComObject Word.Application
    $word.Visible = $false; $word.DisplayAlerts = 0
    try {
      $doc = $word.Documents.Open($src, $false, $true, $false)
      $tables = @()
      $ti = 0
      foreach ($t in $doc.Tables) {
        $ti++
        $rows = @()
        $ri = 0
        foreach ($r in $t.Rows) {
          $ri++
          $cells = @()
          # Cells() can throw on vertically-merged rows; the row is still real,
          # so it is emitted with whatever cells were reachable rather than
          # dropped. A silently dropped row is a silently lost line item.
          try {
            foreach ($c in $r.Cells) {
              $txt = ($c.Range.Text -replace "[\a\r\n]", ' ').Trim() -replace '\s+', ' '
              $cells += $txt
            }
          } catch { $cells += '<<merged-row: cells unreadable>>' }
          $rows += ,@{ r = $ri; cells = $cells }
        }
        $tables += ,@{ t = $ti; rows = $rows }
      }
      # Paragraphs outside tables carry section headings on some masters.
      $paras = @()
      $pi = 0
      foreach ($p in $doc.Paragraphs) {
        $pi++
        if ($p.Range.Tables.Count -gt 0) { continue }
        $txt = ($p.Range.Text -replace "[\a\r\n]", ' ').Trim() -replace '\s+', ' '
        if ($txt.Length -ge 3) { $paras += ,@{ p = $pi; text = $txt } }
      }
      try { $doc.Close($false) } catch { }
      $obj = @{ source = $rel; tables = $tables; paragraphs = $paras }
      $json = $obj | ConvertTo-Json -Depth 8 -Compress
      [IO.File]::WriteAllText($dst, $json, [Text.UTF8Encoding]::new($false))
      "OK tables=$($tables.Count) paras=$($paras.Count)"
    } finally {
      try { $word.Quit() } catch { }
      try { [Runtime.InteropServices.Marshal]::ReleaseComObject($word) | Out-Null } catch { }
    }
  } -ArgumentList $f.FullName, $dest, $f.FullName.Substring($Repo.Length + 1)

  $waited = Wait-Job $job -Timeout $TimeoutSec
  if ($null -eq $waited) {
    Stop-Job $job -ErrorAction SilentlyContinue; Remove-Job $job -Force -ErrorAction SilentlyContinue
    Write-Host ("  HANG  {0}" -f $f.Name); $failed++
  } else {
    $msg = (Receive-Job $job -ErrorAction SilentlyContinue) -join ' '
    $errText = $job.ChildJobs[0].Error | Out-String
    Remove-Job $job -Force -ErrorAction SilentlyContinue
    if ($msg -match '^OK' -and (Test-Path -LiteralPath $dest)) {
      Write-Host ("  ok    {0,-46} {1}" -f $f.Name.Substring(0, [Math]::Min(46, $f.Name.Length)), $msg); $okCount++
    } else {
      Write-Host ("  FAIL  {0} {1} {2}" -f $f.Name, $msg, $errText); $failed++
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
Write-Host "dumped $okCount/$($batch.Count) to out/startup-mining/csp/  (failed $failed)"
if ($okCount -eq 0) { Write-Host 'REFUSE: nothing dumped'; exit 1 }
if ($failed -gt 0) { Write-Host 'REFUSE: batch incomplete -- a partial dump must not read as a batch'; exit 1 }

# COUNT THE ARTIFACTS, NOT THE SUCCESSES. The first run of this harness reported
# "dumped 71/71" while 23 files were being overwritten -- every write succeeded,
# and the batch was still wrong. Success counts measure the loop; file counts
# measure the outcome.
$onDisk = @(Get-ChildItem -Path $OutDir -Filter '*.json' -File).Count
Write-Host "files on disk: $onDisk"
if ($Skip -eq 0 -and $onDisk -lt $okCount) {
  Write-Host "REFUSE: $okCount dumped but only $onDisk files exist -- names are colliding"
  exit 1
}
exit 0
