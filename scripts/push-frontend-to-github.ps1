# Publish Vite/React frontend to GitHub (wacherfrontend). Excludes server/ and build artifacts.
#
# Private repo: Git must authenticate as wacheit26-bit (not another GitHub account).
# Option A — one-time in PowerShell (do not paste the token in chat):
#   $env:WACHERFRONTEND_GITHUB_PAT = "ghp_xxxxxxxx"
#   .\scripts\push-frontend-to-github.ps1 -Message "Frontend update"
# Option B — Git Credential Manager: run `git ls-remote` on the repo URL and sign in as wacheit26-bit
#   (PAT as password). Clear stale GitHub login if you see "Repository not found" on a private repo.
#
# Usage: .\scripts\push-frontend-to-github.ps1 [-Message "your commit message"]

param(
  [string]$Message = "Frontend update",
  [string]$GitHubPat = $env:WACHERFRONTEND_GITHUB_PAT
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $Root

if (-not (Test-Path "src\main.jsx")) {
  Write-Error "Run this from the Wache project root (src\main.jsx missing)."
}

$FrontendRepo = "wacheit26-bit/wacherfrontend"
$FrontendRemoteUrl = "https://github.com/$FrontendRepo.git"

function Get-AuthenticatedRemoteUrl {
  param([string]$Pat)
  if ([string]::IsNullOrWhiteSpace($Pat)) {
    return $FrontendRemoteUrl
  }
  $token = $Pat.Trim()
  return "https://wacheit26-bit:${token}@github.com/$FrontendRepo.git"
}

$PushRemoteUrl = Get-AuthenticatedRemoteUrl -Pat $GitHubPat

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
  git -c user.email="wacheit26-bit@users.noreply.github.com" -c user.name="wacheit26-bit" commit -m $Message
  Write-Host "Committed frontend changes on local main."
} else {
  Write-Host "No frontend path changes to commit on local main."
}

$remoteList = @(git remote 2>$null)
if ($remoteList -contains "frontend") {
  git remote set-url frontend $FrontendRemoteUrl
} else {
  git remote add frontend $FrontendRemoteUrl
}

Write-Host "Checking access to $FrontendRemoteUrl ..."
$prevEap = $ErrorActionPreference
$ErrorActionPreference = "Continue"
$probe = git ls-remote $PushRemoteUrl HEAD 2>&1
$ErrorActionPreference = $prevEap
if (-not $probe -or ($probe -match "not found|Authentication failed|Permission denied|Invalid username or password")) {
  Write-Host ""
  Write-Host "Cannot access the private repo. GitHub often says 'Repository not found' when:"
  Write-Host "  - You are signed in as a different GitHub user (e.g. succ-cloud), or"
  Write-Host "  - No PAT is configured for wacheit26-bit."
  Write-Host ""
  Write-Host "Fix: GitHub -> Settings -> Developer settings -> Personal access tokens ->"
  Write-Host "  classic token with 'repo' scope for wacheit26-bit, then in THIS terminal:"
  Write-Host '  $env:WACHERFRONTEND_GITHUB_PAT = "ghp_your_token_here"'
  Write-Host "  .\scripts\push-frontend-to-github.ps1 -Message `"$Message`""
  Write-Host ""
  exit 1
}

$ArchiveArgs = $FrontendPaths | Where-Object { Test-Path (Join-Path $Root $_) }
if (-not $ArchiveArgs.Count) {
  Write-Error "Nothing to publish - no frontend paths found."
}

$PublishDir = Join-Path $env:TEMP ("wacherfrontend-publish-{0}" -f [guid]::NewGuid().ToString("n"))
New-Item -ItemType Directory -Path $PublishDir | Out-Null

$zipFile = Join-Path $env:TEMP ("wache-frontend-{0}.zip" -f [guid]::NewGuid().ToString("n"))
try {
  & git -C $Root archive --format=zip -o $zipFile HEAD -- @ArchiveArgs
  if (-not (Test-Path $zipFile)) {
    Write-Error "git archive failed to create $zipFile"
  }
  Expand-Archive -Path $zipFile -DestinationPath $PublishDir -Force
} finally {
  if (Test-Path $zipFile) {
    Remove-Item -Force $zipFile
  }
}

Push-Location $PublishDir
git init -b main | Out-Null
git remote add origin $PushRemoteUrl
git add -A
git -c user.email="wacheit26-bit@users.noreply.github.com" -c user.name="wacheit26-bit" commit -m $Message

$ErrorActionPreference = "Continue"
$remoteMain = git ls-remote --heads origin main 2>&1
$ErrorActionPreference = "Stop"
if ($remoteMain -match "not granted|Authentication failed|Permission denied|Invalid username") {
  Write-Host ""
  Write-Host "GitHub rejected this token for wacheit26-bit/wacherfrontend."
  Write-Host "Use a classic PAT with the 'repo' scope, owned by wacheit26-bit."
  Write-Host "If you use a fine-grained token, grant Contents: Read and write on this repo."
  Pop-Location
  Remove-Item -Recurse -Force $PublishDir -ErrorAction SilentlyContinue
  Set-Location $Root
  exit 1
}

if ($remoteMain -match "refs/heads/main") {
  git pull --rebase origin main
  git push origin main
} else {
  git push -u origin main
}
if ($LASTEXITCODE -ne 0) {
  Write-Host "git push failed. Check token scopes and that the repo exists under wacheit26-bit."
  Pop-Location
  Remove-Item -Recurse -Force $PublishDir -ErrorAction SilentlyContinue
  Set-Location $Root
  exit 1
}
Pop-Location

Remove-Item -Recurse -Force $PublishDir -ErrorAction SilentlyContinue
Set-Location $Root
Write-Host "Pushed frontend to https://github.com/$FrontendRepo (branch main)."
