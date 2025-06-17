<#
.SYNOPSIS
    修复JSON文件中的HTTP图片链接为HTTPS
.DESCRIPTION
    批量将所有JSON文件中的网易云音乐HTTP图片链接替换为HTTPS，解决混合内容安全警告
.AUTHOR
    Auto Generated Script
.DATE
    $(Get-Date -Format 'yyyy-MM-dd')
#>

# 设置控制台编码为UTF-8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

# 定义需要处理的目录列表
$directories = @(
    "final_list",
    "final_list_bak", 
    "final_list_default",
    "origon_list"
)

# 定义HTTP到HTTPS的替换规则
$replacementRules = @{
    "http://p1.music.126.net" = "https://p1.music.126.net"
    "http://p2.music.126.net" = "https://p2.music.126.net"
}

# 统计变量
$totalFilesProcessed = 0
$totalReplacements = 0
$processedDirectories = @()

<#
.SYNOPSIS
    处理单个JSON文件
.PARAMETER filePath
    文件路径
.OUTPUTS
    返回替换次数
#>
function Process-JsonFile {
    param(
        [string]$filePath
    )
    
    try {
        # 读取文件内容
        $content = Get-Content -Path $filePath -Raw -Encoding UTF8
        $originalContent = $content
        $replacementCount = 0
        
        # 应用所有替换规则
        foreach ($rule in $replacementRules.GetEnumerator()) {
            $oldPattern = [regex]::Escape($rule.Key)
            $newValue = $rule.Value
            
            # 计算替换次数
            $matches = [regex]::Matches($content, $oldPattern)
            $replacementCount += $matches.Count
            
            # 执行替换
            $content = $content -replace $oldPattern, $newValue
        }
        
        # 如果有替换，则写回文件
        if ($replacementCount -gt 0) {
            Set-Content -Path $filePath -Value $content -Encoding UTF8
            Write-Host "  ✓ 已修复 $replacementCount 个HTTP链接" -ForegroundColor Green
        } else {
            Write-Host "  - 无需修复" -ForegroundColor Gray
        }
        
        return $replacementCount
    }
    catch {
        Write-Host "  ✗ 处理失败: $($_.Exception.Message)" -ForegroundColor Red
        return 0
    }
}

<#
.SYNOPSIS
    处理指定目录下的所有JSON文件
.PARAMETER directoryPath
    目录路径
.OUTPUTS
    返回处理结果统计
#>
function Process-Directory {
    param(
        [string]$directoryPath
    )
    
    $stats = @{
        FilesProcessed = 0
        TotalReplacements = 0
        DirectoryExists = $false
    }
    
    if (-not (Test-Path $directoryPath)) {
        Write-Host "⚠️  目录不存在: $directoryPath" -ForegroundColor Yellow
        return $stats
    }
    
    $stats.DirectoryExists = $true
    Write-Host "\n📁 处理目录: $directoryPath" -ForegroundColor Cyan
    
    # 获取所有JSON文件
    $jsonFiles = Get-ChildItem -Path $directoryPath -Filter "*.json" -File
    
    if ($jsonFiles.Count -eq 0) {
        Write-Host "  📄 未找到JSON文件" -ForegroundColor Yellow
        return $stats
    }
    
    # 处理每个JSON文件
    foreach ($file in $jsonFiles) {
        Write-Host "  📄 处理文件: $($file.Name)" -ForegroundColor White
        $replacements = Process-JsonFile -filePath $file.FullName
        
        $stats.FilesProcessed++
        $stats.TotalReplacements += $replacements
    }
    
    return $stats
}

# 主程序开始
Write-Host "🚀 开始修复HTTP图片链接..." -ForegroundColor Green
Write-Host "=" * 50

# 处理每个目录
foreach ($dir in $directories) {
    $dirPath = Join-Path $PSScriptRoot $dir
    $result = Process-Directory -directoryPath $dirPath
    
    if ($result.DirectoryExists) {
        $processedDirectories += $dir
        $totalFilesProcessed += $result.FilesProcessed
        $totalReplacements += $result.TotalReplacements
        
        Write-Host "  📊 目录统计: 处理了 $($result.FilesProcessed) 个文件，修复了 $($result.TotalReplacements) 个链接" -ForegroundColor Blue
    }
}

# 输出最终统计
Write-Host "\n" + "=" * 50
Write-Host "✅ 修复完成!" -ForegroundColor Green
Write-Host "📊 总体统计:" -ForegroundColor Cyan
Write-Host "  - 处理目录数: $($processedDirectories.Count)" -ForegroundColor White
Write-Host "  - 处理文件数: $totalFilesProcessed" -ForegroundColor White
Write-Host "  - 修复链接数: $totalReplacements" -ForegroundColor White

if ($processedDirectories.Count -gt 0) {
    Write-Host "  - 已处理目录: $($processedDirectories -join ', ')" -ForegroundColor White
}

if ($totalReplacements -gt 0) {
    Write-Host "\n🎉 所有HTTP图片链接已成功替换为HTTPS!" -ForegroundColor Green
    Write-Host "💡 现在您的网站应该不会再出现混合内容警告了。" -ForegroundColor Yellow
} else {
    Write-Host "\n📝 未发现需要修复的HTTP链接。" -ForegroundColor Yellow
}

Write-Host "\n按任意键退出..." -ForegroundColor Gray
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")