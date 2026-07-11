param(
  [Parameter(Mandatory = $true)]
  [string]$HostIp,
  [string]$User = "ubuntu"
)

$ErrorActionPreference = "Stop"

$projectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$zipPath = Join-Path $env:TEMP "ai-comic-workbench-deploy.zip"
$remoteZip = "/home/$User/ai-comic-workbench-deploy.zip"
$remoteDir = "/home/$User/ai-comic-workbench"
$target = "$User@$HostIp"
$postgresPassword = "ai_comic_$([DateTimeOffset]::UtcNow.ToUnixTimeSeconds())_db_pw"

Set-Location $projectRoot

if (Test-Path $zipPath) {
  Remove-Item $zipPath -Force
}

$excludeTop = @("node_modules", ".next", "dist", ".git", "logs", "reports", ".superpowers")
$excludeFiles = @(".env", ".env.cvm", ".env.tencent")
$items = Get-ChildItem -Force | Where-Object {
  $excludeTop -notcontains $_.Name `
    -and $excludeFiles -notcontains $_.Name `
    -and $_.Name -notlike "dev*.log" `
    -and $_.Name -notlike "dev*.err.log"
}

Compress-Archive -Path $items.FullName -DestinationPath $zipPath -Force

Write-Host "Uploading deployment package to $target ..."
scp $zipPath "${target}:$remoteZip"

$remoteScript = @"
set -e
sudo apt-get update
sudo apt-get install -y ca-certificates curl git unzip
if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sudo sh
fi
sudo usermod -aG docker "$User" || true
envBackup="/home/$User/ai-comic-workbench.env.cvm.backup"
if [ -f "$remoteDir/.env.cvm" ]; then
  cp "$remoteDir/.env.cvm" "$envBackup"
fi
rm -rf "$remoteDir"
mkdir -p "$remoteDir"
unzip -q -o "$remoteZip" -d "$remoteDir"
cd "$remoteDir"
if [ -f "$envBackup" ]; then
  cp "$envBackup" .env.cvm
else
  cp .env.cvm.example .env.cvm
fi
set_env() {
  key="$1"
  value="$2"
  if grep -q "^$key=" .env.cvm; then
    sed -i "s#^$key=.*#$key=$value#" .env.cvm
  else
    printf '\n%s=%s\n' "$key" "$value" >> .env.cvm
  fi
}
set_env WEB_ORIGIN "http://$HostIp"
if ! grep -q '^POSTGRES_PASSWORD=' .env.cvm || grep -q '^POSTGRES_PASSWORD=change-this' .env.cvm; then
  set_env POSTGRES_PASSWORD "$postgresPassword"
fi
docker compose --env-file .env.cvm -f docker-compose.cvm.yml up -d --build
docker compose --env-file .env.cvm -f docker-compose.cvm.yml ps
curl -fsS http://127.0.0.1/api/health
"@

Write-Host "Installing and starting the app on $target ..."
ssh $target $remoteScript

Write-Host ""
Write-Host "Deployment finished. Open: http://$HostIp"
Write-Host "For real AI generation, SSH into the server, edit $remoteDir/.env.cvm, add API keys, then run:"
Write-Host "cd $remoteDir && docker compose --env-file .env.cvm -f docker-compose.cvm.yml up -d"
