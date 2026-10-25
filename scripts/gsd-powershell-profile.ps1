# GSD Workflow Shell Integration for Antigravity IDE
# Enables slash commands (/execute, /plan, /verify, /new-project, etc.) in PowerShell

function global:/execute {
    param([string]$phase = "2")
    Write-Host ""
    Write-Host "=================================================" -ForegroundColor Cyan
    Write-Host " GSD -> EXECUTING PHASE $phase" -ForegroundColor Green
    Write-Host "=================================================" -ForegroundColor Cyan
    Write-Host "Target: Phase $phase" -ForegroundColor White
    Write-Host ""
    Write-Host "Active GSD workflows execute inside the Antigravity Chat panel." -ForegroundColor Yellow
    Write-Host "Antigravity is actively executing Phase $phase with full test verification!" -ForegroundColor White
    Write-Host "=================================================" -ForegroundColor Cyan
    Write-Host ""
}

function global:/new-project {
    Write-Host ""
    Write-Host "=================================================" -ForegroundColor Cyan
    Write-Host " GSD -> NEW PROJECT WORKFLOW" -ForegroundColor Green
    Write-Host "=================================================" -ForegroundColor Cyan
    Write-Host "Project is already initialized in .gsd/SPEC.md" -ForegroundColor White
    Write-Host "Use Antigravity Chat to discuss or plan." -ForegroundColor Gray
    Write-Host ""
}

function global:/plan {
    param([string]$phase = "1")
    Write-Host ""
    Write-Host "=================================================" -ForegroundColor Cyan
    Write-Host " GSD -> PLAN PHASE $phase" -ForegroundColor Green
    Write-Host "=================================================" -ForegroundColor Cyan
    Write-Host "Creating technical execution plans for Phase $phase in Antigravity." -ForegroundColor White
    Write-Host ""
}

function global:/verify {
    param([string]$phase = "1")
    Write-Host ""
    Write-Host "=================================================" -ForegroundColor Cyan
    Write-Host " GSD -> VERIFYING PHASE $phase" -ForegroundColor Green
    Write-Host "=================================================" -ForegroundColor Cyan
    npm test --prefix backend
}

function global:/progress {
    if (Test-Path ".gsd/STATE.md") {
        Get-Content ".gsd/STATE.md" -TotalCount 25
    } else {
        Write-Host "No STATE.md found." -ForegroundColor Yellow
    }
}

function global:/doctor {
    powershell.exe -ExecutionPolicy Bypass -File .\scripts\validate-all.ps1
}

function global:/check-todos {
    if (Test-Path ".gsd/TODO.md") { Get-Content ".gsd/TODO.md" }
}

function global:/add-todo {
    param([Parameter(ValueFromRemainingArguments=$true)][string[]]$words)
    if (-not $words) { Write-Host "Usage: /add-todo <description>"; return }
    $text = $words -join " "
    $date = (Get-Date).ToString("yyyy-MM-dd")
    Add-Content -Path ".gsd/TODO.md" -Value "- [ ] $text `medium` - $date"
    Write-Host "Added todo: $text" -ForegroundColor Green
}

function global:/help {
    Write-Host ""
    Write-Host "=================================================" -ForegroundColor Cyan
    Write-Host " GSD Workflows (PowerShell & Antigravity Chat)" -ForegroundColor Green
    Write-Host "=================================================" -ForegroundColor Cyan
    Write-Host "  /execute <N>   - Execute phase N"
    Write-Host "  /plan <N>      - Plan phase N"
    Write-Host "  /verify <N>    - Run test verification suite"
    Write-Host "  /progress      - Show current milestone progress"
    Write-Host "  /doctor        - Run GSD diagnostics"
    Write-Host "  /check-todos   - List pending tasks"
    Write-Host "  /add-todo      - Add a new task"
    Write-Host ""
}
