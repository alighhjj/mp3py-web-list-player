/**
 * 网易云音乐榜单生成程序
 * 分两个阶段：1）获取四个榜单原始数据存入/origon_list文件夹，2）转换数据存入/final_list文件夹
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

/**
 * 榜单类型映射
 */
const CHART_TYPES = {
  1: { id: 1, name: 'original', displayName: '原创榜' },
  2: { id: 2, name: 'new', displayName: '新歌榜' },
  3: { id: 3, name: 'soaring', displayName: '飙升榜' },
  4: { id: 4, name: 'hot', displayName: '热歌榜' }
};

/**
 * 确保目录存在，如果不存在则创建
 * @param {string} dirPath - 目录路径
 */
function ensureDirectoryExists(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
    console.log(`创建目录: ${dirPath}`);
  }
}

/**
 * 从API获取榜单数据
 * @param {number} chartType - 榜单类型ID
 * @returns {Promise<Object>} - 返回榜单数据
 */
function fetchChartData(chartType) {
  return new Promise((resolve, reject) => {
    const url = `https://api.52vmy.cn/api/music/wy/top?t=${chartType}`;
    console.log(`请求URL: ${url}`);
    
    https.get(url, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          console.log(`API响应: ${data.substring(0, 200)}...`);
          const jsonData = JSON.parse(data);
          resolve(jsonData);
        } catch (error) {
          reject(new Error(`解析API响应失败: ${error.message}`));
        }
      });
    }).on('error', (error) => {
      reject(new Error(`API请求失败: ${error.message}`));
    });
  });
}

/**
 * 保存原始数据到origon_list文件夹
 * @param {Object} data - 原始数据
 * @param {string} chartName - 榜单名称
 */
function saveOriginalData(data, chartName) {
  const origonDir = path.join(__dirname, 'origon_list');
  ensureDirectoryExists(origonDir);
  
  const fileName = `${chartName}.json`;
  const filePath = path.join(origonDir, fileName);
  const jsonString = JSON.stringify(data, null, 2);
  
  fs.writeFileSync(filePath, jsonString, 'utf8');
  console.log(`成功保存原始数据到 ${fileName}`);
}

/**
 * 将原始数据转换为标准格式
 * @param {Array} songsData - API返回的歌曲数据数组
 * @param {string} chartName - 榜单名称
 * @returns {Object} - 转换后的数据
 */
function transformToStandardFormat(songsData, chartName) {
  if (!Array.isArray(songsData) || songsData.length === 0) {
    throw new Error('没有有效的歌曲数据可转换');
  }
  
  // 获取当前时间作为处理时间
  const processedAt = new Date().toISOString();
  
  // 转换数据格式
  const songs = songsData.map(item => {
    // 处理封面链接，确保使用 HTTPS 协议
    let coverUrl = null;
    if (item.pic) {
      coverUrl = item.pic.trim();
      // 将 HTTP 协议的网易云音乐图片链接转换为 HTTPS
      if (coverUrl.startsWith('http://p1.music.126.net/') || coverUrl.startsWith('http://p2.music.126.net/')) {
        coverUrl = coverUrl.replace('http://', 'https://');
      }
    }
    
    return {
      title: item.song || '',
      artist: item.sing || '',
      duration: "--:--",
      src: item.url || null,
      cover: coverUrl,
      trackId: item.id || 0,
      source: "netease",
      processedAt: new Date().toISOString()
    };
  });
  
  // 返回最终JSON结构
  return {
    chartName: chartName,
    processedAt: processedAt,
    totalSongs: songs.length,
    songs: songs
  };
}

/**
 * 保存转换后的数据到final_list文件夹
 * @param {Object} data - 转换后的数据
 * @param {string} chartName - 榜单名称
 */
function saveFinalData(data, chartName) {
  const finalDir = path.join(__dirname, 'final_list');
  ensureDirectoryExists(finalDir);
  
  const fileName = `${chartName}.json`;
  const filePath = path.join(finalDir, fileName);
  const jsonString = JSON.stringify(data, null, 2);
  
  fs.writeFileSync(filePath, jsonString, 'utf8');
  console.log(`成功保存转换数据到 ${fileName}`);
}

/**
 * 第一阶段：获取所有榜单原始数据并保存到origon_list文件夹
 */
async function stage1_fetchOriginalData() {
  console.log('=== 第一阶段：获取原始榜单数据 ===');
  
  for (const [chartId, chartInfo] of Object.entries(CHART_TYPES)) {
    try {
      console.log(`正在获取${chartInfo.displayName}数据...`);
      const data = await fetchChartData(parseInt(chartId));
      saveOriginalData(data, chartInfo.name);
      
      // 添加延迟避免请求过快
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (error) {
      console.error(`获取${chartInfo.displayName}失败: ${error.message}`);
    }
  }
}

/**
 * 第二阶段：读取原始数据并转换后保存到final_list文件夹
 */
function stage2_transformData() {
  console.log('=== 第二阶段：转换数据格式 ===');
  
  const origonDir = path.join(__dirname, 'origon_list');
  
  for (const [chartId, chartInfo] of Object.entries(CHART_TYPES)) {
    try {
      const fileName = `${chartInfo.name}.json`;
      const filePath = path.join(origonDir, fileName);
      
      if (!fs.existsSync(filePath)) {
        console.error(`原始数据文件不存在: ${fileName}`);
        continue;
      }
      
      console.log(`正在转换${chartInfo.displayName}数据...`);
      const rawData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      
      // 假设API返回的数据结构中歌曲列表在data字段中
      const songsData = rawData.data || rawData;
      const transformedData = transformToStandardFormat(songsData, chartInfo.displayName);
      
      saveFinalData(transformedData, chartInfo.name);
    } catch (error) {
      console.error(`转换${chartInfo.displayName}失败: ${error.message}`);
    }
  }
}

/**
 * 主函数：执行完整的两阶段处理流程
 */
async function generateAllCharts() {
  try {
    // 第一阶段：获取原始数据
    await stage1_fetchOriginalData();
    
    console.log('\n等待2秒后开始第二阶段...');
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // 第二阶段：转换数据
    stage2_transformData();
    
    console.log('\n=== 所有榜单处理完成 ===');
  } catch (error) {
    console.error('处理过程中发生错误:', error.message);
  }
}

// 执行主函数
generateAllCharts();