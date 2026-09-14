import type { SiteLocation, WorkRecord, WorkScheduleSlot } from './types';

type RegionSeed = readonly [string, string, string, readonly string[], number, number, string];

const regions: readonly RegionSeed[] = [
  ['beitou', '臺北市', '北投區', ['中央北路二段', '大業路', '石牌路一段'], 25.132, 121.501, '臺北榮民總醫院'],
  ['shilin', '臺北市', '士林區', ['中正路', '承德路四段', '忠誠路一段'], 25.096, 121.524, '新光吳火獅紀念醫院'],
  ['neihu', '臺北市', '內湖區', ['文德路', '民權東路六段', '康寧路三段'], 25.078, 121.586, '三軍總醫院內湖院區'],
  ['nangang', '臺北市', '南港區', ['研究院路二段', '興華路', '玉成街'], 25.047, 121.611, '臺北市立聯合醫院忠孝院區'],
  ['songshan', '臺北市', '松山區', ['民生東路五段', '八德路四段', '健康路'], 25.057, 121.56, '臺安醫院'],
  ['xinyi', '臺北市', '信義區', ['松仁路', '吳興街', '信義路五段'], 25.033, 121.574, '臺北醫學大學附設醫院'],
  ['daan', '臺北市', '大安區', ['和平東路二段', '新生南路二段', '瑞安街'], 25.027, 121.543, '國泰綜合醫院'],
  ['zhongshan', '臺北市', '中山區', ['新生北路三段', '龍江路', '北安路'], 25.064, 121.537, '馬偕紀念醫院臺北院區'],
  ['zhongzheng', '臺北市', '中正區', ['汀州路二段', '南海路', '仁愛路一段'], 25.032, 121.516, '臺大醫院'],
  ['wenshan', '臺北市', '文山區', ['木柵路二段', '興隆路三段', '景興路'], 24.995, 121.556, '臺北市立萬芳醫院'],
  ['banqiao', '新北市', '板橋區', ['文化路一段', '中正路', '漢生東路'], 25.012, 121.462, '亞東紀念醫院'],
  ['sanchong', '新北市', '三重區', ['三和路三段', '重新路四段', '集美街'], 25.061, 121.488, '新北市立聯合醫院三重院區'],
  ['xindian', '新北市', '新店區', ['北新路二段', '安康路二段', '中央路'], 24.967, 121.538, '新店耕莘醫院'],
  ['xizhi', '新北市', '汐止區', ['大同路二段', '新台五路一段', '福德一路'], 25.066, 121.655, '國泰綜合醫院汐止分院'],
  ['tucheng', '新北市', '土城區', ['金城路二段', '中央路二段', '學府路一段'], 24.974, 121.445, '新北市立土城醫院'],
  ['taoyuan', '桃園市', '桃園區', ['中正路', '大興西路二段', '三民路一段'], 25.007, 121.301, '衛生福利部桃園醫院'],
  ['zhongli', '桃園市', '中壢區', ['環中東路', '中豐路', '新生路'], 24.953, 121.225, '天晟醫院'],
  ['luzhu', '桃園市', '蘆竹區', ['南崁路二段', '吉林路', '大竹路'], 25.048, 121.289, '林口長庚紀念醫院'],
  ['east-hsinchu', '新竹市', '東區', ['光復路二段', '食品路', '公園路'], 24.802, 120.982, '新竹臺大分院'],
  ['zhubei', '新竹縣', '竹北市', ['光明六路東一段', '縣政二路', '嘉豐五路一段'], 24.831, 121.011, '東元綜合醫院'],
] as const;

const facilities = [
  ['primary', '晨光國小校園', '上課期間維持學童通道，落枝區需以硬式護欄完整封閉。'],
  ['park', '中央公園綠地', '晨間運動人潮較多，施工前完成步道改道與告示設置。'],
  ['community', '晴川社區中庭', '大型車輛進場前通知管理室，地下停車場限高 2.1 公尺。'],
  ['office', '文化行政中心', '洽公時段保留無障礙動線，噪音作業避開午休時間。'],
  ['riverside', '河濱自行車道樹群', '施工範圍跨越自行車道，兩端配置交管人員並預留緊急通道。'],
] as const;

const jobs = [
  ['樹冠結構調整與枯枝清除', '移除枯枝、交叉枝與弱勢枝，維持自然樹形及通行淨高。', false],
  ['風災後懸掛枝緊急處理', '確認斷裂點後分段卸除懸掛枝，完成落枝區清理與樹體複查。', true],
  ['行道樹安全巡檢及修剪', '逐株檢查枝幹缺陷，處理道路側偏冠並保留健康枝條。', false],
  ['病枯木分段伐除作業', '建立雙層管制區後分段伐除，枝材分類並於當日清運。', true],
  ['建物側退縮修剪', '調整接近屋頂及窗面的枝條，保留遮蔭並避免過度截頂。', false],
  ['樹木支撐檢查與更新', '檢查支柱、束帶及根頸狀況，汰換老化材料並調整鬆緊。', false],
] as const;
const crews = [['白', '浩', '陳'], ['肯', '誠', '鴻', '橘'], ['力', '得', '丸'], ['斌', '綺', '方', '康'], ['浩', '肯', '球', '修']] as const;
const weathers = ['晴時多雲，午後注意高溫。', '多雲，風勢穩定。', '短暫陣雨，備妥雨具並持續監測雷達。', '晴朗乾燥，注意補水與防曬。', '陰天，作業條件尚可。'] as const;
const accessNotes = [
  '工具車請停在指定卸料區，消防通道全程保持淨空。',
  '進場前先向管理單位報到，確認鑰匙與門禁開放時間。',
  '早上人車流量較大，第一車先完成三角錐與警示帶佈設。',
  '大型車輛須由引導員步行帶入，轉彎處不得堆放枝材。',
  '鄰近住戶出入口需保留，碎木與清運集中於午後進行。',
] as const;
const safetyNotes = [
  '落枝區與通行區採雙層管制，場控確認清空後才可下切。',
  '高空作業前複查錨點與繩路；平均風勢增強時暫停吊掛。',
  '枝材落點靠近設施，使用導向繩控制並安排專人監看。',
  '作業區地面不平，移動升降設備前先確認承載與支撐位置。',
  '上午曝曬較強，每 60 分鐘安排補水並輪替地面警戒人員。',
  '周邊行人密集，兩端交管人員以無線電確認後才開放通行。',
] as const;

