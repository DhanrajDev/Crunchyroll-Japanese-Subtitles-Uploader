@echo off
set "SRT_DIR=%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$pattern = '02E([0-9]+)\.WE'; Get-ChildItem -LiteralPath $env:SRT_DIR -File -Filter '*.srt' | ForEach-Object { if ($_.BaseName -match $pattern) { $newName = [string][long]$Matches[1] + '.srt'; if ($_.Name -ieq $newName) { return }; $target = Join-Path $_.DirectoryName $newName; if (Test-Path -LiteralPath $target) { Write-Warning ('Skipped ' + $_.Name + ': ' + $newName + ' already exists'); return }; Rename-Item -LiteralPath $_.FullName -NewName $newName; Write-Host ($_.Name + ' -> ' + $newName) } }"
pause
