/**
 * 智课眼（ClassVision）颜色工具函数
 * 
 * 本文件提供颜色计算相关的工具函数，用于生成语义化颜色、
 * 调整颜色亮度等场景。
 */

/**
 * 将 Hex 颜色转换为 RGBA 颜色
 * 
 * @param hex - Hex 颜色值，如 '#1890ff'
 * @param alpha - 透明度，0-1
 * @returns RGBA 颜色字符串，如 'rgba(24, 144, 255, 0.1)'
 * 
 * @example
 * hexToRgba('#1890ff', 0.1)  // 'rgba(24, 144, 255, 0.1)'
 * hexToRgba('#52c41a', 0.5)  // 'rgba(82, 196, 26, 0.5)'
 */
export function hexToRgba(hex: string, alpha: number): string {
  // 移除 # 前缀
  const hexStr = hex.replace('#', '')
  
  // 解析 RGB 值
  let r: number
  let g: number
  let b: number
  
  if (hexStr.length === 3) {
    // 3位 Hex：#RGB
    r = parseInt(hexStr[0] + hexStr[0], 16)
    g = parseInt(hexStr[1] + hexStr[1], 16)
    b = parseInt(hexStr[2] + hexStr[2], 16)
  } else if (hexStr.length === 6) {
    // 6位 Hex：#RRGGBB
    r = parseInt(hexStr.substring(0, 2), 16)
    g = parseInt(hexStr.substring(2, 4), 16)
    b = parseInt(hexStr.substring(4, 6), 16)
  } else {
    // 无效格式，返回原值
    return hex
  }
  
  // 限制 alpha 范围
  const a = Math.max(0, Math.min(1, alpha))
  
  return `rgba(${r}, ${g}, ${b}, ${a})`
}

/**
 * 根据出勤率获取颜色
 * 
 * @param rate - 出勤率，0-100
 * @returns 颜色值
 * 
 * @example
 * getRateColor(95)   // 绿色（正常）
 * getRateColor(80)   // 橙色（迟到）
 * getRateColor(50)   // 红色（缺勤）
 */
export function getRateColor(rate: number): string {
  if (rate >= 90) {
    return '#52c41a' // 绿色 - 正常
  }
  if (rate >= 70) {
    return '#faad14' // 橙色 - 迟到
  }
  return '#ff4d4f' // 红色 - 缺勤
}

/**
 * 根据状态获取颜色配置
 * 
 * @param status - 状态值
 * @returns 包含颜色和背景色的配置
 * 
 * @example
 * getStatusColor('success')   // { color: '#52c41a', bgColor: 'rgba(82, 196, 26, 0.1)' }
 * getStatusColor('error')     // { color: '#ff4d4f', bgColor: 'rgba(255, 77, 79, 0.1)' }
 */
export function getStatusColor(
  status: 'success' | 'warning' | 'error' | 'info' | 'default'
): { color: string; bgColor: string } {
  const colorMap: Record<string, string> = {
    success: '#52c41a',
    warning: '#faad14',
    error: '#ff4d4f',
    info: '#1890ff',
    default: 'rgba(0, 0, 0, 0.45)',
  }
  
  const bgColorMap: Record<string, string> = {
    success: 'rgba(82, 196, 26, 0.1)',
    warning: 'rgba(250, 173, 20, 0.1)',
    error: 'rgba(255, 77, 79, 0.1)',
    info: 'rgba(24, 144, 255, 0.1)',
    default: 'rgba(0, 0, 0, 0.04)',
  }
  
  return {
    color: colorMap[status] || colorMap.default,
    bgColor: bgColorMap[status] || bgColorMap.default,
  }
}

/**
 * 调整颜色亮度
 * 
 * @param hex - Hex 颜色值
 * @param amount - 调整量，-255 到 255（负数变暗，正数变亮）
 * @returns 调整后的 Hex 颜色值
 * 
 * @example
 * adjustBrightness('#1890ff', 20)   // 变亮
 * adjustBrightness('#1890ff', -20)  // 变暗
 */
export function adjustBrightness(hex: string, amount: number): string {
  // 移除 # 前缀
  const hexStr = hex.replace('#', '')
  
  // 解析 RGB 值
  let r: number
  let g: number
  let b: number
  
  if (hexStr.length === 3) {
    r = parseInt(hexStr[0] + hexStr[0], 16)
    g = parseInt(hexStr[1] + hexStr[1], 16)
    b = parseInt(hexStr[2] + hexStr[2], 16)
  } else if (hexStr.length === 6) {
    r = parseInt(hexStr.substring(0, 2), 16)
    g = parseInt(hexStr.substring(2, 4), 16)
    b = parseInt(hexStr.substring(4, 6), 16)
  } else {
    return hex
  }
  
  // 调整亮度并限制范围
  const clamp = (value: number) => Math.max(0, Math.min(255, value))
  
  r = clamp(r + amount)
  g = clamp(g + amount)
  b = clamp(b + amount)
  
  // 转换为 Hex
  const toHex = (value: number) => 
    value.toString(16).padStart(2, '0')
  
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

/**
 * 判断颜色是否为深色
 * 
 * @param hex - Hex 颜色值
 * @returns 是否为深色
 * 
 * @example
 * isDarkColor('#1890ff')  // false
 * isDarkColor('#000000')  // true
 */
export function isDarkColor(hex: string): boolean {
  // 移除 # 前缀
  const hexStr = hex.replace('#', '')
  
  // 解析 RGB 值
  let r: number
  let g: number
  let b: number
  
  if (hexStr.length === 3) {
    r = parseInt(hexStr[0] + hexStr[0], 16)
    g = parseInt(hexStr[1] + hexStr[1], 16)
    b = parseInt(hexStr[2] + hexStr[2], 16)
  } else if (hexStr.length === 6) {
    r = parseInt(hexStr.substring(0, 2), 16)
    g = parseInt(hexStr.substring(2, 4), 16)
    b = parseInt(hexStr.substring(4, 6), 16)
  } else {
    return false
  }
  
  // 计算亮度（YIQ 色彩空间）
  const yiq = (r * 299 + g * 587 + b * 114) / 1000
  
  // 亮度小于 128 为深色
  return yiq < 128
}

/**
 * 获取颜色的对比色（黑或白）
 * 
 * @param hex - Hex 颜色值
 * @returns 对比色 '#000000' 或 '#ffffff'
 * 
 * @example
 * getContrastColor('#1890ff')  // '#ffffff'
 * getContrastColor('#ffffff')  // '#000000'
 */
export function getContrastColor(hex: string): string {
  return isDarkColor(hex) ? '#ffffff' : '#000000'
}

/**
 * 生成随机颜色（用于标签等）
 * 
 * @returns Hex 颜色值
 * 
 * @example
 * generateRandomColor()  // '#a1b2c3'
 */
export function generateRandomColor(): string {
  const colors = [
    '#1890ff', // 蓝色
    '#52c41a', // 绿色
    '#faad14', // 橙色
    '#ff4d4f', // 红色
    '#722ed1', // 紫色
    '#13c2c2', // 青色
    '#eb2f96', // 粉色
  ]
  
  const index = Math.floor(Math.random() * colors.length)
  return colors[index]
}