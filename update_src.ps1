# PowerShell脚本：修改music_data.json中的src字段
# 将src为null的值替换为网易云音乐外链URL

$jsonFile = "f:\程序\coder\mp3py-web-list-player\music_data.json"

# 读取JSON文件内容
$content = Get-Content $jsonFile -Raw -Encoding UTF8

# 使用正则表达式匹配并替换
# 匹配模式："src": null, 后面跟着任意内容直到找到 "trackId": 数字
$pattern = '"src":\s*null,([\s\S]*?)"trackId":\s*(\d+)'
$replacement = '"src": "https://music.163.com/song/media/outer/url?id=$2",$1"trackId": $2'

$newContent = $content -replace $pattern, $replacement

# 写回文件
$newContent | Out-File $jsonFile -Encoding UTF8

Write-Host "已完成src字段的修改，将null值替换为网易云音乐外链URL"
Write-Host "修改的文件：$jsonFile"