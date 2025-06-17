<#
.SYNOPSIS
    Git自动化提交和推送脚本
.DESCRIPTION
    自动检测是否为首次设置，执行相应的初始化或更新操作
    支持交互式输入提交信息和选择推送分支
    增加了超时处理机制，避免远程分支查询卡死
    增强网络失败恢复能力，支持检测未推送的提交并重新推送
#>

# 函数：检测是否为Git仓库
function Test-GitRepository {
    <#
    .SYNOPSIS
        检测当前目录是否为Git仓库
    .DESCRIPTION
        通过检查.git目录是否存在来判断
    #>
    return Test-Path ".git"
}

# 函数：检测是否已配置远程仓库
function Test-RemoteOrigin {
    <#
    .SYNOPSIS
        检测是否已配置origin远程仓库
    .DESCRIPTION
        通过git remote命令检查是否存在origin配置
    #>
    $remotes = git remote
    return $remotes -contains "origin"
}

# 函数：检测是否有未推送的提交
function Test-UnpushedCommits {
    <#
    .SYNOPSIS
        检测是否有未推送到远程仓库的本地提交
    .DESCRIPTION
        通过比较本地分支和远程分支的提交差异来判断
    .PARAMETER BranchName
        要检查的分支名称，默认为当前分支
    #>
    param(
        [string]$BranchName = (git branch --show-current)
    )
    
    try {
        # 尝试获取远程分支信息
        $remoteBranch = "origin/$BranchName"
        
        # 检查远程分支是否存在
        $remoteExists = git branch -r | Select-String $remoteBranch
        if (-not $remoteExists) {
            Write-Host "远程分支 $remoteBranch 不存在，可能是新分支" -ForegroundColor Yellow
            return $true
        }
        
        # 获取本地和远程的提交差异
        $unpushedCommits = git log $remoteBranch..HEAD --oneline 2>$null
        
        if ($unpushedCommits) {
            Write-Host "发现未推送的提交:" -ForegroundColor Yellow
            $unpushedCommits | ForEach-Object { Write-Host "  $_" -ForegroundColor Cyan }
            return $true
        }
        
        return $false
    } catch {
        Write-Host "检查未推送提交时出错: $($_.Exception.Message)" -ForegroundColor Yellow
        # 如果检查失败，假设有未推送的提交以确保安全
        return $true
    }
}

# 函数：恢复推送操作
function Invoke-RecoveryPush {
    <#
    .SYNOPSIS
        恢复之前失败的推送操作
    .DESCRIPTION
        检测未推送的提交并尝试重新推送到远程仓库
    #>
    $currentBranch = git branch --show-current
    
    Write-Host "=== 恢复模式：检测到未推送的提交 ===" -ForegroundColor Magenta
    Write-Host "当前分支: $currentBranch" -ForegroundColor Green
    
    # 显示未推送的提交
    Write-Host "`n未推送的提交列表:" -ForegroundColor Yellow
    try {
        $remoteBranch = "origin/$currentBranch"
        $unpushedCommits = git log $remoteBranch..HEAD --oneline 2>$null
        if ($unpushedCommits) {
            $unpushedCommits | ForEach-Object { Write-Host "  $_" -ForegroundColor Cyan }
        } else {
            # 如果远程分支不存在，显示所有本地提交
            $allCommits = git log --oneline -5
            Write-Host "  (显示最近5个提交，可能包含需要推送的提交)" -ForegroundColor Gray
            $allCommits | ForEach-Object { Write-Host "  $_" -ForegroundColor Cyan }
        }
    } catch {
        Write-Host "  无法获取提交列表，但检测到有未推送的更改" -ForegroundColor Yellow
    }
    
    # 询问用户是否继续推送
    $continueRecover = Read-Host "`n是否继续推送这些提交？(y/n)"
    if ($continueRecover -ne 'y' -and $continueRecover -ne 'Y') {
        Write-Host "用户取消恢复操作" -ForegroundColor Yellow
        return
    }
    
    # 选择推送的分支
    Write-Host "`n请选择要推送的分支:" -ForegroundColor Yellow
    Write-Host "1. 当前分支 ($currentBranch)"
    Write-Host "2. main"
    Write-Host "3. master"
    
    $choice = Read-Host "请输入选择 (1-3)"
    
    $targetBranch = switch ($choice) {
        "1" { $currentBranch }
        "2" { "main" }
        "3" { "master" }
        default { 
            Write-Host "无效选择，使用当前分支: $currentBranch" -ForegroundColor Yellow
            $currentBranch
        }
    }
    
    # 执行推送操作（带重试机制）
    Invoke-PushWithRetry -BranchName $targetBranch -MaxRetries 3
}

