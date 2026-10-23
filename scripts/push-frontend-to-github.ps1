# Publish Vite/React frontend to GitHub (wacherfrontend). Excludes server/ and build artifacts.
# Usage: .\scripts\push-frontend-to-github.ps1 [-Message "your commit message"]

param(
  [string]$Message = "Frontend update"
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $Root

if (-not (Test-Path "src\main.jsx")) {
  Write-Error "Run this from the Wache project root (src\main.jsx missing)."
}

$FrontendRemoteUrl = "https://github.com/wacheit26-bit/wacherfrontend.git"
$PublishDir = Join-Path $Root ".frontend-publish"

$FrontendPaths = @(
  "index.html",
  "package.json",
  "package-lock.json",
  "vite.config.js",
  "tailwind.config.js",
  "netlify.toml",
  ".env.example",
  ".gitignore",
  "README.md",
  "public",
  "src",
  "scripts/push-frontend-to-github.ps1",
  "scripts/hostinger-deploy-frontend.sh",
  "docs/HOSTINGER-FRONTEND.md"
)

foreach ($path in $FrontendPaths) {
  if (Test-Path (Join-Path $Root $path)) {
    git add -- "$path"
  }
}

$Status = git status --porcelain -- @FrontendPaths
if ($Status) {
  git -c user.email="succ-cloud@users.noreply.github.com" -c user.name="succ-cloud" commit -m $Message
  Write-Host "Committed frontend changes on local main."
} else {
  Write-Host "No frontend path changes to commit on local main."
}

$remoteList = @(git remote 2>$null)
if ($remoteList -notcontains "frontend") {
  git remote add frontend $FrontendRemoteUrl
  Write-Host "Added git remote 'frontend' -> $FrontendRemoteUrl"
}

function Ensure-PublishRepo {
  if (Test-Path (Join-Path $PublishDir ".git")) {
    Push-Location $PublishDir
    $prevEap = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    git fetch origin 2>$null | Out-Null
    if (git ls-remote --heads origin main 2>$null) {
      git checkout main 2>$null | Out-Null
      git reset --hard origin/main 2>$null | Out-Null
    } else {
      git checkout -B main 2>$null | Out-Null
    }
    $ErrorActionPreference = $prevEap
    Pop-Location
    return
  }

  New-Item -ItemType Directory -Path $PublishDir -Force | Out-Null
  Set-Location $PublishDir
  if (-not (Test-Path ".git")) {
    git init -b main | Out-Null
    git remote add origin $FrontendRemoteUrl
  }
  Set-Location $Root
}

Ensure-PublishRepo

$ArchiveArgs = $FrontendPaths | Where-Object { Test-Path (Join-Path $Root $_) }
if (-not $ArchiveArgs.Count) {
  Write-Error "Nothing to publish - no frontend paths found."
}

$stagingDir = Join-Path $PublishDir "_staging"
if (Test-Path $stagingDir) {
  Remove-Item -Recurse -Force $stagingDir -ErrorAction SilentlyContinue
}
New-Item -ItemType Directory -Path $stagingDir | Out-Null
$zipFile = Join-Path $env:TEMP ("wache-frontend-{0}.zip" -f [guid]::NewGuid().ToString("n"))
try {
  & git -C $Root archive --format=zip -o $zipFile HEAD -- @ArchiveArgs
  if (-not (Test-Path $zipFile)) {
    Write-Error "git archive failed to create $zipFile"
  }
  Expand-Archive -Path $zipFile -DestinationPath $stagingDir -Force
  Get-ChildItem -Path $stagingDir -Force | ForEach-Object {
    Copy-Item -Path $_.FullName -Destination $PublishDir -Recurse -Force
  }
} finally {
  if (Test-Path $zipFile) {
    Remove-Item -Force $zipFile
  }
  if (Test-Path $stagingDir) {
    Remove-Item -Recurse -Force $stagingDir -ErrorAction SilentlyContinue
  }
}

Set-Location $PublishDir
git add -A
$PublishStatus = git status --porcelain
if (-not $PublishStatus) {
  Write-Host "No changes to publish (frontend repo already up to date)."
  Set-Location $Root
  exit 0
}

git -c user.email="succ-cloud@users.noreply.github.com" -c user.name="succ-cloud" commit -m $Message

git fetch origin 2>$null
$remoteMain = git ls-remote --heads origin main 2>$null
if ($remoteMain) {
  git pull --rebase origin main
  git push origin main
} else {
  git push -u origin main
}

Set-Location $Root
Write-Host "Pushed frontend to $FrontendRemoteUrl on branch main."
