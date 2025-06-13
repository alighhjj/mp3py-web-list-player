const fs = require('fs');
const path = require('path');
const { searchMusicbyUser, getAlbumCover } = require('./music_api');

/**
 * 获取随机延迟时间（毫秒）
 * @param {number} min - 最小延迟时间
 * @param {number} max - 最大延迟时间
 * @returns {number} 随机延迟时间
 */
function getRandomDelay(min = 1000, max = 3000) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * 搜索单首歌曲并返回格式化结果
 * @param {object} songInfo - 歌曲信息对象，包含song和artist属性
 * @param {number} count - 每页返回的歌曲数量
 * @param {number} pages - 搜索页数
 * @returns {Array} 格式化的歌曲数据数组
 */
async function searchSingleSong(songInfo, count = 5, pages = 1) {
  const keyword = `${songInfo.song} ${songInfo.artist}`;
  const formattedSongs = [];
  
  try {
    console.log(`\n🔍 正在搜索: ${keyword}`);
    console.log('=' .repeat(50));
    
    const result = await searchMusicbyUser(keyword, 'netease', count, pages);
    
    // 检查返回结果的格式
    let songs = [];
    if (result && Array.isArray(result)) {
      songs = result;
    } else if (result && result.data && Array.isArray(result.data)) {
      songs = result.data;
    } else if (result && typeof result === 'object') {
      // 如果result是对象，尝试找到歌曲数组
      const possibleKeys = ['songs', 'list', 'results', 'items'];
      for (const key of possibleKeys) {
        if (result[key] && Array.isArray(result[key])) {
          songs = result[key];
          break;
        }
      }
    }
    
    if (songs && songs.length > 0) {
      console.log(`✅ 找到 ${songs.length} 首相关歌曲`);
      
      // 使用Promise.all并发处理所有歌曲的封面获取
      const songPromises = songs.map(async (song, index) => {
        // 处理艺术家信息（可能是数组或字符串）
        let artistInfo = '未知';
        if (Array.isArray(song.artist)) {
          artistInfo = song.artist.join(', ');
        } else if (song.artist) {
          artistInfo = song.artist;
        }
        
        // 获取专辑封面
        let coverUrl = '/icons/icon-192x192.png'; // 默认封面
        if (song.pic_id || song.pic) {
          try {
            const picId = song.pic_id || song.pic;
            coverUrl = await getAlbumCover(picId, song.source || 'netease', 2);
            console.log(`   ✓ 获取封面成功: ${song.name} - ${coverUrl}`);
          } catch (error) {
            console.log(`   ⚠️ 封面获取失败，使用默认封面: ${song.name}`);
          }
        }
        
        // 按照classic.json的格式构造歌曲对象
        const formattedSong = {
          title: song.name || '未知',
          artist: artistInfo,
          duration: song.duration || '--:--',
          src: `https://music.163.com/song/media/outer/url?id=${song.id || song.url_id || ''}`,
          cover: coverUrl,
          trackId: song.id || song.url_id || 0,
          source: song.source || 'netease',
          processedAt: new Date().toISOString()
        };
        
        console.log(`   ${index + 1}. ${formattedSong.title} - ${formattedSong.artist}`);
        return formattedSong;
      });
      
      // 等待所有歌曲处理完成
      const processedSongs = await Promise.all(songPromises);
      formattedSongs.push(...processedSongs);
    } else {
      console.log(`❌ 未找到相关歌曲: ${keyword}`);
    }
    
  } catch (error) {
    console.error(`❌ 搜索失败: ${keyword}`);
    console.error(`错误信息: ${error.message}`);
  }
  
  return formattedSongs;
}

/**
 * 主函数：批量搜索歌曲
 * @param {string} configFilePath - 可选的配置文件路径
 */
async function main(configFilePath = null) {
  const startTime = Date.now();
  
  try {
    // 配置文件路径 - 支持命令行参数或默认路径
    const configPath = configFilePath || 
                      (process.argv[2] && path.resolve(process.argv[2])) || 
                      path.join(__dirname, 'music_search.json');
    const outputPath = path.join(__dirname, 'final_list', 'search.json');
    
    // 检查配置文件是否存在
    if (!fs.existsSync(configPath)) {
      throw new Error(`配置文件不存在: ${configPath}`);
    }
    
    // 读取配置文件
    console.log(`📖 正在读取配置文件: ${configPath}`);
    const configContent = fs.readFileSync(configPath, 'utf8');
    const musicSearch = JSON.parse(configContent);
    
    // 支持两种配置格式：classic_songs数组 或 songs数组
    const songsArray = musicSearch.classic_songs || musicSearch.songs;
    
    if (!songsArray || !Array.isArray(songsArray)) {
      throw new Error('配置文件格式错误：缺少 classic_songs 或 songs 数组');
    }
    
    // 确保输出目录存在
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
      console.log('📁 创建输出目录:', outputDir);
    }
    
    const totalSongs = songsArray.length;
    console.log(`🎵 共需要搜索 ${totalSongs} 首歌曲`);
    
    const allSearchResults = [];
    
    // 逐个搜索歌曲
    for (let i = 0; i < songsArray.length; i++) {
      const songInfo = typeof songsArray[i] === 'string' ? 
                      { song: songsArray[i], artist: '' } : 
                      songsArray[i];
      
      console.log(`\n[${i + 1}/${totalSongs}] 处理进度: ${Math.round((i / totalSongs) * 100)}%`);
      
      const searchResults = await searchSingleSong(songInfo, 5, 1); // 搜索5首歌曲，第1页
      
      // 将搜索结果添加到总结果中
      allSearchResults.push(...searchResults);
      
      // 添加延迟，避免请求过于频繁
      if (i < songsArray.length - 1) {
        const delay = getRandomDelay(2000, 4000);
        console.log(`\n⏳ 等待 ${delay}ms 后继续下一首...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    // 构造输出数据格式，按照classic.json的结构
    const outputData = {
      processedAt: new Date().toISOString(),
      totalSongs: allSearchResults.length,
      songs: allSearchResults
    };
    
    // 保存结果到文件
    fs.writeFileSync(outputPath, JSON.stringify(outputData, null, 2), 'utf8');
    
    const endTime = Date.now();
    const duration = Math.round((endTime - startTime) / 1000);
    
    console.log('\n' + '='.repeat(60));
    console.log('🎉 音乐搜索完成！');
    console.log(`⏱️ 总耗时: ${duration} 秒`);
    console.log(`📊 搜索歌曲数: ${totalSongs}`);
    console.log(`💾 找到歌曲总数: ${allSearchResults.length}`);
    console.log(`📁 结果已保存到: ${outputPath}`);
    console.log('=' .repeat(60));
    
  } catch (error) {
    console.error('❌ 程序执行失败:', error.message);
    console.error('详细错误:', error);
  }
}

// 如果直接运行此文件，则执行主函数
if (require.main === module) {
  main().catch(error => {
    console.error('❌ 程序异常退出:', error);
    process.exit(1);
  });
}

// 导出函数供其他模块使用
module.exports = {
  searchSingleSong,
  main
};