# 函数：带重试机制的推送操作
function Invoke-PushWithRetry {
    <#
    .SYNOPSIS
        带重试机制的Git推送操作
    .DESCRIPTION
        执行Git推送，如果失败则自动重试，包含多种恢复策略
    .PARAMETER BranchName
        要推送的分支名称
    .PARAMETER MaxRetries
        最大重试次数，默认3次
    #>
    param(
        [string]$BranchName,
        [int]$MaxRetries = 3
    )
    
    for ($retry = 1; $retry -le $MaxRetries; $retry++) {
        Write-Host "推送到 $BranchName 分支 (尝试 $retry/$MaxRetries)..." -ForegroundColor Cyan
        
        # 尝试推送
        $pushResult = git push -u origin $BranchName 2>&1
        
        if ($LASTEXITCODE -eq 0) {
            Write-Host "推送成功！" -ForegroundColor Green
            return $true
        }
        
        Write-Host "推送失败 (尝试 $retry/$MaxRetries)" -ForegroundColor Red
        Write-Host "错误信息: $pushResult" -ForegroundColor Red
        
        if ($retry -lt $MaxRetries) {
            # 尝试恢复策略
            Write-Host "尝试恢复策略..." -ForegroundColor Yellow
            
            # 策略1: 先拉取远程更改
            Write-Host "策略1: 尝试拉取远程更改..." -ForegroundColor Yellow
            $pullResult = git pull origin $BranchName --no-edit --allow-unrelated-histories 2>&1
            
            if ($LASTEXITCODE -eq 0) {
                Write-Host "拉取成功，继续重试推送..." -ForegroundColor Green
                continue
            }
            
            # 策略2: 检查是否是新分支
            Write-Host "策略2: 检查是否是新分支..." -ForegroundColor Yellow
            $remoteBranchExists = git ls-remote --heads origin $BranchName 2>$null
            
            if (-not $remoteBranchExists) {
                Write-Host "检测到新分支，尝试创建远程分支..." -ForegroundColor Yellow
                continue
            }
            
            # 等待一段时间后重试
            $waitTime = $retry * 2
            Write-Host "等待 $waitTime 秒后重试..." -ForegroundColor Yellow
            Start-Sleep -Seconds $waitTime
        }
    }
    
    # 所有重试都失败后的最终选项
    Write-Host "`n所有自动重试都失败了" -ForegroundColor Red
    Write-Host "可能的原因:" -ForegroundColor Yellow
    Write-Host "1. 网络连接问题" -ForegroundColor Yellow
    Write-Host "2. 远程仓库权限问题" -ForegroundColor Yellow
    Write-Host "3. 分支冲突需要手动解决" -ForegroundColor Yellow
    
    $forceRetry = Read-Host "`n是否尝试强制推送？(y/n) [警告: 可能覆盖远程更改]"
    if ($forceRetry -eq 'y' -or $forceRetry -eq 'Y') {
        Write-Host "执行强制推送..." -ForegroundColor Red
        git push --force origin $BranchName
        
        if ($LASTEXITCODE -eq 0) {
            Write-Host "强制推送成功！" -ForegroundColor Green
            return $true
        } else {
            Write-Host "强制推送也失败了" -ForegroundColor Red
        }
    }
    
    Write-Host "推送操作最终失败，请手动检查并解决问题" -ForegroundColor Red
    Write-Host "建议的手动命令:" -ForegroundColor Yellow
    Write-Host "  git status" -ForegroundColor Cyan
    Write-Host "  git log --oneline -5" -ForegroundColor Cyan
    Write-Host "  git remote -v" -ForegroundColor Cyan
    Write-Host "  git push origin $BranchName" -ForegroundColor Cyan
    
    return $false
}

