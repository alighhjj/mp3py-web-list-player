# 修改music_data.json中的src字段
$jsonPath = ".\music_data.json"

# 读取JSON内容
$jsonContent = Get-Content $jsonPath -Raw

# 解析JSON
$jsonObject = $jsonContent | ConvertFrom-Json

# 遍历所有歌曲，修改src字段
foreach ($song in $jsonObject.songs) {
    if ($song.src -eq $null) {
        $song.src = "https://music.163.com/song/media/outer/url?id=$($song.trackId)"
    }
}

# 转换回JSON并保存
$newJsonContent = $jsonObject | ConvertTo-Json -Depth 10
$newJsonContent | Set-Content $jsonPath -Encoding UTF8

Write-Host "已成功修改所有src为null的条目"
Write-Host "修改的文件: $jsonPath"