export const demoLocations = [
  {
    id:'demo-urban-banyan',
    name:'展示案例｜都會公園老榕樹',
    address:'臺北市大安區（示範座標）',
    lat:25.0337,
    lng:121.5352,
    status:'待複查',
    attention:'示範資料：假日人流密集。檢查與作業前須先劃設落枝警戒區，並安排地面人員管制行人動線。',
    aliases:['榕樹','公園','風險評估','TRAQ','VTA'],
    isDemo:true,
    records:[
      {
        id:'demo-r1',locationId:'demo-urban-banyan',title:'Level 2 基本樹木風險評估',
        notes:'樹種：榕樹（Ficus microcarpa），胸高直徑 DBH 約 112 cm。以地面目視與木槌音診檢查根頸、主幹及主要枝條；西南側共優勢主幹可見夾皮，冠層另有約 8 cm 枯枝位於步道上方。目標物占用率評估為「頻繁」，本次初步風險等級為中度，建議先移除明顯枯枝，並於颱風季前完成進階檢測。',
        imageUrls:['https://images.unsplash.com/photo-1441974231531-c6227db76b6e?auto=format&fit=crop&w=1000&q=82'],youtubeUrls:[],
        fileUrls:['https://www.isa-arbor.com/Portals/0/Assets/PDF/Online-Learning/Sample%20Reports/TRAQ_Formal_Municipal_Report_L2.pdf?ver=2026-01-06-085406-580'],
        authorName:'陳柏宇｜ISA Certified Arborist®／TRAQ',dateLabel:'展示 · 9 月 2 日'
      },
      {
        id:'demo-r2',locationId:'demo-urban-banyan',title:'枯枝移除與減重修剪建議',
        notes:'建議採冠層清理（crown cleaning）為主，保留健康活枝與自然樹形。所有切口應落在枝領外側，避免平切與截頂；單次活冠移除量控制在 10% 以內。夾皮主幹暫不直接移除，待音波斷層或其他進階檢測確認承載能力後再擬定風險緩解方案。',
        imageUrls:[],youtubeUrls:[],fileUrls:['https://research.fs.usda.gov/download/treesearch/12602.pdf'],
        authorName:'林書妍｜European Tree Worker（ETW）',dateLabel:'展示 · 9 月 3 日'
      }
    ]
  },
  {
    id:'demo-campus-camphor',
    name:'展示案例｜校園樟樹攀樹修剪',
    address:'臺北市內湖區（示範座標）',
    lat:25.0785,
    lng:121.5796,
    status:'進行中',
    attention:'示範資料：上課時段禁止吊掛作業。作業前完成工具與繩索檢點、空中救援計畫及全員工作簡報。',
    aliases:['樟樹','校園','攀樹','修剪','ETW','攀樹師'],
    isDemo:true,
    records:[
      {
        id:'demo-r3',locationId:'demo-campus-camphor',title:'攀登前檢查與工作定位設定',
        notes:'完成樹體 360° 地面檢查，確認無明顯懸掛枝與蜂巢。主錨點設於健全主枝分叉上方，使用雙繩系統進入樹冠；作業鏈鋸啟用前維持第二獨立固定點。地面組已確認救援繩、急救箱與通訊口令，並完成繩索、鉤環、吊帶及安全帽的逐項檢查。',
        imageUrls:['https://images.unsplash.com/photo-1511497584788-876760111969?auto=format&fit=crop&w=1000&q=82'],
        youtubeUrls:['https://www.youtube.com/watch?v=MHgnaP6o1kI'],
        fileUrls:['https://www.isa-arbor.com/Portals/0/Assets/PDF/Certification/Outline_ISA_Cerified-Tree-Worker_2024.pdf?ver=2024-02-06-143200-427'],
        authorName:'王志遠｜ISA Certified Tree Climber®',dateLabel:'展示 · 8 月 29 日'
      },
      {
        id:'demo-r4',locationId:'demo-campus-camphor',title:'冠層清理與建築側淨空',
        notes:'移除枯死、斷裂及互相摩擦枝，東側建築物外牆維持約 1.5 m 淨空。修剪以小切口分散處理，未進行截頂；直徑較大的枝條採三刀法與控制式吊掛，避免撕裂樹皮或讓枝段自由落下。完工後保留足夠葉面積供樹體恢復。',
        imageUrls:[],youtubeUrls:[],fileUrls:[],
        authorName:'林書妍｜European Tree Worker（ETW）',dateLabel:'展示 · 8 月 30 日'
      }
    ]
  },
  {
    id:'demo-storm-rain-tree',
    name:'展示案例｜社區雨豆樹風災處置',
    address:'新北市板橋區（示範座標）',
    lat:25.0114,
    lng:121.4618,
    status:'注意事項',
    attention:'示範資料：北側主枝有新鮮裂縫，下方停車格暫停使用；在完成風險緩解前不得移除警戒帶。',
    aliases:['雨豆樹','風災','裂枝','吊掛','rigging'],
    isDemo:true,
    records:[
      {
        id:'demo-r5',locationId:'demo-storm-rain-tree',title:'颱風後緊急巡查',
        notes:'北側主枝基部出現約 65 cm 縱向裂縫，裂縫下方為固定停車位。已先將目標區隔離，並以望遠鏡確認冠層另有兩支懸掛枝。考量目標物占用與失效後果，建議在 24 小時內由合格攀樹人員優先移除懸掛枝，再評估裂枝減重或移除方案。',
        imageUrls:['https://images.unsplash.com/photo-1473448912268-2022ce9509d8?auto=format&fit=crop&w=1000&q=82'],youtubeUrls:[],fileUrls:[],
        authorName:'陳柏宇｜ISA Certified Arborist®／TRAQ',dateLabel:'展示 · 8 月 18 日'
      },
      {
        id:'demo-r6',locationId:'demo-storm-rain-tree',title:'控制式吊掛移除完成',
        notes:'先以高位導向點與摩擦制動器建立吊掛系統，分段降低懸掛枝，避免衝擊主幹與鋪面。裂枝側完成約 12% 末端減重，未改變主幹連結。建議 3 個月後及下一次強風事件後複查裂縫變化，並以相同角度照片追蹤。',
        imageUrls:[],youtubeUrls:[],fileUrls:[],
        authorName:'王志遠｜ISA Certified Tree Climber®',dateLabel:'展示 · 8 月 19 日'
      }
    ]
  },
  {
    id:'demo-construction-protection',
    name:'展示案例｜工地樹木保護區',
    address:'臺中市西屯區（示範座標）',
    lat:24.1813,
    lng:120.6468,
    status:'施工中',
    attention:'示範資料：樹木保護區內禁止堆料、停車、洗車與改變土壤高程；根系附近開挖須由樹藝師現場監看。',
    aliases:['工地','根系','樹木保護','TPZ','開挖'],
    isDemo:true,
    records:[
      {
        id:'demo-r7',locationId:'demo-construction-protection',title:'施工前樹況與根域基準記錄',
        notes:'完成樹幹、根頸、冠幅與鄰近鋪面拍攝，建立施工前基準。依現場條件劃設樹木保護區（TPZ），圍籬固定於保護區外緣；主要根域鋪設約 8 cm 木屑覆蓋並增設臨時承壓板，降低施工機具造成土壤壓實。',
        imageUrls:['https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1000&q=82'],youtubeUrls:[],fileUrls:[],
        authorName:'張雅雯｜ISA Certified Arborist®',dateLabel:'展示 · 8 月 12 日'
      },
      {
        id:'demo-r8',locationId:'demo-construction-protection',title:'管線試掘現場監看',
        notes:'採人工與氣動挖掘方式確認根系位置；發現直徑約 6 cm 結構根後立即停止向樹幹方向開挖，並將管線路徑外移 80 cm。暴露細根以濕麻布覆蓋，當日完成回填與澆灌。後續每兩週檢查葉色、枝梢回枯與土壤含水狀況。',
        imageUrls:[],youtubeUrls:[],fileUrls:[],
        authorName:'張雅雯｜ISA Certified Arborist®',dateLabel:'展示 · 8 月 15 日'
      }
    ]
  },
  {
    id:'demo-veteran-camphor',
    name:'展示案例｜老樟樹年度健檢',
    address:'新竹市東區（示範座標）',
    lat:24.8017,
    lng:120.9715,
    status:'已完成',
    attention:'示範資料：樹洞為潛在野生動物棲地，檢查及修剪前先確認無鳥巢或其他動物活動。',
    aliases:['老樹','樟樹','年度健檢','音波斷層','生態棲地'],
    isDemo:true,
    records:[
      {
        id:'demo-r9',locationId:'demo-veteran-camphor',title:'年度樹勢與結構複查',
        notes:'與去年固定照片比對，冠層密度與葉色大致穩定；主幹東側舊傷口持續形成癒合組織，未見新裂縫。根頸周圍覆土已移除，可見根張發育正常。樹洞開口附近有新鮮糞便與羽毛，先列為棲地保留區，不做封填。',
        imageUrls:['https://images.unsplash.com/photo-1448375240586-882707db888b?auto=format&fit=crop&w=1000&q=82'],youtubeUrls:[],fileUrls:[],
        authorName:'周子涵｜European Tree Technician（ETT）',dateLabel:'展示 · 7 月 26 日'
      },
      {
        id:'demo-r10',locationId:'demo-veteran-camphor',title:'年度管理建議',
        notes:'維持目前低干預策略：移除步道上方新生枯枝、補充有機覆蓋物但避開根頸，乾季依土壤含水狀況深層澆灌。若主幹舊傷出現裂縫擴大、真菌子實體或冠梢快速回枯，再安排音波斷層等進階檢測。下次例行複查排定 12 個月後。',
        imageUrls:[],youtubeUrls:[],fileUrls:['https://www.isa-arbor.com/Online-Learning/More-Resources/Sample-Reports'],
        authorName:'周子涵｜European Tree Technician（ETT）',dateLabel:'展示 · 7 月 27 日'
      }
    ]
  }
];
