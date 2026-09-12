import type { SiteLocation, WorkRecord, WorkScheduleSlot } from './types';

const siteSeeds = [
  ['demo-neihu-high', '內湖高中', '臺北市內湖區文德路 218 號', 25.0789, 121.5871],
  ['demo-xinsheng-park', '新生公園', '臺北市中山區新生北路三段 105 號', 25.0674, 121.5306],
  ['demo-banqiao-primary', '板橋國小', '新北市板橋區文化路一段 23 號', 25.0114, 121.4592],
  ['demo-yonghe-junior', '永和國中', '新北市永和區國中路 111 號', 25.0068, 121.5239],
  ['demo-taoyuan-park', '桃園藝文廣場', '桃園市桃園區中正路 1188 號', 25.0172, 121.2984],
  ['demo-luzhu-primary', '蘆竹國小', '桃園市蘆竹區南崁路二段 18 號', 25.0559, 121.2887],
  ['demo-xindian-park', '碧潭河岸公園', '新北市新店區新店路 260 號', 24.9566, 121.5371],
  ['demo-shilin-residence', '士林官邸周邊綠地', '臺北市士林區福林路 60 號', 25.0953, 121.5300],
  ['demo-sanchong-primary', '三重國小', '新北市三重區三和路三段 1 號', 25.0705, 121.4966],
  ['demo-zhongli-park', '中壢光明公園', '桃園市中壢區民權路 396 號', 24.9627, 121.2160],
] as const;

const jobSeeds = [
  ['校門老榕樹枯枝清除', '清除乾枯枝與交叉枝，保留健康樹冠並完成落枝區清掃。', '修剪'],
  ['操場側樹冠提高', '調整通行淨高，移除下垂枝並維持樹冠平衡。', '修剪'],
  ['風災折損枝處理', '先行檢查斷裂點，分段卸除懸掛枝並清運。', '修剪'],
  ['行道樹結構性修剪', '針對偏冠與弱勢枝進行退縮，避免一次過度修剪。', '修剪'],
  ['病枯木伐除與整地', '設置封鎖區後分段伐除，樹頭降低並將枝材分類清運。', '伐除'],
] as const;

const crewSets = [
  ['白', '浩', '陳', '修'],
  ['肯', '誠', '鴻', '橘'],
  ['力', '得', '丸', '庭'],
  ['斌', '綺', '方', '康'],
  ['浩', '肯', '誠', '球', '修'],
];

const weathers = ['晴時多雲，午後注意高溫。', '多雲，風勢穩定。', '短暫陣雨，備妥雨具。', '晴朗乾燥，注意補水。', '陰天，作業條件尚可。'];

function isoDate(offset: number) {
  const date = new Date(Date.UTC(2026, 8, 10 - offset));
  return date.toISOString().slice(0, 10);
}

function makeRecord(locationId: string, siteIndex: number, jobIndex: number): WorkRecord {
  const [title, notes, kind] = jobSeeds[jobIndex];
  const workDate = isoDate(siteIndex * 5 + jobIndex);
  const slot: WorkScheduleSlot = jobIndex === 1 ? '上午' : jobIndex === 3 ? '下午' : '全天';
  return {
    id: `generated-${siteIndex + 1}-${jobIndex + 1}`,
    locationId,
    authorName: 'TreeServ 測試資料',
    title,
    notes,
    workDate,
    endDate: workDate,
    startDaySlot: slot,
    endDaySlot: slot,
    scheduleSlot: slot,
    scheduleStatus: '已完成',
    crew: crewSets[(siteIndex + jobIndex) % crewSets.length],
    meetingTime: jobIndex % 2 ? '07:15' : '07:30',
    meetingPlace: '案場主要入口',
    weather: weathers[(siteIndex + jobIndex) % weathers.length],
    workDetails: `${notes}\n作業前完成風險評估、工具檢點與地面管制。`,
    assignments: '攀樹人員負責樹上作業；地面人員負責繩索控制、警戒與枝材整理。',
    disposal: kind === '伐除' ? '大夾車 15:00 進場清運。' : '枝葉集中後由小夾車清運。',
    parking: '工具車停放於校方或管理單位指定區域。',
    equipment: '安全帽、護目鏡、鏈鋸防護褲、攀樹繩、Rigging 繩組、三角錐與警示帶。',
    safetyNotes: '落枝區全程封閉；風雨增強或視線不良時停止高空作業。',
    imageUrls: [],
    youtubeUrls: [],
    fileUrls: [],
  };
}

export const generatedDemoLocations: SiteLocation[] = siteSeeds.map((site, siteIndex) => {
  const [id, name, address, lat, lng] = site;
  return {
    id,
    name,
    address,
    lat,
    lng,
    status: '待驗收',
    attention: '此為展示資料；作業時仍須依現場風險評估與管理單位指示調整。',
    aliases: [],
    isDemo: true,
    records: jobSeeds.map((_job, jobIndex) => makeRecord(id, siteIndex, jobIndex)),
  };
});

export const generatedDemoRecordCount = generatedDemoLocations.reduce(
  (total, location) => total + (location.records?.length ?? 0),
  0,
);