function dateFromOffset(offset: number) {
  const date = new Date(Date.UTC(2026, 8, 13 + offset));
  return date.toISOString().slice(0, 10);
}

function makeRecord(locationId: string, siteIndex: number, recordIndex: number, hospital: string): WorkRecord {
  const [title, notes, isRemoval] = jobs[(siteIndex + recordIndex) % jobs.length];
  const offset = ((siteIndex * 13 + recordIndex * 17) % 120) - 90;
  const workDate = dateFromOffset(offset);
  const endDate = recordIndex === 2 ? dateFromOffset(offset + 1) : workDate;
  const startSlot: WorkScheduleSlot = recordIndex === 1 ? '上午' : '全天';
  const endSlot: WorkScheduleSlot = recordIndex === 2 ? '下午' : startSlot;
  return {
    id: `generated-${siteIndex + 1}-${recordIndex + 1}`,
    locationId,
    authorName: 'TreeServ 測試資料',
    title,
    notes,
    workDate,
    endDate,
    startDaySlot: startSlot,
    endDaySlot: endSlot,
    scheduleSlot: startSlot === endSlot ? startSlot : '全天',
    scheduleStatus: offset < 0 ? '已完成' : offset === 0 ? '進行中' : '已排程',
    crew: [...crews[(siteIndex + recordIndex) % crews.length]],
    meetingTime: ['06:45', '07:00', '07:15', '07:30'][siteIndex % 4],
    meetingPlace: recordIndex % 2 === 0 ? '案場主要入口' : '鄰近停車區集合點',
    weather: weathers[(siteIndex + recordIndex) % weathers.length],
    hospitalName: hospital,
    hospitalTravelTime: `${8 + ((siteIndex + recordIndex * 3) % 18)} 分鐘`,
    hospitalDistance: `${(2.1 + ((siteIndex + recordIndex) % 8) * 0.7).toFixed(1)} 公里`,
    workDetails: `${notes}\n作業前完成樹體目視評估、工具檢點、落枝區封鎖及鄰近設施保護。`,
    assignments: '現場負責人進行風險確認；攀樹人員執行樹上作業；地面人員負責繩索控制、交管與枝材整理。',
    disposal: isRemoval ? '大夾車於 15:00 後進場，木段與枝葉分車清運。' : '枝葉集中碎木後清運，木料依管理單位指定位置堆置。',
    parking: '工具車停放於管理單位指定區域，不占用消防與無障礙通道。',
    equipment: '安全帽、護目鏡、鏈鋸防護褲、攀樹繩、Rigging 繩組、三角錐、警示帶與急救箱。',
    safetyNotes: safetyNotes[(siteIndex * 2 + recordIndex) % safetyNotes.length],
    imageUrls: [], youtubeUrls: [], fileUrls: [],
  };
}

export const generatedDemoLocations: SiteLocation[] = regions.flatMap((region, regionIndex) => {
  const [slug, city, district, roads, baseLat, baseLng, hospital] = region;
  return facilities.map(([facilitySlug, facilityName, attention], facilityIndex) => {
    const siteIndex = regionIndex * facilities.length + facilityIndex;
    const id = `demo-${slug}-${facilitySlug}`;
    const recordCount = siteIndex % 4;
    return {
      id,
      name: `${district}${facilityName}（測試）`,
      address: `${city}${district}${roads[facilityIndex % roads.length]} ${18 + ((siteIndex * 17) % 180)} 號`,
      lat: baseLat + (facilityIndex - 2) * 0.0031,
      lng: baseLng + (((facilityIndex * 2) % 5) - 2) * 0.0034,
      status: recordCount === 0 ? '待排程' : siteIndex % 3 === 0 ? '待驗收' : '已排程',
      attention: `測試資料｜${attention} ${accessNotes[(regionIndex + facilityIndex * 2) % accessNotes.length]}`,
      aliases: [`${district}${facilityName}`, facilityName],
      isDemo: true,
      records: Array.from({ length: recordCount }, (_item, recordIndex) => makeRecord(id, siteIndex, recordIndex, hospital)),
    } satisfies SiteLocation;
  });
});

export const generatedDemoRecordCount = generatedDemoLocations.reduce(
  (total, location) => total + (location.records?.length ?? 0), 0,
);
