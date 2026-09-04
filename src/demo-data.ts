type ImportedRecord = Record<string, unknown>;

function record(id:string, locationId:string, fields:ImportedRecord){
  return { id, locationId, imageUrls:[], youtubeUrls:[], fileUrls:[], authorName:'群組案場紀錄', ...fields };
}

export const crewOptions = ['白','肯','誠','浩','儀','庭','修','陳','得','丸','鴻','橘','球','韻','歐','力','綺','斌','薛','康','方'];

export const demoLocations = [
  {
    id:'import-zhishan', name:'芝山文化生態綠園', address:'臺北市士林區芝山文化生態綠園', lat:25.1042763, lng:121.5319248, status:'注意事項', aliases:['芝山綠園','暖房'], isDemo:true,
    attention:'暖房與野鳥籠舍緊鄰作業區；全攀並需 Rigging。卸裝備後須徒步約 200 公尺（含階梯），或繞行約 250 公尺坡道。',
    records:[record('import-r01','import-zhishan',{dateLabel:'11/06',title:'暖房周邊修剪及伐除',crew:['白','肯','誠','浩','儀','庭','修'],meetingTime:'08:00',meetingPlace:'園區正門',mapUrl:'https://maps.app.goo.gl/MbaM5dPMP8obyovB9',weather:'連續小雨、風大；請準備雨衣與替換衣物。',hospitalName:'臺北市立聯合醫院陽明院區',hospitalDistance:'130 m',hospitalTravelTime:'1 分鐘',notes:'伐除 3 棵、修剪 5 棵，詳見修剪計畫。作業區旁為玻璃暖房與野鳥籠舍。',workDetails:'全攀作業，需 Rigging。樹木分切後堆置於周邊空地。',assignments:'同安清運 06:00：白；芝山綠園：肯、誠、浩、儀、庭、修。',disposal:'無清運，需分切堆置在周邊空地。',parking:'卸裝備後徒步約 200 公尺（含階梯）；繞行坡道約 250 公尺。',equipment:'攀樹人員完整個人裝備；Rigging 3 組（扁帶包）；樹上電動鏈鋸全套（含 201、電池系列工具）；地面鏈鋸 550 × 1。',safetyNotes:'雨天與強風作業，留意濕滑階梯、暖房玻璃及籠舍。'})]
  },
  {
    id:'import-longshan',name:'龍山國小',address:'臺北市萬華區龍山國民小學',lat:25.035511,lng:121.49673,status:'注意事項',aliases:['廣州街70巷'],isDemo:true,attention:'先在廣州街 70 巷卸裝備，08:00 後才可將車輛停入學校；高溫作業注意中暑。',
    records:[record('import-r02','import-longshan',{dateLabel:'6/21',title:'70 巷側樹木修剪作業',crew:[],meetingTime:'07:30',meetingPlace:'廣州街 70 巷卸裝備處',mapUrl:'https://maps.app.goo.gl/AueLpn8NwGyJ9AXQ8',weather:'晴，體感可達 42°C；多帶飲水並注意中暑。',hospitalName:'臺大醫院',hospitalDistance:'3.2 公里',hospitalTravelTime:'10 分鐘',notes:'作業內容依計畫書，全部位於廣州街 70 巷。',workDetails:'可能採 Climber 綁妥後吊切的方式，依現場條件決定。',crane:'吊車 1 天',disposal:'小夾下午進場。',parking:'先於廣州街 70 巷卸裝備，08:00 後可停入學校。',safetyNotes:'高溫曝曬，補水並安排降溫休息。'})]
  },
  {
    id:'import-huajiang',name:'華江國小',address:'臺北市萬華區華江國民小學',lat:25.0344321,lng:121.4922663,status:'注意事項',aliases:['萬華區華江國小'],isDemo:true,attention:'校內可能有其他廠商施工；進場車輛需避免互相阻擋，並依當日路權範圍作業。',
    records:[
      record('import-r03','import-huajiang',{dateLabel:'4/3',title:'吊車樹木修剪作業',crew:['白','陳','得','丸','鴻','橘','修'],meetingTime:'07:30',meetingPlace:'華江國小',mapUrl:'https://maps.app.goo.gl/BDyFvbikvofigeYo7',weather:'晴至多雲，約 25–30°C；多帶飲水，鋒面將至仍需帶雨具。',hospitalName:'臺大醫院',hospitalDistance:'4 公里',hospitalTravelTime:'15 分鐘',notes:'吊車 1 台、作業 1 天。',workDetails:'依現場計畫執行樹木修剪。',crane:'吊車 1 台／1 天',disposal:'夾子車：阿勻 15:00',parking:'車輛可停校內車格。',roadPermit:'4/3 無路權；路權僅有 4/4，馬路側作業不多。',safetyNotes:'校內另有廠商施工，車輛進場避免互相阻擋。'}),
      record('import-r14','import-huajiang',{dateLabel:'5/11',title:'華江國小樹木作業',crew:['力','浩','白','陳','肯','誠','丸','鴻','橘','修','球','綺','庭'],meetingTime:'07:30',meetingPlace:'華江國小操場側門',mapUrl:'https://maps.app.goo.gl/7XQpMtxKnM5R6ho38',weather:'晴，24–28°C，炎熱；注意曝曬與補給。',notes:'由操場側門集合進場，依計畫執行當日樹木作業。',assignments:'力、浩為帶車／開場標記人員。',crane:'林大哥',disposal:'小夾：菘強 15:00',safetyNotes:'注意曝曬，備足飲水與補給。'})
    ]
  },
  {
    id:'import-nanmen',name:'南門國小',address:'臺北市中正區南門國民小學',lat:25.0347249,lng:121.5082312,status:'進行中',aliases:['台北市南門國小','廣州街8巷'],isDemo:true,attention:'由廣州街 8 巷側門進校停車；大茄苳需重心調整與拉纜，受保榕樹須謹慎施作。',
    records:[record('import-r04','import-nanmen',{dateLabel:'9/29',title:'茄苳與榕樹重心調整',crew:['浩','陳','鴻','橘','白'],meetingTime:'07:30',meetingPlace:'廣州街 8 巷側門',mapUrl:'https://maps.app.goo.gl/9R83RucoYuizSokc6?g_st=ipc',weather:'炎熱，中午可達 35°C。',hospitalName:'臺北市立聯合醫院和平院區',hospitalDistance:'260 m',hospitalTravelTime:'1 分鐘',notes:'大茄苳、停車場榕樹及受保榕樹共 3 項樹冠管理作業。',workDetails:'1. 大茄苳 1 棵重心調整、拉纜作業。\n2. 停車場榕樹 1 棵重心大幅退縮。\n3. 受保榕樹人行道側樹冠提高。',assignments:'白負責開場；另有 stone 哥團隊。',disposal:'小夾清運。',parking:'廣州街 8 巷側門進校停車。',safetyNotes:'高溫補水；受保樹與人行道側作業須加強區隔。'})]
  },
  {
    id:'import-luzhou-junior',name:'蘆洲國中公托幼兒園',address:'新北市蘆洲區中正路 265 號',lat:25.0863404,lng:121.4696,status:'注意事項',aliases:['蘆洲國中','公托幼兒園'],isDemo:true,attention:'依群組現場圖黃線行進，圓圈為卸裝備區、紅色區域為停車區；公裝存放於警衛室旁小房間。',
    records:[record('import-r05','import-luzhou-junior',{dateLabel:'8/10',title:'榕樹局部退縮與微疏枝',crew:['肯','球','修','誠','浩','橘'],meetingTime:'07:30',meetingPlace:'蘆洲國中公托幼兒園',mapUrl:'https://maps.app.goo.gl/BqhmXwS2CWstvuwb8?g_st=ipc',weather:'晴時午後陣雨，降雨率 50%，體感最高 40°C。',hospitalName:'新北市立聯合醫院三重院區',hospitalDistance:'7.3 公里',hospitalTravelTime:'15 分鐘',notes:'榕樹局部退縮、微疏枝透光；全攀樹作業。',workDetails:'榕樹局部退縮與微疏枝透光，全程採攀樹方式作業。',disposal:'夾子車：1 小，14:00。',parking:'依群組現場圖黃線行進；圓圈卸裝備、紅色區域停車。',equipment:'公裝除電池外，均放在警衛室旁小房間；請早班警衛開正門捲門後整車拖出。',safetyNotes:'請智誠多帶一個保冷袋；午後雷陣雨與高體感溫度需加強補水及防雨。'})]
  },
  {
    id:'import-daye',name:'大業國小',address:'桃園市大業國民小學',lat:25.006748,lng:121.31579,status:'進行中',aliases:['ETW大業國小'],isDemo:true,attention:'優先進行 ETW 作業；若有多餘時間才安排部分攀爬。週一尚有半天上課，堆置區不得影響學生活動。',
    records:[record('import-r06','import-daye',{dateLabel:'1/19',title:'ETW 優先作業與攀爬預備',crew:['白','浩','陳','得','肯','誠','丸','鴻','橘','儀','韻','球','修','庭','歐'],meetingTime:'07:30',meetingPlace:'民光東路側門內停車，使用一年六班教室',mapUrl:'https://maps.app.goo.gl/tLqZKp3dNiqsBRnw6?g_st=com.google.maps.preview.copy',weather:'多雲至陰，注意保暖。',hospitalName:'桃園榮民總醫院',hospitalDistance:'1.5 公里',hospitalTravelTime:'7 分鐘',notes:'當天說明，先以 ETW 為主；如有餘裕再做部分攀爬工作，可先參考計畫書。',workDetails:'ETW 項目優先，部分攀爬工作視進度安排。',disposal:'堆置在不影響學生活動的區域。',parking:'民光東路側門內停車。',equipment:'全員攜帶自己的攀爬裝備與 PPE。',safetyNotes:'週一仍有半天上課；歐為素食。'})]
  },
  {
    id:'import-chengzhou',name:'成州國小',address:'新北市五股區成州國民小學',lat:25.0997414,lng:121.4506619,status:'注意事項',aliases:['五股成州國小'],isDemo:true,attention:'校園可能仍有師生活動；圍牆外吊車作業與內側攀樹區須完整隔離。',
    records:[record('import-r07','import-chengzhou',{dateLabel:'11/30',title:'圍牆外吊車退縮與內側疏枝',crew:['陳','誠','修','鴻','橘'],meetingTime:'07:30',meetingPlace:'學校大門口',mapUrl:'https://maps.app.goo.gl/48WzczHGRsdhBkP98',weather:'晴、涼冷。',hospitalName:'新北市立聯合醫院三重院區',hospitalDistance:'8 公里',hospitalTravelTime:'20 分鐘',notes:'圍牆外使用吊車退縮，內側採攀樹疏枝。',workDetails:'吊車處理圍牆外樹冠退縮，校內側由攀樹人員疏枝。',crane:'圍牆外吊車作業。',disposal:'小夾 14:30。',equipment:'三角錐、警示帶、施工改道牌。',safetyNotes:'注意學校是否有師生活動，完整封閉施工及落枝區域。'})]
  },
  {
    id:'import-guangfu',name:'光復國小（中和）',address:'新北市中和區光復國民小學',lat:25.0151637,lng:121.4831365,status:'注意事項',aliases:['新北市光復國小','光復國小'],isDemo:true,attention:'校內作業須配合師生活動；雨天可能有強降雨或雷雨，攀樹、吊車及地面分組依現場調整。',
    records:[
      record('import-r08','import-guangfu',{dateLabel:'9/22',title:'植栽修剪整理',crew:['陳','誠','丸','鴻','橘','修','庭'],meetingTime:'07:30',meetingPlace:'校門內停車',mapUrl:'https://maps.app.goo.gl/wuJpmYo5nXsMMmAq9',weather:'整天有陣雨或雷雨，可能強降雨；請備雨衣、雨傘及替換衣物。',hospitalName:'雙和醫院',hospitalDistance:'3.5 公里',hospitalTravelTime:'10 分鐘',notes:'校園植栽修剪整理。',workDetails:'依現場植栽狀況進行修剪、整理與集運。',parking:'校門內停車。',equipment:'太空包、高枝剪、自帶剪定鋏。',safetyNotes:'雷雨或強降雨時停止高空作業。'}),
      record('import-r13','import-guangfu',{dateLabel:'7/7（日）',title:'樹木修剪及花台修整',crew:['白','丸','肯','誠','鴻','橘','修'],meetingTime:'07:30',meetingPlace:'光復國小',mapUrl:'https://maps.app.goo.gl/3jdhtbRQLys2Sk9dA?g_st=com.google.maps.preview.copy',notes:'新北市光復國小樹木修剪及花台修整作業。',workDetails:'依吊車、花台、牆上榕三組同步推進。',assignments:'吊車組：丸、肯、修。\n花台組：白、橘（推車、太空包）。\n牆上榕組：誠、鴻（推車、太空包）。',equipment:'推車、太空包。',safetyNotes:'各組維持通訊並劃分吊車與地面作業動線。'})
    ]
  },
  {
    id:'import-linkou',name:'林口國小',address:'新北市林口區林口國民小學',lat:25.0797104,lng:121.3899638,status:'注意事項',aliases:['林口路68巷'],isDemo:true,attention:'當日需完成林口路 68 巷路權範圍；約 90% 為吊車作業，未完成部分可於隔日預備日繼續。',
    records:[record('import-r09','import-linkou',{dateLabel:'8/15',title:'林口路 68 巷吊車作業',crew:['浩','力','得','陳','誠','肯','球','修'],meetingTime:'07:30',meetingPlace:'林口國小作業點',mapUrl:'https://maps.app.goo.gl/zNH9cxcXd4RZN8Pk7?g_st=com.google.maps.preview.copy',weather:'多雲至陰、悶熱，午後降雨機率高。',hospitalName:'林口長庚醫院',hospitalDistance:'4 公里',hospitalTravelTime:'18 分鐘',notes:'90% 為吊車作業，2 台吊車進場 1 天。',workDetails:'優先完成林口路 68 巷路權範圍，若未完成可於隔日預備日續作。',assignments:'浩為帶隊／開場標記人員。',crane:'2 台吊車／1 天。',disposal:'大夾：阿宏 15:00。',roadPermit:'當日需完成林口路 68 巷路權範圍。',safetyNotes:'悶熱與午後降雨機率高，吊車作業依天候調整。'})]
  },
  {
    id:'import-shanding',name:'山頂國小',address:'桃園市龜山區山頂國民小學',lat:24.99179,lng:121.32723,status:'注意事項',aliases:['桃園山頂國小'],isDemo:true,attention:'白千層下方有水溝蓋施工，需再評估作業安全；大夾進入前先協調側門對面車輛移車。',
    records:[record('import-r10','import-shanding',{dateLabel:'8/14',title:'颱風折損樹與校園修剪',crew:['力','陳','得','浩','肯','誠','球','修'],meetingTime:'07:30',meetingPlace:'山頂國小',mapUrl:'https://maps.app.goo.gl/2EAprJzkYYWwUH7S6',hospitalName:'桃園榮民總醫院',hospitalPhone:'03-2868001',hospitalDistance:'1.9 公里',hospitalTravelTime:'9 分鐘',notes:'依計畫書修剪，另有 4 項現場重點。',workDetails:'1. 水柳颱風後折斷，改為全株伐除。\n2. 司令台旁白千層下方有水溝蓋施工，先評估安全。\n3. 後方化糞池有上次修剪枝條，需一併清運。\n4. 大夾進入前協調側門對面車輛移車。',assignments:'力、陳為帶車／開場標記人員；無線電由小陳（湧霖）準備。',crane:'展哥，半天。',disposal:'大夾：阿宏 15:00。',equipment:'角錐、吊車鏈鋸板、高枝鋸、高枝剪、無線電、拖樹枝廢繩。',safetyNotes:'水溝蓋施工區未確認安全前不得進行上方作業。'})]
  },
  {
    id:'import-luchang',name:'鷺江國小',address:'新北市蘆洲區民族路 7 號',lat:25.0851574,lng:121.4770857,status:'注意事項',aliases:['民權路側門','中東海棗側門'],isDemo:true,attention:'民權路與中東海棗側門各有遙控器；中東海棗作業期間側門車輛無法進出，四維樓施工區須完全封閉。',
    records:[record('import-r11','import-luchang',{dateLabel:'日期待確認',title:'吊車修剪與校園動線管制',crew:['力','得','浩','陳','肯','誠','橘','庭'],meetingTime:'07:30',meetingPlace:'民權路側門',mapUrl:'https://maps.app.goo.gl/s5RvD7BFYKnsdHYX6?g_st=com.google.maps.preview.copy',hospitalName:'三重醫院',hospitalPhone:'02-29829111',hospitalDistance:'4.1 公里',hospitalTravelTime:'待確認',notes:'警衛 06:00 上班；簡組長已交接民權路側門與中東海棗側門兩個遙控器。',workDetails:'1. 中東海棗 10–14 棵由騰信安排修剪，本組集中與清運。\n2. 中東海棗側門車輛無法進出。\n3. 大王椰子下方無遮擋且易傷行人，必要時上綁帶。\n4. 四維樓小葉欖仁一樓有學生上課，施工區完全封閉。\n5. 吊車作業後若有時間，由場控安排 2 人至蘆洲國中修剪大王椰子（不清運）。',crane:'展哥，1 天。',disposal:'大夾：阿祐 15:30。',equipment:'警示帶、綁帶組、吊車鏈鋸板、防刺手套。',safetyNotes:'四維樓使用警示帶完全封閉；大王椰子下方強化行人管制。'})]
  },
  {
    id:'import-wuxing',name:'吳興街 220 巷案場',address:'臺北市信義區吳興街 220 巷 11 弄',lat:25.028068,lng:121.562239,status:'注意事項',aliases:['吳興街','220巷11弄'],isDemo:true,attention:'可先到工作點卸裝備，再移至附近停車場或路邊停車；拉運樹枝距離約 30 公尺。',
    records:[record('import-r12','import-wuxing',{dateLabel:'7/12',title:'修剪 5 棵、伐除 1 棵',crew:[],meetingTime:'預計 07:30，待確認',meetingPlace:'吳興街 220 巷 11 弄工作點',mapUrl:'https://maps.app.goo.gl/LQ1enonctDpa6ouG9',weather:'多雲悶熱，午後降雨機率 40%。',hospitalName:'臺北醫學大學附設醫院',hospitalDistance:'鄰近案場',hospitalTravelTime:'步行可達',notes:'修剪 5 棵、伐除 1 棵；樹枝需拉運約 30 公尺，由同業清運。',workDetails:'完成 5 棵修剪與 1 棵伐除，枝材集中後交由同業清運。',disposal:'同業清運；拉運樹枝約 30 公尺。',parking:'先於工作點卸裝備，再到附近停車場或路邊停車。',equipment:'角錐、馬刺、Rigging。',safetyNotes:'午後可能降雨，注意悶熱、補水及巷弄人車動線。'})]
  },
  {
    id:'import-qiming',name:'臺北市立啟明學校',address:'臺北市士林區忠誠路二段 207 巷 1 號',lat:25.1174818,lng:121.5347347,status:'注意事項',aliases:['啟明學校'],isDemo:true,attention:'兩日施工且天候不穩。開車卸裝備者先至指定卸貨點，完成後再至主集合點停車；暴雨時先整理地面。',
    records:[
      record('import-r15a','import-qiming',{dateLabel:'第一天',title:'啟明學校兩日施工｜第一天',crew:['得','丸','斌','庭','薛','修','康'],meetingTime:'07:30',meetingPlace:'啟明學校主集合點',mapUrl:'https://maps.app.goo.gl/9fq3jAZBP9WpJsp97?g_st=ic',weather:'陰雨、豪雨，天氣不穩；準備外套及雨具。',hospitalName:'振興醫院',hospitalDistance:'2.4 公里',hospitalTravelTime:'9 分鐘',notes:'第一天進場，吊車預計 07:30–08:00 到場。',workDetails:'依兩日施工時程推進；雨勢過大時停止高空作業。',assignments:'得、丸、斌攜帶攀樹器材；庭、薛、修、康支援地面及現場分工。',crane:'07:30–08:00 之間進場。',parking:'開車且需卸裝備者先至 https://maps.app.goo.gl/cTHw5vztCXA5wyJR7?g_st=ic，07:00 卸裝備後回主定位點停車；機車直接到主集合點。',equipment:'攀樹器材、外套、雨具。',safetyNotes:'豪雨或雷雨時暫停高空與吊掛作業。'}),
      record('import-r15b','import-qiming',{dateLabel:'第二天',title:'啟明學校兩日施工｜第二天',crew:['斌','鴻','橘','綺','得','修','方','誠'],meetingTime:'07:30',meetingPlace:'啟明學校主集合點',mapUrl:'https://maps.app.goo.gl/9fq3jAZBP9WpJsp97?g_st=ic',weather:'雨。',hospitalName:'振興醫院',hospitalDistance:'2.4 公里',hospitalTravelTime:'9 分鐘',notes:'第二天持續施工；若下暴雨，先整理地面，待雨勢減弱再上樹。',workDetails:'依第一天進度續作；雨勢大時轉做地面整理，雨勢轉小且裝備與人員狀況安全後再恢復攀樹。',assignments:'斌、鴻、橘、綺、得攜帶攀樹裝備；修、方、誠支援。',parking:'沿用第一天主集合點及卸裝備動線。',equipment:'多帶幾件雨衣與替換衣褲；現場備吹風機供人員乾燥使用。',safetyNotes:'避免濕冷與失溫；重新上樹前檢查繩索、PPE 與踩點狀況。'})
    ]
  }
];
