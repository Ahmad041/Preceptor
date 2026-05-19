# Script untuk memastikan Ollama berjalan
$processName = "ollama"
$check = Get-Process $processName -ErrorAction SilentlyContinue

if ($check -eq $null) {
    Write-Host "------------------------------------------"
    Write-Host "⚠️  OLLAMA OFFLINE" -ForegroundColor Yellow
    Write-Host "Mencoba menyalakan Ollama serve..."
    
    # Jalankan ollama serve secara detatched
    Start-Process "ollama" -ArgumentList "serve" -WindowStyle Hidden
    
    # Tunggu beberapa detik agar server up
    for ($i = 1; $i -le 5; $i++) {
        Write-Host "Menunggu server siap... ($i/5)"
        Start-Sleep -Seconds 1
    }
    
    Write-Host "✅ Ollama seharusnya sudah aktif sekarang." -ForegroundColor Green
    Write-Host "------------------------------------------"
} else {
    Write-Host "✅ Ollama sudah berjalan (PID: $($check.Id))" -ForegroundColor Cyan
}