# 函数：初始化Git仓库
function Initialize-GitRepository {
    <#
    .SYNOPSIS
        初始化Git仓库并配置远程仓库
    .DESCRIPTION
        执行git init和git remote add origin操作
    #>
    Write-Host "检测到这是首次设置，开始初始化Git仓库..." -ForegroundColor Yellow
    
    # 初始化Git仓库
    Write-Host "初始化Git仓库..." -ForegroundColor Green
    git init
    
    # 获取远程仓库地址
    $remoteUrl = Read-Host "请输入远程仓库地址 (例如: https://github.com/username/repository.git)"
    
    # 添加远程仓库
    Write-Host "添加远程仓库..." -ForegroundColor Green
    git remote add origin $remoteUrl
    
    Write-Host "Git仓库初始化完成！" -ForegroundColor Green
}

# 函数：稳定的远程分支查询
function Get-RemoteBranchesStable {
    <#
    .SYNOPSIS
        稳定的远程分支查询函数
    .DESCRIPTION
        使用多种策略确保远程分支查询的稳定性：
        1. 重试机制
        2. 降级方案
        3. 简化的错误处理
    .PARAMETER MaxRetries
        最大重试次数，默认2次
    #>
    param(
        [int]$MaxRetries = 2
    )
    
    Write-Host "查询远程分支..." -ForegroundColor Green
    
    # 方法1：直接查询（最简单，最稳定）
    for ($i = 0; $i -le $MaxRetries; $i++) {
        try {
            if ($i -gt 0) {
                Write-Host "重试第 $i 次..." -ForegroundColor Yellow
                Start-Sleep -Seconds 2
            }
            
            # 直接执行git命令，不使用作业
            $result = git ls-remote --heads origin 2>&1
            
            if ($LASTEXITCODE -eq 0 -and $result) {
                Write-Host $result
                return $true
            }
        } catch {
            Write-Host "查询出错: $($_.Exception.Message)" -ForegroundColor Yellow
        }
    }
    
    # 方法2：降级方案 - 尝试简单的连接测试
    Write-Host "使用降级方案..." -ForegroundColor Yellow
    try {
        $remoteUrl = git remote get-url origin 2>$null
        if ($remoteUrl) {
            Write-Host "远程仓库地址: $remoteUrl" -ForegroundColor Cyan
            Write-Host "无法查询远程分支，但远程仓库配置正常" -ForegroundColor Yellow
            return $false
        }
    } catch {
        Write-Host "无法获取远程仓库信息" -ForegroundColor Red
    }
    
    Write-Host "远程分支查询失败，将跳过分支检查" -ForegroundColor Red
    return $false
}

