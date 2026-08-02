<#
.SYNOPSIS
    Wakes the SuperKart deployment Codespace and republishes its three ports.

.DESCRIPTION
    A Codespace that has been idle drops to a stopped state, and even after
    it comes back the port forwarding it needs to serve public URLs does not
    survive the stop, every port resets to private. This script folds the
    resume plus the two follow up gh CLI steps needed to fix that into one
    command, instead of running four or five commands by hand each time.

    Steps:
      1. Check the Codespace state, resume it over ssh if it is stopped.
      2. Wait for Docker and the three containers to come back up.
      3. Register each port's tunnel with a short lived local forward.
      4. Set each port's visibility to public.
      5. Print the three public URLs so they are ready to open or share.

.PARAMETER CodespaceName
    Name of the Codespace to wake, defaults to the live SuperKart deployment.

.EXAMPLE
    ./scripts/resume_codespace.ps1
#>

param(
    [string]$CodespaceName = "superkart-deploy3-wj54597j97f5vjp"
)

$ErrorActionPreference = "Stop"

# port, label, and a spare local port used only to register the tunnel
$Ports = @(
    @{ Remote = 7860; Local = 47860; Label = "Backend API" },
    @{ Remote = 8501; Local = 48501; Label = "Web Components UI" },
    @{ Remote = 8502; Local = 48502; Label = "Streamlit UI" }
)

function Get-CodespaceState {
    $json = gh codespace view --codespace $CodespaceName --json state | ConvertFrom-Json
    return $json.state
}

Write-Host "Checking state of $CodespaceName..."
$state = Get-CodespaceState
Write-Host "Current state: $state"

if ($state -ne "Available") {
    Write-Host "Codespace is not running, resuming over ssh..."
    gh codespace ssh --codespace $CodespaceName -- "echo resumed" | Out-Null

    # docker itself can take a few seconds to come back after a resume
    $dockerReady = $false
    for ($i = 0; $i -lt 12; $i++) {
        Start-Sleep -Seconds 5
        $running = gh codespace ssh --codespace $CodespaceName -- "docker ps --format '{{.Names}}'" 2>$null
        if ($running -match "superkart-backend" -and $running -match "superkart-frontend" -and $running -match "superkart-streamlit") {
            $dockerReady = $true
            break
        }
    }
    if (-not $dockerReady) {
        Write-Warning "Containers did not all report running yet, continuing anyway, check 'docker ps' manually if URLs do not work."
    } else {
        Write-Host "All three containers are up."
    }
} else {
    Write-Host "Codespace is already running."
}

Write-Host ""
Write-Host "Registering port tunnels..."
foreach ($p in $Ports) {
    $job = Start-Job -ScriptBlock {
        param($cs, $remote, $local)
        gh codespace ports forward "${remote}:${local}" --codespace $cs
    } -ArgumentList $CodespaceName, $p.Remote, $p.Local
    Start-Sleep -Seconds 6
    Stop-Job -Job $job -ErrorAction SilentlyContinue | Out-Null
    Remove-Job -Job $job -Force -ErrorAction SilentlyContinue | Out-Null
}

Write-Host ""
Write-Host "Setting port visibility to public..."
foreach ($p in $Ports) {
    gh codespace ports visibility "$($p.Remote):public" --codespace $CodespaceName | Out-Null
}

Start-Sleep -Seconds 3

Write-Host ""
Write-Host "Final port status:"
gh codespace ports --codespace $CodespaceName

Write-Host ""
Write-Host "Public URLs:"
foreach ($p in $Ports) {
    Write-Host "  $($p.Label): https://$CodespaceName-$($p.Remote).app.github.dev"
}