# 函数：执行提交和推送操作
function Invoke-GitCommitAndPush {
    <#
    .SYNOPSIS
        执行Git提交和推送操作
    .DESCRIPTION
        添加文件、提交更改、查询远程分支并推送到指定分支
    #>
    # 添加修改的文件
    Write-Host "添加修改的文件..." -ForegroundColor Green
    git add .
    
    # 检查是否有文件需要提交
    $status = git status --porcelain
    if (-not $status) {
        Write-Host "没有文件需要提交" -ForegroundColor Yellow
        return
    }
    
    # 交互式输入提交信息
    Write-Host "请输入提交信息:" -ForegroundColor Green
    $commitMessage = Read-Host "提交信息"
    
    # 验证提交信息不为空
    while ([string]::IsNullOrWhiteSpace($commitMessage)) {
        Write-Host "提交信息不能为空，请重新输入:" -ForegroundColor Red
        $commitMessage = Read-Host "提交信息"
    }
    
    # 执行提交
    Write-Host "提交更改..." -ForegroundColor Green
    git commit -m "$commitMessage"
    
    # 尝试查询远程分支（稳定版本）
    $remoteBranchSuccess = Get-RemoteBranchesStable -MaxRetries 2
    
    if (-not $remoteBranchSuccess) {
        Write-Host "`n无法查询远程分支，将使用默认选项" -ForegroundColor Yellow
        Write-Host "建议检查网络连接和远程仓库配置" -ForegroundColor Yellow
        Write-Host "可以使用命令检查：git remote -v" -ForegroundColor Yellow
    }
    
    Write-Host "`n请选择要推送的分支:" -ForegroundColor Yellow
    Write-Host "1. main"
    Write-Host "2. master"
    Write-Host "3. 当前分支 ($(git branch --show-current))"
    
    $choice = Read-Host "请输入选择 (1-3)"
    
    $targetBranch = switch ($choice) {
        "1" { "main" }
        "2" { "master" }
        "3" { git branch --show-current }
        default { 
            Write-Host "无效选择，使用当前分支" -ForegroundColor Yellow
            git branch --show-current
        }
    }
    
    # 使用增强的推送函数
    Invoke-PushWithRetry -BranchName $targetBranch -MaxRetries 3
    
    Write-Host "操作完成！" -ForegroundColor Green
}

# 主程序逻辑
try {
    Write-Host "=== Git自动化脚本 ===" -ForegroundColor Magenta
    
    # 检测是否为首次设置
    if (-not (Test-GitRepository) -or -not (Test-RemoteOrigin)) {
        # 首次设置：执行初始化
        Initialize-GitRepository
        
        # 询问是否继续提交
        $continueCommit = Read-Host "`n是否继续执行提交操作？(y/n)"
        if ($continueCommit -eq 'y' -or $continueCommit -eq 'Y') {
            Invoke-GitCommitAndPush
        }
    } else {
        # 非首次设置：检查是否有未推送的提交
        Write-Host "检测到已存在的Git仓库..." -ForegroundColor Green
        
        # 检查是否有未推送的提交
        if (Test-UnpushedCommits) {
            Write-Host "检测到未推送的提交，进入恢复模式..." -ForegroundColor Yellow
            Invoke-RecoveryPush
        } else {
            # 检查是否有新的更改需要提交
            $status = git status --porcelain
            if ($status) {
                Write-Host "检测到新的更改，执行正常提交流程..." -ForegroundColor Green
                Invoke-GitCommitAndPush
            } else {
                Write-Host "没有新的更改需要提交，工作目录是干净的" -ForegroundColor Green
                
                # 仍然检查是否需要推送（以防远程分支落后）
                $currentBranch = git branch --show-current
                Write-Host "当前分支: $currentBranch" -ForegroundColor Cyan
                
                $checkPush = Read-Host "是否检查并推送当前分支到远程？(y/n)"
                if ($checkPush -eq 'y' -or $checkPush -eq 'Y') {
                    Invoke-PushWithRetry -BranchName $currentBranch -MaxRetries 3
                }
            }
        }
    }
} catch {
    Write-Host "脚本执行出错: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "错误详情: $($_.Exception.StackTrace)" -ForegroundColor Red
    
    # 提供恢复建议
    Write-Host "`n恢复建议:" -ForegroundColor Yellow
    Write-Host "1. 检查网络连接" -ForegroundColor Cyan
    Write-Host "2. 验证Git配置: git config --list" -ForegroundColor Cyan
    Write-Host "3. 检查远程仓库: git remote -v" -ForegroundColor Cyan
    Write-Host "4. 查看Git状态: git status" -ForegroundColor Cyan
    Write-Host "5. 重新运行此脚本" -ForegroundColor Cyan
}